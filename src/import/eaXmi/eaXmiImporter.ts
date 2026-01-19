import { createImportReport } from '../importReport';
import { readBlobAsArrayBuffer } from '../framework/blobReaders';
import { decodeXmlBytes } from '../framework/xmlDecoding';
import type { ImportContext, ImportResult, Importer } from '../framework/importer';
import type { IRModel } from '../framework/ir';
import { parseXmlLenient } from '../framework/xml';

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

    // Skeleton only: parsing is implemented in Step 4+.
    throw new Error(
      `EA XMI importer is registered, but semantic parsing isn't implemented yet. ` +
        `Next: implement Step 4 (packages → folders), then Step 5+ (elements/relationships/members).`
    );
  }
};
