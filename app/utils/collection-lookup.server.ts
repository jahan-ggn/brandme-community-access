import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { adminGraphQL } from "./api.server";

type CollectionProducts = {
  nodes: Array<{ id: string }>;
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
};

type CollectionProductsData = {
  collection: {
    products: CollectionProducts;
  } | null;
};

export async function getCollectionProducts(
  admin: AdminApiContext,
  collectionGid: string,
): Promise<string[]> {
  const productIds: string[] = [];

  let cursor: string | null = null;
  let hasNextPage: boolean = true;

  while (hasNextPage) {
    const data: CollectionProductsData =
      await adminGraphQL<CollectionProductsData>(
        admin,
        `#graphql
          query GetCollectionProducts($id: ID!, $after: String) {
            collection(id: $id) {
              products(first: 250, after: $after) {
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
        {
          id: collectionGid,
          after: cursor,
        },
      );

    const products: CollectionProducts | undefined = data.collection?.products;

    if (!products) {
      break;
    }

    for (const node of products.nodes) {
      productIds.push(node.id);
    }

    hasNextPage = products.pageInfo.hasNextPage;
    cursor = products.pageInfo.endCursor;

    if (hasNextPage && !cursor) {
      throw new Error("Shopify returned hasNextPage=true but no endCursor");
    }
  }

  return productIds;
}
