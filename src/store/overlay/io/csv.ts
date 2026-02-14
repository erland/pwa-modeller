export type CsvDelimiter = ',' | ';' | '\t' | '|';

export function escapeCsvCell(value: unknown, delimiter: CsvDelimiter = ','): string {
  const s = value === null || value === undefined ? '' : String(value);
  // Quote if cell contains delimiter, quotes, or newlines
  const needsQuote = s.includes(delimiter) || s.includes('"') || /\r|\n/.test(s);
  const cleaned = s.replace(/\r?\n/g, ' ');
  if (!needsQuote) return cleaned;
  return `"${cleaned.replace(/"/g, '""')}"`;
}

export function toCsvLine(cells: unknown[], delimiter: CsvDelimiter = ','): string {
  return cells.map((c) => escapeCsvCell(c, delimiter)).join(delimiter);
}

/**
 * Heuristic delimiter detection. Counts occurrences in the first few non-empty lines.
 * Defaults to comma when no clear winner.
 */
export function detectDelimiter(text: string): CsvDelimiter {
  const candidates: CsvDelimiter[] = [',', ';', '\t', '|'];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 10);
  if (lines.length === 0) return ',';

  const scores = new Map<CsvDelimiter, number>();
  for (const d of candidates) scores.set(d, 0);

  for (const line of lines) {
    for (const d of candidates) {
      // Count delimiter occurrences outside quotes (simple scan)
      let inQuotes = false;
      let count = 0;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          // Handle escaped quotes by doubling
          const next = line[i + 1];
          if (inQuotes && next === '"') {
            i++;
            continue;
          }
          inQuotes = !inQuotes;
        } else if (!inQuotes && ch === d) {
          count++;
        }
      }
      scores.set(d, (scores.get(d) ?? 0) + count);
    }
  }

  // Prefer the delimiter with the highest score; require it to be meaningfully > 0
  let best: CsvDelimiter = ',';
  let bestScore = -1;
  for (const [d, s] of scores.entries()) {
    if (s > bestScore) {
      best = d;
      bestScore = s;
    }
  }
  return bestScore <= 0 ? ',' : best;
}

/**
 * Minimal RFC4180-ish CSV parser supporting quotes and newlines.
 * Returns rows of cells as strings (empty string for empty cells).
 */
export function parseCsv(text: string, delimiter?: CsvDelimiter): string[][] {
  const d = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = '';
  };
  const pushRow = () => {
    // avoid trailing empty row caused by final newline
    if (row.length === 1 && row[0] === '' && rows.length === 0) {
      // allow single empty header row
      rows.push(row);
    } else if (row.some((c) => c !== '') || rows.length > 0) {
      rows.push(row);
    }
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === d) {
      pushCell();
      continue;
    }

    if (ch === '\n' || ch === '\r') {
      // handle CRLF
      if (ch === '\r' && text[i + 1] === '\n') i++;
      pushCell();
      pushRow();
      continue;
    }

    cell += ch;
  }

  // flush last cell/row
  pushCell();
  pushRow();

  // Normalize: trim possible empty last row
  if (rows.length > 1) {
    const last = rows[rows.length - 1];
    if (last.every((c) => c === '')) rows.pop();
  }
  return rows;
}
