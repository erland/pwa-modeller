export type CopyPngFromSvgOptions = {
  scale?: number;
  background?: string | null;
};

export function canWriteImageToClipboard(): boolean {
  const anyNav = navigator as unknown as { clipboard?: { write?: unknown } };
  const canWrite = typeof anyNav.clipboard?.write === 'function';
  const hasClipboardItem = 'ClipboardItem' in window;
  return canWrite && hasClipboardItem;
}

function ensureNamespaces(svgText: string): string {
  let s = svgText;
  if (!/\sxmlns=/.test(s)) s = s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  if (!/\sxmlns:xlink=/.test(s)) s = s.replace('<svg', '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  return s;
}

function getSvgSize(svg: SVGSVGElement): { width: number; height: number } {
  const vb = svg.viewBox?.baseVal;
  if (vb && vb.width > 0 && vb.height > 0) return { width: vb.width, height: vb.height };

  const rect = svg.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) return { width: rect.width, height: rect.height };

  try {
    const bb = svg.getBBox();
    if (bb.width > 0 && bb.height > 0) return { width: bb.width, height: bb.height };
  } catch {
    // ignore
  }

  return { width: 800, height: 600 };
}

function svgToDataUrl(svg: SVGSVGElement): string {
  const serialized = ensureNamespaces(new XMLSerializer().serializeToString(svg));
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = dataUrl;
  });
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (!b) reject(new Error('Failed to encode PNG'));
      else resolve(b);
    }, 'image/png');
  });
}

export async function copyPngFromSvgElement(svg: SVGSVGElement, options?: CopyPngFromSvgOptions): Promise<void> {
  if (!canWriteImageToClipboard()) {
    throw new Error('Clipboard image write is not supported in this browser.');
  }

  const scale = typeof options?.scale === 'number' && options.scale > 0 ? options.scale : 2;
  const background = options?.background ?? null;

  const { width, height } = getSvgSize(svg);
  const dataUrl = svgToDataUrl(svg);
  const img = await loadImage(dataUrl);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');

  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await canvasToPngBlob(canvas);
  const item = new ClipboardItem({ 'image/png': blob });
  await navigator.clipboard.write([item]);
}

function parseSvgSizeFromText(svgText: string): { width: number; height: number } {
  try {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (!svg) return { width: 800, height: 600 };

    const vb = svg.getAttribute('viewBox');
    if (vb) {
      const parts = vb.split(/[\s,]+/).map((p) => Number(p));
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
        const w = parts[2];
        const h = parts[3];
        if (w > 0 && h > 0) return { width: w, height: h };
      }
    }

    const wAttr = svg.getAttribute('width');
    const hAttr = svg.getAttribute('height');
    const w = wAttr ? Number(String(wAttr).replace(/[^0-9.]/g, '')) : NaN;
    const h = hAttr ? Number(String(hAttr).replace(/[^0-9.]/g, '')) : NaN;
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { width: w, height: h };
  } catch {
    // ignore
  }

  return { width: 800, height: 600 };
}

function svgTextToDataUrl(svgText: string): string {
  const serialized = ensureNamespaces(svgText);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
}

export async function copyPngFromSvgText(svgText: string, options?: CopyPngFromSvgOptions): Promise<void> {
  if (!canWriteImageToClipboard()) {
    throw new Error('Clipboard image write is not supported in this browser.');
  }

  const scale = typeof options?.scale === 'number' && options.scale > 0 ? options.scale : 2;
  const background = options?.background ?? null;

  const { width, height } = parseSvgSizeFromText(svgText);
  const dataUrl = svgTextToDataUrl(svgText);
  const img = await loadImage(dataUrl);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');

  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await canvasToPngBlob(canvas);
  const item = new ClipboardItem({ 'image/png': blob });
  await navigator.clipboard.write([item]);
}
