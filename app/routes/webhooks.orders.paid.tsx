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

  const orderId = payload?.id?.toString() ?? "";

  // TODO: Step 5
  // 1. Read purchased products
  // 2. Determine creator collection
  // 3. Find CreatorMapping
  // 4. Forward event to correct Discourse plugin
  // 5. Create delivery log

  // IMPORTANT:
  // Only mark the webhook processed after all required processing succeeds.
  await markWebhookProcessed(webhookId, shop, orderId, "orders/paid");

  return new Response();
};
