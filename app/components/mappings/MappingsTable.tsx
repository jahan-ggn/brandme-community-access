import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { MappingData } from "./types";

export function MappingsTable({
  mappings,
  isSubmitting,
  fetcher,
}: {
  mappings: MappingData[];
  isSubmitting: boolean;
  fetcher: ReturnType<typeof useFetcher>;
}) {
  const shopify = useAppBridge();

  if (mappings.length === 0) {
    return <s-paragraph>No mappings yet. Create one above.</s-paragraph>;
  }

  return (
    <s-table>
      <s-table-header-row>
        <s-table-header listSlot="primary">Creator</s-table-header>
        <s-table-header listSlot="secondary">Community</s-table-header>
        <s-table-header listSlot="inline">Products</s-table-header>
        <s-table-header listSlot="inline">Status</s-table-header>
        <s-table-header listSlot="inline">Created</s-table-header>
        <s-table-header listSlot="inline">Actions</s-table-header>
      </s-table-header-row>

      <s-table-body>
        {mappings.map((mapping) => (
          <s-table-row key={mapping.id}>
            <s-table-cell>
              <strong>{mapping.collectionName}</strong>
            </s-table-cell>

            <s-table-cell>
              <s-link href={mapping.discourseUrl} target="_blank">
                {mapping.discourseUrl.replace(/^https?:\/\//, "")}
              </s-link>
            </s-table-cell>

            <s-table-cell>{mapping.productCount}</s-table-cell>

            <s-table-cell>
              <s-badge tone={mapping.enabled ? "success" : "neutral"}>
                {mapping.enabled ? "Enabled" : "Disabled"}
              </s-badge>
            </s-table-cell>

            <s-table-cell>
              {new Date(mapping.createdAt).toLocaleDateString("en-GB")}
            </s-table-cell>

            <s-table-cell>
              <div
                style={{ display: "flex", gap: "8px", whiteSpace: "nowrap" }}
              >
                <s-button
                  variant="tertiary"
                  onClick={() => {
                    navigator.clipboard.writeText(mapping.connectionSecret);
                    shopify.toast.show("Secret copied to clipboard");
                  }}
                >
                  Copy Secret
                </s-button>

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
              </div>
            </s-table-cell>
          </s-table-row>
        ))}
      </s-table-body>
    </s-table>
  );
}
