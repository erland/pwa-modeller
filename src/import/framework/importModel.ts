import { registerBuiltInImporters } from './builtins';
import { createImportReport } from '../importReport';
import type { ImportContext, ImportResult } from './importer';
import { UnsupportedImportFormatError } from './importer';
import { pickImporter } from './registry';
import { readBlobAsArrayBuffer } from './blobReaders';
import { normalizeImportIR } from '../normalize/normalizeImportIR';
import { normalizeBpmn2ImportIR } from '../bpmn2/normalizeBpmn2ImportIR';
import { normalizeEaXmiImportIR } from '../eaXmi/normalizeEaXmiImportIR';
import { normalizeMeffImportIR } from '../meff/normalizeMeffImportIR';
import type { IRModel } from './ir';

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
 * Step 1: parse into format-agnostic IR + ImportReport (no store mutations).
 * Step 2: normalize/validate IR into a structurally safe shape.
 * Step 3: applyImportIR(…) mutates the store.
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

  // Importers are expected to always return an IR, but keep this function
  // type-safe (and resilient) in case an importer returns a partial result.
  const baseIr =
    result.ir ??
    ({
      folders: [],
      elements: [],
      relationships: [],
      meta: {
        format: result.format || pick.importer.format || pick.importer.id
      }
    } satisfies IRModel);

  // Step 2: format-agnostic normalization (keeps parse vs apply responsibilities clean).
  // Optional format-specific normalization before the generic pass.
  const preNormalizedIr =
    baseIr.meta?.format === 'bpmn2'
      ? normalizeBpmn2ImportIR(baseIr, {
          report: result.report,
          source: result.format || pick.importer.format || pick.importer.id
        })
      : baseIr.meta?.format === 'ea-xmi-uml'
        ? (normalizeEaXmiImportIR(baseIr, {
            report: result.report,
            source: result.format || pick.importer.format || pick.importer.id
          }) ?? baseIr)
      : baseIr.meta?.format === 'archimate-meff'
        ? (normalizeMeffImportIR(baseIr, {
            report: result.report,
            source: result.format || pick.importer.format || pick.importer.id
          }) ?? baseIr)
      : baseIr;

  const normalizedIr = normalizeImportIR(preNormalizedIr, {
    report: result.report,
    source: result.format || pick.importer.format || pick.importer.id
  });

  return { ...result, ir: normalizedIr };
}
