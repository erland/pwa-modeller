import type { ImportReport } from '../../importReport';
import type { IRFolder, IRId } from '../../framework/ir';

import { addWarning } from '../../importReport';
import { attrAny, childText, isElementNode, localName } from '../../framework/xml';

import { findFirstByLocalName } from './xmlScan';
import { parsePropertiesToRecord } from './properties';
import { parseTaggedValues } from './taggedValues';

export type OrgParseResult = {
  folders: IRFolder[];
  /** References (element ids, view ids, etc.) to their folder ids. */
  refToFolder: Map<IRId, IRId>;
};

export function parseOrganizations(doc: Document, report: ImportReport): OrgParseResult {
  const folders: IRFolder[] = [];
  const refToFolder = new Map<IRId, IRId>();

  // Some exporters namespace/prefix the tags (e.g. <ns0:organizations>), so we must match localName.
  const orgRoot = findFirstByLocalName(doc, ['organizations', 'organization']);

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
        const hasLabel =
          childText(child, 'label') != null ||
          childText(child, 'name') != null ||
          attrAny(child, ['label', 'name']) != null;
        const hasNested = Array.from(child.children).some(
          (c) => isElementNode(c) && ['item', 'organization', 'folder'].includes(localName(c))
        );
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
    const pseudoName =
      childText(orgRoot, 'label') ?? childText(orgRoot, 'name') ?? attrAny(orgRoot, ['label', 'name']) ?? 'Organization';
    folders.push({ id: pseudoId, name: pseudoName, parentId: null });
    for (const child of Array.from(orgRoot.children)) handleRefChild(child, pseudoId);
  } else {
    addWarning(report, 'MEFF: Found <organizations> section, but could not interpret its structure.');
  }

  return { folders, refToFolder };
}
