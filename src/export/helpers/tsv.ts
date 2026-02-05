import type { TabularData } from '../contracts/ExportBundle';

function escapeCell(v: string): string {
  // TSV: only need to guard tabs/newlines; Excel also likes CRLF.
  // We'll replace \t with spaces and normalize newlines.
  return v.replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
}

export function tabularToTsv(data: TabularData): string {
  const lines: string[] = [];
  lines.push(data.headers.map(escapeCell).join('\t'));
  for (const row of data.rows) {
    const cells = row.map((c) => {
      if (c === null || c === undefined) return '';
      return escapeCell(String(c));
    });
    lines.push(cells.join('\t'));
  }
  return lines.join('\n');
}
