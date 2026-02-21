import type { ExportArtifact, ExportBundle, ImageRef } from '../../contracts/ExportBundle';

import { svgTextToPngBytes } from '../svgToPngBytes';

function isImageArtifact(a: ExportArtifact): a is { type: 'image'; name: string; data: ImageRef } {
  return a.type === 'image';
}

export function pickImageArtifacts(bundle: ExportBundle): Array<{ type: 'image'; name: string; data: ImageRef }> {
  return bundle.artifacts.filter(isImageArtifact);
}

function bytesToBase64(bytes: Uint8Array): string {
  // Avoid call-stack issues for large arrays.
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function artifactToPngDataUrl(
  art: { type: 'image'; name: string; data: ImageRef }
): Promise<string | undefined> {
  // Ensure we always embed PNG data (even if the artifact is SVG markup).
  if (art.data.kind === 'png') {
    return art.data.data.startsWith('data:') ? art.data.data : `data:image/png;base64,${art.data.data}`;
  }
  if (art.data.kind === 'svg') {
    const pngBytes = await svgTextToPngBytes(art.data.data, { scale: 2, background: '#ffffff' });
    return `data:image/png;base64,${bytesToBase64(pngBytes)}`;
  }
  return undefined;
}
