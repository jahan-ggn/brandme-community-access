import type { ActionFunctionArgs } from "react-router";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logger } from "../utils/logger.server";
import { Sentry } from "../utils/sentry.server";
import {
  isDuplicateWebhook,
  markWebhookProcessed,
} from "../utils/webhook-helpers.server";
import { syncProductMappings } from "../utils/product-sync.server";
import { adminGraphQL } from "../utils/api.server";

type ProductPayload = {
  id: number | string;
};

type ProductCollectionsData = {
  product: {
    collections: {
      nodes: Array<{ id: string }>;
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
    } | null;
  } | null;
};

async function getProductCollections(
  admin: AdminApiContext,
  productGid: string,
): Promise<string[]> {
  const collectionIds: string[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data: ProductCollectionsData =
      await adminGraphQL<ProductCollectionsData>(
        admin,
        `#graphql
        query GetProductCollections($id: ID!, $after: String) {
          product(id: $id) {
            collections(first: 250, after: $after) {
              nodes {
                id
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `,
        { id: productGid, after: cursor },
      );

    const collections = data.product?.collections;

    if (!collections) break;

    for (const node of collections.nodes) {
      collectionIds.push(node.id);
    }

    hasNextPage = collections.pageInfo.hasNextPage;
    cursor = collections.pageInfo.endCursor;

    if (hasNextPage && !cursor) {
      throw new Error("Shopify returned hasNextPage=true but no endCursor");
    }
  }

  return collectionIds;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload, webhookId, admin } =
    await authenticate.webhook(request);

  logger.info({ topic, shop, webhookId }, "Webhook received");

  if (await isDuplicateWebhook(webhookId)) {
    logger.info({ webhookId }, "Duplicate webhook ignored");
    return new Response();
  }

  const product = payload as ProductPayload;
  const productId = String(product.id);
  const productGid = `gid://shopify/Product/${productId}`;

  if (!admin) {
    logger.error(
      { shop, productGid },
      "No admin session for products/update, cannot sync",
    );
    Sentry.captureException(new Error("No admin session for products/update"), {
      tags: { topic, shop },
      extra: { webhookId, productGid },
    });
    return new Response("Unable to process product update", { status: 500 });
  }

  try {
    const existingMappings = await db.productMapping.findMany({
      where: {
        shop,
        shopifyProductId: productGid,
        creatorMapping: { enabled: true },
      },
      select: {
        creatorMappingId: true,
        creatorMapping: {
          select: { shopifyCollectionId: true },
        },
      },
    });

    const currentCollectionIds = await getProductCollections(admin, productGid);
    const currentCollectionSet = new Set(currentCollectionIds);

    const mappingIdsToSync = new Set<number>();

    for (const mapping of existingMappings) {
      if (
        !currentCollectionSet.has(mapping.creatorMapping.shopifyCollectionId)
      ) {
        mappingIdsToSync.add(mapping.creatorMappingId);
      }
    }

    if (currentCollectionIds.length > 0) {
      const matchingMappings = await db.creatorMapping.findMany({
        where: {
          shop,
          enabled: true,
          shopifyCollectionId: { in: currentCollectionIds },
        },
        select: { id: true },
      });

      for (const mapping of matchingMappings) {
        mappingIdsToSync.add(mapping.id);
      }
    }

    if (mappingIdsToSync.size === 0) {
      logger.info(
        { shop, productGid },
        "No creator mappings affected by product update, skipping",
      );
      await markWebhookProcessed(webhookId, shop, productId, "products/update");
      return new Response();
    }

    for (const mappingId of mappingIdsToSync) {
      const mapping = await db.creatorMapping.findUnique({
        where: { id: mappingId },
        select: { shopifyCollectionId: true, collectionName: true },
      });

      if (!mapping) continue;

      const result = await syncProductMappings(
        admin,
        shop,
        mappingId,
        mapping.shopifyCollectionId,
      );

      logger.info(
        {
          shop,
          productGid,
          mappingId,
          collectionName: mapping.collectionName,
          synced: result.synced,
          removed: result.removed,
        },
        "Product update triggered collection re-sync",
      );
    }
  } catch (error) {
    logger.error(
      { shop, productGid, webhookId, err: error },
      "Failed to process products/update webhook",
    );
    Sentry.captureException(error, {
      tags: { topic, shop },
      extra: { webhookId, productGid },
    });
    return new Response("Webhook processing failed", { status: 500 });
  }

  await markWebhookProcessed(webhookId, shop, productId, "products/update");
  return new Response();
};
