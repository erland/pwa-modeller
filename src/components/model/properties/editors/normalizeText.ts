// Keep behavior stable: do not trim automatically.
// (Phase-out/cleanup can introduce trimming later if desired.)
export function normalizeOptionalText(value: string): string | undefined {
  return value === '' ? undefined : value;
}
