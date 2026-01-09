import { registerBuiltInImporters } from './builtins';
import { createImportReport } from '../importReport';
import type { ImportContext, ImportResult } from './importer';
import { UnsupportedImportFormatError } from './importer';
import { pickImporter } from './registry';
import { readBlobAsArrayBuffer } from './blobReaders';

const DEFAULT_SNIFF_BYTES = 256 * 1024; // 256 KiB

function getLowerFileName(file: File): string {
  return (file.name ?? '').toLowerCase();
}

function getExtension(fileName: string): string | null {
  const idx = fileName.lastIndexOf('.');
  if (idx <= 0) return null;
  const ext = fileName.slice(idx + 1).trim().toLowerCase();
  return ext || null;
}




async function readSniffBytes(file: File, maxBytes = DEFAULT_SNIFF_BYTES): Promise<Uint8Array> {
  const blob = file.slice(0, maxBytes);
  const buf = await readBlobAsArrayBuffer(blob);
  return new Uint8Array(buf);
}

function decodeUtf8Lossy(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    // Very old browsers: TextDecoder may be missing.
    // In that case, sniffText will be empty and sniffers should fall back to extension.
    return '';
  }
}

export async function buildImportContext(file: File): Promise<ImportContext> {
  const fileName = getLowerFileName(file);
  const sniffBytes = await readSniffBytes(file);
  const sniffText = decodeUtf8Lossy(sniffBytes);
  return {
    sniffText,
    sniffBytes,
    fileName,
    extension: getExtension(fileName),
    mimeType: file.type ?? ''
  };
}

/**
 * Main entry point used by UI.
 *
 * Step 1: returns IR + ImportReport; does NOT apply to store.
 * Step 3 will introduce applyImportIR(...) to mutate the store.
 */
export async function importModel(file: File): Promise<ImportResult> {
  registerBuiltInImporters();
  const ctx = await buildImportContext(file);
  const pick = await pickImporter(ctx);

  if (!pick) {
    throw new UnsupportedImportFormatError(
      ctx.fileName,
      `No importer matched "${ctx.fileName}" (ext: ${ctx.extension ?? 'none'}, type: ${ctx.mimeType || 'unknown'})`
    );
  }

  const result = await pick.importer.import(file, ctx);

  // Ensure report has at least a sensible "source".
  if (!result.report?.source) {
    result.report = createImportReport(result.format || pick.importer.format || pick.importer.id);
  }

  return result;
}
