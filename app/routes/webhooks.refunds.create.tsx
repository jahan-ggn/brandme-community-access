import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

import {
  isDuplicateWebhook,
  markWebhookProcessed,
  createDeliveryLog,
} from "../utils/webhook-helpers.server";

import { forwardToDiscourse } from "../utils/discourse-forwarder.server";
import db from "../db.server";

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
  refund_line_items: RefundLineItem[] | null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload, webhookId } =
    await authenticate.webhook(request);

  console.log(
    `Received ${topic} webhook for ${shop} (webhook ID: ${webhookId})`,
  );

  if (await isDuplicateWebhook(webhookId)) {
    console.log(`Ignoring duplicate webhook ${webhookId}`);
    return new Response();
  }

  const refund = payload as RefundPayload;
  const orderId = refund?.order_id?.toString() ?? "";
  const refundLineItems = refund?.refund_line_items ?? [];

  if (refundLineItems.length === 0) {
    console.log(`No refund line items in refund for order ${orderId}`);
    await markWebhookProcessed(webhookId, shop, orderId, "refunds/create");
    return new Response();
  }

  const deliveryLog = await db.deliveryLog.findFirst({
    where: { shop, orderId },
    select: { customerEmail: true },
  });

  if (!deliveryLog) {
    console.error(
      `No delivery log found for order ${orderId}, cannot process refund`,
    );

    return new Response("Unable to process refund", {
      status: 500,
    });
  }

  const customerEmail = deliveryLog.customerEmail;

  try {
    for (const refundItem of refundLineItems) {
      const lineItem = refundItem.line_item;
      if (!lineItem?.product_id) continue;

      const productId = lineItem.product_id.toString();
      const productGid = `gid://shopify/Product/${productId}`;

      const productMappings = await db.productMapping.findMany({
        where: {
          shop,
          shopifyProductId: productGid,
          creatorMapping: { enabled: true },
        },
        include: { creatorMapping: true },
      });

      if (productMappings.length === 0) {
        console.log(
          `No creator mapping for refunded product ${productGid}, skipping`,
        );
        continue;
      }

      for (const productMapping of productMappings) {
        const creator = productMapping.creatorMapping;

        const result = await forwardToDiscourse(
          creator.discourseUrl,
          creator.connectionSecret,
          {
            customerEmail,
            productId,
            orderId,
            eventType: "refunds/create",
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
          throw new Error(
            `Failed to send refund for product ${productId} to ${creator.discourseUrl}: ${result.error ?? "Unknown error"}`,
          );
        }
      }
    }
  } catch (error) {
    console.error(
      `Failed to process refunds/create webhook for order ${orderId}`,
      error,
    );
    return new Response("Webhook processing failed", { status: 500 });
  }

  await markWebhookProcessed(webhookId, shop, orderId, "refunds/create");
  return new Response();
};
