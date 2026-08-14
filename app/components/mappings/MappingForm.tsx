import { useFetcher } from "react-router";
import type { CollectionData, MappingAction } from "./types";

export function MappingForm({
  collections,
  isSubmitting,
}: {
  collections: CollectionData[];
  isSubmitting: boolean;
}) {
  const fetcher = useFetcher<MappingAction>();
  const error =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : undefined;

  return (
    <>
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
    </>
  );
}
