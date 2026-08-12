import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { useEffect, useRef } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

import db from "../db.server";
import { authenticate } from "../shopify.server";
import { syncProductMappings } from "../utils/product-sync.server";
import { adminGraphQL } from "../utils/api.server";
import { parseId } from "../utils/validation.server";
import { logger } from "app/utils/logger.server";

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
      products: {
        select: {
          id: true,
        },
      },
    },
  });

  const collections: ShopifyCollection[] = [];

  let cursor: string | null = null;
  let hasNextPage: boolean = true;

  while (hasNextPage) {
    const responseData: CollectionsData = await adminGraphQL<CollectionsData>(
      admin,
      `#graphql
        query GetCollections($after: String) {
          collections(first: 250, after: $after) {
            nodes {
              id
              title
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      {
        after: cursor,
      },
    );

    const collectionsData: CollectionsConnection = responseData.collections;

    for (const collection of collectionsData.nodes) {
      collections.push({
        id: collection.id,
        title: collection.title,
      });
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

    const discourseUrl = String(formData.get("discourseUrl") ?? "").trim();

    if (!shopifyCollectionId || !discourseUrl) {
      return {
        error: "Collection and Discourse URL are required",
      };
    }

    let parsedDiscourseUrl: URL;

    try {
      parsedDiscourseUrl = new URL(discourseUrl);
    } catch {
      return {
        error: "Please enter a valid Discourse URL",
      };
    }

    if (parsedDiscourseUrl.protocol !== "https:") {
      return {
        error: "Please enter a valid HTTPS Discourse URL",
      };
    }

    const existing = await db.creatorMapping.findUnique({
      where: {
        shop_shopifyCollectionId: {
          shop,
          shopifyCollectionId,
        },
      },
    });

    if (existing) {
      return {
        error: "A mapping for this collection already exists",
      };
    }

    const responseData: CollectionData = await adminGraphQL<CollectionData>(
      admin,
      `#graphql
      query GetCollection($id: ID!) {
        collection(id: $id) {
          id
          title
        }
      }
    `,
      {
        id: shopifyCollectionId,
      },
    );

    const collection: ShopifyCollection | null = responseData.collection;

    if (!collection) {
      return {
        error: "The selected Shopify collection could not be found",
      };
    }

    const connectionSecret = crypto.randomUUID();

    const mapping = await db.creatorMapping.create({
      data: {
        shop,
        shopifyCollectionId: collection.id,
        collectionName: collection.title,
        discourseUrl: parsedDiscourseUrl.toString().replace(/\/+$/, ""),
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
          collectionTitle: collection.title,
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
      };
    } catch (error) {
      await db.creatorMapping.delete({
        where: {
          id: mapping.id,
        },
      });

      logger.error(
        { shop, collectionTitle: collection.title, err: error },
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
    if (id === null) {
      return { error: "A valid mapping ID is required" };
    }

    const discourseUrl = String(formData.get("discourseUrl") ?? "").trim();

    if (!discourseUrl) {
      return {
        error: "Discourse URL is required",
      };
    }

    let parsedDiscourseUrl: URL;

    try {
      parsedDiscourseUrl = new URL(discourseUrl);
    } catch {
      return {
        error: "Please enter a valid Discourse URL",
      };
    }

    if (parsedDiscourseUrl.protocol !== "https:") {
      return {
        error: "Please enter a valid HTTPS Discourse URL",
      };
    }

    const mapping = await db.creatorMapping.findFirst({
      where: {
        id,
        shop,
      },
    });

    if (!mapping) {
      return {
        error: "Mapping not found",
      };
    }

    await db.creatorMapping.update({
      where: {
        id: mapping.id,
      },
      data: {
        discourseUrl: parsedDiscourseUrl.toString().replace(/\/+$/, ""),
      },
    });

    return {
      success: true,
      message: "Mapping updated.",
    };
  }

  if (intent === "toggle") {
    const id = parseId(formData.get("id"));
    if (id === null) {
      return { error: "A valid mapping ID is required" };
    }

    const mapping = await db.creatorMapping.findFirst({
      where: {
        id,
        shop,
      },
    });

    if (!mapping) {
      return {
        error: "Mapping not found",
      };
    }

    const enabled = !mapping.enabled;

    await db.creatorMapping.update({
      where: {
        id: mapping.id,
      },
      data: {
        enabled,
      },
    });

    return {
      success: true,
      message: `Mapping ${enabled ? "enabled" : "disabled"}.`,
    };
  }

  if (intent === "delete") {
    const id = parseId(formData.get("id"));
    if (id === null) {
      return { error: "A valid mapping ID is required" };
    }

    const mapping = await db.creatorMapping.findFirst({
      where: {
        id,
        shop,
      },
    });

    if (!mapping) {
      return {
        error: "Mapping not found",
      };
    }

    await db.creatorMapping.delete({
      where: {
        id: mapping.id,
      },
    });

    return {
      success: true,
      message: "Mapping deleted.",
    };
  }

  if (intent === "resync") {
    const id = parseId(formData.get("id"));
    if (id === null) {
      return { error: "A valid mapping ID is required" };
    }

    const mapping = await db.creatorMapping.findFirst({
      where: {
        id,
        shop,
      },
    });

    if (!mapping) {
      return {
        error: "Mapping not found",
      };
    }

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
        message:
          `Re-synced successfully. ` +
          `${syncResult.synced} added, ${syncResult.removed} removed.`,
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

  return {
    error: "Unknown action",
  };
};

export default function MappingsPage() {
  const { mappings, collections } = useLoaderData<typeof loader>();

  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const shopify = useAppBridge();

  const previousFetcherState = useRef(fetcher.state);

  const fetcherData = fetcher.data;

  const error =
    fetcherData && "error" in fetcherData ? fetcherData.error : undefined;

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
    }

    previousFetcherState.current = fetcher.state;
  }, [fetcher.state, fetcher.data, shopify, revalidator]);

  return (
    <s-page heading="Creator Community Mappings">
      <s-section heading="Add a new mapping">
        {error && (
          <s-banner tone="critical">
            <s-paragraph>{error}</s-paragraph>
          </s-banner>
        )}

        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="create" />

          <s-stack direction="block" gap="base">
            <s-select
              name="shopifyCollectionId"
              label="Shopify Collection"
              placeholder="Select a collection…"
              required
            >
              {collections.map((collection) => (
                <s-option
                  key={collection.id}
                  value={collection.id}
                  disabled={collection.alreadyMapped}
                >
                  {collection.title}
                  {collection.alreadyMapped ? " (already mapped)" : ""}
                </s-option>
              ))}
            </s-select>

            <s-text-field
              name="discourseUrl"
              label="Discourse Community URL"
              placeholder="https://community.example.com"
              required
            />

            <s-button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create mapping"}
            </s-button>
          </s-stack>
        </fetcher.Form>
      </s-section>

      <s-section heading="Existing mappings">
        {mappings.length === 0 ? (
          <s-paragraph>No mappings yet. Create one above.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Creator</s-table-header>

              <s-table-header>Discourse URL</s-table-header>

              <s-table-header>Products</s-table-header>

              <s-table-header>Status</s-table-header>

              <s-table-header>Created</s-table-header>

              <s-table-header>Actions</s-table-header>
            </s-table-header-row>

            <s-table-body>
              {mappings.map((mapping) => (
                <s-table-row key={mapping.id}>
                  <s-table-cell>{mapping.collectionName}</s-table-cell>

                  <s-table-cell>{mapping.discourseUrl}</s-table-cell>

                  <s-table-cell>{mapping.productCount}</s-table-cell>

                  <s-table-cell>
                    {mapping.enabled ? "Enabled" : "Disabled"}
                  </s-table-cell>

                  <s-table-cell>
                    {new Date(mapping.createdAt).toLocaleDateString()}
                  </s-table-cell>

                  <s-table-cell>
                    <s-stack direction="inline" gap="base">
                      <fetcher.Form method="post" style={{ display: "inline" }}>
                        <input type="hidden" name="intent" value="toggle" />

                        <input type="hidden" name="id" value={mapping.id} />

                        <s-button
                          type="submit"
                          variant="tertiary"
                          disabled={isSubmitting}
                        >
                          {mapping.enabled ? "Disable" : "Enable"}
                        </s-button>
                      </fetcher.Form>

                      <fetcher.Form method="post" style={{ display: "inline" }}>
                        <input type="hidden" name="intent" value="resync" />

                        <input type="hidden" name="id" value={mapping.id} />

                        <s-button
                          type="submit"
                          variant="tertiary"
                          disabled={isSubmitting}
                        >
                          Re-sync
                        </s-button>
                      </fetcher.Form>

                      <fetcher.Form method="post" style={{ display: "inline" }}>
                        <input type="hidden" name="intent" value="delete" />

                        <input type="hidden" name="id" value={mapping.id} />

                        <s-button
                          type="submit"
                          variant="tertiary"
                          tone="critical"
                          disabled={isSubmitting}
                        >
                          Delete
                        </s-button>
                      </fetcher.Form>
                    </s-stack>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
