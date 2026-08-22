import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import type { CollectionOption, MappingAction } from "./types";

export function MappingForm({
  collections,
  fetcher,
}: {
  collections: CollectionOption[];
  fetcher: ReturnType<typeof useFetcher<MappingAction>>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const selectRef = useRef<React.ElementRef<"s-select">>(null);
  const urlRef = useRef<React.ElementRef<"s-text-field">>(null);

  const formData = fetcher.formData as FormData | undefined;
  const isCreating =
    fetcher.state !== "idle" && formData?.get("intent") === "create";

  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "success" in fetcher.data &&
      fetcher.data.success
    ) {
      formRef.current?.reset();

      if (selectRef.current) {
        selectRef.current.value = "";
      }

      if (urlRef.current) {
        urlRef.current.value = "";
      }
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form ref={formRef} method="post">
      <input type="hidden" name="intent" value="create" />

      <s-stack direction="block" gap="base">
        <s-select
          ref={selectRef}
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
          ref={urlRef}
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
  );
}
