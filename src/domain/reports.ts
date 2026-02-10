import type { ArchimateLayer, ElementType, Model } from './types';
import { VIEWPOINTS, getViewpointById } from './config/viewpoints';
import { buildElementParentFolderIndex, buildFolderParentIndex, getFolderPathLabel } from './indexes/paths';

export type ElementReportCategoryId =
  | 'all'
  | 'BusinessProcess'
  | 'ApplicationComponent'
  | 'Capability';

export type ElementReportOptions = {
  /** Existing quick preset (currently maps 1:1 to element type). */
  category?: ElementReportCategoryId;
  /** Filter by ArchiMate layer. */
  layer?: ArchimateLayer | 'all';
  /** Filter by a specific element type (overrides category when set). */
  elementType?: ElementType | 'all';
};

export type ElementReportRow = {
  id: string;
  name: string;
  type: string;
  layer: string;
  folderPath: string;
};

export type ViewInventoryRow = {
  id: string;
  name: string;
  viewpoint: string;
  documentation: string;
  folderPath: string;
};

export type RelationshipReportRow = {
  id: string;
  name: string;
  type: string;
  source: string;
  target: string;
  documentation: string;
};

function buildViewParentFolderIndex(model: Model): Map<string, string> {
  const idx = new Map<string, string>();
  for (const folder of Object.values(model.folders)) {
    for (const viewId of folder.viewIds ?? []) {
      if (!idx.has(viewId)) idx.set(viewId, folder.id);
    }
  }
  return idx;
}

function folderPath(model: Model, folderId: string | null, folderParent: Map<string, string | null>): string {
  if (!folderId) return '';
  return getFolderPathLabel(model, folderId, folderParent, { includeRoot: true });
}

function categoryToTypes(category: ElementReportCategoryId): ElementType[] | null {
  if (category === 'all') return null;
  // For now, categories map 1:1 to element types.
  return [category as unknown as ElementType];
}

export function generateElementReport(model: Model, category?: ElementReportCategoryId): ElementReportRow[];
export function generateElementReport(model: Model, options?: ElementReportOptions): ElementReportRow[];
export function generateElementReport(
  model: Model,
  arg: ElementReportCategoryId | ElementReportOptions = 'all'
): ElementReportRow[] {
  const options: ElementReportOptions = typeof arg === 'string' ? { category: arg } : arg;
  const category = options.category ?? 'all';
  const layerFilter = options.layer ?? 'all';
  const typeFilter = options.elementType ?? 'all';

  const types = typeFilter !== 'all' ? ([typeFilter] as ElementType[]) : categoryToTypes(category);

  const folderParent = buildFolderParentIndex(model);
  const elementParentFolder = buildElementParentFolderIndex(model);

  return Object.values(model.elements)
    .filter((e) => (types ? types.includes(e.type) : true))
    .filter((e) => (layerFilter === 'all' ? true : e.layer === layerFilter))
    .map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      layer: e.layer ?? '',
      folderPath: folderPath(model, elementParentFolder.get(e.id) ?? null, folderParent)
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function generateViewInventoryReport(model: Model): ViewInventoryRow[] {
  const folderParent = buildFolderParentIndex(model);
  const viewParentFolder = buildViewParentFolderIndex(model);
  return Object.values(model.views)
    .map((v) => {
      const vp = getViewpointById(v.viewpointId) ?? VIEWPOINTS.find((x) => x.id === v.viewpointId);
      return {
        id: v.id,
        name: v.name,
        viewpoint: vp?.name ?? v.viewpointId,
        documentation: v.documentation ?? '',
        folderPath: folderPath(model, viewParentFolder.get(v.id) ?? null, folderParent)
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function generateRelationshipReport(model: Model): RelationshipReportRow[] {
  return Object.values(model.relationships)
    .map((r) => {
      const srcId = r.sourceElementId ?? r.sourceConnectorId;
      const tgtId = r.targetElementId ?? r.targetConnectorId;
      const src = r.sourceElementId ? model.elements[r.sourceElementId] : undefined;
      const tgt = r.targetElementId ? model.elements[r.targetElementId] : undefined;
      return {
        id: r.id,
        name: r.name ?? '',
        type: r.type,
        source: src?.name || srcId || '',
        target: tgt?.name || tgtId || '',
        documentation: r.documentation ?? ''
      };
    })
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: 'base' }));
}

function escapeCsvValue(value: unknown): string {
  const s = String(value ?? '');
  // Escape quotes and wrap if value contains CSV special chars.
  const needsQuotes = /[\n\r,"]/g.test(s);
  const escaped = s.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

export function rowsToCsv<T extends Record<string, unknown>>(rows: T[], columns: Array<{ key: keyof T; header: string }>): string {
  const header = columns.map((c) => escapeCsvValue(c.header)).join(',');
  const lines = rows.map((r) => columns.map((c) => escapeCsvValue(r[c.key])).join(','));
  return [header, ...lines].join('\n');
}
