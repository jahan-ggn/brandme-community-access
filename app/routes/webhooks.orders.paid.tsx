import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { Sentry } from "../utils/sentry.server";

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

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload, webhookId } =
    await authenticate.webhook(request);

  logger.info({ topic, shop, webhookId }, "Webhook received");

  if (await isDuplicateWebhook(webhookId)) {
    logger.info({ webhookId }, "Duplicate webhook ignored");
    return new Response();
  }

  const order = payload as OrderPayload;

  const orderId = String(order.id);
  const customerEmail = order.email?.trim() ?? "";
  const lineItems = order.line_items ?? [];

  if (!customerEmail) {
    logger.warn(
      { shop, orderId, webhookId },
      "No customer email, skipping Discourse processing",
    );

    await markWebhookProcessed(webhookId, shop, orderId, "orders/paid");

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
        { shop, productGid },
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
            eventType: "purchase",
          },
        },
        select: { id: true, status: true },
      });

      if (existingDelivery?.status === "delivered") {
        logger.info(
          { shop, orderId, productId, discourseUrl: creator.discourseUrl },
          "Already delivered, skipping",
        );
        continue;
      }

      try {
        const result = await forwardToDiscourse(
          creator.discourseUrl,
          creator.connectionSecret,
          {
            customerEmail,
            productId,
            orderId,
            eventType: "purchase",
          },
        );

        await createDeliveryLog(
          shop,
          orderId,
          customerEmail,
          productId,
          creator.discourseUrl,
          result.success ? "delivered" : "failed",
          result.error,
          "purchase",
        );

        if (!result.success) {
          errors.push(
            `Product ${productId} → ${creator.discourseUrl}: ${
              result.error ?? "Unknown error"
            }`,
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        logger.error(
          {
            shop,
            orderId,
            productId,
            discourseUrl: creator.discourseUrl,
            err: error,
          },
          "Delivery failed",
        );

        Sentry.captureException(error, {
          tags: { topic, shop },
          extra: {
            webhookId,
            orderId,
            productId,
            discourseUrl: creator.discourseUrl,
          },
        });

        await createDeliveryLog(
          shop,
          orderId,
          customerEmail,
          productId,
          creator.discourseUrl,
          "failed",
          message,
          "purchase",
        );

        errors.push(
          `Product ${productId} → ${creator.discourseUrl}: ${message}`,
        );
      }
    }
  }

  if (errors.length > 0) {
    Sentry.captureException(new Error("Partial webhook failure"), {
      tags: { topic, shop },
      extra: { webhookId, orderId, errors },
    });
    logger.error(
      { shop, orderId, webhookId, errors },
      "Partial webhook failure",
    );

    return new Response("Webhook processing partially failed", {
      status: 500,
    });
  }

  await markWebhookProcessed(webhookId, shop, orderId, "orders/paid");

  return new Response();
};
