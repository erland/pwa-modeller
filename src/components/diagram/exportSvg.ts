import type { Model, ViewNodeLayout } from '../../domain';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

function boundsForNodes(nodes: ViewNodeLayout[]): Bounds {
  if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + (n.width ?? 0));
    maxY = Math.max(maxY, n.y + (n.height ?? 0));
  }
  return { minX, minY, maxX, maxY };
}

export function createViewSvg(model: Model, viewId: string): string {
  const view = model.views[viewId];
  if (!view) throw new Error(`View not found: ${viewId}`);
  const nodes = view.layout?.nodes ?? [];

  const padding = 20;
  const b = boundsForNodes(nodes);

  // Minimum size for empty views.
  const width = Math.max(640, (b.maxX - b.minX) + padding * 2);
  const height = Math.max(420, (b.maxY - b.minY) + padding * 2);
  const offsetX = -b.minX + padding;
  const offsetY = -b.minY + padding;

  const nodeByElement = new Map(nodes.map((n) => [n.elementId, n] as const));

  // Relationships: draw only if both endpoints are present as nodes in this view.
  const relationshipLines: Array<{ x1: number; y1: number; x2: number; y2: number; label: string }> = [];
  for (const rel of Object.values(model.relationships)) {
    const s = nodeByElement.get(rel.sourceElementId);
    const t = nodeByElement.get(rel.targetElementId);
    if (!s || !t) continue;
    const x1 = s.x + s.width / 2 + offsetX;
    const y1 = s.y + s.height / 2 + offsetY;
    const x2 = t.x + t.width / 2 + offsetX;
    const y2 = t.y + t.height / 2 + offsetY;
    relationshipLines.push({ x1, y1, x2, y2, label: rel.type });
  }

  const linesSvg = relationshipLines
    .map((l) => {
      const mx = (l.x1 + l.x2) / 2;
      const my = (l.y1 + l.y2) / 2;
      return [
        `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="#64748b" stroke-width="1.5" />`,
        `<text x="${mx}" y="${my - 4}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="11" fill="#334155" text-anchor="middle">${escapeXml(l.label)}</text>`
      ].join('');
    })
    .join('');

  const nodesSvg = nodes
    .map((n) => {
      const el = model.elements[n.elementId];
      if (!el) return '';
      const x = n.x + offsetX;
      const y = n.y + offsetY;
      const name = el.name || '(unnamed)';
      const type = el.type;
      const tag = n.styleTag;
      const highlight = n.highlighted;

      const tagSvg = tag
        ? `<g>
            <rect x="${x + 8}" y="${y + n.height - 22}" width="${Math.max(28, tag.length * 7)}" height="16" rx="8" fill="#e2e8f0" />
            <text x="${x + 14}" y="${y + n.height - 10}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="11" fill="#0f172a">${escapeXml(tag)}</text>
          </g>`
        : '';

      return `
        <g>
          <rect x="${x}" y="${y}" width="${n.width}" height="${n.height}" rx="10" fill="#ffffff" stroke="${highlight ? '#f59e0b' : '#cbd5e1'}" stroke-width="${highlight ? 2 : 1}" />
          <text x="${x + 10}" y="${y + 22}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="13" font-weight="700" fill="#0f172a">${escapeXml(name)}</text>
          <text x="${x + 10}" y="${y + 40}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="12" fill="#334155">${escapeXml(type)}</text>
          ${tagSvg}
        </g>
      `;
    })
    .join('');

  const title = escapeXml(view.name);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />
  <text x="${padding}" y="${padding}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="14" font-weight="700" fill="#0f172a">${title}</text>
  <g transform="translate(0, 12)">
    ${linesSvg}
    ${nodesSvg}
  </g>
</svg>`;

  return svg;
}
