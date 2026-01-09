import { createImportReport, recordUnknownElementType, recordUnknownRelationshipType } from '../importReport';
import type { ImportReport } from '../importReport';
import type { IRFolder, IRElement, IRId, IRModel, IRRelationship, IRTaggedValue } from '../framework/ir';

function isElementNode(n: Node): n is Element {
  return n.nodeType === Node.ELEMENT_NODE;
}

function localName(el: Element): string {
  // DOMParser in browsers normalizes tagName; keep it case-insensitive.
  return (el.localName || el.tagName || '').toLowerCase();
}

function attrAny(el: Element, names: string[]): string | null {
  for (const name of names) {
    const v = el.getAttribute(name);
    if (v != null) return v;
    // Sometimes attributes are namespaced (e.g. xsi:type) but accessible via raw name.
    // As a fallback, try to match by suffix.
    for (const a of Array.from(el.attributes)) {
      if (a.name.toLowerCase() === name.toLowerCase() || a.name.toLowerCase().endsWith(':' + name.toLowerCase())) {
        return a.value;
      }
    }
  }
  return null;
}

function getType(el: Element): string | null {
  return attrAny(el, ['xsi:type', 'type']);
}

function pickTextByLang(nodes: Element[]): string {
  if (!nodes.length) return '';
  // Prefer explicit english if present, otherwise first.
  const en = nodes.find((n) => (n.getAttribute('xml:lang') || n.getAttribute('lang') || '').toLowerCase().startsWith('en'));
  return (en ?? nodes[0]).textContent?.trim() ?? '';
}

function childText(el: Element, childTag: string): string | null {
  const tag = childTag.toLowerCase();
  const matches: Element[] = [];
  for (const c of Array.from(el.children)) {
    if (localName(c) === tag) matches.push(c);
  }
  if (!matches.length) return null;
  const txt = pickTextByLang(matches).trim();
  return txt.length ? txt : null;
}

function parsePropertiesToRecord(el: Element): Record<string, string> | undefined {
  // Common patterns:
  // - <properties><property key="k" value="v"/></properties>
  // - <properties><property propertyDefinitionRef="..." value="..."/></properties>
  // - <property key="..." value="..."/>
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
  // - <properties> ... </properties> (handled separately as properties)
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
  elementToFolder: Map<IRId, IRId>;
};

function parseOrganizations(doc: Document, report: ImportReport): OrgParseResult {
  const folders: IRFolder[] = [];
  const elementToFolder = new Map<IRId, IRId>();

  const orgRoot =
    doc.getElementsByTagName('organizations')[0] ??
    doc.getElementsByTagName('organization')[0] ??
    doc.getElementsByTagName('Organizations')[0] ??
    doc.getElementsByTagName('Organization')[0];

  if (!orgRoot) return { folders, elementToFolder };

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
    if (ref && !elementToFolder.has(ref)) elementToFolder.set(ref, folderId);
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

  return { folders, elementToFolder };
}

export type ParseMeffResult = {
  ir: IRModel;
  report: ImportReport;
};

/**
 * Parse ArchiMate Model Exchange File (MEFF) into the canonical IR.
 * This is v1: elements + relationships + organization/folders; no diagram/view parsing yet.
 */
export function parseMeffXml(xmlText: string, fileNameForMessages = 'model.xml'): ParseMeffResult {
  const report = createImportReport('archimate-meff');

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  const parserErrors = doc.getElementsByTagName('parsererror');
  if (parserErrors && parserErrors.length) {
    report.warnings.push(`MEFF: XML parser reported an error while reading "${fileNameForMessages}".`);
  }

  const { folders, elementToFolder } = parseOrganizations(doc, report);

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

      const type = (getType(el) ?? '').trim();
      if (!type) recordUnknownElementType(report, 'MissingType');

      const name = childText(el, 'name') ?? attrAny(el, ['name']) ?? '';
      const documentation = childText(el, 'documentation') ?? undefined;

      const folderId = elementToFolder.get(id) ?? null;

      elements.push({
        id,
        type: type || 'Unknown',
        name: name || undefined,
        documentation,
        folderId: folderId ?? undefined,
        properties: parsePropertiesToRecord(el),
        taggedValues: parseTaggedValues(el),
        meta: {
          source: 'archimate-meff'
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

      const type = (getType(el) ?? '').trim();
      if (!type) recordUnknownRelationshipType(report, 'MissingType');

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
        type: type || 'Unknown',
        name,
        documentation,
        sourceId,
        targetId,
        properties: parsePropertiesToRecord(el),
        taggedValues: parseTaggedValues(el),
        meta: {
          source: 'archimate-meff'
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
    meta: {
      format: 'archimate-meff',
      importedAtIso: new Date().toISOString()
    }
  };

  return { ir, report };
}
