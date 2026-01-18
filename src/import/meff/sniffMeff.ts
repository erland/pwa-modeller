import type { ImportContext } from '../framework/importer';

/**
 * Heuristic sniff for ArchiMate Model Exchange File (MEFF).
 * We primarily look for Open Group ArchiMate namespace + a <model> root.
 *
 * This is intentionally permissive: exact validation happens during parsing.
 */
export function sniffMeff(ctx: ImportContext): boolean {
  const t = ctx.sniffText.toLowerCase();

  // Common ArchiMate exchange namespace markers.
  const hasArchimateNs =
    t.includes('opengroup.org/xsd/archimate') ||
    t.includes('www.opengroup.org/xsd/archimate') ||
    t.includes('xsd/archimate');

  // MEFF is typically a <model …> root.
  const hasModelRoot = t.includes('<model') && (t.includes('</model>') || t.includes('<elements') || t.includes('<relationships'));

  // IMPORTANT: Be conservative here to avoid false positives on other XML formats
  // (e.g. BPMN 2.0) that may contain generic "<model" tags.
  // Exact validation happens during parsing.
  return hasArchimateNs && hasModelRoot;
}
