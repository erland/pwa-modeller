import type { TabularData } from '../contracts/ExportBundle';

function escapeCell(v: string): string {
  // CSV per RFC 4180-ish: quote when needed and double quotes.
  const needsQuote = /[",\r\n]/.test(v);
  const s = v.replace(/\r?\n/g, ' ');
  if (!needsQuote) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function tabularToCsv(data: TabularData): string {
  const lines: string[] = [];
  lines.push(data.headers.map((h) => escapeCell(String(h ?? ''))).join(','));
  for (const row of data.rows) {
    const cells = row.map((c) => (c === null || c === undefined ? '' : escapeCell(String(c))));
    lines.push(cells.join(','));
  }
  return lines.join('\n');
}
