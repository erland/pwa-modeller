import { rowsToCsv } from '../../domain';
import { downloadTextFile, sanitizeFileNameWithExtension } from '../../store';

export type CsvColumn<T> = {
  key: keyof T;
  header: string;
};

export function exportReportCsv<T>(
  modelName: string,
  baseName: string,
  rows: T[],
  columns: CsvColumn<T>[],
  suffix?: string
) {
  // rowsToCsv expects a Record-ish row type. Report rows are object-shaped, but many are defined
  // without an index signature, so we keep the casting contained here.
  const csv = rowsToCsv(
    rows as unknown as Record<string, unknown>[],
    columns.map((c) => ({ key: String(c.key) as never, header: c.header })) as never
  );
  const base = suffix ? `${modelName}-${baseName}-${suffix}` : `${modelName}-${baseName}`;
  downloadTextFile(sanitizeFileNameWithExtension(base, 'csv'), csv, 'text/csv');
}
