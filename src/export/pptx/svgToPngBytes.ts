export type SvgToPngOptions = {
  scale?: number;
  background?: string;
};

function ensureSvgHasXmlns(svgText: string): string {
  if (svgText.includes('xmlns=')) return svgText;
  return svgText.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
}

export async function svgTextToPngBytes(svgText: string, opts: SvgToPngOptions = {}): Promise<Uint8Array> {
  const scale = opts.scale ?? 2;
  const bg = opts.background ?? '#ffffff';

  const normalizedSvg = ensureSvgHasXmlns(svgText);
  const svgBlob = new Blob([normalizedSvg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    img.decoding = 'async';
    // Use anonymous to keep canvas untainted (best-effort).
    img.crossOrigin = 'anonymous';

    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load SVG into Image()'));
    });
    img.src = url;
    await loaded;

    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');

    // Background for better Office pasting.
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.drawImage(img, 0, 0, w, h);

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to create PNG blob'))), 'image/png');
    });
    const ab = await blob.arrayBuffer();
    return new Uint8Array(ab);
  } finally {
    URL.revokeObjectURL(url);
  }
}
