import type { ImportReport } from '../importReport';
import type { IRFolder } from '../framework/ir';

import { attr, attrAny, localName } from '../framework/xml';
import { DEFAULT_UML_PACKAGE_IMPORT_POLICY, type UmlPackageImportPolicy } from './policy';
import { getXmiId, getXmiType } from './xmi';

const EA_GUID_ATTRS = ['ea_guid', 'ea:guid', 'guid'] as const;

function getEaGuid(el: Element): string | undefined {
  const v = attrAny(el, [...EA_GUID_ATTRS]);
  const s = v?.trim();
  return s ? s : undefined;
}

function looksLikeUmlModel(el: Element): boolean {
  const t = (getXmiType(el) ?? '').toLowerCase();
  if (t === 'uml:model' || t.endsWith(':model')) return true;
  return localName(el) === 'model';
}

function looksLikeUmlPackage(el: Element): boolean {
  const ln = localName(el);
  if (ln === 'package') return true;

  // Most common in XMI: <packagedElement xmi:type="uml:Package" …>
  if (ln !== 'packagedelement') return false;
  const t = (getXmiType(el) ?? '').toLowerCase();
  if (!t) return false;
  return t === 'uml:package' || t.endsWith(':package') || t === 'package';
}

function defaultPackageName(el: Element): string {
  // Prefer the UML "name" attribute.
  const n = (attr(el, 'name') ?? '').trim();
  if (n) return n;
  // EA sometimes stores a human-readable label elsewhere; keep this conservative.
  const fallback = (attr(el, 'xmi:label') ?? attr(el, 'label') ?? '').trim();
  return fallback || 'Package';
}

export type ParsePackageHierarchyResult = {
  folders: IRFolder[];
  /** The UML model element (if found). */
  modelEl: Element | null;
};

/**
 * Step 4: Parse UML package hierarchy into IR folders.
 *
 * Policy-compliance:
 * - Packages become folders.
 * - We do NOT materialize `uml.package` elements here (that is handled later).
 */
export function parseEaXmiPackageHierarchyToFolders(
  doc: Document,
  report: ImportReport,
  policy: UmlPackageImportPolicy = DEFAULT_UML_PACKAGE_IMPORT_POLICY,
): ParsePackageHierarchyResult {
  const folders: IRFolder[] = [];
  const seen = new Set<string>();
  let syntheticCounter = 0;

  // Find the first UML model-ish element.
  const all = doc.getElementsByTagName('*');
  let modelEl: Element | null = null;
  for (let i = 0; i < all.length; i++) {
    const el = all.item(i);
    if (!el) continue;
    if (looksLikeUmlModel(el)) {
      modelEl = el;
      break;
    }
  }

  const makeId = (el: Element): string => {
    const xmiId = getXmiId(el);
    if (xmiId) return xmiId;
    syntheticCounter++;
    const id = `eaPkg_synth_${syntheticCounter}`;
    report.warnings.push(
      `EA XMI: Package missing xmi:id; generated synthetic folder id "${id}" (name="${defaultPackageName(el)}").`,
    );
    return id;
  };

  const visitPackage = (pkgEl: Element, parentId: string | null) => {
    const id = makeId(pkgEl);
    if (seen.has(id)) {
      report.warnings.push(`EA XMI: Duplicate package id "${id}" encountered; skipping subsequent occurrence.`);
      return;
    }
    seen.add(id);

    const name = policy.preferHumanReadableNames ? defaultPackageName(pkgEl) : getXmiId(pkgEl) ?? defaultPackageName(pkgEl);
    const eaGuid = getEaGuid(pkgEl);
    const xmiType = getXmiType(pkgEl);

    const folder: IRFolder = {
      id,
      name,
      parentId,
      externalIds: eaGuid ? [{ system: 'sparx-ea', id: eaGuid, kind: 'package-guid' }] : undefined,
      meta: {
        ...(xmiType ? { xmiType } : {}),
      },
    };

    folders.push(folder);

    // Recurse into nested packages.
    for (const child of Array.from(pkgEl.children)) {
      if (looksLikeUmlPackage(child)) {
        visitPackage(child, id);
      }
    }
  };

  const startRoots = (root: Element) => {
    for (const child of Array.from(root.children)) {
      if (looksLikeUmlPackage(child)) {
        visitPackage(child, null);
      }
    }
  };

  if (modelEl) {
    startRoots(modelEl);
  } else {
    // Fallback: search from the document root.
    report.warnings.push('EA XMI: Could not find a UML Model root; scanning document for top-level packages.');
    const docRoot = doc.documentElement;
    if (docRoot) startRoots(docRoot);
  }

  return { folders, modelEl };
}
