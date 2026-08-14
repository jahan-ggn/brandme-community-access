import db from "../db.server";
import { forwardToDiscourse } from "./discourse-forwarder.server";
import { createDeliveryLog } from "./webhook-helpers.server";
import { logger } from "./logger.server";
import { Sentry } from "./sentry.server";
import { MAX_RETRY_ATTEMPTS } from "./retry-config.server";

const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 3_600_000;
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = MAX_RETRY_ATTEMPTS;

function calculateBackoff(attemptCount: number): number {
  const delay = BASE_DELAY_MS * Math.pow(2, attemptCount);
  return Math.min(delay, MAX_DELAY_MS);
}

export async function enqueueRetry(
  shop: string,
  orderId: string,
  customerEmail: string,
  productId: string,
  discourseUrl: string,
  connectionSecret: string,
  eventType: string,
  webhookId: string,
  lastError?: string,
): Promise<void> {
  await db.retryQueue.create({
    data: {
      shop,
      orderId,
      customerEmail,
      productId,
      discourseUrl,
      connectionSecret,
      eventType,
      webhookId,
      lastError,
    },
  });

  logger.info(
    { shop, orderId, productId, discourseUrl, eventType },
    "Enqueued retry for failed delivery",
  );
}

export async function processRetryQueue(): Promise<void> {
  const now = new Date();

  const pendingRetries = await db.retryQueue.findMany({
    where: {
      nextRetryAt: { lte: now },
      attemptCount: { lt: MAX_ATTEMPTS },
    },
    orderBy: { nextRetryAt: "asc" },
    take: BATCH_SIZE,
  });

  if (pendingRetries.length === 0) return;

  logger.info({ count: pendingRetries.length }, "Processing retry queue batch");

  for (const item of pendingRetries) {
    try {
      const result = await forwardToDiscourse(
        item.discourseUrl,
        item.connectionSecret,
        {
          event: item.eventType as "purchase" | "refund",
          email: item.customerEmail,
          webhookId: item.webhookId,
          productId: item.productId,
          orderId: item.orderId,
        },
      );

      if (result.success) {
        await db.retryQueue.delete({ where: { id: item.id } });

        await createDeliveryLog(
          item.shop,
          item.orderId,
          item.customerEmail,
          item.productId,
          item.discourseUrl,
          item.eventType === "purchase" ? "delivered" : "refund_delivered",
          undefined,
          item.eventType,
        );

        logger.info(
          { shop: item.shop, orderId: item.orderId, productId: item.productId },
          "Retry succeeded, removed from queue",
        );
      } else {
        const nextAttempt = item.attemptCount + 1;

        if (nextAttempt >= MAX_ATTEMPTS) {
          await db.retryQueue.delete({ where: { id: item.id } });

          Sentry.captureException(new Error("Retry exhausted max attempts"), {
            tags: { shop: item.shop },
            extra: {
              orderId: item.orderId,
              productId: item.productId,
              discourseUrl: item.discourseUrl,
              lastError: result.error,
            },
          });

          logger.error(
            {
              shop: item.shop,
              orderId: item.orderId,
              productId: item.productId,
              discourseUrl: item.discourseUrl,
              lastError: result.error,
            },
            "Retry exhausted max attempts, giving up",
          );
        } else {
          await db.retryQueue.update({
            where: { id: item.id },
            data: {
              attemptCount: nextAttempt,
              lastError: result.error,
              nextRetryAt: new Date(Date.now() + calculateBackoff(nextAttempt)),
            },
          });

          logger.warn(
            {
              shop: item.shop,
              orderId: item.orderId,
              productId: item.productId,
              error: result.error,
              attempt: nextAttempt,
            },
            "Retry failed, rescheduled",
          );
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const nextAttempt = item.attemptCount + 1;

      if (nextAttempt >= MAX_ATTEMPTS) {
        await db.retryQueue.delete({ where: { id: item.id } });

        Sentry.captureException(error, {
          tags: { shop: item.shop },
          extra: {
            orderId: item.orderId,
            productId: item.productId,
            discourseUrl: item.discourseUrl,
            lastError: message,
          },
        });

        logger.error(
          {
            shop: item.shop,
            orderId: item.orderId,
            productId: item.productId,
            discourseUrl: item.discourseUrl,
          },
          "Retry exhausted max attempts after exception, giving up",
        );
      } else {
        await db.retryQueue.update({
          where: { id: item.id },
          data: {
            attemptCount: nextAttempt,
            lastError: message,
            nextRetryAt: new Date(Date.now() + calculateBackoff(nextAttempt)),
          },
        });

        Sentry.captureException(error, {
          tags: { shop: item.shop },
          extra: {
            orderId: item.orderId,
            productId: item.productId,
            attempt: nextAttempt,
          },
        });

        logger.error(
          {
            shop: item.shop,
            orderId: item.orderId,
            productId: item.productId,
            err: error,
            attempt: nextAttempt,
          },
          "Retry threw exception, rescheduled",
        );
      }
    }
  }
}
