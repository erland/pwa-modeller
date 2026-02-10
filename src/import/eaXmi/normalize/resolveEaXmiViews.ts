import type { IRId, IRRelationship, IRView } from '../../framework/ir';
import { info } from './normalizeEaXmiShared';
import type { NormalizeEaXmiOptions } from './normalizeEaXmiShared';
import { buildElementLookup, buildRelationshipLookup } from './viewResolution/refTokens';
import { resolveViewNodes } from './viewResolution/resolveViewNodes';
import { resolveViewConnections } from './viewResolution/resolveViewConnections';

// --- Milestone B (Step B2): Resolve diagram object references to imported elements ---

export { buildElementLookup, buildRelationshipLookup };

export function resolveEaXmiViews(
  viewsRaw: IRView[] | undefined,
  folderIds: Set<string>,
  elementLookup: Map<string, IRId>,
  relationshipLookup: Map<string, IRId>,
  relationships: IRRelationship[],
  opts?: NormalizeEaXmiOptions
): IRView[] | undefined {
  if (!viewsRaw) return undefined;

  return viewsRaw.map((v) => {
    // Validate folderId (diagram owning package)
    let folderId = v.folderId;
    if (folderId && typeof folderId === 'string' && !folderIds.has(folderId)) {
      info(
        opts,
        'EA XMI Normalize: View referenced missing folderId; moved to root. (EA export may omit package metadata.)',
        { code: 'missing-folder', context: { viewId: v.id, folderId } }
      );
      folderId = null;
    }

    const { nodes: nextNodes, nodeKeyToElement, nodeKeyToRefCandidates } = resolveViewNodes(v, elementLookup, relationshipLookup, opts);
    const nextConnections = resolveViewConnections(
      v,
      relationshipLookup,
      elementLookup,
      relationships,
      nodeKeyToElement,
      nodeKeyToRefCandidates,
      opts
    );

    return {
      ...v,
      ...(folderId !== undefined ? { folderId } : {}),
      nodes: nextNodes,
      connections: nextConnections
    };
  });
}
