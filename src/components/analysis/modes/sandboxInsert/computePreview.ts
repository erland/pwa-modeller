import type { Model } from '../../../../domain';
import { bfsKShortestPaths, bfsShortestPath, buildAdjacency } from '../../../../domain';
import type { SandboxAddRelatedDirection, SandboxInsertIntermediatesMode } from '../../workspace/controller/sandboxTypes';

import type { Candidate, PreviewPath, RelatedGroup } from './types';
import { clampInt } from './utils';

export type ComputeCommonArgs = {
  model: Model;
  enabledRelationshipTypes: string[];
  existingSet: Set<string>;
  /** Optional element type filter. If provided, only elements of these types become candidates. */
  enabledElementTypesSet?: Set<string>;
  /**
   * If true, candidates already in sandbox are included (with alreadyInSandbox=true),
   * otherwise they are excluded from the candidate list.
   */
  includeAlreadyInSandbox?: boolean;
};

export function computeIntermediatesPreview(args: ComputeCommonArgs & {
  sourceElementId: string;
  targetElementId: string;
  mode: SandboxInsertIntermediatesMode;
  k: number;
  maxHops: number;
  direction: SandboxAddRelatedDirection;
}): { paths: PreviewPath[]; candidates: Candidate[]; defaultSelectedIds: Set<string> } {
  const {
    model,
    enabledRelationshipTypes,
    existingSet,
    enabledElementTypesSet,
    includeAlreadyInSandbox = true,
    sourceElementId,
    targetElementId,
    mode,
    k,
    maxHops,
    direction,
  } = args;

  const allowedTypes = new Set(enabledRelationshipTypes);
  const adjacency = buildAdjacency(model, allowedTypes);

  const maxH = clampInt(maxHops, 1, 16);
  const kk = clampInt(k, 1, 10);

  const paths: string[][] =
    mode === 'topk'
      ? bfsKShortestPaths({ startId: sourceElementId, targetId: targetElementId, adjacency, direction, maxHops: maxH, k: kk })
      : (() => {
          const p = bfsShortestPath({ startId: sourceElementId, targetId: targetElementId, adjacency, direction, maxHops: maxH });
          return p ? [p] : [];
        })();

  const previewPaths: PreviewPath[] = paths.map((p) => {
    const intermediates = p.slice(1, -1).filter((id) => typeof id === 'string' && id.length > 0 && Boolean(model.elements[id]));
    return { path: p, intermediates };
  });

  const candidateMap = new Map<string, Candidate>();
  for (const pp of previewPaths) {
    for (const id of pp.intermediates) {
      if (candidateMap.has(id)) continue;
      const el = model.elements[id];
      if (!el) continue;

      if (enabledElementTypesSet && !enabledElementTypesSet.has(el.type)) continue;

      const already = existingSet.has(id);
      if (already && !includeAlreadyInSandbox) continue;

      candidateMap.set(id, {
        id,
        name: el.name || '(unnamed)',
        type: el.type,
        alreadyInSandbox: already,
      });
    }
  }

  const candidates = Array.from(candidateMap.values()).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  const defaultSelectedIds = new Set<string>();
  for (const c of candidates) {
    if (!c.alreadyInSandbox) defaultSelectedIds.add(c.id);
  }

  return { paths: previewPaths, candidates, defaultSelectedIds };
}

export function computeRelatedPreview(args: ComputeCommonArgs & {
  anchorElementIds: string[];
  depth: number;
  direction: SandboxAddRelatedDirection;
}): { groups: RelatedGroup[]; candidates: Candidate[]; defaultSelectedIds: Set<string> } {
  const {
    model,
    enabledRelationshipTypes,
    existingSet,
    enabledElementTypesSet,
    includeAlreadyInSandbox = true,
    anchorElementIds,
    depth,
    direction,
  } = args;

  const allowedTypes = new Set(enabledRelationshipTypes);
  const adjacency = buildAdjacency(model, allowedTypes);

  const anchorIds = anchorElementIds.filter((id) => typeof id === 'string' && id.length > 0 && Boolean(model.elements[id]));
  const depthLimit = clampInt(depth, 1, 6);

  const depthById = new Map<string, number>();
  const byDepth = new Map<number, string[]>();

  const q: Array<{ id: string; depth: number }> = anchorIds.map((id) => ({ id, depth: 0 }));
  for (const a of anchorIds) depthById.set(a, 0);

  while (q.length) {
    const cur = q.shift();
    if (!cur) break;
    if (cur.depth >= depthLimit) continue;

    const neighbors: string[] = [];
    if (direction === 'both' || direction === 'outgoing') {
      for (const e of adjacency.out.get(cur.id) ?? []) neighbors.push(e.to);
    }
    if (direction === 'both' || direction === 'incoming') {
      for (const e of adjacency.in.get(cur.id) ?? []) neighbors.push(e.to);
    }

    const nextDepth = cur.depth + 1;
    for (const nb of neighbors) {
      if (depthById.has(nb)) continue;
      if (!model.elements[nb]) continue;
      depthById.set(nb, nextDepth);
      if (!byDepth.has(nextDepth)) byDepth.set(nextDepth, []);
      byDepth.get(nextDepth)!.push(nb);
      q.push({ id: nb, depth: nextDepth });
    }
  }

  const groups: RelatedGroup[] = [];
  const candidateMap = new Map<string, Candidate>();

  for (let d = 1; d <= depthLimit; d++) {
    const ids = (byDepth.get(d) ?? []).slice();
    if (ids.length === 0) continue;

    ids.sort((a, b) => {
      const ea = model.elements[a];
      const eb = model.elements[b];
      const ta = ea?.type ?? '';
      const tb = eb?.type ?? '';
      const na = ea?.name ?? a;
      const nb = eb?.name ?? b;
      return ta.localeCompare(tb) || na.localeCompare(nb);
    });

    groups.push({ depth: d, elementIds: ids });

    for (const id of ids) {
      if (candidateMap.has(id)) continue;
      const el = model.elements[id];
      if (!el) continue;

      if (enabledElementTypesSet && !enabledElementTypesSet.has(el.type)) continue;

      const already = existingSet.has(id);
      if (already && !includeAlreadyInSandbox) continue;

      candidateMap.set(id, {
        id,
        name: el.name || '(unnamed)',
        type: el.type,
        alreadyInSandbox: already,
      });
    }
  }

  const candidates = Array.from(candidateMap.values()).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  const defaultSelectedIds = new Set<string>();
  for (const c of candidates) {
    if (!c.alreadyInSandbox) defaultSelectedIds.add(c.id);
  }

  return { groups, candidates, defaultSelectedIds };
}
