import { createImportReport, recordUnknownElementType, recordUnknownRelationshipType } from '../importReport';
import type { ImportReport } from '../importReport';
import type { IRBounds, IRFolder, IRElement, IRId, IRModel, IRPoint, IRRelationship, IRTaggedValue, IRView, IRViewConnection, IRViewNode } from '../framework/ir';
import { mapElementType, mapRelationshipType } from '../mapping/archimateTypeMapping';
import { attrAny, childText, getType, isElementNode, localName, parseXmlLenient } from '../framework/xml';


function parsePropertiesToRecord(el: Element): Record<string, string> | undefined {
  // Common patterns:
  // - <properties><property key="k" value="v"/></properties>
  // - <properties><property propertyDefinitionRef="…" value="…"/></properties>
  // - <property key="…" value="…"/>
  const props: Record<string, string> = {};

  const collectFromProperty = (p: Element) => {
    const key =
      attrAny(p, ['key', 'name', 'propertydefinitionref', 'propertyDefinitionRef', 'ref', 'identifierRef']) ??
      childText(p, 'key') ??
      childText(p, 'name');
    const value = attrAny(p, ['value']) ?? childText(p, 'value') ?? (p.textContent?.trim() ?? '');
    if (key && value) props[key] = value;
  };

  // First: <properties> container(s)
  for (const c of Array.from(el.children)) {
    if (localName(c) === 'properties') {
      for (const p of Array.from(c.children)) {
        if (localName(p) === 'property') collectFromProperty(p);
      }
    }
  }
  // Also allow direct <property> children
  for (const c of Array.from(el.children)) {
    if (localName(c) === 'property') collectFromProperty(c);
  }

  return Object.keys(props).length ? props : undefined;
}

function parseTaggedValues(el: Element): IRTaggedValue[] | undefined {
  // We keep this broad. Some exporters represent tagged values as:
  // - <taggedValues><taggedValue key="k" value="v"/></taggedValues>
  // - <properties> … </properties> (handled separately as properties)
  const out: IRTaggedValue[] = [];

  const addKV = (key: string | null, value: string | null) => {
    const k = (key ?? '').trim();
    const v = (value ?? '').trim();
    if (k && v) out.push({ key: k, value: v });
  };

  for (const c of Array.from(el.children)) {
    const ln = localName(c);
    if (ln === 'taggedvalues') {
      for (const tv of Array.from(c.children)) {
        if (localName(tv) !== 'taggedvalue') continue;
        addKV(attrAny(tv, ['key', 'name']), attrAny(tv, ['value']) ?? tv.textContent);
      }
    } else if (ln === 'taggedvalue') {
      addKV(attrAny(c, ['key', 'name']), attrAny(c, ['value']) ?? c.textContent);
    }
  }

  return out.length ? out : undefined;
}

type OrgParseResult = {
  folders: IRFolder[];
  /** References (element ids, view ids, etc.) to their folder ids. */
  refToFolder: Map<IRId, IRId>;
};

function parseOrganizations(doc: Document, report: ImportReport): OrgParseResult {
  const folders: IRFolder[] = [];
  const refToFolder = new Map<IRId, IRId>();

  const orgRoot =
    doc.getElementsByTagName('organizations')[0] ??
    doc.getElementsByTagName('organization')[0] ??
    doc.getElementsByTagName('Organizations')[0] ??
    doc.getElementsByTagName('Organization')[0];

  if (!orgRoot) return { folders, refToFolder };

  let autoId = 0;

  const makeFolderId = (raw: string | null): string => {
    if (raw && raw.trim().length) return raw.trim();
    autoId += 1;
    return `org-auto-${autoId}`;
  };

  const handleRefChild = (child: Element, folderId: IRId) => {
    const ref =
      attrAny(child, ['identifierref', 'identifierRef', 'ref', 'idref', 'elementref', 'elementRef']) ??
      childText(child, 'identifierRef') ??
      childText(child, 'ref');
    if (ref && !refToFolder.has(ref)) refToFolder.set(ref, folderId);
  };

  const walkItem = (itemEl: Element, parentId: IRId | null) => {
    // Consider <item> or <organization> nodes as folders if they have a label/name or children.
    const id = makeFolderId(attrAny(itemEl, ['identifier', 'id']));
    const name =
      childText(itemEl, 'label') ??
      childText(itemEl, 'name') ??
      attrAny(itemEl, ['label', 'name']) ??
      'Group';

    const folder: IRFolder = {
      id,
      name,
      parentId: parentId ?? null,
      documentation: childText(itemEl, 'documentation') ?? undefined,
      properties: parsePropertiesToRecord(itemEl),
      taggedValues: parseTaggedValues(itemEl)
    };
    folders.push(folder);

    for (const child of Array.from(itemEl.children)) {
      const ln = localName(child);
      if (ln === 'item' || ln === 'organization' || ln === 'folder') {
        // A child may be a reference-only item (identifierRef) OR a nested group.
        const hasRef =
          attrAny(child, ['identifierref', 'identifierRef', 'ref', 'idref', 'elementref', 'elementRef']) != null;
        const hasLabel = childText(child, 'label') != null || childText(child, 'name') != null || attrAny(child, ['label', 'name']) != null;
        const hasNested = Array.from(child.children).some((c) => isElementNode(c) && (['item', 'organization', 'folder'].includes(localName(c))));
        if (hasRef && !hasLabel && !hasNested) {
          handleRefChild(child, folder.id);
        } else if (hasRef && !hasLabel && hasNested) {
          // Some exporters wrap nested groups in a node that also has identifierRef; treat as group and still collect refs.
          handleRefChild(child, folder.id);
          walkItem(child, folder.id);
        } else {
          // Treat as nested folder/group.
          walkItem(child, folder.id);
        }
      } else {
        // Sometimes refs are not wrapped in <item>; allow direct reference tags.
        handleRefChild(child, folder.id);
      }
    }
  };

  // Start from orgRoot's child <item>/<organization> nodes, or orgRoot itself if it appears to be a folder.
  const rootChildren = Array.from(orgRoot.children).filter((c) => {
    const ln = localName(c);
    return ln === 'item' || ln === 'organization' || ln === 'folder';
  });

  if (rootChildren.length) {
    for (const c of rootChildren) walkItem(c, null);
  } else if (isElementNode(orgRoot) && (localName(orgRoot) === 'organization' || localName(orgRoot) === 'organizations')) {
    // Some tools put folder-like attributes on <organizations> itself.
    // In that case, treat its children as refs.
    const pseudoId = makeFolderId(attrAny(orgRoot, ['identifier', 'id']));
    const pseudoName = childText(orgRoot, 'label') ?? childText(orgRoot, 'name') ?? attrAny(orgRoot, ['label', 'name']) ?? 'Organization';
    folders.push({ id: pseudoId, name: pseudoName, parentId: null });
    for (const child of Array.from(orgRoot.children)) handleRefChild(child, pseudoId);
  } else {
    report.warnings.push('MEFF: Found <organizations> section, but could not interpret its structure.');
  }

  return { folders, refToFolder };
}


function parseNumber(raw: string | null): number | undefined {
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function parseBounds(el: Element): IRBounds | undefined {
  const tryFrom = (e: Element): IRBounds | undefined => {
    const x = parseNumber(attrAny(e, ['x', 'left', 'posx', 'posX']));
    const y = parseNumber(attrAny(e, ['y', 'top', 'posy', 'posY']));
    const w = parseNumber(attrAny(e, ['width', 'w']));
    const h = parseNumber(attrAny(e, ['height', 'h']));
    if (x == null || y == null || w == null || h == null) return undefined;
    return { x, y, width: w, height: h };
  };

  // First: attributes on the node itself.
  const direct = tryFrom(el);
  if (direct) return direct;

  // Second: a direct <bounds>/<geometry>/<rect> child.
  for (const c of Array.from(el.children)) {
    const ln = localName(c);
    if (ln === 'bounds' || ln === 'geometry' || ln === 'rect') {
      const b = tryFrom(c);
      if (b) return b;
    }
  }

  // Third: any descendant <bounds>/<geometry>/<rect>.
  const descendants = Array.from(el.getElementsByTagName('*')) as Element[];
  for (const d of descendants) {
    const ln = localName(d);
    if (ln === 'bounds' || ln === 'geometry' || ln === 'rect') {
      const b = tryFrom(d);
      if (b) return b;
    }
  }

  return undefined;
}

function parsePoints(el: Element): IRPoint[] | undefined {
  const out: IRPoint[] = [];
  const candidates = Array.from(el.getElementsByTagName('*')) as Element[];
  for (const c of candidates) {
    const ln = localName(c);
    if (ln !== 'point' && ln !== 'bendpoint' && ln !== 'waypoint') continue;

    const x = parseNumber(attrAny(c, ['x', 'posx', 'posX']));
    const y = parseNumber(attrAny(c, ['y', 'posy', 'posY']));
    if (x == null || y == null) continue;

    out.push({ x, y });
  }

  return out.length ? out : undefined;
}

function meffNodeKindFromType(rawType: string | null): { kind: IRViewNode['kind']; objectType?: 'Label' | 'Note' | 'GroupBox' } {
  const t = (rawType ?? '').toLowerCase();
  if (t.includes('note')) return { kind: 'note', objectType: 'Note' };
  if (t.includes('group')) return { kind: 'group', objectType: 'GroupBox' };
  if (t.includes('label')) return { kind: 'shape', objectType: 'Label' };
  return { kind: 'other', objectType: 'Label' };
}

function parseViews(doc: Document, report: ImportReport, refToFolder: Map<IRId, IRId>): IRView[] {
  const viewsRoot =
    doc.getElementsByTagName('views')[0] ??
    doc.getElementsByTagName('Views')[0] ??
    doc.getElementsByTagName('diagrams')[0] ??
    doc.getElementsByTagName('Diagrams')[0];

  if (!viewsRoot || !isElementNode(viewsRoot)) return [];

  const views: IRView[] = [];

  const isViewCandidate = (el: Element): boolean => {
    const ln = localName(el);
    if (ln !== 'view' && ln !== 'diagram') return false;
    const id = attrAny(el, ['identifier', 'id']);
    if (!id) return false;
    // Ensure it actually contains view content.
    const hasNodes = el.getElementsByTagName('node').length > 0;
    const hasConnections = el.getElementsByTagName('connection').length > 0 || el.getElementsByTagName('edge').length > 0;
    return hasNodes || hasConnections;
  };

  const candidates = Array.from(viewsRoot.getElementsByTagName('*')) as Element[];
  const viewEls = candidates.filter(isViewCandidate);

  let autoViewId = 0;

  for (const vEl of viewEls) {
    const id = (attrAny(vEl, ['identifier', 'id']) ?? '').trim() || `view-auto-${++autoViewId}`;
    const name =
      (attrAny(vEl, ['name', 'label']) ?? childText(vEl, 'name') ?? childText(vEl, 'label') ?? '').trim() || 'View';
    const documentation = childText(vEl, 'documentation') ?? childText(vEl, 'documentationText') ?? undefined;

    const viewpoint =
      attrAny(vEl, ['viewpoint', 'viewpointid', 'viewpointId', 'viewpointref', 'viewpointRef']) ??
      childText(vEl, 'viewpoint') ??
      undefined;

    const folderId = refToFolder.get(id) ?? null;

    const nodes: IRViewNode[] = [];
    const connections: IRViewConnection[] = [];

    let autoNodeId = 0;

    const parseNodeRec = (nodeEl: Element, parentNodeId: IRId | null) => {
      const nodeId =
        (attrAny(nodeEl, ['identifier', 'id']) ?? '').trim() ||
        (attrAny(nodeEl, ['elementref', 'elementRef', 'conceptref', 'conceptRef']) ?? '').trim() ||
        `node-auto-${++autoNodeId}`;

      const elementId =
        (attrAny(nodeEl, ['elementref', 'elementRef', 'conceptref', 'conceptRef', 'element', 'ref']) ??
          childText(nodeEl, 'elementRef') ??
          childText(nodeEl, 'conceptRef') ??
          null)?.trim() || undefined;

      const typeToken = getType(nodeEl);
      const label =
        (attrAny(nodeEl, ['label', 'name']) ??
          childText(nodeEl, 'label') ??
          childText(nodeEl, 'name') ??
          childText(nodeEl, 'text'))?.trim() || undefined;

      const bounds = parseBounds(nodeEl);
      const zIndex = parseNumber(attrAny(nodeEl, ['z', 'zindex', 'zIndex', 'order']));

      if (elementId) {
        nodes.push({
          id: nodeId,
          kind: 'element',
          elementId,
          parentNodeId,
          label,
          bounds,
          properties: parsePropertiesToRecord(nodeEl),
          taggedValues: parseTaggedValues(nodeEl),
          meta: {
            source: 'archimate-meff',
            ...(zIndex != null ? { zIndex } : {})
          }
        });
      } else {
        const kindInfo = meffNodeKindFromType(typeToken);
        nodes.push({
          id: nodeId,
          kind: kindInfo.kind,
          parentNodeId,
          label,
          bounds,
          properties: parsePropertiesToRecord(nodeEl),
          taggedValues: parseTaggedValues(nodeEl),
          meta: {
            source: 'archimate-meff',
            ...(kindInfo.objectType ? { objectType: kindInfo.objectType } : {}),
            ...(zIndex != null ? { zIndex } : {})
          }
        });
      }

      for (const c of Array.from(nodeEl.children)) {
        if (localName(c) === 'node') parseNodeRec(c, nodeId);
      }
    };

    // Parse top-level nodes (recursive for nested nodes).
    for (const c of Array.from(vEl.children)) {
      if (!isElementNode(c)) continue;
      if (localName(c) === 'node') parseNodeRec(c, null);
      // Some exporters wrap nodes in <nodes> container
      if (localName(c) === 'nodes') {
        for (const nn of Array.from(c.children)) {
          if (isElementNode(nn) && localName(nn) === 'node') parseNodeRec(nn, null);
        }
      }
    }

    let autoConnId = 0;
    const connCandidates = Array.from(vEl.getElementsByTagName('*')) as Element[];
    for (const cEl of connCandidates) {
      const ln = localName(cEl);
      if (ln !== 'connection' && ln !== 'edge' && ln !== 'relationship') continue;

      const relationshipId =
        (attrAny(cEl, ['relationshipref', 'relationshipRef', 'relationref', 'relationRef', 'ref']) ??
          childText(cEl, 'relationshipRef') ??
          childText(cEl, 'ref') ??
          null)?.trim() || undefined;

      const hasEndpoints =
        attrAny(cEl, ['source', 'target', 'sourcenode', 'targetnode', 'sourceRef', 'targetRef', 'sourceNode', 'targetNode']) != null;

      if (!relationshipId && !hasEndpoints) continue;

      const id =
        (attrAny(cEl, ['identifier', 'id']) ?? '').trim() || (relationshipId ? `${relationshipId}#${++autoConnId}` : `conn-auto-${++autoConnId}`);

      const sourceNodeId =
        (attrAny(cEl, ['sourcenode', 'sourceNode', 'sourceNodeRef', 'sourceRef', 'source']) ?? null)?.trim() || undefined;
      const targetNodeId =
        (attrAny(cEl, ['targetnode', 'targetNode', 'targetNodeRef', 'targetRef', 'target']) ?? null)?.trim() || undefined;

      const sourceElementId =
        (attrAny(cEl, ['sourceelementref', 'sourceElementRef']) ?? null)?.trim() || undefined;
      const targetElementId =
        (attrAny(cEl, ['targetelementref', 'targetElementRef']) ?? null)?.trim() || undefined;

      const zIndex = parseNumber(attrAny(cEl, ['z', 'zindex', 'zIndex', 'order']));

      connections.push({
        id,
        relationshipId,
        sourceNodeId,
        targetNodeId,
        sourceElementId,
        targetElementId,
        label: (childText(cEl, 'label') ?? attrAny(cEl, ['label', 'name']) ?? undefined)?.trim() || undefined,
        points: parsePoints(cEl),
        properties: parsePropertiesToRecord(cEl),
        taggedValues: parseTaggedValues(cEl),
        meta: {
          source: 'archimate-meff',
          ...(zIndex != null ? { zIndex } : {})
        }
      });
    }

    views.push({
      id,
      name,
      documentation: documentation ?? undefined,
      folderId,
      viewpoint: viewpoint ?? undefined,
      nodes,
      connections,
      meta: {
        source: 'archimate-meff'
      }
    });
  }

  if (!views.length) {
    // Presence of <views> but no parseable <view> objects shouldn't be fatal, but it helps troubleshooting.
    report.warnings.push('MEFF: Found <views> section, but did not recognize any <view> / <diagram> entries.');
  }

  return views;
}

export type ParseMeffResult = {
  ir: IRModel;
  report: ImportReport;
};

/**
 * Parse ArchiMate Model Exchange File (MEFF) into the canonical IR.
 * MEFF import: elements + relationships + organization/folders + (optional) views/diagrams.
 */
export function parseMeffXml(xmlText: string, fileNameForMessages = 'model.xml'): ParseMeffResult {
  const report = createImportReport('archimate-meff');

  const { doc, parserError } = parseXmlLenient(xmlText);

  if (parserError) {
    report.warnings.push("MEFF: XML parser reported an error while reading \"" + fileNameForMessages + "\": " + parserError);
  }

  const { folders, refToFolder } = parseOrganizations(doc, report);
  const views = parseViews(doc, report, refToFolder);

  const elements: IRElement[] = [];
  const relationships: IRRelationship[] = [];

  // Elements
  const elementsRoot = doc.getElementsByTagName('elements')[0];
  if (elementsRoot) {
    for (const el of Array.from(elementsRoot.children)) {
      if (!isElementNode(el) || localName(el) !== 'element') continue;

      const id = attrAny(el, ['identifier', 'id']);
      if (!id) {
        report.warnings.push('MEFF: Skipping an <element> without identifier.');
        continue;
      }

      const rawType = (getType(el) ?? '').trim();
      const typeRes = mapElementType(rawType, 'archimate-meff');
      if (typeRes.kind === 'unknown') recordUnknownElementType(report, typeRes.unknown);
      const typeForIr = typeRes.kind === 'known' ? typeRes.type : 'Unknown';

      const name = childText(el, 'name') ?? attrAny(el, ['name']) ?? '';
      const safeName = name.trim().length ? name.trim() : '(unnamed)';
      if (!name.trim().length) {
        report.warnings.push(`MEFF: Element "${id}" is missing a name; using "(unnamed)".`);
      }
      const documentation = childText(el, 'documentation') ?? undefined;

      const folderId = refToFolder.get(id) ?? null;

      elements.push({
        id,
        type: typeForIr,
        name: safeName,
        documentation,
        folderId: folderId ?? undefined,
        properties: parsePropertiesToRecord(el),
        taggedValues: parseTaggedValues(el),
        meta: {
          source: 'archimate-meff',
          ...(typeRes.kind === 'unknown'
            ? { sourceType: typeRes.unknown.name }
            : {})
        }
      });
    }
  } else {
    report.warnings.push('MEFF: No <elements> section found.');
  }

  // Relationships
  const relRoot = doc.getElementsByTagName('relationships')[0];
  if (relRoot) {
    for (const el of Array.from(relRoot.children)) {
      if (!isElementNode(el) || localName(el) !== 'relationship') continue;

      const id = attrAny(el, ['identifier', 'id']);
      if (!id) {
        report.warnings.push('MEFF: Skipping a <relationship> without identifier.');
        continue;
      }

      const rawType = (getType(el) ?? '').trim();
      const typeRes = mapRelationshipType(rawType, 'archimate-meff');
      if (typeRes.kind === 'unknown') recordUnknownRelationshipType(report, typeRes.unknown);
      const typeForIr = typeRes.kind === 'known' ? typeRes.type : 'Unknown';

      const sourceId =
        attrAny(el, ['source', 'sourceRef', 'sourceref', 'from']) ?? childText(el, 'source') ?? childText(el, 'sourceRef');
      const targetId =
        attrAny(el, ['target', 'targetRef', 'targetref', 'to']) ?? childText(el, 'target') ?? childText(el, 'targetRef');

      if (!sourceId || !targetId) {
        report.warnings.push(`MEFF: Relationship "${id}" is missing source/target; skipped.`);
        continue;
      }

      const name = childText(el, 'name') ?? attrAny(el, ['name']) ?? undefined;
      const documentation = childText(el, 'documentation') ?? undefined;

      relationships.push({
        id,
        type: typeForIr,
        name,
        documentation,
        sourceId,
        targetId,
        properties: parsePropertiesToRecord(el),
        taggedValues: parseTaggedValues(el),
        meta: {
          source: 'archimate-meff',
          ...(typeRes.kind === 'unknown'
            ? { sourceType: typeRes.unknown.name }
            : {})
        }
      });
    }
  } else {
    report.warnings.push('MEFF: No <relationships> section found.');
  }

  const ir: IRModel = {
    folders,
    elements,
    relationships,
    views,
    meta: {
      format: 'archimate-meff',
      importedAtIso: new Date().toISOString()
    }
  };

  return { ir, report };
}