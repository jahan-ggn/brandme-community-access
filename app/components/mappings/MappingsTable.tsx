import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { MappingData } from "./types";

export function MappingsTable({
  mappings,
  isSubmitting,
}: {
  mappings: MappingData[];
  isSubmitting: boolean;
}) {
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  if (mappings.length === 0) {
    return <s-paragraph>No mappings yet. Create one above.</s-paragraph>;
  }

  return (
    <s-table>
      <s-table-header-row>
        <s-table-header>Creator</s-table-header>
        <s-table-header>Discourse URL</s-table-header>
        <s-table-header>Secret</s-table-header>
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

            <s-table-cell>
              <s-stack direction="inline" gap="base">
                <s-text-field
                  value={mapping.connectionSecret}
                  readOnly
                  autocomplete="off"
                />
                <s-button
                  variant="tertiary"
                  onClick={() => {
                    navigator.clipboard.writeText(mapping.connectionSecret);
                    shopify.toast.show("Secret copied to clipboard");
                  }}
                >
                  Copy
                </s-button>
              </s-stack>
            </s-table-cell>

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
  );
}
