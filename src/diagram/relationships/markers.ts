import type { MarkerKind } from './style';

export type MarkerDef = {
  kind: Exclude<MarkerKind, 'none'>;
  viewBox: string;
  refX: number;
  refY: number;
  markerWidth: number;
  markerHeight: number;
  pathD: string;
  /** If true, marker is filled, otherwise it's an open stroke shape. */
  isFilled: boolean;
  /** Stroke width for open shapes. */
  strokeWidth?: number;
  strokeLinejoin?: 'round' | 'miter' | 'bevel';
};

export const MARKER_DEFS: MarkerDef[] = [
  {
    kind: 'arrowOpen',
    viewBox: '0 0 10 10',
    refX: 9,
    refY: 5,
    markerWidth: 8,
    markerHeight: 8,
    pathD: 'M 0 0 L 10 5 L 0 10',
    isFilled: false,
    strokeWidth: 1.6,
    strokeLinejoin: 'round',
  },
  {
    kind: 'arrowFilled',
    viewBox: '0 0 10 10',
    refX: 9,
    refY: 5,
    markerWidth: 8,
    markerHeight: 8,
    pathD: 'M 0 0 L 10 5 L 0 10 z',
    isFilled: true,
  },
  {
    kind: 'triangleOpen',
    viewBox: '0 0 10 10',
    refX: 9,
    refY: 5,
    markerWidth: 10,
    markerHeight: 10,
    pathD: 'M 0 0 L 10 5 L 0 10 z',
    isFilled: false,
    strokeWidth: 1.6,
    strokeLinejoin: 'round',
  },
  {
    kind: 'diamondOpen',
    viewBox: '0 0 10 10',
    refX: 0,
    refY: 5,
    markerWidth: 10,
    markerHeight: 10,
    pathD: 'M 0 5 L 5 0 L 10 5 L 5 10 z',
    isFilled: false,
    strokeWidth: 1.6,
    strokeLinejoin: 'round',
  },
  {
    kind: 'diamondFilled',
    viewBox: '0 0 10 10',
    refX: 0,
    refY: 5,
    markerWidth: 10,
    markerHeight: 10,
    pathD: 'M 0 5 L 5 0 L 10 5 L 5 10 z',
    isFilled: true,
  },
];

export function markerId(kind: MarkerKind | undefined, selected: boolean): string | undefined {
  if (!kind || kind === 'none') return undefined;
  return `${kind}${selected ? 'Sel' : ''}`;
}

export function markerUrl(kind: MarkerKind | undefined, selected: boolean): string | undefined {
  const id = markerId(kind, selected);
  return id ? `url(#${id})` : undefined;
}

export function renderSvgMarkerDefs(args: {
  stroke: string;
  strokeSelected?: string;
  includeSelected?: boolean;
}): string {
  const stroke = args.stroke;
  const strokeSelected = args.strokeSelected ?? stroke;
  const includeSelected = Boolean(args.includeSelected);

  const one = (def: MarkerDef, selected: boolean) => {
    const id = markerId(def.kind, selected);
    if (!id) return '';
    const s = selected ? strokeSelected : stroke;
    const path = def.isFilled
      ? `<path d="${def.pathD}" fill="${s}" />`
      : `<path d="${def.pathD}" fill="none" stroke="${s}" stroke-width="${def.strokeWidth ?? 1.6}" stroke-linejoin="${def.strokeLinejoin ?? 'round'}" />`;
    return `<marker id="${id}" viewBox="${def.viewBox}" refX="${def.refX}" refY="${def.refY}" markerWidth="${def.markerWidth}" markerHeight="${def.markerHeight}" orient="auto">${path}</marker>`;
  };

  const parts: string[] = [];
  for (const def of MARKER_DEFS) {
    parts.push(one(def, false));
    if (includeSelected) parts.push(one(def, true));
  }
  return parts.join('\n');
}
