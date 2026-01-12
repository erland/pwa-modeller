import type { ImportReport } from '../importReport';
import { addWarning } from '../importReport';
import type {
  IRExternalId,
  IRFolder,
  IRId,
  IRModel,
  IRRelationship,
  IRTaggedValue,
  IRView,
  IRViewConnection,
  IRViewNode
} from '../framework/ir';

export type NormalizeImportIROptions = {
  /**
   * Optional report to append normalization warnings to.
   * If omitted, warnings are simply dropped.
   */
  report?: ImportReport;

  /** Optional source label used in warning strings. */
  source?: string;

  /** Whether to drop relationships that reference missing elements. Default: true. */
  dropDanglingRelationships?: boolean;
};

function warn(opts: NormalizeImportIROptions | undefined, message: string): void {
  if (!opts?.report) return;
  addWarning(opts.report, message);
}

function asTrimmedString(v: unknown): string {
  return (typeof v === 'string' ? v : v == null ? '' : String(v)).trim();
}

function ensureName(
  kind: string,
  id: string,
  name: unknown,
  fallback: string,
  opts?: NormalizeImportIROptions
): string {
  const n = asTrimmedString(name);
  if (n) return n;
  warn(opts, `${opts?.source ? `${opts.source}: ` : ''}Normalize: ${kind} "${id}" missing name; using "${fallback}".`);
  return fallback;
}

function normalizeTaggedValues(tvs: IRTaggedValue[] | undefined): IRTaggedValue[] | undefined {
  if (!tvs || tvs.length === 0) return undefined;
  const out: IRTaggedValue[] = [];
  for (const tv of tvs) {
    const key = asTrimmedString(tv?.key);
    if (!key) continue;
    out.push({ key, value: asTrimmedString(tv?.value) });
  }
  return out.length ? out : undefined;
}

function normalizeExternalIds(ext: IRExternalId[] | undefined): IRExternalId[] | undefined {
  if (!ext || ext.length === 0) return undefined;
  const out: IRExternalId[] = [];
  for (const e of ext) {
    const id = asTrimmedString(e?.id);
    if (!id) continue;
    const system = asTrimmedString(e?.system) || undefined;
    const kind = asTrimmedString(e?.kind) || undefined;
    out.push({ id, system, kind });
  }
  return out.length ? out : undefined;
}

function dedupeById<T extends { id: IRId }>(
  items: T[],
  kind: string,
  opts?: NormalizeImportIROptions
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const id = asTrimmedString(item?.id);
    if (!id) {
      warn(opts, `${opts?.source ? `${opts.source}: ` : ''}Normalize: Dropped ${kind} with empty id.`);
      continue;
    }
    if (seen.has(id)) {
      warn(opts, `${opts?.source ? `${opts.source}: ` : ''}Normalize: Dropped duplicate ${kind} id "${id}".`);
      continue;
    }
    seen.add(id);
    // Preserve original object reference where possible.
    // We still want a normalized id string.
    out.push({ ...item, id });
  }
  return out;
}

function normalizeFolder(folder: IRFolder, folderIds: Set<string>, opts?: NormalizeImportIROptions): IRFolder {
  const id = asTrimmedString(folder.id);
  const parentIdRaw = folder.parentId == null ? null : asTrimmedString(folder.parentId);
  let parentId: string | null | undefined = parentIdRaw;
  if (parentId && (!folderIds.has(parentId) || parentId === id)) {
    warn(opts, `${opts?.source ? `${opts.source}: ` : ''}Normalize: Folder "${id}" had invalid parentId "${parentId}"; moved to root.`);
    parentId = null;
  }
  return {
    ...folder,
    id,
    name: ensureName('folder', id, folder.name, 'Unnamed folder', opts),
    parentId,
    taggedValues: normalizeTaggedValues(folder.taggedValues),
    externalIds: normalizeExternalIds(folder.externalIds)
  };
}

function normalizeRelationship(
  rel: IRRelationship,
  elementIds: Set<string>,
  opts?: NormalizeImportIROptions
): IRRelationship | null {
  const id = asTrimmedString(rel.id);
  const sourceId = asTrimmedString(rel.sourceId);
  const targetId = asTrimmedString(rel.targetId);

  const dangling = !elementIds.has(sourceId) || !elementIds.has(targetId);
  if (dangling && (opts?.dropDanglingRelationships ?? true)) {
    warn(
      opts,
      `${opts?.source ? `${opts.source}: ` : ''}Normalize: Dropped relationship "${id}" because it references missing element(s) (source: "${sourceId}", target: "${targetId}").`
    );
    return null;
  }

  return {
    ...rel,
    id,
    type: asTrimmedString(rel.type) || 'Unknown',
    name: rel.name ? asTrimmedString(rel.name) : undefined,
    sourceId,
    targetId,
    taggedValues: normalizeTaggedValues(rel.taggedValues),
    externalIds: normalizeExternalIds(rel.externalIds)
  };
}

function normalizeViewNode(node: IRViewNode, elementIds: Set<string>, nodeIds: Set<string>, opts?: NormalizeImportIROptions): IRViewNode {
  const id = asTrimmedString(node.id);
  let elementId = node.elementId ? asTrimmedString(node.elementId) : undefined;
  if (elementId && !elementIds.has(elementId)) {
    warn(opts, `${opts?.source ? `${opts.source}: ` : ''}Normalize: ViewNode "${id}" referenced missing elementId "${elementId}"; cleared.`);
    elementId = undefined;
  }

  const parentNodeIdRaw = node.parentNodeId == null ? null : asTrimmedString(node.parentNodeId);
  let parentNodeId: string | null | undefined = parentNodeIdRaw;
  if (parentNodeId && (!nodeIds.has(parentNodeId) || parentNodeId === id)) {
    warn(opts, `${opts?.source ? `${opts.source}: ` : ''}Normalize: ViewNode "${id}" had invalid parentNodeId "${parentNodeId}"; cleared.`);
    parentNodeId = null;
  }

  // Bounds: only keep if sane.
  const b = node.bounds;
  const bounds =
    b &&
    Number.isFinite(b.x) &&
    Number.isFinite(b.y) &&
    Number.isFinite(b.width) &&
    Number.isFinite(b.height) &&
    b.width > 0 &&
    b.height > 0
      ? b
      : undefined;

  return {
    ...node,
    id,
    kind: (asTrimmedString(node.kind) as IRViewNode['kind']) || 'other',
    elementId,
    parentNodeId,
    label: node.label ? asTrimmedString(node.label) : undefined,
    bounds,
    taggedValues: normalizeTaggedValues(node.taggedValues),
    externalIds: normalizeExternalIds(node.externalIds)
  };
}

function normalizeViewConnection(
  conn: IRViewConnection,
  relIds: Set<string>,
  nodeIds: Set<string>,
  elementIds: Set<string>,
  opts?: NormalizeImportIROptions
): IRViewConnection {
  const id = asTrimmedString(conn.id);

  let relationshipId = conn.relationshipId ? asTrimmedString(conn.relationshipId) : undefined;
  if (relationshipId && !relIds.has(relationshipId)) {
    warn(opts, `${opts?.source ? `${opts.source}: ` : ''}Normalize: ViewConnection "${id}" referenced missing relationshipId "${relationshipId}"; cleared.`);
    relationshipId = undefined;
  }

  let sourceNodeId = conn.sourceNodeId ? asTrimmedString(conn.sourceNodeId) : undefined;
  let targetNodeId = conn.targetNodeId ? asTrimmedString(conn.targetNodeId) : undefined;

  if (sourceNodeId && !nodeIds.has(sourceNodeId)) {
    warn(opts, `${opts?.source ? `${opts.source}: ` : ''}Normalize: ViewConnection "${id}" had invalid sourceNodeId "${sourceNodeId}"; cleared.`);
    sourceNodeId = undefined;
  }
  if (targetNodeId && !nodeIds.has(targetNodeId)) {
    warn(opts, `${opts?.source ? `${opts.source}: ` : ''}Normalize: ViewConnection "${id}" had invalid targetNodeId "${targetNodeId}"; cleared.`);
    targetNodeId = undefined;
  }

  let sourceElementId = conn.sourceElementId ? asTrimmedString(conn.sourceElementId) : undefined;
  let targetElementId = conn.targetElementId ? asTrimmedString(conn.targetElementId) : undefined;

  if (sourceElementId && !elementIds.has(sourceElementId)) {
    warn(opts, `${opts?.source ? `${opts.source}: ` : ''}Normalize: ViewConnection "${id}" had invalid sourceElementId "${sourceElementId}"; cleared.`);
    sourceElementId = undefined;
  }
  if (targetElementId && !elementIds.has(targetElementId)) {
    warn(opts, `${opts?.source ? `${opts.source}: ` : ''}Normalize: ViewConnection "${id}" had invalid targetElementId "${targetElementId}"; cleared.`);
    targetElementId = undefined;
  }

  const points = conn.points
    ? conn.points
        .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
        .map((p) => ({ x: p.x, y: p.y }))
    : undefined;

  return {
    ...conn,
    id,
    relationshipId,
    sourceNodeId,
    targetNodeId,
    sourceElementId,
    targetElementId,
    label: conn.label ? asTrimmedString(conn.label) : undefined,
    points: points && points.length ? points : undefined,
    taggedValues: normalizeTaggedValues(conn.taggedValues),
    externalIds: normalizeExternalIds(conn.externalIds)
  };
}

function normalizeView(view: IRView, folderIds: Set<string>, elementIds: Set<string>, relIds: Set<string>, opts?: NormalizeImportIROptions): IRView {
  const id = asTrimmedString(view.id);
  const folderIdRaw = view.folderId == null ? null : asTrimmedString(view.folderId);
  const folderId = folderIdRaw && folderIds.has(folderIdRaw) ? folderIdRaw : folderIdRaw ? null : folderIdRaw;
  if (folderIdRaw && folderId === null) {
    warn(opts, `${opts?.source ? `${opts.source}: ` : ''}Normalize: View "${id}" referenced missing folderId "${folderIdRaw}"; moved to root.`);
  }

  const rawNodes = Array.isArray(view.nodes) ? view.nodes : [];
  const rawConnections = Array.isArray(view.connections) ? view.connections : [];

  const dedupedNodes = dedupeById(rawNodes as IRViewNode[], `view node in view "${id}"`, opts);
  const nodeIds = new Set<string>(dedupedNodes.map((n) => asTrimmedString(n.id)));
  const nodes = dedupedNodes.map((n) => normalizeViewNode(n, elementIds, nodeIds, opts));

  const dedupedConns = dedupeById(rawConnections as IRViewConnection[], `view connection in view "${id}"`, opts);
  const connections = dedupedConns.map((c) => normalizeViewConnection(c, relIds, nodeIds, elementIds, opts));

  return {
    ...view,
    id,
    name: ensureName('view', id, view.name, 'Unnamed view', opts),
    folderId,
    viewpoint: view.viewpoint ? asTrimmedString(view.viewpoint) : undefined,
    nodes,
    connections,
    taggedValues: normalizeTaggedValues(view.taggedValues),
    externalIds: normalizeExternalIds(view.externalIds)
  };
}

/**
 * Format-agnostic normalization/validation of import IR.
 *
 * Goal: ensure the IR is structurally safe to apply to the store,
 * without introducing semantic decisions (those belong to the apply step).
 */
export function normalizeImportIR(ir: IRModel, opts?: NormalizeImportIROptions): IRModel {
  const folders = dedupeById(Array.isArray(ir.folders) ? ir.folders : [], 'folder', opts);
  const folderIds = new Set<string>(folders.map((f) => asTrimmedString(f.id)));

  const normalizedFolders = folders.map((f) => normalizeFolder(f, folderIds, opts));

  const elements = dedupeById(Array.isArray(ir.elements) ? ir.elements : [], 'element', opts).map((e) => {
    const id = asTrimmedString(e.id);
    const folderIdRaw = e.folderId == null ? null : asTrimmedString(e.folderId);
    const folderId = folderIdRaw && folderIds.has(folderIdRaw) ? folderIdRaw : folderIdRaw ? null : folderIdRaw;
    if (folderIdRaw && folderId === null) {
      warn(opts, `${opts?.source ? `${opts.source}: ` : ''}Normalize: Element "${id}" referenced missing folderId "${folderIdRaw}"; moved to root.`);
    }
    return {
      ...e,
      id,
      type: asTrimmedString(e.type) || 'Unknown',
      name: ensureName('element', id, e.name, 'Unnamed element', opts),
      folderId,
      documentation: e.documentation ? asTrimmedString(e.documentation) : undefined,
      taggedValues: normalizeTaggedValues(e.taggedValues),
      externalIds: normalizeExternalIds(e.externalIds)
    };
  });

  const elementIds = new Set<string>(elements.map((e) => asTrimmedString(e.id)));

  const relationshipsRaw = dedupeById(Array.isArray(ir.relationships) ? ir.relationships : [], 'relationship', opts);
  const relationships: IRRelationship[] = [];
  for (const r of relationshipsRaw) {
    const nr = normalizeRelationship(r, elementIds, opts);
    if (nr) relationships.push(nr);
  }
  const relationshipIds = new Set<string>(relationships.map((r) => asTrimmedString(r.id)));

  const viewsRaw = ir.views ? dedupeById(Array.isArray(ir.views) ? ir.views : [], 'view', opts) : undefined;
  const views = viewsRaw ? viewsRaw.map((v) => normalizeView(v, folderIds, elementIds, relationshipIds, opts)) : undefined;

  // Ensure importedAtIso is set (helpful for UI / telemetry).
  const meta = {
    ...(ir.meta ?? {}),
    importedAtIso: (ir.meta?.importedAtIso ? asTrimmedString(ir.meta.importedAtIso) : '') || new Date().toISOString()
  };

  return {
    ...ir,
    folders: normalizedFolders,
    elements,
    relationships,
    views,
    meta
  };
}
