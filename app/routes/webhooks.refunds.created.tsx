import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  isDuplicateWebhook,
  markWebhookProcessed,
} from "../utils/webhook-helpers.server";

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

  const orderId = payload?.order_id?.toString() ?? "";

  // TODO: Refund handling
  // 1. Read refunded line items
  // 2. Determine which refunded products are paid membership products
  // 3. Determine the correct creator/community
  // 4. Notify the correct Discourse plugin
  // 5. Remove/update the corresponding Discourse group access
  // 6. Create delivery log

  // Only mark as processed after all refund handling succeeds.
  await markWebhookProcessed(webhookId, shop, orderId, "refunds/create");

  return new Response();
};
