import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

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

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload, webhookId } =
    await authenticate.webhook(request);

  logger.info({ topic, shop, webhookId }, "Webhook received");

  if (await isDuplicateWebhook(webhookId)) {
    logger.info({ webhookId }, "Duplicate webhook ignored");
    return new Response();
  }

  const refund = payload as RefundPayload;

  const refundId = String(refund.id);
  const orderId = String(refund.order_id);
  const refundLineItems = refund.refund_line_items ?? [];

  if (refundLineItems.length === 0) {
    logger.info({ refundId, orderId }, "No refund line items, skipping");

    await markWebhookProcessed(webhookId, shop, orderId, "refunds/create");

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
        { shop, productGid },
        "No creator mapping found, skipping product",
      );
      continue;
    }

    for (const productMapping of productMappings) {
      const creator = productMapping.creatorMapping;

      const existingRefund = await db.deliveryLog.findFirst({
        where: {
          shop,
          orderId,
          productId,
          discourseCommunity: creator.discourseUrl,
          status: "refund_delivered",
        },
        select: {
          id: true,
        },
      });

      if (existingRefund) {
        logger.info(
          { shop, orderId, productId, discourseUrl: creator.discourseUrl },
          "Refund already delivered, skipping",
        );
        continue;
      }

      const purchaseDelivery = await db.deliveryLog.findFirst({
        where: {
          shop,
          orderId,
          productId,
          discourseCommunity: creator.discourseUrl,
          status: "delivered",
        },
        select: {
          customerEmail: true,
        },
      });

      if (!purchaseDelivery) {
        logger.info(
          { shop, orderId, productId, discourseUrl: creator.discourseUrl },
          "No delivered purchase found, skipping refund",
        );
        continue;
      }

      const customerEmail = purchaseDelivery.customerEmail;

      try {
        const result = await forwardToDiscourse(
          creator.discourseUrl,
          creator.connectionSecret,
          {
            customerEmail,
            productId,
            orderId,
            eventType: "refund",
          },
        );

        await createDeliveryLog(
          shop,
          orderId,
          customerEmail,
          productId,
          creator.discourseUrl,
          result.success ? "refund_delivered" : "refund_failed",
          result.error,
        );

        if (!result.success) {
          errors.push(
            `Refund for product ${productId} → ${creator.discourseUrl}: ` +
              `${result.error ?? "Unknown error"}`,
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
          "Refund delivery failed",
        );

        await createDeliveryLog(
          shop,
          orderId,
          customerEmail,
          productId,
          creator.discourseUrl,
          "refund_failed",
          message,
        );

        errors.push(
          `Refund for product ${productId} → ${creator.discourseUrl}: ` +
            `${message}`,
        );
      }
    }
  }

  if (errors.length > 0) {
    logger.error(
      { shop, refundId, orderId, webhookId, errors },
      "Partial webhook failure",
    );

    return new Response("Webhook processing partially failed", {
      status: 500,
    });
  }

  await markWebhookProcessed(webhookId, shop, orderId, "refunds/create");

  return new Response();
};
