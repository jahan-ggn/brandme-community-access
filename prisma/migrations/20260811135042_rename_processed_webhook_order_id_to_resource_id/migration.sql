/*
  Warnings:

  - You are about to drop the column `orderId` on the `ProcessedWebhook` table. All the data in the column will be lost.
  - Added the required column `resourceId` to the `ProcessedWebhook` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProcessedWebhook" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "webhookId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processed',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME
);
INSERT INTO "new_ProcessedWebhook" ("createdAt", "eventType", "id", "processedAt", "shop", "status", "webhookId") SELECT "createdAt", "eventType", "id", "processedAt", "shop", "status", "webhookId" FROM "ProcessedWebhook";
DROP TABLE "ProcessedWebhook";
ALTER TABLE "new_ProcessedWebhook" RENAME TO "ProcessedWebhook";
CREATE UNIQUE INDEX "ProcessedWebhook_webhookId_key" ON "ProcessedWebhook"("webhookId");
CREATE INDEX "ProcessedWebhook_shop_idx" ON "ProcessedWebhook"("shop");
CREATE INDEX "ProcessedWebhook_resourceId_idx" ON "ProcessedWebhook"("resourceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
