import db from "../db.server";
import { logger } from "./logger.server";

const WEBHOOK_RETENTION_DAYS = 7;

export async function isDuplicateWebhook(webhookId: string): Promise<boolean> {
  const existing = await db.processedWebhook.findUnique({
    where: { webhookId },
  });

  return existing !== null;
}

export async function markWebhookProcessed(
  webhookId: string,
  shop: string,
  resourceId: string,
  eventType: string,
): Promise<void> {
  await db.processedWebhook.create({
    data: {
      webhookId,
      shop,
      resourceId,
      eventType,
      status: "processed",
      processedAt: new Date(),
    },
  });
}

export async function createDeliveryLog(
  shop: string,
  orderId: string,
  customerEmail: string,
  productId: string,
  discourseCommunity: string,
  status: string = "pending",
  errorMessage?: string,
  eventType: string = "purchase",
): Promise<void> {
  await db.deliveryLog.upsert({
    where: {
      orderId_productId_discourseCommunity_eventType: {
        orderId,
        productId,
        discourseCommunity,
        eventType,
      },
    },
    update: {
      status,
      errorMessage: errorMessage ?? null,
      customerEmail,
      updatedAt: new Date(),
    },
    create: {
      shop,
      orderId,
      customerEmail,
      productId,
      discourseCommunity,
      eventType,
      status,
      errorMessage: errorMessage ?? null,
    },
  });
}

export async function cleanupOldWebhooks(): Promise<void> {
  const cutoff = new Date(
    Date.now() - WEBHOOK_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  const result = await db.processedWebhook.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  if (result.count > 0) {
    logger.info({ deleted: result.count }, "Cleaned up old processed webhooks");
  }
}
