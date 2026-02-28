import PptxGenJS from 'pptxgenjs';

import { postProcessPptxWithJsZip } from '../postProcessPptxWithJsZip';
import type { PptxPostProcessMeta } from '../pptxPostProcessMeta';

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  // Browser
  if (typeof atob === 'function') {
    const bin = atob(base64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Node/test
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const B: any = (globalThis as any).Buffer;
  if (B?.from) {
    return new Uint8Array(B.from(base64, 'base64'));
  }
  throw new Error('Base64 decode not supported on this platform');
}

// PptxGenJS has multiple output modes depending on platform/bundler.
// Some browser builds throw for 'nodebuffer' ("nodebuffer is not supported by this platform").
async function writePptxBytes(pptx: PptxGenJS): Promise<Uint8Array | ArrayBuffer> {
  try {
    // Works in Node and in some browser bundles.
    return await pptx.write('nodebuffer');
  } catch (e) {
    console.warn('[PPTX] pptx.write("nodebuffer") failed; trying browser fallbacks.', e);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyPptx: any = pptx as any;

  try {
    // Common browser mode.
    const ab = await anyPptx.write('arraybuffer');
    // Some versions return ArrayBuffer, some return Uint8Array.
    return ab instanceof Uint8Array ? ab : (ab as ArrayBuffer);
  } catch (e) {
    console.warn('[PPTX] pptx.write("arraybuffer") failed; trying base64 fallback.', e);
  }

  const b64 = await anyPptx.write('base64');
  if (typeof b64 !== 'string') {
    throw new Error('PPTX write failed: unsupported output type');
  }
  // Some implementations include data URL prefix.
  const clean = b64.startsWith('data:') ? b64.slice(b64.indexOf(',') + 1) : b64;
  return decodeBase64ToUint8Array(clean);
}

export async function writePptxBlob(pptx: PptxGenJS, meta: PptxPostProcessMeta | undefined): Promise<Blob> {
  const raw = await writePptxBytes(pptx);
  const processed = await postProcessPptxWithJsZip(raw, meta);
  const safeProcessed = processed instanceof Uint8Array ? processed : new Uint8Array(processed);

  // Ensure we pass an ArrayBuffer (not SharedArrayBuffer) to Blob for TS/dom compatibility.
  const ab = new ArrayBuffer(safeProcessed.byteLength);
  new Uint8Array(ab).set(safeProcessed);

  return new Blob([ab], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}