import type { ImportReport } from '../importReport';

/**
 * A short, stable identifier for an importer implementation (e.g. "meff", "xmi").
 * Used for logging and debugging. Must be unique in the registry.
 */
export type ImporterId = string;

/**
 * A short format label (e.g. "archimate-meff", "xmi", "json").
 * Keep this stable; it's useful in reports and telemetry.
 */
export type ImportFormat = string;

export type ImportSeverity = 'info' | 'warning' | 'error';

export type ImportMessage = {
  severity: ImportSeverity;
  message: string;
};

export type ImportContext = {
  /**
   * Best-effort decoded text snippet for sniffing (first N bytes decoded as UTF-8).
   * Importers should tolerate this being empty or containing replacement characters.
   */
  sniffText: string;
  /** First N bytes of the file (raw). */
  sniffBytes: Uint8Array;
  /** Lowercased filename. */
  fileName: string;
  /** Lowercased file extension without dot, if any. */
  extension: string | null;
  /** Browser-provided mime type (can be empty). */
  mimeType: string;
};

/**
 * Intermediate representation produced by an importer.
 *
 * Step 2 will introduce a canonical IR type shared by all importers.
 * For Step 1 we keep this generic so we can wire up the framework without
 * forcing any particular IR schema yet.
 */
export type ImportIR = unknown;

export type ImportResult<TIR = ImportIR> = {
  format: ImportFormat;
  importerId: ImporterId;
  ir: TIR;
  report: ImportReport;
  messages?: ImportMessage[];
};

export type Importer<TIR = ImportIR> = {
  id: ImporterId;
  format: ImportFormat;
  /** Human-readable name for UI (optional). */
  displayName?: string;

  /**
   * Optional priority. Higher runs first when sniffing.
   * Default: 0.
   */
  priority?: number;

  /**
   * File extensions (lowercase, without dot) that this importer expects.
   * Used as a fallback when sniffing isn't provided or doesn't match.
   */
  extensions?: string[];

  /**
   * Optional sniffer. Return true if this importer can handle the file.
   * Should be fast and side-effect free.
   */
  sniff?: (ctx: ImportContext) => boolean | Promise<boolean>;

  /**
   * Parse and produce intermediate representation (IR) + report.
   * Must not mutate app state directly (store mutations happen later).
   */
  import: (file: File, ctx: ImportContext) => Promise<ImportResult<TIR>>;
};

export class UnsupportedImportFormatError extends Error {
  readonly fileName: string;

  constructor(fileName: string, message?: string) {
    super(message ?? `No importer registered for file: ${fileName}`);
    this.name = 'UnsupportedImportFormatError';
    this.fileName = fileName;
  }
}
