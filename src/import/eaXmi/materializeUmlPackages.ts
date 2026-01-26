import type { ImportReport } from '../importReport';
import { addInfo, addWarning } from '../importReport';
import type { IRElement, IRExternalId, IRFolder, IRRelationship, IRView } from '../framework/ir';

import { attrAny, localName } from '../framework/xml';

type EaPackageIdAliases = {
  /** Maps EA's repository-style package id (EAID_…) -> XMI idref (EAPK_…) */
  eaidToXmiId: Map<string, string>;
  /** Reverse map: XMI idref (EAPK_…) -> EA repository-style id (EAID_…) */
  xmiIdToEaid: Map<string, string>;
};

function isInsideXmiExtension(el: Element): boolean {
  let p: Element | null = el.parentElement;
  while (p) {
    if (localName(p) === 'extension') return true;
    p = p.parentElement;
  }
  return false;
}

/**
 * Sparx EA uses *two* identifiers for packages:
 * - XMI idref (often EAPK_…) on UML <packagedElement …>
 * - Repository id (often EAID_…) exposed as <model package2="EAID_…"> under xmi:Extension element records
 *
 * Diagrams (and some connectors) frequently reference packages using EAID_… (subject="EAID_…").
 */
function buildEaPackageIdAliases(doc: Document): EaPackageIdAliases {
  const eaidToXmiId = new Map<string, string>();
  const xmiIdToEaid = new Map<string, string>();

  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all.item(i);
    if (!el) continue;
    if (!isInsideXmiExtension(el)) continue;
    if (localName(el) !== 'element') continue;

    const idref = (attrAny(el, ['xmi:idref', 'idref']) ?? '').trim();
    if (!idref) continue;

    // Look for a nested <model package2="EAID_…" … ea_eleType="package" />
    let package2: string | undefined;
    let eaEleType: string | undefined;
    for (const ch of Array.from(el.children)) {
      if (localName(ch) !== 'model') continue;
      const p2 = (attrAny(ch, ['package2', 'package_2', 'package2id', 'package2_id']) ?? '').trim();
      if (p2) package2 = p2;
      eaEleType = (attrAny(ch, ['ea_eleType', 'ea_eletype', 'ea_ele_type', 'type']) ?? '').trim();
    }
    if (!package2) continue;

    // Be conservative: only alias when it looks like a package record.
    const looksLikePackage =
      package2.startsWith('EAID_') ||
      (eaEleType ? eaEleType.toLowerCase() === 'package' : false) ||
      idref.startsWith('EAPK_');
    if (!looksLikePackage) continue;

    if (!eaidToXmiId.has(package2)) eaidToXmiId.set(package2, idref);
    if (!xmiIdToEaid.has(idref)) xmiIdToEaid.set(idref, package2);
  }

  return { eaidToXmiId, xmiIdToEaid };
}

function collectReferencedPackageXmiIdsFromViews(views: IRView[], aliases: EaPackageIdAliases, folderIds: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const v of views ?? []) {
    for (const n of v.nodes ?? []) {
      const meta = n?.meta;
      if (!meta || typeof meta !== 'object') continue;
      const rr = (meta as Record<string, unknown>).refRaw;
      if (!rr || typeof rr !== 'object') continue;
      for (const raw of Object.values(rr as Record<string, unknown>)) {
        if (typeof raw !== 'string') continue;
        const tok = raw.trim();
        if (!tok) continue;
        if (folderIds.has(tok)) out.add(tok);
        const mapped = aliases.eaidToXmiId.get(tok);
        if (mapped && folderIds.has(mapped)) out.add(mapped);
      }
    }
  }
  return out;
}

function mergeExternalIds(...lists: Array<IRExternalId[] | undefined>): IRExternalId[] | undefined {
  const out: IRExternalId[] = [];
  const seen = new Set<string>();
  for (const l of lists) {
    for (const ex of l ?? []) {
      if (!ex?.id) continue;
      const key = `${ex.system ?? ''}|${ex.kind ?? ''}|${ex.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ex);
    }
  }
  return out.length ? out : undefined;
}

export type MaterializeUmlPackagesResult = {
  elements: IRElement[];
  relationships: IRRelationship[];
  createdPackageElements: number;
  rewrittenRelationshipEndpoints: number;
};

/**
 * Materialize UML packages as `uml.package` elements when they are referenced as diagram subjects (EAID_…) or
 * as relationship endpoints.
 *
 * This fixes a common EA export pattern where:
 * - packages are defined with xmi:id like EAPK_…
 * - diagram objects reference them using EAID_… (model package2)
 */
export function materializeUmlPackagesFromEaXmi(
  doc: Document,
  folders: IRFolder[],
  elements: IRElement[],
  relationships: IRRelationship[],
  views: IRView[],
  report: ImportReport
): MaterializeUmlPackagesResult {
  const aliases = buildEaPackageIdAliases(doc);
  const folderIds = new Set((folders ?? []).map((f) => (typeof f?.id === 'string' ? f.id : '')));
  const folderById = new Map<string, IRFolder>((folders ?? []).map((f) => [f.id, f]));

  // 1) Collect package refs from diagrams.
  const referencedPackages = collectReferencedPackageXmiIdsFromViews(views ?? [], aliases, folderIds);

  // 2) Rewrite relationship endpoints that point at EAID_… package ids.
  let rewritten = 0;
  const relationshipsOut: IRRelationship[] = (relationships ?? []).map((r) => {
    let sourceId = r.sourceId;
    let targetId = r.targetId;

    const mappedS = aliases.eaidToXmiId.get(sourceId);
    const mappedT = aliases.eaidToXmiId.get(targetId);

    if (mappedS && folderIds.has(mappedS)) {
      sourceId = mappedS;
      referencedPackages.add(mappedS);
      rewritten++;
    }
    if (mappedT && folderIds.has(mappedT)) {
      targetId = mappedT;
      referencedPackages.add(mappedT);
      rewritten++;
    }

    if (sourceId === r.sourceId && targetId === r.targetId) return r;
    return { ...r, sourceId, targetId };
  });

  if (rewritten > 0) {
    addInfo(report, 'EA XMI: Rewrote relationship endpoints referencing packages via EAID_* to their XMI package ids (EAPK_*).', {
      code: 'ea-xmi:package-eaid-endpoint-rewrite',
      context: { count: rewritten }
    });
  }

  // 3) Create uml.package elements for referenced packages if they do not already exist.
  const elById = new Map<string, IRElement>((elements ?? []).map((e) => [e.id, e]));
  let created = 0;

  for (const pkgXmiId of referencedPackages) {
    if (!pkgXmiId) continue;
    if (elById.has(pkgXmiId)) continue;

    const folder = folderById.get(pkgXmiId);
    if (!folder) {
      addWarning(report, 'EA XMI: Found a diagram/relationship reference to a package, but the package folder was not imported.', {
        code: 'ea-xmi:package-folder-missing',
        context: { xmiId: pkgXmiId }
      });
      continue;
    }

    const eaid = aliases.xmiIdToEaid.get(pkgXmiId);
    const externalIds = mergeExternalIds(
      [{ system: 'xmi', id: pkgXmiId, kind: 'xmi-id' }],
      eaid ? [{ system: 'sparx-ea', id: eaid, kind: 'package-eaid' }] : undefined,
      folder.externalIds
    );

    const pkgEl: IRElement = {
      id: pkgXmiId,
      type: 'uml.package',
      name: folder.name ?? 'Package',
      ...(folder.parentId ? { folderId: folder.parentId } : {}),
      ...(externalIds ? { externalIds } : {}),
      meta: {
        metaclass: 'Package',
        xmiType: 'uml:Package',
        derivedFromFolder: true
      }
    };

    elById.set(pkgXmiId, pkgEl);
    created++;
  }

  if (created > 0) {
    addInfo(report, 'EA XMI: Materialized UML packages as elements because they were referenced as diagram nodes or relationship endpoints.', {
      code: 'ea-xmi:package-elements-created',
      context: { count: created }
    });
  }

  return {
    elements: Array.from(elById.values()),
    relationships: relationshipsOut,
    createdPackageElements: created,
    rewrittenRelationshipEndpoints: rewritten
  };
}
