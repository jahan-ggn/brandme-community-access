import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  const webhookId = request.headers.get("x-shopify-webhook-id") || "";
  console.log(
    `Received ${topic} webhook for ${shop} (webhook ID: ${webhookId})`,
  );

  // TODO: Step 4 — deduplicate via ProcessedWebhook table
  // TODO: Step 6 — revoke Discourse group access for refunded items

  return new Response();
};
