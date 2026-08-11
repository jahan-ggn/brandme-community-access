import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  isDuplicateWebhook,
  markWebhookProcessed,
} from "../utils/webhook-helpers.server";
import { syncProductMappings } from "../utils/product-sync.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload, webhookId, admin } =
    await authenticate.webhook(request);

  console.log(
    `Received ${topic} webhook for ${shop} (webhook ID: ${webhookId})`,
  );

  if (await isDuplicateWebhook(webhookId)) {
    console.log(`Ignoring duplicate webhook ${webhookId}`);
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
    console.log(
      `No CreatorMapping for collection ${collectionGid}, skipping sync`,
    );
    await markWebhookProcessed(
      webhookId,
      shop,
      collectionId,
      "collections/update",
    );
    return new Response();
  }

  if (!admin) {
    console.error(
      `No admin session for ${shop}; collection sync could not be completed`,
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
    console.log(
      `Synced collection ${collectionGid}: ${result.synced} added, ${result.removed} removed`,
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
