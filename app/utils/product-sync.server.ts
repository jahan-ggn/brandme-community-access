import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { getCollectionProducts } from "./collection-lookup.server";

export async function syncProductMappings(
  admin: AdminApiContext,
  shop: string,
  creatorMappingId: number,
  collectionGid: string,
): Promise<{ synced: number; removed: number }> {
  const currentProductIds = await getCollectionProducts(admin, collectionGid);

  const existingMappings = await db.productMapping.findMany({
    where: { creatorMappingId },
    select: { id: true, shopifyProductId: true },
  });

  const existingProductIds = new Set(
    existingMappings.map((m) => m.shopifyProductId),
  );
  const currentProductIdSet = new Set(currentProductIds);

  const toAdd = currentProductIds.filter((id) => !existingProductIds.has(id));
  for (const productId of toAdd) {
    await db.productMapping.create({
      data: {
        shop,
        shopifyProductId: productId,
        creatorMappingId,
      },
    });
  }

  const toRemove = existingMappings
    .filter((m) => !currentProductIdSet.has(m.shopifyProductId))
    .map((m) => m.id);

  if (toRemove.length > 0) {
    await db.productMapping.deleteMany({
      where: { id: { in: toRemove } },
    });
  }

  return { synced: toAdd.length, removed: toRemove.length };
}
