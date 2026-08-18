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

type RefundLineItemEntry = {
  product_id: number | string | null;
};

type RefundLineItem = {
  line_item_id: number | string;
  line_item: RefundLineItemEntry | null;
};

type RefundPayload = {
  id: number | string;
  order_id: number | string;
  refund_line_items?: RefundLineItem[] | null;
};

const EVENT_TYPE = "refund";
const WEBHOOK_TOPIC = "refunds/create";

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

  const refund = payload as RefundPayload;

  const refundId = String(refund.id);
  const orderId = String(refund.order_id);
  const refundLineItems = refund.refund_line_items ?? [];

  if (refundLineItems.length === 0) {
    logger.info(
      {
        shop,
        refundId,
        orderId,
        webhookId,
      },
      "No refund line items, skipping",
    );

    await markWebhookProcessed(webhookId, shop, orderId, WEBHOOK_TOPIC);

    return new Response();
  }

  const errors: string[] = [];

  for (const refundItem of refundLineItems) {
    const lineItem = refundItem.line_item;

    if (lineItem?.product_id == null) {
      continue;
    }

    const productId = String(lineItem.product_id);
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
          refundId,
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

      const existingRefund = await db.deliveryLog.findUnique({
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

      if (existingRefund?.status === "refund_delivered") {
        logger.info(
          {
            shop,
            refundId,
            orderId,
            productId,
            creatorMappingId: creator.id,
            discourseUrl: creator.discourseUrl,
            webhookId,
          },
          "Refund already delivered, skipping",
        );

        continue;
      }

      const purchaseDelivery = await db.deliveryLog.findUnique({
        where: {
          orderId_productId_discourseCommunity_eventType: {
            orderId,
            productId,
            discourseCommunity: creator.discourseUrl,
            eventType: "purchase",
          },
        },
        select: {
          customerEmail: true,
          status: true,
        },
      });

      if (!purchaseDelivery || purchaseDelivery.status !== "delivered") {
        logger.info(
          {
            shop,
            refundId,
            orderId,
            productId,
            creatorMappingId: creator.id,
            discourseUrl: creator.discourseUrl,
            webhookId,
          },
          "No delivered purchase found, skipping refund",
        );

        continue;
      }

      const customerEmail = purchaseDelivery.customerEmail;

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
            refundId,
            orderId,
            productId,
            creatorMappingId: creator.id,
            discourseUrl: creator.discourseUrl,
            webhookId,
            err: error,
          },
          "Refund delivery threw an exception",
        );

        await createDeliveryLog(
          shop,
          orderId,
          customerEmail,
          productId,
          creator.discourseUrl,
          "refund_failed",
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
          `Refund for product ${productId} → ${creator.discourseUrl}: ${message}`,
        );

        continue;
      }

      await createDeliveryLog(
        shop,
        orderId,
        customerEmail,
        productId,
        creator.discourseUrl,
        result.success ? "refund_delivered" : "refund_failed",
        result.error,
        EVENT_TYPE,
      );

      if (result.success) {
        logger.info(
          {
            shop,
            refundId,
            orderId,
            productId,
            creatorMappingId: creator.id,
            discourseUrl: creator.discourseUrl,
            webhookId,
          },
          "Refund delivered to Discourse",
        );

        continue;
      }

      const errorMessage =
        result.error ?? "Unknown Discourse refund delivery error";

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
        `Refund for product ${productId} → ${creator.discourseUrl}: ${errorMessage}`,
      );

      logger.warn(
        {
          shop,
          refundId,
          orderId,
          productId,
          creatorMappingId: creator.id,
          discourseUrl: creator.discourseUrl,
          webhookId,
          error: errorMessage,
        },
        "Refund delivery failed, queued for retry",
      );
    }
  }

  if (errors.length > 0) {
    logger.error(
      {
        shop,
        refundId,
        orderId,
        webhookId,
        errors,
      },
      "Refund webhook completed with partial failures; failed deliveries queued for retry",
    );
  }

  await markWebhookProcessed(webhookId, shop, orderId, WEBHOOK_TOPIC);

  return new Response();
};
