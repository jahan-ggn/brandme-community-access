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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const mappings = await db.creatorMapping.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
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
      enabled: mapping.enabled,
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

  type CollectionQueryResponse = {
    data?: {
      collection?: ShopifyCollection | null;
    };
  };

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
        `${syncResult.synced} products synced, ` +
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
};

export default function MappingsPage() {
  const { mappings, collections } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const error =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : undefined;

  const success =
    fetcher.data && "success" in fetcher.data ? fetcher.data.success : false;

  const synced =
    fetcher.data && "synced" in fetcher.data ? fetcher.data.synced : undefined;

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
              Mapping created successfully.
              {typeof synced === "number"
                ? ` ${synced} products were synced.`
                : ""}
            </p>
          </s-banner>
        )}

        <fetcher.Form method="post">
          <s-stack direction="block" gap="base">
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
            <s-table-row>
              <s-table-cell>Creator</s-table-cell>
              <s-table-cell>Discourse URL</s-table-cell>
              <s-table-cell>Status</s-table-cell>
              <s-table-cell>Created</s-table-cell>
            </s-table-row>

            {mappings.map((mapping) => (
              <s-table-row key={mapping.id}>
                <s-table-cell>{mapping.collectionName}</s-table-cell>

                <s-table-cell>{mapping.discourseUrl}</s-table-cell>

                <s-table-cell>
                  {mapping.enabled ? "Enabled" : "Disabled"}
                </s-table-cell>

                <s-table-cell>
                  {new Date(mapping.createdAt).toLocaleDateString()}
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
