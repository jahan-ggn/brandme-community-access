-- CreateTable
CREATE TABLE "RetryQueue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
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

-- CreateIndex
CREATE INDEX "RetryQueue_nextRetryAt_idx" ON "RetryQueue"("nextRetryAt");

-- CreateIndex
CREATE INDEX "RetryQueue_shop_idx" ON "RetryQueue"("shop");
