import type { ImportReport } from '../importReport';
import type { IRExternalId, IRView } from '../framework/ir';
import { attrAny, childText, localName, qa } from '../framework/xml';

type ParseEaDiagramCatalogResult = {
  views: IRView[];
};

const EA_EXTENDER_ATTRS = ['extender'] as const;

// Common EA-ish diagram id / guid attribute names seen across exports.
const EA_DIAGRAM_GUID_ATTRS = ['ea_guid', 'ea:guid', 'guid', 'uuid'] as const;
const EA_DIAGRAM_ID_ATTRS = ['xmi:id', 'xmi:idref', 'id', 'diagramid', 'diagram_id', 'diagramID'] as const;
const EA_DIAGRAM_NAME_ATTRS = ['name', 'diagramname', 'diagram_name', 'title'] as const;
const EA_DIAGRAM_TYPE_ATTRS = ['diagramtype', 'diagram_type', 'diagramType', 'type', 'kind'] as const;
const EA_DIAGRAM_PACKAGE_ATTRS = ['package', 'packageid', 'packageId', 'package_id', 'owner', 'ownerid', 'parent'] as const;
const EA_DIAGRAM_NOTES_ATTRS = ['notes', 'note', 'documentation', 'description'] as const;

function isEaExtension(el: Element): boolean {
  const extender = (attrAny(el, [...EA_EXTENDER_ATTRS]) ?? '').toLowerCase();
  return extender.includes('enterprise architect');
}

function isDiagramCandidate(el: Element): boolean {
  const ln = localName(el);
  // Be tolerant: we mostly want nodes named "Diagram" or "UMLDiagram" etc.
  // Avoid grabbing DiagramObject/DiagramLink/etc. (future steps handle those).
  if (ln === 'diagram') return true;
  if (ln.endsWith('diagram') && !ln.includes('diagramobject') && !ln.includes('diagramlink')) return true;
  return false;
}

function slug(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40);
}

function pickDiagramId(el: Element, synthIdx: number, report: ImportReport): { id: string; externalIds: IRExternalId[] } {
  const guid = attrAny(el, [...EA_DIAGRAM_GUID_ATTRS])?.trim();
  const xmiId = attrAny(el, ['xmi:id'])?.trim();
  const anyId = attrAny(el, [...EA_DIAGRAM_ID_ATTRS])?.trim();

  const externalIds: IRExternalId[] = [];
  if (xmiId) externalIds.push({ system: 'xmi', id: xmiId, kind: 'xmi-id' });
  if (guid) externalIds.push({ system: 'sparx-ea', id: guid, kind: 'diagram-guid' });
  if (anyId && anyId !== xmiId && anyId !== guid) externalIds.push({ system: 'sparx-ea', id: anyId, kind: 'diagram-id' });

  const picked = guid || xmiId || anyId;
  if (picked) return { id: picked, externalIds };

  // Deterministic fallback: based on order and name-ish (best effort).
  const name = attrAny(el, [...EA_DIAGRAM_NAME_ATTRS])?.trim() || childText(el, 'name')?.trim() || 'diagram';
  const id = `eaDiagram_synth_${synthIdx}_${slug(name)}`;
  report.warnings.push(`EA XMI: Diagram missing id/guid; generated synthetic diagram id "${id}" (name="${name}").`);
  return { id, externalIds };
}

function pickDiagramName(el: Element, fallback: string): string {
  const direct = attrAny(el, [...EA_DIAGRAM_NAME_ATTRS])?.trim();
  if (direct) return direct;
  const child = childText(el, 'name')?.trim();
  if (child) return child;
  return fallback;
}

function pickDiagramType(el: Element): string | undefined {
  const direct = attrAny(el, [...EA_DIAGRAM_TYPE_ATTRS])?.trim();
  if (direct) return direct;
  // Sometimes EA exports a nested <properties diagramType="…" />
  for (const ch of Array.from(el.children)) {
    if (localName(ch) === 'properties') {
      const t = attrAny(ch, [...EA_DIAGRAM_TYPE_ATTRS])?.trim();
      if (t) return t;
    }
  }
  return undefined;
}

function pickOwningPackageRef(el: Element): string | undefined {
  const direct = attrAny(el, [...EA_DIAGRAM_PACKAGE_ATTRS])?.trim();
  if (direct) return direct;
  // Sometimes the owning package is represented as <package xmi:idref="…" /> or similar.
  for (const ch of Array.from(el.children)) {
    const ln = localName(ch);
    if (ln === 'package' || ln === 'owner' || ln === 'parent') {
      const ref = attrAny(ch, ['xmi:idref', 'idref', 'ref', 'href', 'xmi:id'])?.trim();
      if (ref) return ref;
    }
  }
  return undefined;
}

function pickNotes(el: Element): string | undefined {
  const direct = attrAny(el, [...EA_DIAGRAM_NOTES_ATTRS])?.trim();
  if (direct) return direct;
  const child = childText(el, 'notes')?.trim() || childText(el, 'documentation')?.trim() || childText(el, 'description')?.trim();
  return child || undefined;
}

/**
 * Step B1a: discover diagrams in EA's XMI extension and translate them into empty IR views.
 *
 * The structure of EA's XMI extension varies across EA versions and export options.
 * We therefore:
 * - locate xmi:Extension elements with extender="Enterprise Architect"
 * - search descendants for elements that look like a diagram record
 * - extract stable ids and metadata
 */
export function parseEaDiagramCatalog(doc: Document, report: ImportReport): ParseEaDiagramCatalogResult {
  const views: IRView[] = [];
  const seen = new Set<string>();
  let synthCounter = 0;

  const extensions = qa(doc, 'extension').filter(isEaExtension);
  if (!extensions.length) {
    report.warnings.push('EA XMI: No Enterprise Architect <xmi:Extension> element found; skipping diagram import.');
    return { views };
  }

  // Collect diagram candidates from all EA extension blocks.
  const candidates: Element[] = [];
  for (const ext of extensions) {
    const all = ext.getElementsByTagName('*');
    for (let i = 0; i < all.length; i++) {
      const el = all.item(i);
      if (!el) continue;
      if (isDiagramCandidate(el)) candidates.push(el);
    }
  }

  for (const el of candidates) {
    synthCounter++;
    const { id, externalIds } = pickDiagramId(el, synthCounter, report);
    if (seen.has(id)) {
      report.warnings.push(`EA XMI: Duplicate diagram id "${id}" encountered; skipping subsequent occurrence.`);
      continue;
    }
    seen.add(id);

    const name = pickDiagramName(el, `Diagram ${views.length + 1}`);
    const diagramType = pickDiagramType(el);
    const owningPackageId = pickOwningPackageRef(el);
    const notes = pickNotes(el);

    views.push({
      id,
      name,
      ...(notes ? { documentation: notes } : {}),
      ...(owningPackageId ? { folderId: owningPackageId } : {}),
      ...(diagramType ? { viewpoint: diagramType } : {}),
      nodes: [],
      connections: [],
      ...(externalIds.length ? { externalIds } : {}),
      meta: {
        sourceSystem: 'sparx-ea',
        ...(diagramType ? { eaDiagramType: diagramType } : {}),
        ...(owningPackageId ? { owningPackageId } : {}),
      },
    });
  }

  return { views };
}
