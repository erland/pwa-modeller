import type { IRModel, IRRelationship } from '../../framework/ir';
import { normalizeUmlRelAttrs, trimOrUndef } from './normalizeEaXmiShared';

export function normalizeEaXmiRelationships(ir: IRModel): IRRelationship[] {
  return (ir.relationships ?? []).map((r) => {
    const name = trimOrUndef(r.name);
    const documentation = trimOrUndef(r.documentation);

    const meta = r.meta && typeof r.meta === 'object' ? { ...(r.meta as Record<string, unknown>) } : undefined;
    if (meta && 'umlAttrs' in meta) {
      const next = normalizeUmlRelAttrs((meta as any).umlAttrs);
      if (next) meta.umlAttrs = next;
      else delete (meta as any).umlAttrs;
    }

    return {
      ...r,
      ...(name ? { name } : {}),
      ...(documentation ? { documentation } : {}),
      ...(meta ? { meta } : {})
    };
  });
}
