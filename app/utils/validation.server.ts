export function parseId(value: FormDataEntryValue | null): number | null {
  if (value === null) return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

const MAX_URL_LENGTH = 2048;
const MAX_COLLECTION_NAME_LENGTH = 255;

export function validateDiscourseUrl(
  raw: string,
): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = raw.trim();

  if (!trimmed) {
    return { ok: false, error: "Discourse URL is required" };
  }

  if (trimmed.length > MAX_URL_LENGTH) {
    return {
      ok: false,
      error: `Discourse URL must not exceed ${MAX_URL_LENGTH} characters`,
    };
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "Please enter a valid Discourse URL" };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Please enter a valid HTTPS Discourse URL" };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, error: "Discourse URL must not contain credentials" };
  }

  if (parsed.hash || parsed.search) {
    return {
      ok: false,
      error: "Discourse URL must not contain query parameters or fragments",
    };
  }

  const normalized =
    parsed.origin +
    (parsed.pathname !== "/" ? parsed.pathname.replace(/\/+$/, "") : "");

  return { ok: true, url: normalized };
}

export function validateCollectionName(
  name: string,
): { ok: true; name: string } | { ok: false; error: string } {
  const trimmed = name.trim();

  if (!trimmed) {
    return { ok: false, error: "Collection name is required" };
  }

  if (trimmed.length > MAX_COLLECTION_NAME_LENGTH) {
    return {
      ok: false,
      error: `Collection name must not exceed ${MAX_COLLECTION_NAME_LENGTH} characters`,
    };
  }

  return { ok: true, name: trimmed };
}
