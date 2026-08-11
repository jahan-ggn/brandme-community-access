import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";

import db from "../db.server";
import { authenticate } from "../shopify.server";
import { syncProductMappings } from "../utils/product-sync.server";

type ShopifyCollection = {
  id: string;
  title: string;
};

type CollectionsQueryResponse = {
  data?: {
    collections?: {
      nodes: ShopifyCollection[];
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
    };
  };
};

type CollectionQueryResponse = {
  data?: {
    collection?: ShopifyCollection | null;
  };
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
  let hasNextPage = true;

  while (hasNextPage) {
    const response: Response = await admin.graphql(
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
        variables: {
          after: cursor,
        },
      },
    );

    const responseJson: CollectionsQueryResponse = await response.json();

    const collectionsData = responseJson.data?.collections;

    if (!collectionsData) {
      break;
    }

    for (const collection of collectionsData.nodes) {
      collections.push({
        id: collection.id,
        title: collection.title,
      });
    }

    hasNextPage = collectionsData.pageInfo.hasNextPage;
    cursor = collectionsData.pageInfo.endCursor;
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

    if (
      parsedDiscourseUrl.protocol !== "https:" &&
      parsedDiscourseUrl.protocol !== "http:"
    ) {
      return {
        error: "Please enter a valid HTTP or HTTPS Discourse URL",
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

    const collectionResponse: Response = await admin.graphql(
      `#graphql
        query GetCollection($id: ID!) {
          collection(id: $id) {
            id
            title
          }
        }
      `,
      {
        variables: {
          id: shopifyCollectionId,
        },
      },
    );

    const collectionResponseJson: CollectionQueryResponse =
      await collectionResponse.json();

    const collection = collectionResponseJson.data?.collection;

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

      console.log(
        `Created mapping for ${collection.title}: ` +
          `${syncResult.synced} synced, ` +
          `${syncResult.removed} removed`,
      );

      return {
        success: true,
        synced: syncResult.synced,
      };
    } catch (error) {
      await db.creatorMapping.delete({
        where: {
          id: mapping.id,
        },
      });

      console.error(`Failed to create mapping for ${collection.title}`, error);

      return {
        error:
          error instanceof Error
            ? `Mapping could not be created: ${error.message}`
            : "Mapping could not be created because product sync failed",
      };
    }
  }

  if (intent === "edit") {
    const id = Number(formData.get("id"));

    const discourseUrl = String(formData.get("discourseUrl") ?? "").trim();

    if (!id || !discourseUrl) {
      return {
        error: "Mapping ID and Discourse URL are required",
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

    if (
      parsedDiscourseUrl.protocol !== "https:" &&
      parsedDiscourseUrl.protocol !== "http:"
    ) {
      return {
        error: "Please enter a valid HTTP or HTTPS Discourse URL",
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
      message: "Mapping updated",
    };
  }

  if (intent === "toggle") {
    const id = Number(formData.get("id"));

    if (!id) {
      return {
        error: "Mapping ID is required",
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
        enabled: !mapping.enabled,
      },
    });

    return {
      success: true,
      message: `Mapping ${!mapping.enabled ? "enabled" : "disabled"}`,
    };
  }

  if (intent === "delete") {
    const id = Number(formData.get("id"));

    if (!id) {
      return {
        error: "Mapping ID is required",
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

    await db.creatorMapping.delete({
      where: {
        id: mapping.id,
      },
    });

    return {
      success: true,
      message: "Mapping deleted",
    };
  }

  if (intent === "resync") {
    const id = Number(formData.get("id"));

    if (!id) {
      return {
        error: "Mapping ID is required",
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

    try {
      const syncResult = await syncProductMappings(
        admin,
        shop,
        mapping.id,
        mapping.shopifyCollectionId,
      );

      console.log(
        `Re-synced ${mapping.collectionName}: ` +
          `${syncResult.synced} added, ` +
          `${syncResult.removed} removed`,
      );

      return {
        success: true,
        message:
          `Re-synced: ${syncResult.synced} added, ` +
          `${syncResult.removed} removed`,
      };
    } catch (error) {
      console.error(`Failed to re-sync ${mapping.collectionName}`, error);

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

  const data = fetcher.data;

  const error = data && "error" in data ? data.error : undefined;

  const success = data && "success" in data ? data.success : false;

  const message = data && "message" in data ? data.message : undefined;

  const synced = data && "synced" in data ? data.synced : undefined;

  const isSubmitting = fetcher.state !== "idle";

  return (
    <s-page heading="Creator Community Mappings">
      <s-section heading="Add a new mapping">
        {error && (
          <s-banner tone="critical">
            <p>{error}</p>
          </s-banner>
        )}

        {success && (
          <s-banner tone="success">
            <p>
              {message ?? "Mapping created successfully."}

              {typeof synced === "number"
                ? ` ${synced} products were synced.`
                : ""}
            </p>
          </s-banner>
        )}

        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="create" />
          {collections.length === 0 ? (
            <s-paragraph>
              No Shopify collections found. Create a collection in Shopify Admin
              first.
            </s-paragraph>
          ) : (
            <s-select
              name="shopifyCollectionId"
              label="Shopify Collection"
              required
            >
              <option value="">Select a collection…</option>
              {collections.map((collection) => (
                <option
                  key={collection.id}
                  value={collection.id}
                  disabled={collection.alreadyMapped}
                >
                  {collection.title}
                  {collection.alreadyMapped ? " (already mapped)" : ""}
                </option>
              ))}
            </s-select>
          )}

          <s-stack direction="block" gap="base">
            <s-url-field
              name="discourseUrl"
              label="Discourse Community URL"
              placeholder="https://community.example.com"
              required
            />

            <s-button
              type="submit"
              disabled={isSubmitting || collections.length === 0}
            >
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
            <s-table-row>
              <s-table-cell>Creator</s-table-cell>

              <s-table-cell>Discourse URL</s-table-cell>

              <s-table-cell>Products</s-table-cell>

              <s-table-cell>Status</s-table-cell>

              <s-table-cell>Created</s-table-cell>

              <s-table-cell>Actions</s-table-cell>
            </s-table-row>

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
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
