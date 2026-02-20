import type { Model, ViewNodeLayout, ArchimateLayer, ElementType, View } from '../../domain';
import { ELEMENT_TYPES_BY_LAYER, getElementTypeLabel, readUmlClassifierMembers } from '../../domain';
import { renderSvgMarkerDefs } from '../../diagram/relationships/markers';
import { readUmlNodeAttrs } from '../../notations/uml/nodeAttrs';
import { formatUmlClassifierMemberLines, readUmlElementStereotype } from '../../notations/uml/formatClassifierText';
import { UML_CLASSIFIER_METRICS, measureUmlClassifierBoxHeights } from '../../notations/uml/measureClassifierText';
import { isUmlClassifierType } from '../../notations/uml/nodeTypes';
import type { Viewport } from './exportSvg.helpers';
import {
  applyLaneOffsetsForExport,
  buildNodeIndex,
  computeRelationshipItems,
  computeViewport,
  escapeXml,
  getOrderedNodes,
  nodeSize,
  renderLinesSvg,
  translateNodes,
} from './exportSvg.helpers';

const ELEMENT_TYPE_TO_LAYER: Partial<Record<ElementType, ArchimateLayer>> = (() => {
  const map: Partial<Record<ElementType, ArchimateLayer>> = {};
  (Object.keys(ELEMENT_TYPES_BY_LAYER) as ArchimateLayer[]).forEach((layer) => {
    for (const t of ELEMENT_TYPES_BY_LAYER[layer] ?? []) map[t] = layer;
  });
  return map;
})();

const LAYER_FILL: Record<ArchimateLayer, string> = {
  Strategy: '#f0d1c0',
  Motivation: '#eadcff',
  Business: '#fff0b3',
  Application: '#d4ebff',
  Technology: '#d8f5df',
  Physical: '#d8f5df',
  ImplementationMigration: '#ffd0e0',
};

type PreparedSvgExport = {
  model: Model;
  view: View;
  padding: number;
  viewport: Viewport;
  nodes: ViewNodeLayout[];
  linesSvg: string;
};

function getViewOrThrow(model: Model, viewId: string): View {
  const view = model.views[viewId];
  if (!view) throw new Error(`View not found: ${viewId}`);
  return view;
}

function isContainerType(typeId: string): boolean {
  return typeId === 'bpmn.pool' || typeId === 'bpmn.lane';
}

function isObjectType(t: unknown): t is 'Note' | 'Label' | 'GroupBox' | 'Divider' {
  return t === 'Note' || t === 'Label' || t === 'GroupBox' || t === 'Divider';
}

function objectText(t: string, obj: { name?: string; text?: string }): string {
  if (t === 'GroupBox') return obj.name?.trim() || 'Group';
  if (t === 'Divider') return '';
  const raw = obj.text?.trim();
  if (raw) return raw;
  return t === 'Label' ? 'Label' : 'Note';
}

function svgTextAnchor(align: unknown): 'start' | 'middle' | 'end' {
  if (align === 'center') return 'middle';
  if (align === 'right') return 'end';
  return 'start';
}

function renderMultilineText(
  x: number,
  y: number,
  text: string,
  opts: { fontSize: number; fontWeight?: number; fill: string; anchor: 'start' | 'middle' | 'end' }
): string {
  const lines = text.split(/\r?\n/);
  const lh = Math.round(opts.fontSize * 1.25);
  return `<text x="${x}" y="${y}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="${opts.fontSize}"${
    opts.fontWeight ? ` font-weight="${opts.fontWeight}"` : ''
  } fill="${opts.fill}" text-anchor="${opts.anchor}">${lines
    .map((ln, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lh}">${escapeXml(ln)}</tspan>`)
    .join('')}</text>`;
}

function splitLines(text?: string): string[] {
  if (!text) return [];
  const normalized = text.replace(/\r\n/g, '\n');
  const trimmedEnd = normalized.replace(/\n+$/, '');
  return trimmedEnd.length ? trimmedEnd.split('\n') : [];
}

function defaultUmlClassifierStereotype(type: string): string | undefined {
  // Keep in sync with notations/uml/renderNodeContent.tsx (defaultStereo logic).
  switch (type) {
    case 'uml.interface':
      return 'interface';
    case 'uml.associationClass':
      return 'AssociationClass';
    case 'uml.datatype':
      return 'datatype';
    case 'uml.primitiveType':
      return 'primitive';
    case 'uml.enum':
      return 'enumeration';
    case 'uml.package':
      return 'package';
    case 'uml.component':
      return 'component';
    case 'uml.artifact':
      return 'artifact';
    case 'uml.node':
      return 'node';
    case 'uml.device':
      return 'device';
    case 'uml.executionEnvironment':
      return 'execution environment';
    case 'uml.subject':
      return 'subject';
    default:
      return undefined;
  }
}

function safeIdFragment(v: string): string {
  return v.replace(/[^a-zA-Z0-9_\-:.]/g, '_');
}

function renderUmlClassifierNodeSvg(args: {
  model: Model;
  view: View;
  node: ViewNodeLayout;
  x: number;
  y: number;
  w: number;
  h: number;
}): string {
  const { model, view, node, x, y, w, h } = args;
  const el = node.elementId ? model.elements[node.elementId] : null;
  if (!el) return '';

  const name = el.name || '(unnamed)';
  const type = el.type;

  const attrs = readUmlNodeAttrs(node);
  const collapsed = attrs.collapsed ?? false;
  const viewAllowsAttributes = view.formatting?.umlUseNodeAttributes ?? true;
  const viewAllowsOperations = view.formatting?.umlUseNodeOperations ?? true;
  const showAttributes = viewAllowsAttributes ? (attrs.showAttributes ?? true) : false;
  const showOperations = viewAllowsOperations ? (attrs.showOperations ?? true) : false;

  const elementStereo = readUmlElementStereotype(el);
  const defaultStereo = elementStereo ?? defaultUmlClassifierStereotype(type);

  const legacyAttrLines = splitLines(attrs.attributesText);
  const legacyOpLines = splitLines(attrs.operationsText);
  const members = readUmlClassifierMembers(el);
  const useLegacyText =
    type === 'uml.datatype' &&
    members.attributes.length === 0 &&
    members.operations.length === 0 &&
    (legacyAttrLines.length > 0 || legacyOpLines.length > 0);

  const { attributes: attributeLines, operations: operationLines } = formatUmlClassifierMemberLines({
    element: el,
    legacyAttributesLines: legacyAttrLines,
    legacyOperationsLines: legacyOpLines,
    useLegacyText,
  });

  const hasStereo = Boolean(defaultStereo && defaultStereo.trim().length);
  const heights = measureUmlClassifierBoxHeights({
    hasStereotype: hasStereo,
    collapsed,
    showAttributes,
    showOperations,
    attributeLines: attributeLines.length,
    operationLines: operationLines.length,
  });

  const m = UML_CLASSIFIER_METRICS;

  const highlight = node.highlighted;
  const stroke = highlight ? '#f59e0b' : '#475569';
  const strokeWidth = 2;

  const clipId = `uml_clip_${safeIdFragment(node.elementId ?? 'node')}`;

  const headerX = x + w / 2;
  const headerTop = y + m.headerPadY;

  const stereoText = hasStereo ? `«${defaultStereo}»` : '';
  const stereoY = headerTop + 11;
  const nameY = headerTop + (hasStereo ? m.stereotypeLineH + m.stereotypeGap : 0) + 13;

  const headerSvg = `
    ${hasStereo ? `<text x="${headerX}" y="${stereoY}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="11" fill="#0f172a" opacity="0.85" text-anchor="middle">${escapeXml(stereoText)}</text>` : ''}
    <text x="${headerX}" y="${nameY}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="13" font-weight="800"${type === 'uml.interface' ? ' font-style="italic"' : ''} fill="#0f172a" text-anchor="middle">${escapeXml(name)}</text>
  `;

  let yCursor = y + heights.headerH;

  function renderSection(lines: string[], sectionH: number): { svg: string; nextY: number } {
    if (sectionH <= 0) return { svg: '', nextY: yCursor };
    const borderY = yCursor;
    const textX = x + m.padX;
    const textY = yCursor + m.sectionPadY + 12;
    const clipRectY = yCursor + m.sectionBorderH;
    const clipRectH = Math.max(0, sectionH - m.sectionBorderH);

    const textLines = lines.length ? lines : [' '];
    const tspans = textLines
      .map((ln, i) => `<tspan x="${textX}" dy="${i === 0 ? 0 : m.sectionLineH}">${escapeXml(ln)}</tspan>`)
      .join('');

    const secClipId = `${clipId}_sec_${Math.round(borderY)}`;

    const sectionSvg = `
      <line x1="${x}" y1="${borderY}" x2="${x + w}" y2="${borderY}" stroke="rgba(0,0,0,0.18)" stroke-width="1" />
      <clipPath id="${secClipId}"><rect x="${x}" y="${clipRectY}" width="${w}" height="${clipRectH}" /></clipPath>
      <g clip-path="url(#${secClipId})">
        <text x="${textX}" y="${textY}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="12" fill="#0f172a" opacity="0.9">${tspans}</text>
      </g>
    `;

    return { svg: sectionSvg, nextY: yCursor + sectionH };
  }

  let sectionsSvg = '';
  if (!collapsed) {
    if (showAttributes) {
      const r = renderSection(attributeLines, heights.attributesH);
      sectionsSvg += r.svg;
      yCursor = r.nextY;
    }
    if (showOperations) {
      const r = renderSection(operationLines, heights.operationsH);
      sectionsSvg += r.svg;
      yCursor = r.nextY;
    }
  }

  return `
    <g>
      <defs>
        <clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${w}" height="${h}" /></clipPath>
      </defs>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff" stroke="${stroke}" stroke-width="${strokeWidth}" />
      <g clip-path="url(#${clipId})">
        ${headerSvg}
        ${sectionsSvg}
      </g>
    </g>
  `;
}

function makeRenderNodeSvg(model: Model, view: View): (n: ViewNodeLayout) => string {
  return (n: ViewNodeLayout): string => {
    const x = n.x;
    const y = n.y;
    const { w, h } = nodeSize(n);

    if (n.connectorId) {
      const c = model.connectors?.[n.connectorId];
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.min(w, h) / 2;
      const symbol = c?.type === 'OrJunction' ? '∨' : '∧';

      return `
        <g>
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" stroke="#475569" stroke-width="2" />
          <text x="${cx}" y="${cy + 4}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="14" font-weight="800" fill="#0f172a" text-anchor="middle">${symbol}</text>
        </g>
      `;
    }

    // View-local objects (note/label/group box/divider).
    if (n.objectId) {
      const obj = view.objects?.[n.objectId];
      if (!obj || !isObjectType(obj.type)) return '';

      const isGroup = obj.type === 'GroupBox';
      const isDivider = obj.type === 'Divider';
      const isDividerVertical = isDivider && h > w;
      const isLabel = obj.type === 'Label';
      const isNote = obj.type === 'Note';

      const stroke = (obj.style?.stroke as string | undefined) ?? (n.highlighted ? '#f59e0b' : 'rgba(0,0,0,0.18)');
      const fill =
        (obj.style?.fill as string | undefined) ??
        (isNote ? 'rgba(255, 255, 200, 0.92)' : isGroup || isLabel || isDivider ? 'transparent' : 'rgba(255,255,255,0.92)');
      const dash = isGroup || isLabel ? ' stroke-dasharray="6 6"' : '';
      const strokeWidth = isGroup ? 2 : isDivider ? 0 : 1;
      const rx = isDivider ? 0 : 12;

      if (isDivider) {
        const lineStroke = (obj.style?.stroke as string | undefined) ?? 'rgba(0,0,0,0.55)';
        const x1 = isDividerVertical ? x + w / 2 : x;
        const y1 = isDividerVertical ? y : y + h / 2;
        const x2 = isDividerVertical ? x + w / 2 : x + w;
        const y2 = isDividerVertical ? y + h : y + h / 2;
        return `<g>
          <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${lineStroke}" stroke-width="2" />
        </g>`;
      }

      const text = objectText(obj.type, obj);
      const textAlign = svgTextAnchor(obj.style?.textAlign);
      const padX = isLabel ? 6 : 10;
      const padY = isLabel ? 14 : isGroup ? 18 : 18;
      const tx = textAlign === 'middle' ? x + w / 2 : textAlign === 'end' ? x + w - padX : x + padX;

      const rect = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash} />`;

      if (isGroup) {
        return `<g>
          ${rect}
          ${renderMultilineText(tx, y + padY, text, { fontSize: 12, fontWeight: 800, fill: 'rgba(0,0,0,0.88)', anchor: textAlign })}
        </g>`;
      }

      if (isLabel) {
        return `<g>
          ${rect}
          ${renderMultilineText(tx, y + padY, text, { fontSize: 13, fill: 'rgba(0,0,0,0.88)', anchor: textAlign })}
        </g>`;
      }

      // Notes and default fallback.
      return `<g>
        ${rect}
        ${renderMultilineText(tx, y + padY, text, { fontSize: 13, fill: 'rgba(0,0,0,0.88)', anchor: textAlign })}
      </g>`;
    }

    const el = n.elementId ? model.elements[n.elementId] : null;
    if (!el) return '';

    // UML: render classifier nodes with compartments (attributes/operations) using shared helpers.
    if (view.kind === 'uml' && isUmlClassifierType(el.type)) {
      return renderUmlClassifierNodeSvg({ model, view, node: n, x, y, w, h });
    }

    const name = el.name || '(unnamed)';
    const type = el.type;
    const typeLabel = getElementTypeLabel(type);

    const layer = (ELEMENT_TYPE_TO_LAYER[type] ?? 'Business') as ArchimateLayer;
    const fill = LAYER_FILL[layer];
    const tag = n.styleTag;
    const highlight = n.highlighted;

    // Use higher-contrast strokes in SVG exports so borders remain visible even when nodes are nested.
    const stroke = highlight ? '#f59e0b' : '#475569';
    const strokeWidth = 2;

    const tagSvg = tag
      ? `<g>
          <rect x="${x + 8}" y="${y + h - 22}" width="${Math.max(28, tag.length * 7)}" height="16" rx="8" fill="#e2e8f0" />
          <text x="${x + 14}" y="${y + h - 10}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="11" fill="#0f172a">${escapeXml(tag)}</text>
        </g>`
      : '';

    return `
      <g>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />
        <text x="${x + 10}" y="${y + 22}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="13" font-weight="700" fill="#0f172a">${escapeXml(name)}</text>
        <text x="${x + 10}" y="${y + 40}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="12" fill="#334155">${escapeXml(typeLabel)}</text>
        ${tagSvg}
      </g>
    `;
  };
}

function prepareSvgExport(model: Model, viewId: string, padding: number): PreparedSvgExport {
  const view = getViewOrThrow(model, viewId);

  const orderedNodes = getOrderedNodes(view.layout?.nodes ?? []);
  const viewport = computeViewport(orderedNodes, padding);

  const nodes = translateNodes(orderedNodes, viewport);
  const nodeByKey = buildNodeIndex(nodes);
  const { relItems, obstaclesById } = computeRelationshipItems({ model, view, nodes, nodeByKey, viewport });
  const lanePointsById = applyLaneOffsetsForExport({ view, relItems, obstaclesById });
  const linesSvg = renderLinesSvg(relItems, lanePointsById);

  return { model, view, padding, viewport, nodes, linesSvg };
}

function partitionNodesForSvg(model: Model, view: View, nodes: ViewNodeLayout[]): { containersSvg: string; nodesSvg: string } {
  const renderNodeSvg = makeRenderNodeSvg(model, view);

  // If we have container nodes (e.g. BPMN pools/lanes), render them *behind* relationships
  // so edges remain visible when drawn inside containers.
  const containerNodes = nodes.filter((n) => {
    if (!n.elementId) return false;
    const el = model.elements[n.elementId];
    return Boolean(el && isContainerType(el.type));
  });

  const groupBoxNodes = nodes.filter((n) => {
    if (!n.objectId) return false;
    const obj = view.objects?.[n.objectId];
    return Boolean(obj && obj.type === 'GroupBox');
  });

  const foregroundNodes = nodes.filter((n) => {
    if (n.connectorId) return true;
    if (!n.elementId) return false;
    const el = model.elements[n.elementId];
    return Boolean(el && !isContainerType(el.type));
  });

  const foregroundObjectNodes = nodes.filter((n) => {
    if (!n.objectId) return false;
    const obj = view.objects?.[n.objectId];
    return Boolean(obj && obj.type !== 'GroupBox');
  });

  const containersSvg = [...containerNodes, ...groupBoxNodes].map(renderNodeSvg).join('');
  const nodesSvg = [...foregroundNodes, ...foregroundObjectNodes].map(renderNodeSvg).join('');

  return { containersSvg, nodesSvg };
}

function renderSvgDocument(prep: PreparedSvgExport, parts: { containersSvg: string; nodesSvg: string }): string {
  const { view, padding, viewport, linesSvg } = prep;
  const { width, height } = viewport;

  // Export uses a neutral light background so diagrams remain readable when
  // embedded in documents regardless of the app's current theme.
  const backgroundFill = '#ffffff';

  const title = escapeXml(view.name);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    ${renderSvgMarkerDefs({ stroke: 'rgba(0,0,0,0.55)' })}
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="${backgroundFill}" />
  <text x="${padding}" y="${padding}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="14" font-weight="700" fill="#0f172a">${title}</text>
  <g transform="translate(0, 12)">
    ${parts.containersSvg}
    ${linesSvg}
    ${parts.nodesSvg}
  </g>
</svg>`;
}

// Relationship routing + styling helpers live in exportSvg.helpers.ts.
export function createViewSvg(model: Model, viewId: string): string {
  const prep = prepareSvgExport(model, viewId, 20);
  const parts = partitionNodesForSvg(prep.model, prep.view, prep.nodes);
  return renderSvgDocument(prep, parts);
}
