import type { IRModel, IRElement, IRExternalId, IRFolder, IRRelationship, IRView } from '../../framework/ir';
import { addInfo, addWarning } from '../../importReport';
import type { NormalizeEaXmiOptions } from './normalizeEaXmiShared';
import type { EaPackageIdAliasesJson } from '../materializeUmlPackages';

function asAliases(ir: IRModel): EaPackageIdAliasesJson | undefined {
  const meta = ir.meta;
  if (!meta || typeof meta !== 'object') return undefined;
  const eaXmi = (meta as any).eaXmi;
  if (!eaXmi || typeof eaXmi !== 'object') return undefined;
  const pkg = (eaXmi as any).packageIdAliases;
  if (!pkg || typeof pkg !== 'object') return undefined;
  if (!pkg.eaidToXmiId || !pkg.xmiIdToEaid) return undefined;
  return pkg as EaPackageIdAliasesJson;
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

function collectReferencedPackageXmiIdsFromViews(
  views: IRView[] | undefined,
  aliases: EaPackageIdAliasesJson,
  folderIds: Set<string>
): Set<string> {
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
        const mapped = aliases.eaidToXmiId[tok];
        if (mapped && folderIds.has(mapped)) out.add(mapped);
      }
    }
  }
  return out;
}

export type NormalizeEaXmiPackagesResult = {
  elements: IRElement[];
  relationships: IRRelationship[];
};

/**
 * EA XMI packages:
 * - UML packages exist as folders (EAPK_… ids)
 * - Diagrams and some connectors reference packages using EA repository ids (EAID_…) via xmi:Extension element records (model package2)
 *
 * If we don't rewrite EAID_* -> EAPK_* and materialize uml.package elements early,
 * generic normalizeImportIR will drop relationships and clear view connections.
 */
export function normalizeEaXmiPackages(
  ir: IRModel,
  folderIds: Set<string>,
  opts?: NormalizeEaXmiOptions
): NormalizeEaXmiPackagesResult {
  const aliases = asAliases(ir);
  if (!aliases) {
    // Keep behavior unchanged if the importer didn't attach alias data.
    return { elements: ir.elements ?? [], relationships: ir.relationships ?? [] };
  }

  const referencedPackages = collectReferencedPackageXmiIdsFromViews(ir.views, aliases, folderIds);

  // Rewrite relationship endpoints that reference packages via EAID_… -> EAPK_…
  let rewritten = 0;
  const relationshipsOut: IRRelationship[] = (ir.relationships ?? []).map((r) => {
    let sourceId = r.sourceId;
    let targetId = r.targetId;

    const mappedS = sourceId ? aliases.eaidToXmiId[sourceId] : undefined;
    const mappedT = targetId ? aliases.eaidToXmiId[targetId] : undefined;

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

  if (rewritten > 0 && opts?.report) {
    addInfo(opts.report, 'EA XMI: Rewrote relationship endpoints referencing packages via EAID_* to their XMI package ids (EAPK_*).', {
      code: 'ea-xmi:package-eaid-endpoint-rewrite',
      context: { count: rewritten }
    });
  }

  // Materialize uml.package elements for referenced packages (if missing).
  const folderById = new Map<string, IRFolder>((ir.folders ?? []).map((f) => [f.id, f]));
  const elById = new Map<string, IRElement>((ir.elements ?? []).map((e) => [e.id, e]));
  let created = 0;

  for (const pkgXmiId of referencedPackages) {
    if (!pkgXmiId) continue;
    if (elById.has(pkgXmiId)) continue;

    const folder = folderById.get(pkgXmiId);
    if (!folder) {
      if (opts?.report) {
        addWarning(opts.report, 'EA XMI: Found a diagram/relationship reference to a package, but the package folder was not imported.', {
          code: 'ea-xmi:package-folder-missing',
          context: { xmiId: pkgXmiId }
        });
      }
      continue;
    }

    const eaid = aliases.xmiIdToEaid[pkgXmiId];
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

  if (created > 0 && opts?.report) {
    addInfo(opts.report, 'EA XMI: Materialized UML packages as elements because they were referenced as diagram nodes or relationship endpoints.', {
      code: 'ea-xmi:package-elements-created',
      context: { count: created }
    });
  }

  return { elements: Array.from(elById.values()), relationships: relationshipsOut };
}
