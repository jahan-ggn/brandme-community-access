import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

import {
  isDuplicateWebhook,
  markWebhookProcessed,
  createDeliveryLog,
} from "../utils/webhook-helpers.server";

import { forwardToDiscourse } from "../utils/discourse-forwarder.server";

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

  console.log(
    `Received ${topic} webhook for ${shop} (webhook ID: ${webhookId})`,
  );

  if (await isDuplicateWebhook(webhookId)) {
    console.log(`Ignoring duplicate webhook ${webhookId}`);
    return new Response();
  }

  const order = payload as OrderPayload;

  const orderId = String(order.id);
  const customerEmail = order.email?.trim() ?? "";
  const lineItems = order.line_items ?? [];

  if (!customerEmail) {
    console.error(
      `No customer email in order ${orderId}, skipping Discourse processing`,
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
      console.log(
        `No creator mapping found for product ${productGid}, skipping`,
      );
      continue;
    }

    for (const productMapping of productMappings) {
      const creator = productMapping.creatorMapping;

      const existingDelivery = await db.deliveryLog.findFirst({
        where: {
          shop,
          orderId,
          productId,
          discourseCommunity: creator.discourseUrl,
          status: "delivered",
        },
        select: {
          id: true,
        },
      });

      if (existingDelivery) {
        console.log(
          `Already delivered order ${orderId}, product ${productId} to ${creator.discourseUrl}, skipping`,
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

        console.error(
          `Failed to deliver product ${productId} to ${creator.discourseUrl}:`,
          error,
        );

        await createDeliveryLog(
          shop,
          orderId,
          customerEmail,
          productId,
          creator.discourseUrl,
          "failed",
          message,
        );

        errors.push(
          `Product ${productId} → ${creator.discourseUrl}: ${message}`,
        );
      }
    }
  }

  if (errors.length > 0) {
    console.error(
      `Partial failure for orders/paid webhook (order ${orderId}):\n${errors.join(
        "\n",
      )}`,
    );

    return new Response("Webhook processing partially failed", {
      status: 500,
    });
  }

  await markWebhookProcessed(webhookId, shop, orderId, "orders/paid");

  return new Response();
};
