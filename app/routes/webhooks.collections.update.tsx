import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  isDuplicateWebhook,
  markWebhookProcessed,
} from "../utils/webhook-helpers.server";
import { syncProductMappings } from "../utils/product-sync.server";
import db from "../db.server";
import { logger } from "../utils/logger.server";
import { Sentry } from "../utils/sentry.server";

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
    Sentry.captureException(new Error("No admin session for collection sync"), {
      tags: { topic, shop },
      extra: { webhookId, collectionGid },
    });

    return new Response("Unable to sync collection", { status: 500 });
  }
  try {
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
  } catch (error) {
    logger.error(
      { shop, collectionGid, webhookId, err: error },
      "Collection sync failed",
    );
    Sentry.captureException(error, {
      tags: { topic, shop },
      extra: { webhookId, collectionGid },
    });
    return new Response("Collection sync failed", { status: 500 });
  }

  await markWebhookProcessed(
    webhookId,
    shop,
    collectionId,
    "collections/update",
  );

  return new Response();
};
