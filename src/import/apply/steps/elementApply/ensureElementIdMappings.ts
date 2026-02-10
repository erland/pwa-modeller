import type { ApplyImportContext } from '../../applyImportTypes';
import { createId } from '../../../../domain';

export function ensureElementIdMappings(ctx: ApplyImportContext): void {
  const { ir, mappings } = ctx;

  for (const el of ir.elements ?? []) {
    if (!el?.id) continue;
    if (!mappings.elements[el.id]) {
      mappings.elements[el.id] = createId('el');
    }
  }
}
