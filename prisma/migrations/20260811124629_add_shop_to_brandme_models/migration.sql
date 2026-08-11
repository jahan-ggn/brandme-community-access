/*
  Warnings:

  - Added the required column `shop` to the `CreatorMapping` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shop` to the `DeliveryLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shop` to the `ProcessedWebhook` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CreatorMapping" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "shopifyCollectionId" TEXT NOT NULL,
    "collectionName" TEXT NOT NULL,
    "discourseUrl" TEXT NOT NULL,
    "connectionSecret" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_CreatorMapping" ("collectionName", "connectionSecret", "createdAt", "discourseUrl", "enabled", "id", "shopifyCollectionId", "updatedAt") SELECT "collectionName", "connectionSecret", "createdAt", "discourseUrl", "enabled", "id", "shopifyCollectionId", "updatedAt" FROM "CreatorMapping";
DROP TABLE "CreatorMapping";
ALTER TABLE "new_CreatorMapping" RENAME TO "CreatorMapping";
CREATE UNIQUE INDEX "CreatorMapping_shop_shopifyCollectionId_key" ON "CreatorMapping"("shop", "shopifyCollectionId");
CREATE TABLE "new_DeliveryLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "discourseCommunity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_DeliveryLog" ("createdAt", "customerEmail", "discourseCommunity", "errorMessage", "id", "orderId", "productId", "status", "updatedAt") SELECT "createdAt", "customerEmail", "discourseCommunity", "errorMessage", "id", "orderId", "productId", "status", "updatedAt" FROM "DeliveryLog";
DROP TABLE "DeliveryLog";
ALTER TABLE "new_DeliveryLog" RENAME TO "DeliveryLog";
CREATE INDEX "DeliveryLog_shop_idx" ON "DeliveryLog"("shop");
CREATE INDEX "DeliveryLog_orderId_idx" ON "DeliveryLog"("orderId");
CREATE INDEX "DeliveryLog_customerEmail_idx" ON "DeliveryLog"("customerEmail");
CREATE TABLE "new_ProcessedWebhook" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "webhookId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processed',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME
);
INSERT INTO "new_ProcessedWebhook" ("createdAt", "eventType", "id", "orderId", "processedAt", "status", "webhookId") SELECT "createdAt", "eventType", "id", "orderId", "processedAt", "status", "webhookId" FROM "ProcessedWebhook";
DROP TABLE "ProcessedWebhook";
ALTER TABLE "new_ProcessedWebhook" RENAME TO "ProcessedWebhook";
CREATE UNIQUE INDEX "ProcessedWebhook_webhookId_key" ON "ProcessedWebhook"("webhookId");
CREATE INDEX "ProcessedWebhook_shop_idx" ON "ProcessedWebhook"("shop");
CREATE INDEX "ProcessedWebhook_orderId_idx" ON "ProcessedWebhook"("orderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
