export function formatTotal(n: number): string {
  return String(n);
}

export function formatCellValue(n: number): string {
  if (!Number.isFinite(n)) return '';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
