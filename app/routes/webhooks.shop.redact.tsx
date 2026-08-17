import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logger } from "../utils/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);

  logger.info({ topic, shop }, "Shop redaction webhook received");

  await db.$transaction([
    db.session.deleteMany({ where: { shop } }),
    db.deliveryLog.deleteMany({ where: { shop } }),
    db.retryQueue.deleteMany({ where: { shop } }),
    db.processedWebhook.deleteMany({ where: { shop } }),
    db.productMapping.deleteMany({ where: { shop } }),
    db.creatorMapping.deleteMany({ where: { shop } }),
  ]);

  logger.info({ topic, shop }, "Shop data redacted");

  return new Response(null, { status: 200 });
};
