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

  // MEFF is typically a <model ...> root.
  const hasModelRoot = t.includes('<model') && (t.includes('</model>') || t.includes('<elements') || t.includes('<relationships'));

  // Many exports mention "archimate" plainly.
  const mentionsArchimate = t.includes('archimate');

  return (hasArchimateNs && hasModelRoot) || (mentionsArchimate && hasModelRoot);
}
