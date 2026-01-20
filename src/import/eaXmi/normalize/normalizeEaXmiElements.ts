import type { IRElement, IRModel } from '../../framework/ir';
import { info, normalizeUmlMembers, trimOrUndef } from './normalizeEaXmiShared';
import type { NormalizeEaXmiOptions } from './normalizeEaXmiShared';

export function normalizeEaXmiElements(
  ir: IRModel,
  folderIds: Set<string>,
  opts?: NormalizeEaXmiOptions
): IRElement[] {
  return (ir.elements ?? []).map((e) => {
    const name = trimOrUndef(e.name) ?? e.name;
    const documentation = trimOrUndef(e.documentation);

    let folderId = e.folderId;
    if (folderId && typeof folderId === 'string' && !folderIds.has(folderId)) {
      info(
        opts,
        'EA XMI Normalize: Element referenced missing folderId; moved to root. (EA export may omit package metadata.)',
        { code: 'missing-folder', context: { elementId: e.id, folderId } }
      );
      folderId = null;
    }

    const meta = e.meta && typeof e.meta === 'object' ? { ...(e.meta as Record<string, unknown>) } : undefined;
    if (meta && 'umlMembers' in meta) {
      meta.umlMembers = normalizeUmlMembers((meta as any).umlMembers);
    }

    return {
      ...e,
      name,
      documentation,
      ...(folderId !== undefined ? { folderId } : {}),
      ...(meta ? { meta } : {})
    };
  });
}
