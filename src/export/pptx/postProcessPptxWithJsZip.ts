import JSZip from 'jszip';
import { buildNodeMapFromSlideXml } from './parseSlideNodeMap';
import type { PptxPostProcessMeta } from './pptxPostProcessMeta';
import { replaceAllLineShapesWithConnectors } from './attachConnectors';

export type PptxBytes = Uint8Array | ArrayBuffer;

function warn(msg: string, err?: unknown): void {
  // eslint-disable-next-line no-console
  console.warn(`[PPTX post-process] ${msg}`, err);
}

function toUint8Array(input: PptxBytes): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

/**
 * Step 4 — PPTX post-process step (infrastructure).
 *
 * This is intentionally a conservative no-op transform: it unzips the PPTX, reads slide XML,
 * and re-zips it back. The connector attachment will be implemented in the next step(s).
 */
export async function postProcessPptxWithJsZip(input: PptxBytes, meta?: PptxPostProcessMeta): Promise<Uint8Array> {
  const bytes = toUint8Array(input);
  try {
    const zip = await JSZip.loadAsync(bytes);

  // Touch slide XML to validate that we can read and write the package.
const slidePath = 'ppt/slides/slide1.xml';
const slide = zip.file(slidePath);
if (slide) {
  const xml = await slide.async('string');

  // Step 5: Parse slide XML and build a node map (EA_NODE:<id> -> shape id + bounds).
  // This also acts as a sanity check that our marker strategy survived PptxGenJS serialization.
  try {
    const _nodeMap = buildNodeMapFromSlideXml(xml);
    void _nodeMap;
  } catch (e) {
    warn('Node-map parse failed; keeping original slide XML.', e);
  }

  // Step 6: Replace placeholder edge lines with real connectors (p:cxnSp).
  // Step 7: Verification + fallback behavior:
  // - If connector transform fails, keep the original XML (plain lines remain).
  // - If connector transform succeeds but results in empty/invalid XML, fall back.
  try {
    const replaced = replaceAllLineShapesWithConnectors(xml, meta);
    if (replaced && typeof replaced.xml === 'string' && replaced.xml.length > 200) {
      zip.file(slidePath, replaced.xml);
    } else {
      warn('Connector transform returned unexpected output; keeping original slide XML.');
      zip.file(slidePath, xml);
    }
  } catch (e) {
    warn('Connector transform failed; keeping original slide XML.', e);
    zip.file(slidePath, xml);
  }
}


  // Repack
  const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    return out;
  } catch (e) {
    warn('Post-process failed; returning original PPTX bytes.', e);
    return bytes;
  }
}
