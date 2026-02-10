export function safeJsonStringify(value: unknown, maxLen = 40000): string {
  try {
    const s = JSON.stringify(value, null, 2);
    if (s.length <= maxLen) return s;
    return `${s.slice(0, maxLen)}\n…(truncated)…`;
  } catch {
    return String(value);
  }
}
