import { PptxEmuRect } from '../pptxPostProcessMeta';
import { createEl } from '../xmlDom';

export type PptxNs = { p: string; a: string };

export type ConnectorBuildArgs = {
  shapeId: number;
  name: string;
  from: { id: number; idx: number };
  to: { id: number; idx: number };
  bbox: PptxEmuRect;
  /** prstGeom @prst value. Defaults to 'line'. */
  prst?: string;
  /**
   * Whether to include a:cxnSpLocks, a:stCxn and a:endCxn.
   * Some legacy slides rely only on straightConnector geometry without these.
   */
  includeConnections?: boolean;
  /** Optional attributes to set on <a:cxnSpLocks> when connections are included. */
  locksAttrs?: Record<string, string>;
  /** Optional <a:ln> element (already styled). Will be appended after prstGeom. */
  ln?: Element | null;
};

function addCxnSpLocks(doc: Document, nsA: string, cNvCxnSpPr: Element, attrs?: Record<string, string>): void {
  const locks = createEl(doc, nsA, 'a:cxnSpLocks');
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      locks.setAttribute(k, v);
    }
  }
  cNvCxnSpPr.appendChild(locks);
}

function ensureAvLst(doc: Document, nsA: string): Element {
  return createEl(doc, nsA, 'a:avLst');
}

/**
 * Build a p:cxnSp connector with child order tuned for PowerPoint.
 * Order:
 * - p:nvCxnSpPr (with p:cNvPr, p:cNvCxnSpPr [locks+stCxn+endCxn], p:nvPr)
 * - p:spPr (with a:xfrm, a:prstGeom, optional a:ln)
 */
export function buildCxnSp(doc: Document, ns: PptxNs, args: ConnectorBuildArgs): Element {
  const cxnSp = createEl(doc, ns.p, 'p:cxnSp');

  const includeConnections = args.includeConnections !== false;

  // nv
  const nv = createEl(doc, ns.p, 'p:nvCxnSpPr');
  const cNvPr = createEl(doc, ns.p, 'p:cNvPr');
  cNvPr.setAttribute('id', String(args.shapeId));
  cNvPr.setAttribute('name', args.name);
  const cNvCxnSpPr = createEl(doc, ns.p, 'p:cNvCxnSpPr');
  if (includeConnections) {
    addCxnSpLocks(doc, ns.a, cNvCxnSpPr, args.locksAttrs);

    const st = createEl(doc, ns.a, 'a:stCxn');
    st.setAttribute('id', String(args.from.id));
    st.setAttribute('idx', String(args.from.idx));

    const en = createEl(doc, ns.a, 'a:endCxn');
    en.setAttribute('id', String(args.to.id));
    en.setAttribute('idx', String(args.to.idx));

    cNvCxnSpPr.appendChild(st);
    cNvCxnSpPr.appendChild(en);
  }

  const nvPr = createEl(doc, ns.p, 'p:nvPr');
  nv.appendChild(cNvPr);
  nv.appendChild(cNvCxnSpPr);
  nv.appendChild(nvPr);

  // spPr
  const spPr = createEl(doc, ns.p, 'p:spPr');

  const xfrm = createEl(doc, ns.a, 'a:xfrm');
  const off = createEl(doc, ns.a, 'a:off');
  off.setAttribute('x', String(Math.round(args.bbox.x)));
  off.setAttribute('y', String(Math.round(args.bbox.y)));
  const ext = createEl(doc, ns.a, 'a:ext');
  ext.setAttribute('cx', String(Math.round(args.bbox.cx)));
  ext.setAttribute('cy', String(Math.round(args.bbox.cy)));
  xfrm.appendChild(off);
  xfrm.appendChild(ext);

  const geom = createEl(doc, ns.a, 'a:prstGeom');
  geom.setAttribute('prst', args.prst ?? 'line');
  geom.appendChild(ensureAvLst(doc, ns.a));

  // Child order in p:spPr is important for PowerPoint.
  spPr.appendChild(xfrm);
  spPr.appendChild(geom);
  if (args.ln) spPr.appendChild(args.ln);

  cxnSp.appendChild(nv);
  cxnSp.appendChild(spPr);
  return cxnSp;
}
