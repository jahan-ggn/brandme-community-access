-- CreateTable
CREATE TABLE "ProductMapping" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "creatorMappingId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductMapping_creatorMappingId_fkey" FOREIGN KEY ("creatorMappingId") REFERENCES "CreatorMapping" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProductMapping_shop_shopifyProductId_idx" ON "ProductMapping"("shop", "shopifyProductId");

-- CreateIndex
CREATE INDEX "ProductMapping_creatorMappingId_idx" ON "ProductMapping"("creatorMappingId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMapping_creatorMappingId_shopifyProductId_key" ON "ProductMapping"("creatorMappingId", "shopifyProductId");
