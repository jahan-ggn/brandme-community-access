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
    "pluginStatus" TEXT NOT NULL DEFAULT 'unknown',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_CreatorMapping" ("collectionName", "connectionSecret", "createdAt", "discourseUrl", "enabled", "id", "shop", "shopifyCollectionId", "updatedAt") SELECT "collectionName", "connectionSecret", "createdAt", "discourseUrl", "enabled", "id", "shop", "shopifyCollectionId", "updatedAt" FROM "CreatorMapping";
DROP TABLE "CreatorMapping";
ALTER TABLE "new_CreatorMapping" RENAME TO "CreatorMapping";
CREATE UNIQUE INDEX "CreatorMapping_shop_shopifyCollectionId_key" ON "CreatorMapping"("shop", "shopifyCollectionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
