-- CreateTable
CREATE TABLE "CreatorMapping" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shopifyCollectionId" TEXT NOT NULL,
    "collectionName" TEXT NOT NULL,
    "discourseUrl" TEXT NOT NULL,
    "connectionSecret" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProcessedWebhook" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "webhookId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processed',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME
);

-- CreateTable
CREATE TABLE "DeliveryLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "discourseCommunity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "CreatorMapping_shopifyCollectionId_key" ON "CreatorMapping"("shopifyCollectionId");

-- CreateIndex
CREATE INDEX "CreatorMapping_shopifyCollectionId_idx" ON "CreatorMapping"("shopifyCollectionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedWebhook_webhookId_key" ON "ProcessedWebhook"("webhookId");

-- CreateIndex
CREATE INDEX "ProcessedWebhook_webhookId_idx" ON "ProcessedWebhook"("webhookId");

-- CreateIndex
CREATE INDEX "ProcessedWebhook_orderId_idx" ON "ProcessedWebhook"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryLog_orderId_idx" ON "DeliveryLog"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryLog_customerEmail_idx" ON "DeliveryLog"("customerEmail");
