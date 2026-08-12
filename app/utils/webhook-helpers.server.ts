import db from "../db.server";

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
