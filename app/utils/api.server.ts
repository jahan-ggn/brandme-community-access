import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

type GraphQLError = {
  message: string;
  extensions?: Record<string, unknown>;
};

type GraphQLResponse<T> = {
  data?: T;
  errors?: GraphQLError[];
};

export async function adminGraphQL<T>(
  admin: AdminApiContext,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await admin.graphql(query, { variables });

  if (!response.ok) {
    const body = await response.text();

    throw new Error(`Shopify Admin API HTTP ${response.status}: ${body}`);
  }

  const json = (await response.json()) as GraphQLResponse<T>;

  if (json.errors?.length) {
    const messages = json.errors.map((error) => error.message).join("; ");

    throw new Error(`GraphQL errors: ${messages}`);
  }

  if (!json.data) {
    throw new Error("GraphQL response contained no data");
  }

  return json.data;
}
