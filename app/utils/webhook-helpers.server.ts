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
  orderId: string,
  eventType: string,
): Promise<void> {
  await db.processedWebhook.create({
    data: {
      webhookId,
      shop,
      orderId,
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
): Promise<void> {
  await db.deliveryLog.create({
    data: {
      shop,
      orderId,
      customerEmail,
      productId,
      discourseCommunity,
      status,
      errorMessage: errorMessage ?? null,
    },
  });
}
