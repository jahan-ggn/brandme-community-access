/*
  Warnings:

  - Added the required column `webhookId` to the `RetryQueue` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RetryQueue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "discourseUrl" TEXT NOT NULL,
    "connectionSecret" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextRetryAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_RetryQueue" ("attemptCount", "connectionSecret", "createdAt", "customerEmail", "discourseUrl", "eventType", "id", "lastError", "maxAttempts", "nextRetryAt", "orderId", "productId", "shop", "updatedAt") SELECT "attemptCount", "connectionSecret", "createdAt", "customerEmail", "discourseUrl", "eventType", "id", "lastError", "maxAttempts", "nextRetryAt", "orderId", "productId", "shop", "updatedAt" FROM "RetryQueue";
DROP TABLE "RetryQueue";
ALTER TABLE "new_RetryQueue" RENAME TO "RetryQueue";
CREATE INDEX "RetryQueue_nextRetryAt_idx" ON "RetryQueue"("nextRetryAt");
CREATE INDEX "RetryQueue_shop_idx" ON "RetryQueue"("shop");
CREATE INDEX "RetryQueue_webhookId_idx" ON "RetryQueue"("webhookId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
