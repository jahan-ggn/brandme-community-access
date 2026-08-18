import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";
import db from "../db.server";

import { enqueueRetry } from "../utils/retry-queue.server";
import {
  isDuplicateWebhook,
  markWebhookProcessed,
  createDeliveryLog,
} from "../utils/webhook-helpers.server";
import { forwardToDiscourse } from "../utils/discourse-forwarder.server";
import { logger } from "../utils/logger.server";

type LineItem = {
  product_id: number | string | null;
};

type OrderPayload = {
  id: number | string;
  email: string | null;
  line_items?: LineItem[] | null;
};

const EVENT_TYPE = "purchase";
const WEBHOOK_TOPIC = "orders/paid";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload, webhookId } =
    await authenticate.webhook(request);

  logger.info(
    {
      topic,
      shop,
      webhookId,
    },
    "Webhook received",
  );

  if (await isDuplicateWebhook(webhookId)) {
    logger.info(
      {
        shop,
        webhookId,
      },
      "Duplicate webhook ignored",
    );

    return new Response();
  }

  const order = payload as OrderPayload;

  const orderId = String(order.id);
  const customerEmail = order.email?.trim() ?? "";
  const lineItems = order.line_items ?? [];

  if (!customerEmail) {
    logger.warn(
      {
        shop,
        orderId,
        webhookId,
      },
      "No customer email, skipping Discourse processing",
    );

    await markWebhookProcessed(webhookId, shop, orderId, WEBHOOK_TOPIC);

    return new Response();
  }

  const errors: string[] = [];

  for (const item of lineItems) {
    if (item.product_id == null) {
      continue;
    }

    const productId = String(item.product_id);
    const productGid = `gid://shopify/Product/${productId}`;

    const productMappings = await db.productMapping.findMany({
      where: {
        shop,
        shopifyProductId: productGid,
        creatorMapping: {
          enabled: true,
        },
      },
      include: {
        creatorMapping: true,
      },
    });

    if (productMappings.length === 0) {
      logger.info(
        {
          shop,
          orderId,
          productId,
          productGid,
          webhookId,
        },
        "No creator mapping found, skipping product",
      );

      continue;
    }

    for (const productMapping of productMappings) {
      const creator = productMapping.creatorMapping;

      const existingDelivery = await db.deliveryLog.findUnique({
        where: {
          orderId_productId_discourseCommunity_eventType: {
            orderId,
            productId,
            discourseCommunity: creator.discourseUrl,
            eventType: EVENT_TYPE,
          },
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (existingDelivery?.status === "delivered") {
        logger.info(
          {
            shop,
            orderId,
            productId,
            creatorMappingId: creator.id,
            discourseUrl: creator.discourseUrl,
            webhookId,
          },
          "Already delivered, skipping",
        );

        continue;
      }

      let result;

      try {
        result = await forwardToDiscourse(
          creator.discourseUrl,
          creator.connectionSecret,
          {
            event: EVENT_TYPE,
            email: customerEmail,
            webhookId,
            productId,
            orderId,
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        logger.error(
          {
            shop,
            orderId,
            productId,
            creatorMappingId: creator.id,
            discourseUrl: creator.discourseUrl,
            webhookId,
            err: error,
          },
          "Discourse delivery threw an exception",
        );

        await createDeliveryLog(
          shop,
          orderId,
          customerEmail,
          productId,
          creator.discourseUrl,
          "failed",
          message,
          EVENT_TYPE,
        );

        await enqueueRetry(
          shop,
          orderId,
          customerEmail,
          productId,
          creator.id,
          EVENT_TYPE,
          webhookId,
          message,
        );

        errors.push(
          `Product ${productId} → ${creator.discourseUrl}: ${message}`,
        );

        continue;
      }

      await createDeliveryLog(
        shop,
        orderId,
        customerEmail,
        productId,
        creator.discourseUrl,
        result.success ? "delivered" : "failed",
        result.error,
        EVENT_TYPE,
      );

      if (result.success) {
        logger.info(
          {
            shop,
            orderId,
            productId,
            creatorMappingId: creator.id,
            discourseUrl: creator.discourseUrl,
            webhookId,
          },
          "Purchase delivered to Discourse",
        );

        continue;
      }

      const errorMessage = result.error ?? "Unknown Discourse delivery error";

      await enqueueRetry(
        shop,
        orderId,
        customerEmail,
        productId,
        creator.id,
        EVENT_TYPE,
        webhookId,
        errorMessage,
      );

      errors.push(
        `Product ${productId} → ${creator.discourseUrl}: ${errorMessage}`,
      );

      logger.warn(
        {
          shop,
          orderId,
          productId,
          creatorMappingId: creator.id,
          discourseUrl: creator.discourseUrl,
          webhookId,
          error: errorMessage,
        },
        "Discourse delivery failed, queued for retry",
      );
    }
  }

  if (errors.length > 0) {
    logger.error(
      {
        shop,
        orderId,
        webhookId,
        errors,
      },
      "Webhook completed with partial failures; failed deliveries queued for retry",
    );
  }

  await markWebhookProcessed(webhookId, shop, orderId, WEBHOOK_TOPIC);

  return new Response();
};
