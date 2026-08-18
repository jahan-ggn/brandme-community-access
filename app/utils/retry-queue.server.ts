import db from "../db.server";
import { forwardToDiscourse } from "./discourse-forwarder.server";
import { createDeliveryLog } from "./webhook-helpers.server";
import { logger } from "./logger.server";
import { MAX_RETRY_ATTEMPTS } from "./retry-config.server";

const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 3_600_000;
const BATCH_SIZE = 10;

function calculateBackoff(attemptCount: number): number {
  const delay = BASE_DELAY_MS * Math.pow(2, attemptCount);

  return Math.min(delay, MAX_DELAY_MS);
}

export async function enqueueRetry(
  shop: string,
  orderId: string,
  customerEmail: string,
  productId: string,
  creatorMappingId: number,
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
      creatorMappingId,
      eventType,
      webhookId,
      maxAttempts: MAX_RETRY_ATTEMPTS,
      lastError,
    },
  });

  logger.info(
    {
      shop,
      orderId,
      productId,
      creatorMappingId,
      eventType,
      webhookId,
    },
    "Enqueued retry for failed delivery",
  );
}

export async function processRetryQueue(): Promise<void> {
  const now = new Date();

  const pendingRetries = await db.retryQueue.findMany({
    where: {
      nextRetryAt: {
        lte: now,
      },
    },
    orderBy: {
      nextRetryAt: "asc",
    },
    take: BATCH_SIZE,
  });

  if (pendingRetries.length === 0) {
    return;
  }

  logger.info({ count: pendingRetries.length }, "Processing retry queue batch");

  for (const item of pendingRetries) {
    try {
      if (item.attemptCount >= item.maxAttempts) {
        await db.retryQueue.delete({
          where: {
            id: item.id,
          },
        });

        logger.warn(
          {
            shop: item.shop,
            orderId: item.orderId,
            productId: item.productId,
            creatorMappingId: item.creatorMappingId,
            attemptCount: item.attemptCount,
            maxAttempts: item.maxAttempts,
          },
          "Removing retry that already reached max attempts",
        );

        continue;
      }

      const creatorMapping = await db.creatorMapping.findUnique({
        where: {
          id: item.creatorMappingId,
        },
        select: {
          discourseUrl: true,
          connectionSecret: true,
          enabled: true,
        },
      });

      if (!creatorMapping) {
        await db.retryQueue.delete({
          where: {
            id: item.id,
          },
        });

        logger.error(
          {
            shop: item.shop,
            orderId: item.orderId,
            productId: item.productId,
            creatorMappingId: item.creatorMappingId,
            webhookId: item.webhookId,
          },
          "Creator mapping no longer exists, removing retry",
        );

        continue;
      }

      if (!creatorMapping.enabled) {
        await db.retryQueue.delete({
          where: {
            id: item.id,
          },
        });

        logger.warn(
          {
            shop: item.shop,
            orderId: item.orderId,
            productId: item.productId,
            creatorMappingId: item.creatorMappingId,
            webhookId: item.webhookId,
          },
          "Creator mapping is disabled, removing retry",
        );

        continue;
      }

      const result = await forwardToDiscourse(
        creatorMapping.discourseUrl,
        creatorMapping.connectionSecret,
        {
          event: item.eventType as "purchase" | "refund",
          email: item.customerEmail,
          webhookId: item.webhookId,
          productId: item.productId,
          orderId: item.orderId,
        },
      );

      if (result.success) {
        await db.retryQueue.delete({
          where: {
            id: item.id,
          },
        });

        await createDeliveryLog(
          item.shop,
          item.orderId,
          item.customerEmail,
          item.productId,
          creatorMapping.discourseUrl,
          item.eventType === "purchase" ? "delivered" : "refund_delivered",
          undefined,
          item.eventType,
        );

        logger.info(
          {
            shop: item.shop,
            orderId: item.orderId,
            productId: item.productId,
            creatorMappingId: item.creatorMappingId,
          },
          "Retry succeeded, removed from queue",
        );

        continue;
      }

      const nextAttempt = item.attemptCount + 1;

      if (nextAttempt >= item.maxAttempts) {
        await db.retryQueue.delete({
          where: {
            id: item.id,
          },
        });

        logger.error(
          {
            shop: item.shop,
            orderId: item.orderId,
            productId: item.productId,
            creatorMappingId: item.creatorMappingId,
            discourseUrl: creatorMapping.discourseUrl,
            webhookId: item.webhookId,
            attemptCount: nextAttempt,
            maxAttempts: item.maxAttempts,
            lastError: result.error,
          },
          "Retry exhausted max attempts, giving up",
        );

        continue;
      }

      await db.retryQueue.update({
        where: {
          id: item.id,
        },
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
          creatorMappingId: item.creatorMappingId,
          error: result.error,
          attempt: nextAttempt,
          maxAttempts: item.maxAttempts,
        },
        "Retry failed, rescheduled",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      const nextAttempt = item.attemptCount + 1;

      if (nextAttempt >= item.maxAttempts) {
        await db.retryQueue.delete({
          where: {
            id: item.id,
          },
        });

        logger.error(
          {
            shop: item.shop,
            orderId: item.orderId,
            productId: item.productId,
            creatorMappingId: item.creatorMappingId,
            webhookId: item.webhookId,
            attemptCount: nextAttempt,
            maxAttempts: item.maxAttempts,
            err: error,
          },
          "Retry exhausted max attempts after exception, giving up",
        );

        continue;
      }

      await db.retryQueue.update({
        where: {
          id: item.id,
        },
        data: {
          attemptCount: nextAttempt,
          lastError: message,
          nextRetryAt: new Date(Date.now() + calculateBackoff(nextAttempt)),
        },
      });

      logger.error(
        {
          shop: item.shop,
          orderId: item.orderId,
          productId: item.productId,
          creatorMappingId: item.creatorMappingId,
          webhookId: item.webhookId,
          err: error,
          attempt: nextAttempt,
          maxAttempts: item.maxAttempts,
        },
        "Retry threw exception, rescheduled",
      );
    }
  }
}
