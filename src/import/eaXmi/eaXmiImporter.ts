import { addInfo, addWarning, createImportReport } from '../importReport';
import { readBlobAsArrayBuffer } from '../framework/blobReaders';
import { decodeXmlBytes } from '../framework/xmlDecoding';
import type { ImportContext, ImportResult, Importer } from '../framework/importer';
import type { IRModel, IRRelationship } from '../framework/ir';
import { parseXmlLenient } from '../framework/xml';
import { parseEaXmiPackageHierarchyToFolders } from './parsePackages';
import {
  parseEaXmiArchiMateProfileElementsToElements,
  parseEaXmiBpmnProfileElementsToElements,
  parseEaXmiClassifiersToElements,
} from './parseElements';
import { parseEaXmiArchiMateProfileRelationships, parseEaXmiBpmnProfileRelationships, parseEaXmiRelationships } from './parseRelationships';
import { parseEaXmiArchiMateConnectorRelationships } from './parseEaConnectorsArchiMateRelationships';
import { parseEaXmiUmlConnectorRelationships } from './parseEaConnectorsUmlRelationships';
import { parseEaXmiAssociations } from './parseAssociations';
import { parseEaDiagramCatalog } from './parseEaDiagramCatalog';
import { parseEaDiagramObjects } from './parseEaDiagramObjects';
import { parseEaDiagramConnections } from './parseEaDiagramConnections';
import { parseEaXmiLinksRelationships } from './parseEaXmiLinksRelationships';
import { buildEaPackageIdAliasesJson, materializeUmlPackagesFromEaXmi } from './materializeUmlPackages';

function detectEaXmiUmlFromText(text: string): boolean {
  if (!text) return false;

  // Quick checks first (cheap string scans).
  const t = text.toLowerCase();
  if (!t.includes('<')) return false;

  // Root is typically <xmi:XMI …> but prefixes can vary.
  // Keep this fairly strict to avoid claiming generic XML with a random xmi:* element.
  const hasXmiRoot =
    /<\s*(?:[\w.-]+:)?xmi\s*:\s*xmi\b/i.test(text) ||
    /<\s*xmi\b[^>]*xmlns/i.test(text);
  if (!hasXmiRoot) return false;

  // UML indicator: either explicit uml namespace or common uml model/package/class markers.
  const hasUmlMarker =
    /xmlns\s*:\s*uml\s*=/.test(t) ||
    /http:\/\/www\.omg\.org\/spec\/uml/i.test(text) ||
    /\buml\s*:\s*model\b/i.test(text) ||
    /\bxmi\s*:\s*type\s*=\s*"\s*uml\s*:\s*package\b/i.test(text) ||
    /\bxmi\s*:\s*type\s*=\s*"\s*uml\s*:\s*class\b/i.test(text) ||
    /\bpackagedelement\b/i.test(t);
  if (!hasUmlMarker) return false;

  // EA indicator: either EA GUIDs, EA namespace, or the EA extension element.
  const hasEaMarker =
    /\bea_guid\b/i.test(text) ||
    /\beaid[_:]/i.test(text) ||
    /enterprise architect/i.test(text) ||
    /extender\s*=\s*"\s*enterprise architect\s*"/i.test(text) ||
    /<\s*(?:[\w.-]+:)?xmi\s*:\s*extension\b/i.test(text) ||
    /xmlns\s*:\s*ea\s*=/.test(t);

  // Prefer to require *some* EA hint to avoid claiming generic UML XMI from other tools.
  return hasEaMarker;
}

function detectEaXmiUmlFromBytes(bytes: Uint8Array): boolean {
  // Byte-based sniff: decode ASCII-ish chars only.
  let s = '';
  const max = Math.min(bytes.length, 64 * 1024);
  for (let i = 0; i < max; i++) {
    const b = bytes[i]!;
    s += b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : ' ';
  }
  return detectEaXmiUmlFromText(s);
}

/**
 * Sparx Enterprise Architect UML export via XMI.
 *
 * Milestone A skeleton: only sniff + registry. Parsing is implemented in later steps.
 */
export const eaXmiImporter: Importer<IRModel> = {
  id: 'ea-xmi-uml',
  format: 'ea-xmi-uml',
  displayName: 'Sparx EA UML XMI',
  // Below BPMN2, above MEFF.
  priority: 105,
  // Extension fallback is intentionally narrow to avoid claiming generic XML.
  extensions: ['xmi'],
  sniff(ctx: ImportContext) {
    // If explicitly .xmi, assume it is intended to be XMI.
    if (ctx.extension === 'xmi') return true;
    if (detectEaXmiUmlFromText(ctx.sniffText)) return true;
    // Some environments may not provide TextDecoder (sniffText empty) – use a byte-based sniff.
    return detectEaXmiUmlFromBytes(ctx.sniffBytes);
  },
  async import(file, ctx): Promise<ImportResult<IRModel>> {
    void ctx;
    const buf = await readBlobAsArrayBuffer(file);
    const { text } = decodeXmlBytes(new Uint8Array(buf));

    const report = createImportReport('ea-xmi-uml');
    report.source = 'ea-xmi-uml';

    // Parse (lenient) primarily to provide a helpful early error message.
    const { doc, parserError } = parseXmlLenient(text);
    if (parserError) {
      throw new Error(`EA XMI: Failed to parse XML: ${parserError}`);
    }

    // Minimal sanity checks: make sure this looks like UML XMI.
    const rootName = (doc.documentElement?.localName || doc.documentElement?.tagName || '').toLowerCase();
    if (!rootName.includes('xmi')) {
      throw new Error(
        `EA XMI: Expected XMI root element (<xmi:XMI ...>), but found <${doc.documentElement?.tagName ?? 'unknown'}>.`
      );
    }

    // Step 4: packages -> folders (policy compliant)
    const { folders, modelEl } = parseEaXmiPackageHierarchyToFolders(doc, report);

    // Step 5: UML classifiers -> elements (minimal attrs + type mapping)
    const { elements: umlElements } = parseEaXmiClassifiersToElements(doc, report);

    // Step 2 (ArchiMate): profile elements -> elements
    const { elements: archimateElements } = parseEaXmiArchiMateProfileElementsToElements(doc, report);

    // Step 5A (BPMN): profile elements -> elements
    const { elements: bpmnElements } = parseEaXmiBpmnProfileElementsToElements(doc, report);

    // Merge (prefer non-UML over UML when ids collide; keep first occurrence between non-UML kinds)
    const elById = new Map<string, (typeof umlElements)[number]>();
    for (const e of umlElements) elById.set(e.id, e);
    for (const e of archimateElements) {
      const existing = elById.get(e.id);
      if (existing) {
        const existingLooksUml = (existing.type ?? '').toString().startsWith('uml.');
        const incomingLooksUml = (e.type ?? '').toString().startsWith('uml.');
        if (existingLooksUml && !incomingLooksUml) {
          addInfo(report, 'EA XMI: Element id collision between UML and ArchiMate; keeping ArchiMate.', {
            code: 'ea-xmi:element-id-collision',
            context: { elementId: e.id, keptType: e.type, droppedType: existing.type }
          });
          elById.set(e.id, e);
        } else {
          addInfo(report, 'EA XMI: Duplicate element id encountered during merge; kept first occurrence.', {
            code: 'ea-xmi:duplicate-element-id',
            context: { elementId: e.id, keptType: existing.type, droppedType: e.type }
          });
        }
        continue;
      }
      elById.set(e.id, e);
    }

    for (const e of bpmnElements) {
      const existing = elById.get(e.id);
      if (existing) {
        const existingLooksUml = (existing.type ?? '').toString().startsWith('uml.');
        const incomingLooksUml = (e.type ?? '').toString().startsWith('uml.');
        if (existingLooksUml && !incomingLooksUml) {
          addInfo(report, 'EA XMI: Element id collision between UML and BPMN; keeping BPMN.', {
            code: 'ea-xmi:element-id-collision',
            context: { elementId: e.id, keptType: e.type, droppedType: existing.type }
          });
          elById.set(e.id, e);
        } else {
          addInfo(report, 'EA XMI: Duplicate element id encountered during merge; kept first occurrence.', {
            code: 'ea-xmi:duplicate-element-id',
            context: { elementId: e.id, keptType: existing.type, droppedType: e.type }
          });
        }
        continue;
      }
      elById.set(e.id, e);
    }
    const elements = Array.from(elById.values());

    // Step B1a: discover diagrams (views) from EA's XMI extension.
    // We do this early because some export files are "mixed" (contain ArchiMate/BPMN stereotypes alongside UML diagrams).
    // In those cases we must NOT suppress raw UML relationship imports, otherwise UML diagrams lose their connectors.
    const { views: viewsB1a } = parseEaDiagramCatalog(doc, report);

    const hasUmlViews = (viewsB1a ?? []).some((v) => {
      const t = (v.viewpoint ?? v.meta?.eaDiagramType ?? '').toString().trim().toLowerCase();
      if (!t) return false;
      if (t.includes('archimate') || t.includes('bpmn')) return false;
      if (t.includes('uml')) return true;
      // Common UML diagram type labels in EA (best-effort)
      return [
        'class',
        'activity',
        'sequence',
        'use case',
        'usecase',
        'state',
        'component',
        'deployment',
        'package',
        'object',
        'communication',
        'composite',
        'interaction',
        'timing'
      ].some((k) => t.includes(k));
    });

    // Step 1 (ArchiMate): EA connector stereotypes -> relationships (preferred for ArchiMate)
    // Provide element type map so the connector parser can resolve cross-notation edge cases
    // (e.g. ArchiMate_Realisation used between UML elements).
    const elementTypeById: Record<string, string> = {};
    for (const e of elements) {
      if (typeof e?.id === 'string' && typeof (e as any).type === 'string') {
        elementTypeById[e.id] = (e as any).type;
      }
    }
    const { relationships: relsArchimateConnectors } = parseEaXmiArchiMateConnectorRelationships(doc, report, { elementTypeById });

    // Step 1C (UML): EA connector block -> UML relationships (associations, deps, etc.)
    const { relationships: relsUmlConnectors } = parseEaXmiUmlConnectorRelationships(doc, report);

    // Step 3 (ArchiMate): profile relationship tags -> relationships
    const { relationships: relsArchimateProfile } = parseEaXmiArchiMateProfileRelationships(doc, report);


    // Step 5B (BPMN): profile relationship tags -> relationships
    const { relationships: relsBpmn } = parseEaXmiBpmnProfileRelationships(doc, report);

    // Step 6.5: EA <links> blocks (InformationFlow, NoteLink, etc.)
    // These are frequently used by EA to represent connectors in older exports.
    const { relationships: relsUmlLinks } = parseEaXmiLinksRelationships(doc, report);

    // Step 7: UML relationships (generalization/realization/dependency/include/extend)
    const { relationships: relsStep7 } = parseEaXmiRelationships(doc, report);

    // Step 8: associations + end metadata (roles, multiplicity, navigability)
    const { relationships: relsStep8 } = parseEaXmiAssociations(doc, report);

    // Step 2: Merge/override relationship typing using connector stereotypes (single source of truth)
    // EA's <xmi:Extension><connectors> is the most reliable place to read ArchiMate relationship stereotypes.
    // When the file contains ArchiMate/BPMN profile data, we suppress raw UML relationship imports to avoid
    // producing non-notation relationships alongside the pure notation relationships.

    const looksLikeArchiMate =
      relsArchimateConnectors.length > 0 ||
      archimateElements.some((e) => (e.type ?? '').toString().startsWith('archimate.')) ||
      relsArchimateProfile.some((r) => (r.type ?? '').toString().startsWith('archimate.'));

    const looksLikeBpmn =
      relsBpmn.length > 0 ||
      bpmnElements.some((e) => (e.type ?? '').toString().startsWith('bpmn.')) ||
      relsBpmn.some((r) => (r.type ?? '').toString().startsWith('bpmn.'));

    // Only suppress raw UML relationships in *pure* ArchiMate/BPMN exports.
    // If the file contains UML diagrams, keep UML relationships even if some ArchiMate/BPMN stereotypes exist.
    const suppressUmlRelationships = (looksLikeArchiMate || looksLikeBpmn) && !hasUmlViews;

    const relSignature = (r: IRRelationship): string => {
      const name = (r.name ?? '').toString().trim().toLowerCase();
      const type = (r.type ?? '').toString();
      const src = (r.sourceId ?? '').toString();
      const tgt = (r.targetId ?? '').toString();
      return `${src}→${tgt}|${type}|${name}`;
    };

    const connectorIds = new Set<string>(relsArchimateConnectors.map((r) => r.id));
    const connectorSigs = new Set<string>(relsArchimateConnectors.map((r) => relSignature(r as IRRelationship)));

    const relById = new Map<string, IRRelationship>();

    const addRel = (r: IRRelationship, source: string): void => {
      const typeStr = (r.type ?? '').toString();

      // In mixed-notation files (ArchiMate/BPMN present), avoid importing raw UML relationships.
      if (suppressUmlRelationships && typeStr.startsWith('uml.')) {
        return;
      }

      // If this relationship has the same semantic signature as a connector-derived ArchiMate relationship,
      // prefer the connector one even if ids differ.
      const sig = relSignature(r);
      if (source !== 'ea-connector' && connectorSigs.has(sig)) {
        addInfo(report, 'EA XMI: Dropped relationship because an EA connector relationship provides the same ArchiMate semantics.', {
          code: 'ea-xmi:relationship-dropped-duplicate',
          context: { relationshipId: r.id, type: typeStr, source: source }
        });
        return;
      }

      // If a connector-derived relationship exists for the same id, always prefer it.
      if (source !== 'ea-connector' && connectorIds.has(r.id)) {
        addInfo(report, 'EA XMI: Dropped relationship because EA connector stereotypes are the source of truth for ArchiMate.', {
          code: 'ea-xmi:relationship-dropped-source-of-truth',
          context: { relationshipId: r.id, type: typeStr, source: source }
        });
        return;
      }

      const existing = relById.get(r.id);
      if (!existing) {
        relById.set(r.id, r);
        return;
      }

      const existingType = (existing.type ?? '').toString();
      const existingLooksUml = existingType.startsWith('uml.');
      const incomingLooksUml = typeStr.startsWith('uml.');

      // Prefer non-UML over UML on id collisions.
      if (existingLooksUml && !incomingLooksUml) {
        addInfo(report, 'EA XMI: Relationship id collision between UML and another source; kept the non-UML relationship.', {
          code: 'ea-xmi:relationship-id-collision',
          context: { relationshipId: r.id, keptType: typeStr, droppedType: existingType, keptSource: source }
        });
        relById.set(r.id, r);
        return;
      }

      // Otherwise keep first occurrence (order defines precedence).
      addInfo(report, 'EA XMI: Duplicate relationship id encountered during merge; kept first occurrence.', {
        code: 'ea-xmi:duplicate-relationship-id',
        context: { relationshipId: r.id, keptType: existingType, droppedType: typeStr, droppedSource: source }
      });
    };

    // Precedence order:
    // 1) EA connector-derived ArchiMate relationships (source of truth)
    // 2) ArchiMate profile-tag relationships (fallback)
    // 3) BPMN profile-tag relationships
    // 4) UML relationships + associations (only if not suppressing)

    for (const r of relsArchimateConnectors) addRel(r as IRRelationship, 'ea-connector');
    for (const r of relsArchimateProfile) addRel(r as IRRelationship, 'archimate-profile');
    for (const r of relsBpmn) addRel(r as IRRelationship, 'bpmn-profile');

    if (!suppressUmlRelationships) {
      for (const r of relsUmlConnectors) addRel(r as IRRelationship, 'uml-connector');
      for (const r of relsUmlLinks) addRel(r as IRRelationship, 'uml-links');
      for (const r of relsStep7) addRel(r as IRRelationship, 'uml');
      for (const r of relsStep8) addRel(r as IRRelationship, 'uml-association');
    }

    let relationships = Array.from(relById.values());

    // Step B1b: attach diagram objects + geometry as unresolved view nodes.
    const { views: viewsWithNodes } = parseEaDiagramObjects(doc, viewsB1a, report);

    // Step B2b (part 1): parse diagram links/connectors (unresolved endpoints and relationship refs).
    const { views } = parseEaDiagramConnections(doc, viewsWithNodes, report);

    // Step B0 (EA packages): EA often references packages using EAID_* (package2) while the UML package uses EAPK_*.
    // Materialize uml.package elements ONLY when packages are referenced as diagram nodes or relationship endpoints.
    const pkgMaterialized = materializeUmlPackagesFromEaXmi(doc, folders, elements, relationships, views, report);
    const elementsWithPackages = pkgMaterialized.elements;
    relationships = pkgMaterialized.relationships;

    if (folders.length === 0) {
      addWarning(
        report,
        'EA XMI: Parsed 0 UML packages into folders. The file may not be a UML XMI export, or it may use an uncommon structure.',
        { code: 'ea-xmi:no-folders' }
      );
    }

    const packageIdAliases = buildEaPackageIdAliasesJson(doc);

    const modelName = modelEl?.getAttribute('name')?.trim();

    const ir: IRModel = {
      folders,
      elements: elementsWithPackages,
      relationships,
      ...(views.length ? { views } : {}),
      meta: {
        format: 'ea-xmi-uml',
        tool: 'Sparx Enterprise Architect',
        ...(modelName ? { modelName } : {}),
        ...(Object.keys(packageIdAliases).length ? { eaPackageIdAliases: packageIdAliases } : {}),
        importedAtIso: new Date().toISOString(),
        sourceSystem: 'sparx-ea'
      }
    };

    return {
      format: 'ea-xmi-uml',
      importerId: 'ea-xmi-uml',
      ir,
      report
    };
  }
};
