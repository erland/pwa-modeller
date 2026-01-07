import type { ElementType, Folder, Model } from './types';
import { VIEWPOINTS, getViewpointById } from './config/viewpoints';

export type ElementReportCategoryId =
  | 'all'
  | 'BusinessProcess'
  | 'ApplicationComponent'
  | 'Capability';

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
  description: string;
  folderPath: string;
};

export type RelationshipReportRow = {
  id: string;
  name: string;
  type: string;
  source: string;
  target: string;
  description: string;
};

function findFolderContainingElement(model: Model, elementId: string): string | null {
  for (const folder of Object.values(model.folders)) {
    if (folder.elementIds.includes(elementId)) return folder.id;
  }
  return null;
}

function findFolderContainingView(model: Model, viewId: string): string | null {
  for (const folder of Object.values(model.folders)) {
    if (folder.viewIds.includes(viewId)) return folder.id;
  }
  return null;
}

function folderPath(model: Model, folderId: string | null): string {
  if (!folderId) return '';
  const names: string[] = [];
  // Folder ids can be stale (e.g., after import/migration), so treat lookup as optional.
  let cur: Folder | undefined = model.folders[folderId];
  while (cur) {
    // Include root in paths. With a unified navigator, the root folder is user-facing (e.g. "Model").
    names.push(cur.name);
    cur = cur.parentId ? model.folders[cur.parentId] : undefined;
  }
  return names.reverse().join(' / ');
}

function categoryToTypes(category: ElementReportCategoryId): ElementType[] | null {
  if (category === 'all') return null;
  // For now, categories map 1:1 to element types.
  return [category as unknown as ElementType];
}

export function generateElementReport(model: Model, category: ElementReportCategoryId = 'all'): ElementReportRow[] {
  const types = categoryToTypes(category);
  return Object.values(model.elements)
    .filter((e) => (types ? types.includes(e.type) : true))
    .map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      layer: e.layer,
      folderPath: folderPath(model, findFolderContainingElement(model, e.id))
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function generateViewInventoryReport(model: Model): ViewInventoryRow[] {
  return Object.values(model.views)
    .map((v) => {
      const vp = getViewpointById(v.viewpointId) ?? VIEWPOINTS.find((x) => x.id === v.viewpointId);
      return {
        id: v.id,
        name: v.name,
        viewpoint: vp?.name ?? v.viewpointId,
        description: v.description ?? '',
        folderPath: folderPath(model, findFolderContainingView(model, v.id))
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
        description: r.description ?? ''
      };
    })
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: 'base' }));
}

function escapeCsvValue(value: unknown): string {
  const s = String(value ?? '');
  // Escape quotes and wrap if value contains CSV special chars.
  const needsQuotes = /[\n\r,\"]/g.test(s);
  const escaped = s.replace(/\"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

export function rowsToCsv<T extends Record<string, unknown>>(rows: T[], columns: Array<{ key: keyof T; header: string }>): string {
  const header = columns.map((c) => escapeCsvValue(c.header)).join(',');
  const lines = rows.map((r) => columns.map((c) => escapeCsvValue(r[c.key])).join(','));
  return [header, ...lines].join('\n');
}
