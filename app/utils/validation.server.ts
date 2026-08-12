export function parseId(value: FormDataEntryValue | null): number | null {
  if (value === null) return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}
