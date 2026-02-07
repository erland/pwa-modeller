import { type OverlayImportWarning } from '../../../../store/overlay';
import type { ResolveReport } from '../../../../store/overlay/resolve';

export function summarizeWarnings(warnings: string[]): string {
  if (!warnings.length) return '';
  if (warnings.length === 1) return ` (1 warning)`;
  return ` (${warnings.length} warnings)`;
}

export function resolveSummary(report: ResolveReport): string {
  const { attached, orphan, ambiguous } = report.counts;
  return `attached=${attached}, orphan=${orphan}, ambiguous=${ambiguous}`;
}

export function warningToText(w: OverlayImportWarning): string {
  if (w.type === 'signature-mismatch') {
    const a = w.fileSignature ? `file=${w.fileSignature}` : 'file=?';
    const b = w.currentSignature ? `current=${w.currentSignature}` : 'current=?';
    return `signature mismatch (${a}, ${b})`;
  }
  if (w.type === 'merge-conflict-multiple-existing') {
    const ref = w.importedEntryId ? `entry=${w.importedEntryId}` : `entry#${w.importedEntryIndex}`;
    return `merge conflict: ${ref} matched multiple existing entries (${w.matchedEntryIds.join(', ')})`;
  }
  return `dropped invalid entry #${w.importedEntryIndex}: ${w.reason}`;
}
