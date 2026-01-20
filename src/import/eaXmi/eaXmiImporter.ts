import { createImportReport } from '../importReport';
import { readBlobAsArrayBuffer } from '../framework/blobReaders';
import { decodeXmlBytes } from '../framework/xmlDecoding';
import type { ImportContext, ImportResult, Importer } from '../framework/importer';
import type { IRModel } from '../framework/ir';
import { parseXmlLenient } from '../framework/xml';
import { parseEaXmiPackageHierarchyToFolders } from './parsePackages';
import {
  parseEaXmiArchiMateProfileElementsToElements,
  parseEaXmiBpmnProfileElementsToElements,
  parseEaXmiClassifiersToElements,
} from './parseElements';
import { parseEaXmiArchiMateProfileRelationships, parseEaXmiBpmnProfileRelationships, parseEaXmiRelationships } from './parseRelationships';
import { parseEaXmiAssociations } from './parseAssociations';
import { parseEaDiagramCatalog } from './parseEaDiagramCatalog';
import { parseEaDiagramObjects } from './parseEaDiagramObjects';
import { parseEaDiagramConnections } from './parseEaDiagramConnections';

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
          report.warnings.push(
            `EA XMI: Element id collision "${e.id}" between UML and ArchiMate; keeping ArchiMate.`
          );
          elById.set(e.id, e);
        } else {
          report.warnings.push(
            `EA XMI: Duplicate element id "${e.id}" encountered during merge; keeping first occurrence (type="${existing.type}").`
          );
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
          report.warnings.push(`EA XMI: Element id collision "${e.id}" between UML and BPMN; keeping BPMN.`);
          elById.set(e.id, e);
        } else {
          report.warnings.push(
            `EA XMI: Duplicate element id "${e.id}" encountered during merge; keeping first occurrence (type="${existing.type}").`
          );
        }
        continue;
      }
      elById.set(e.id, e);
    }
    const elements = Array.from(elById.values());

    // Step 3 (ArchiMate): profile relationship tags -> relationships
    const { relationships: relsArchimate } = parseEaXmiArchiMateProfileRelationships(doc, report);

    // Step 5B (BPMN): profile relationship tags -> relationships
    const { relationships: relsBpmn } = parseEaXmiBpmnProfileRelationships(doc, report);

    // Step 7: UML relationships (generalization/realization/dependency/include/extend)
    const { relationships: relsStep7 } = parseEaXmiRelationships(doc, report);

    // Step 8: associations + end metadata (roles, multiplicity, navigability)
    const { relationships: relsStep8 } = parseEaXmiAssociations(doc, report);

    // Merge (prefer ArchiMate over UML when ids collide, otherwise keep first occurrence)
    const relById = new Map<string, (typeof relsStep7)[number]>();
    for (const r of relsStep7) relById.set(r.id, r);
    for (const r of relsArchimate) {
      const existing = relById.get(r.id);
      if (existing) {
        const existingLooksUml = (existing.type ?? '').toString().startsWith('uml.');
        const incomingLooksUml = (r.type ?? '').toString().startsWith('uml.');
        if (existingLooksUml && !incomingLooksUml) {
          report.warnings.push(`EA XMI: Relationship id collision "${r.id}" between UML and ArchiMate; keeping ArchiMate.`);
          relById.set(r.id, r);
        } else {
          report.warnings.push(
            `EA XMI: Duplicate relationship id "${r.id}" encountered during merge; keeping first occurrence (type="${existing.type}").`
          );
        }
        continue;
      }
      relById.set(r.id, r);
    }

    for (const r of relsBpmn) {
      const existing = relById.get(r.id);
      if (existing) {
        const existingLooksUml = (existing.type ?? '').toString().startsWith('uml.');
        const incomingLooksUml = (r.type ?? '').toString().startsWith('uml.');
        if (existingLooksUml && !incomingLooksUml) {
          report.warnings.push(`EA XMI: Relationship id collision "${r.id}" between UML and BPMN; keeping BPMN.`);
          relById.set(r.id, r);
        } else {
          report.warnings.push(
            `EA XMI: Duplicate relationship id "${r.id}" encountered during merge; keeping first occurrence (type="${existing.type}").`
          );
        }
        continue;
      }
      relById.set(r.id, r);
    }

    for (const r of relsStep8) {
      if (relById.has(r.id)) {
        report.warnings.push(
          `EA XMI: Duplicate relationship id "${r.id}" between association and other relationship kinds; keeping first occurrence.`
        );
        continue;
      }
      relById.set(r.id, r);
    }

    const relationships = Array.from(relById.values());

    // Step B1a: discover diagrams (views) from EA's XMI extension.
    const { views: viewsB1a } = parseEaDiagramCatalog(doc, report);

    // Step B1b: attach diagram objects + geometry as unresolved view nodes.
    const { views: viewsWithNodes } = parseEaDiagramObjects(doc, viewsB1a, report);

    // Step B2b (part 1): parse diagram links/connectors (unresolved endpoints and relationship refs).
    const { views } = parseEaDiagramConnections(doc, viewsWithNodes, report);

    if (folders.length === 0) {
      report.warnings.push(
        'EA XMI: Parsed 0 UML packages into folders. The file may not be a UML XMI export, or it may use an uncommon structure.'
      );
    }

    const modelName = modelEl?.getAttribute('name')?.trim();

    const ir: IRModel = {
      folders,
      elements,
      relationships,
      ...(views.length ? { views } : {}),
      meta: {
        format: 'ea-xmi-uml',
        tool: 'Sparx Enterprise Architect',
        ...(modelName ? { modelName } : {}),
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
