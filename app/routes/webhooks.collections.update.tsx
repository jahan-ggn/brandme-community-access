import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  isDuplicateWebhook,
  markWebhookProcessed,
} from "../utils/webhook-helpers.server";
import { syncProductMappings } from "../utils/product-sync.server";
import db from "../db.server";
import { logger } from "app/utils/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload, webhookId, admin } =
    await authenticate.webhook(request);

  logger.info({ topic, shop, webhookId }, "Webhook received");

  if (await isDuplicateWebhook(webhookId)) {
    logger.info({ webhookId }, "Duplicate webhook ignored");
    return new Response();
  }

  const collectionId = payload?.id?.toString() ?? "";
  const collectionGid = `gid://shopify/Collection/${collectionId}`;

  const mappings = await db.creatorMapping.findMany({
    where: {
      shop,
      shopifyCollectionId: collectionGid,
      enabled: true,
    },
  });

  if (mappings.length === 0) {
    logger.info({ shop, collectionGid }, "No CreatorMapping, skipping sync");

    await markWebhookProcessed(
      webhookId,
      shop,
      collectionId,
      "collections/update",
    );
    return new Response();
  }

  if (!admin) {
    logger.error(
      { shop, collectionGid },
      "No admin session, collection sync incomplete",
    );

    return new Response("Unable to sync collection", { status: 500 });
  }

  for (const mapping of mappings) {
    const result = await syncProductMappings(
      admin,
      shop,
      mapping.id,
      collectionGid,
    );
    logger.info(
      {
        shop,
        collectionGid,
        mappingId: mapping.id,
        synced: result.synced,
        removed: result.removed,
      },
      "Collection synced",
    );
  }

  await markWebhookProcessed(
    webhookId,
    shop,
    collectionId,
    "collections/update",
  );

  return new Response();
};
