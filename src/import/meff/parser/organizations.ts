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
  /** Nested reference ownership (e.g., element-in-element) based on the organizations tree. */
  refToParentRef: Map<IRId, IRId>;
};

export function parseOrganizations(doc: Document, report: ImportReport): OrgParseResult {
  const folders: IRFolder[] = [];
  const refToFolder = new Map<IRId, IRId>();
  const refToParentRef = new Map<IRId, IRId>();

  // Some exporters namespace/prefix the tags (e.g. <ns0:organizations>), so we must match localName.
  const orgRoot = findFirstByLocalName(doc, ['organizations', 'organization']);

  if (!orgRoot) return { folders, refToFolder, refToParentRef };

  let autoId = 0;

  const makeFolderId = (raw: string | null): string => {
    if (raw && raw.trim().length) return raw.trim();
    autoId += 1;
    return `org-auto-${autoId}`;
  };

  const handleRefChild = (child: Element, folderId: IRId | null, parentRef: IRId | null) => {
    const ref =
      attrAny(child, ['identifierref', 'identifierRef', 'ref', 'idref', 'elementref', 'elementRef']) ??
      childText(child, 'identifierRef') ??
      childText(child, 'ref');
    if (ref && folderId && !refToFolder.has(ref)) refToFolder.set(ref, folderId);

    // If this reference is nested under a reference-only item, treat it as semantic ownership/containment.
    if (ref && parentRef && !refToParentRef.has(ref)) refToParentRef.set(ref, parentRef);
  };

  const walkItem = (itemEl: Element, parentFolderId: IRId | null, currentFolderId: IRId | null, parentRef: IRId | null) => {
    // MEFF <organizations> uses <item> for both folders and references.
    // If the node has an identifierRef but no label/name, treat it as a reference container (NOT a folder).
    const ref =
      attrAny(itemEl, ['identifierref', 'identifierRef', 'ref', 'idref', 'elementref', 'elementRef']) ??
      childText(itemEl, 'identifierRef') ??
      childText(itemEl, 'ref');

    const hasLabel =
      childText(itemEl, 'label') != null ||
      childText(itemEl, 'name') != null ||
      attrAny(itemEl, ['label', 'name']) != null;

    if (ref && !hasLabel) {
      // Reference-only node: map the ref to current folder and allow its children to inherit ownership.
      handleRefChild(itemEl, currentFolderId, parentRef);
      const nextParentRef = ref.trim().length ? ref.trim() : parentRef;
      for (const child of Array.from(itemEl.children)) {
        const ln = localName(child);
        if (ln === 'item' || ln === 'organization' || ln === 'folder') {
          walkItem(child, parentFolderId, currentFolderId, nextParentRef);
        } else {
          handleRefChild(child, currentFolderId, nextParentRef);
        }
      }
      return;
    }

    // Folder/group node
    const id = makeFolderId(attrAny(itemEl, ['identifier', 'id']));
    const name =
      childText(itemEl, 'label') ??
      childText(itemEl, 'name') ??
      attrAny(itemEl, ['label', 'name']) ??
      'Group';

    const folder: IRFolder = {
      id,
      name,
      parentId: null,
      documentation: childText(itemEl, 'documentation') ?? undefined,
      properties: parsePropertiesToRecord(itemEl),
      taggedValues: parseTaggedValues(itemEl)
    };

    // Parent the folder under the provided parent folder (as group nesting).
    folder.parentId = parentFolderId;
    folders.push(folder);

    for (const child of Array.from(itemEl.children)) {
      const ln = localName(child);
      if (ln === 'item' || ln === 'organization' || ln === 'folder') {
        walkItem(child, folder.id, folder.id, null);
      } else {
        // Sometimes refs are not wrapped in <item>; allow direct reference tags.
        handleRefChild(child, folder.id, null);
      }
    }
  };

  // Start from orgRoot's child <item>/<organization> nodes, or orgRoot itself if it appears to be a folder.
  const rootChildren = Array.from(orgRoot.children).filter((c) => {
    const ln = localName(c);
    return ln === 'item' || ln === 'organization' || ln === 'folder';
  });

  if (rootChildren.length) {
    for (const c of rootChildren) walkItem(c, null, null, null);
  } else if (isElementNode(orgRoot) && (localName(orgRoot) === 'organization' || localName(orgRoot) === 'organizations')) {
    // Some tools put folder-like attributes on <organizations> itself.
    // In that case, treat its children as refs.
    const pseudoId = makeFolderId(attrAny(orgRoot, ['identifier', 'id']));
    const pseudoName =
      childText(orgRoot, 'label') ?? childText(orgRoot, 'name') ?? attrAny(orgRoot, ['label', 'name']) ?? 'Organization';
    folders.push({ id: pseudoId, name: pseudoName, parentId: null });
    for (const child of Array.from(orgRoot.children)) handleRefChild(child, pseudoId, null);
  } else {
    addWarning(report, 'MEFF: Found <organizations> section, but could not interpret its structure.');
  }

  return { folders, refToFolder, refToParentRef };
}
