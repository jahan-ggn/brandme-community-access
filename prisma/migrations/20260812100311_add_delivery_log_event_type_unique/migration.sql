-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DeliveryLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "discourseCommunity" TEXT NOT NULL,
    "eventType" TEXT NOT NULL DEFAULT 'purchase',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_DeliveryLog" ("createdAt", "customerEmail", "discourseCommunity", "errorMessage", "id", "orderId", "productId", "shop", "status", "updatedAt") SELECT "createdAt", "customerEmail", "discourseCommunity", "errorMessage", "id", "orderId", "productId", "shop", "status", "updatedAt" FROM "DeliveryLog";
DROP TABLE "DeliveryLog";
ALTER TABLE "new_DeliveryLog" RENAME TO "DeliveryLog";
CREATE INDEX "DeliveryLog_shop_idx" ON "DeliveryLog"("shop");
CREATE INDEX "DeliveryLog_orderId_idx" ON "DeliveryLog"("orderId");
CREATE INDEX "DeliveryLog_customerEmail_idx" ON "DeliveryLog"("customerEmail");
CREATE UNIQUE INDEX "DeliveryLog_orderId_productId_discourseCommunity_eventType_key" ON "DeliveryLog"("orderId", "productId", "discourseCommunity", "eventType");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
