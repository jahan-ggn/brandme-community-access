import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

type CollectionProductsResponse = {
  data?: {
    collection?: {
      products?: {
        nodes: Array<{
          id: string;
        }>;
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string | null;
        };
      };
    } | null;
  };
};

export async function getCollectionProducts(
  admin: AdminApiContext,
  collectionGid: string,
): Promise<string[]> {
  const productIds: string[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response: Response = await admin.graphql(
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
      }`,
      {
        variables: {
          id: collectionGid,
          after: cursor,
        },
      },
    );

    const responseJson: CollectionProductsResponse = await response.json();

    const products = responseJson.data?.collection?.products;

    if (!products) {
      break;
    }

    for (const node of products.nodes) {
      productIds.push(node.id);
    }

    hasNextPage = products.pageInfo.hasNextPage;

    if (hasNextPage) {
      cursor = products.pageInfo.endCursor;
    }
  }

  return productIds;
}
