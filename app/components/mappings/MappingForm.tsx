import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import type { CollectionOption, MappingAction } from "./types";

export function MappingForm({
  collections,
  isSubmitting,
  fetcher,
}: {
  collections: CollectionOption[];
  isSubmitting: boolean;
  fetcher: ReturnType<typeof useFetcher<MappingAction>>;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  const formData = fetcher.formData as FormData | undefined;
  const isCreating = isSubmitting && formData?.get("intent") === "create";

  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "success" in fetcher.data &&
      fetcher.data.success &&
      formData?.get("intent") === "create"
    ) {
      formRef.current?.reset();
    }
  }, [fetcher.state, fetcher.data, formData]);

  const error =
    fetcher.data &&
    "error" in fetcher.data &&
    formData?.get("intent") === "create"
      ? fetcher.data.error
      : undefined;

  return (
    <>
      {error && (
        <s-banner tone="critical">
          <s-paragraph>{error}</s-paragraph>
        </s-banner>
      )}

      <fetcher.Form ref={formRef} method="post">
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

          <s-button type="submit" disabled={isCreating}>
            {isCreating ? "Creating…" : "Create mapping"}
          </s-button>
        </s-stack>
      </fetcher.Form>
    </>
  );
}
