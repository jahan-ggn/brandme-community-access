import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

import {
  isDuplicateWebhook,
  markWebhookProcessed,
  createDeliveryLog,
} from "../utils/webhook-helpers.server";

import { forwardToDiscourse } from "../utils/discourse-forwarder.server";
import db from "../db.server";

type LineItem = {
  product_id: number | string | null;
};

type OrderPayload = {
  id: number | string;
  email: string | null;
  line_items: LineItem[] | null;
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

  const order = payload as OrderPayload;

  const orderId = order?.id?.toString() ?? "";
  const customerEmail = order?.email?.trim() ?? "";
  const lineItems = order?.line_items ?? [];

  if (!customerEmail) {
    console.error(
      `No customer email in order ${orderId}, skipping Discourse processing`,
    );

    await markWebhookProcessed(webhookId, shop, orderId, "orders/paid");

    return new Response();
  }

  try {
    for (const item of lineItems) {
      if (!item.product_id) {
        continue;
      }

      const productId = item.product_id.toString();

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
        console.log(
          `No creator mapping found for product ${productGid}, skipping`,
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
            eventType: "orders/paid",
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
        );

        if (!result.success) {
          throw new Error(
            `Failed to deliver product ${productId} to ${creator.discourseUrl}: ${
              result.error ?? "Unknown error"
            }`,
          );
        }
      }
    }
  } catch (error) {
    console.error(
      `Failed to process orders/paid webhook for order ${orderId}`,
      error,
    );

    return new Response("Webhook processing failed", {
      status: 500,
    });
  }

  await markWebhookProcessed(webhookId, shop, orderId, "orders/paid");

  return new Response();
};
