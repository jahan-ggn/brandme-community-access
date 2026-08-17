/*
  Warnings:

  - You are about to drop the column `connectionSecret` on the `RetryQueue` table. All the data in the column will be lost.
  - You are about to drop the column `discourseUrl` on the `RetryQueue` table. All the data in the column will be lost.
  - Added the required column `creatorMappingId` to the `RetryQueue` table without a default value. This is not possible if the table is not empty.

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
    "creatorMappingId" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextRetryAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_RetryQueue" ("attemptCount", "createdAt", "customerEmail", "eventType", "id", "lastError", "maxAttempts", "nextRetryAt", "orderId", "productId", "shop", "updatedAt", "webhookId") SELECT "attemptCount", "createdAt", "customerEmail", "eventType", "id", "lastError", "maxAttempts", "nextRetryAt", "orderId", "productId", "shop", "updatedAt", "webhookId" FROM "RetryQueue";
DROP TABLE "RetryQueue";
ALTER TABLE "new_RetryQueue" RENAME TO "RetryQueue";
CREATE INDEX "RetryQueue_nextRetryAt_idx" ON "RetryQueue"("nextRetryAt");
CREATE INDEX "RetryQueue_shop_idx" ON "RetryQueue"("shop");
CREATE INDEX "RetryQueue_webhookId_idx" ON "RetryQueue"("webhookId");
CREATE INDEX "RetryQueue_creatorMappingId_idx" ON "RetryQueue"("creatorMappingId");
CREATE UNIQUE INDEX "RetryQueue_webhookId_productId_creatorMappingId_eventType_key" ON "RetryQueue"("webhookId", "productId", "creatorMappingId", "eventType");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
