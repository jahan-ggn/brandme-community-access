import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  useFetcher,
  useLoaderData,
  useRevalidator,
  useRouteError,
} from "react-router";
import { useEffect, useRef } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import db from "../db.server";
import { authenticate } from "../shopify.server";
import { syncProductMappings } from "../utils/product-sync.server";
import { adminGraphQL } from "../utils/api.server";
import { checkDiscourseHealth } from "../utils/discourse-forwarder.server";
import {
  parseId,
  validateCollectionName,
  validateDiscourseUrl,
} from "../utils/validation.server";
import { logger } from "../utils/logger.server";
import { Sentry } from "../utils/sentry";

import { MappingForm } from "../components/mappings/MappingForm";
import { MappingsTable } from "../components/mappings/MappingsTable";

type ShopifyCollection = {
  id: string;
  title: string;
};

type CollectionsConnection = {
  nodes: ShopifyCollection[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
};

type CollectionsData = {
  collections: CollectionsConnection;
};

type CollectionData = {
  collection: ShopifyCollection | null;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const mappings = await db.creatorMapping.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    include: {
      products: { select: { id: true } },
    },
  });

  const collections: ShopifyCollection[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const responseData: CollectionsData = await adminGraphQL<CollectionsData>(
      admin,
      `#graphql
        query GetCollections($after: String) {
          collections(first: 250, after: $after) {
            nodes { id title }
            pageInfo { hasNextPage endCursor }
          }
        }
      `,
      { after: cursor },
    );

    const collectionsData = responseData.collections;

    for (const collection of collectionsData.nodes) {
      collections.push({ id: collection.id, title: collection.title });
    }

    hasNextPage = collectionsData.pageInfo.hasNextPage;
    cursor = collectionsData.pageInfo.endCursor;

    if (hasNextPage && !cursor) {
      throw new Error("Shopify returned hasNextPage=true but no endCursor");
    }
  }

  const mappedCollectionIds = new Set(
    mappings.map((mapping) => mapping.shopifyCollectionId),
  );

  return {
    mappings: mappings.map((mapping) => ({
      id: mapping.id,
      collectionName: mapping.collectionName,
      discourseUrl: mapping.discourseUrl,
      shopifyCollectionId: mapping.shopifyCollectionId,
      enabled: mapping.enabled,
      productCount: mapping.products.length,
      createdAt: mapping.createdAt,
      connectionSecret: mapping.connectionSecret,
      pluginStatus: mapping.pluginStatus,
    })),
    collections: collections.map((collection) => ({
      ...collection,
      alreadyMapped: mappedCollectionIds.has(collection.id),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "create") {
    const shopifyCollectionId = String(
      formData.get("shopifyCollectionId") ?? "",
    ).trim();

    if (!shopifyCollectionId) {
      return { error: "Collection is required" };
    }

    const discourseUrlRaw = String(formData.get("discourseUrl") ?? "");
    const urlResult = validateDiscourseUrl(discourseUrlRaw);

    if (!urlResult.ok) {
      return { error: urlResult.error };
    }

    const discourseUrl = urlResult.url;

    const existing = await db.creatorMapping.findUnique({
      where: {
        shop_shopifyCollectionId: { shop, shopifyCollectionId },
      },
    });

    if (existing) {
      return { error: "A mapping for this collection already exists" };
    }

    const responseData: CollectionData = await adminGraphQL<CollectionData>(
      admin,
      `#graphql
        query GetCollection($id: ID!) {
          collection(id: $id) { id title }
        }
      `,
      { id: shopifyCollectionId },
    );

    const collection = responseData.collection;

    if (!collection) {
      return { error: "The selected Shopify collection could not be found" };
    }

    const nameResult = validateCollectionName(collection.title);

    if (!nameResult.ok) {
      return { error: nameResult.error };
    }

    const connectionSecret = crypto.randomUUID();

    const mapping = await db.creatorMapping.create({
      data: {
        shop,
        shopifyCollectionId: collection.id,
        collectionName: nameResult.name,
        discourseUrl,
        connectionSecret,
        enabled: true,
      },
    });

    try {
      const syncResult = await syncProductMappings(
        admin,
        shop,
        mapping.id,
        collection.id,
      );

      logger.info(
        {
          shop,
          collectionTitle: nameResult.name,
          synced: syncResult.synced,
          removed: syncResult.removed,
        },
        "Mapping created and synced",
      );

      return {
        success: true,
        message: `Mapping created. ${syncResult.synced} product${
          syncResult.synced === 1 ? "" : "s"
        } synced.`,
        connectionSecret: mapping.connectionSecret,
      };
    } catch (error) {
      await db.creatorMapping.delete({ where: { id: mapping.id } });

      logger.error(
        { shop, collectionTitle: nameResult.name, err: error },
        "Failed to create mapping",
      );

      return {
        error:
          error instanceof Error
            ? `Mapping could not be created: ${error.message}`
            : "Mapping could not be created because product sync failed",
      };
    }
  }

  if (intent === "edit") {
    const id = parseId(formData.get("id"));
    if (id === null) return { error: "A valid mapping ID is required" };

    const discourseUrlRaw = String(formData.get("discourseUrl") ?? "");
    const urlResult = validateDiscourseUrl(discourseUrlRaw);
    if (!urlResult.ok) return { error: urlResult.error };

    const mapping = await db.creatorMapping.findFirst({ where: { id, shop } });
    if (!mapping) return { error: "Mapping not found" };

    await db.creatorMapping.update({
      where: { id: mapping.id },
      data: { discourseUrl: urlResult.url },
    });

    return { success: true, message: "Mapping updated." };
  }

  if (intent === "toggle") {
    const id = parseId(formData.get("id"));
    if (id === null) return { error: "A valid mapping ID is required" };

    const mapping = await db.creatorMapping.findFirst({ where: { id, shop } });
    if (!mapping) return { error: "Mapping not found" };

    const enabled = !mapping.enabled;

    await db.creatorMapping.update({
      where: { id: mapping.id },
      data: { enabled },
    });

    return {
      success: true,
      message: `Mapping ${enabled ? "enabled" : "disabled"}.`,
    };
  }

  if (intent === "delete") {
    const id = parseId(formData.get("id"));
    if (id === null) return { error: "A valid mapping ID is required" };

    const mapping = await db.creatorMapping.findFirst({ where: { id, shop } });
    if (!mapping) return { error: "Mapping not found" };

    await db.creatorMapping.delete({ where: { id: mapping.id } });

    return { success: true, message: "Mapping deleted." };
  }

  if (intent === "resync") {
    const id = parseId(formData.get("id"));
    if (id === null) return { error: "A valid mapping ID is required" };

    const mapping = await db.creatorMapping.findFirst({ where: { id, shop } });
    if (!mapping) return { error: "Mapping not found" };

    try {
      const syncResult = await syncProductMappings(
        admin,
        shop,
        mapping.id,
        mapping.shopifyCollectionId,
      );

      logger.info(
        {
          shop,
          collectionName: mapping.collectionName,
          synced: syncResult.synced,
          removed: syncResult.removed,
        },
        "Re-synced",
      );

      return {
        success: true,
        message: `Re-synced successfully. ${syncResult.synced} added, ${syncResult.removed} removed.`,
      };
    } catch (error) {
      logger.error(
        { shop, collectionName: mapping.collectionName, err: error },
        "Re-sync failed",
      );

      return {
        error:
          error instanceof Error
            ? `Sync failed: ${error.message}`
            : "Sync failed",
      };
    }
  }

  if (intent === "test") {
    const id = parseId(formData.get("id"));
    if (id === null) {
      return { error: "A valid mapping ID is required" };
    }

    const mapping = await db.creatorMapping.findFirst({
      where: { id, shop },
    });

    if (!mapping) {
      return { error: "Mapping not found" };
    }

    const result = await checkDiscourseHealth(mapping.discourseUrl);

    await db.creatorMapping.update({
      where: { id: mapping.id },
      data: { pluginStatus: result.status },
    });

    if (result.ok) {
      return {
        success: true,
        message: `Plugin is connected at ${mapping.discourseUrl}`,
        pluginStatus: result.status,
      };
    }

    return {
      success: true,
      message: `Plugin check failed: ${result.error}`,
      pluginStatus: result.status,
    };
  }

  return { error: "Unknown action" };
};

export default function MappingsPage() {
  const { mappings, collections } = useLoaderData<typeof loader>();

  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const shopify = useAppBridge();

  const previousFetcherState = useRef(fetcher.state);
  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    const wasBusy = previousFetcherState.current !== "idle";
    const isNowIdle = fetcher.state === "idle";

    if (wasBusy && isNowIdle && fetcher.data) {
      if ("success" in fetcher.data && fetcher.data.success) {
        const message =
          "message" in fetcher.data && fetcher.data.message
            ? fetcher.data.message
            : "Operation completed successfully.";

        shopify.toast.show(message);
        revalidator.revalidate();
      }

      if ("error" in fetcher.data && fetcher.data.error) {
        shopify.toast.show(fetcher.data.error, { isError: true });
      }
    }

    previousFetcherState.current = fetcher.state;
  }, [fetcher.state, fetcher.data, shopify, revalidator]);

  return (
    <s-page heading="Creator Community Mappings">
      <s-section heading="Add a new mapping">
        <MappingForm
          collections={collections}
          isSubmitting={isSubmitting}
          fetcher={fetcher}
        />
      </s-section>

      <s-section heading="Existing mappings">
        <MappingsTable
          mappings={mappings}
          isSubmitting={isSubmitting}
          fetcher={fetcher}
        />
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  Sentry.captureException(error);
  return boundary.error(error);
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
