import { PptxEmuRect } from '../pptxPostProcessMeta';
import { createEl } from '../xmlDom';

export type PptxNs = { p: string; a: string };

function normalizeHex6(v: string | undefined | null, fallback: string): string {
  if (!v) return fallback;
  const s = String(v).trim();
  const m = s.match(/^#?([0-9a-fA-F]{6})$/);
  if (m) return m[1].toUpperCase();
  const m3 = s.match(/^#?([0-9a-fA-F]{3})$/);
  if (m3) {
    const h = m3[1];
    return (h[0] + h[0] + h[1] + h[1] + h[2] + h[2]).toUpperCase();
  }
  return fallback;
}

/**
 * Build a p:sp node (rounded rectangle) used by rebuildSlideFromMeta.
 * This builder keeps a stable child ordering that is known to work in PowerPoint.
 */
export function buildNodeSp(
  doc: Document,
  ns: PptxNs,
  shapeId: number,
  rectEmu: PptxEmuRect,
  nameLine: string,
  typeLine?: string,
  fillHex?: string,
  strokeHex?: string,
  textHex?: string
): Element {
  const sp = createEl(doc, ns.p, 'p:sp');

  const nvSpPr = createEl(doc, ns.p, 'p:nvSpPr');
  const cNvPr = createEl(doc, ns.p, 'p:cNvPr');
  cNvPr.setAttribute('id', String(shapeId));
  cNvPr.setAttribute('name', `EA_NODE:${shapeId}`);
  const cNvSpPr = createEl(doc, ns.p, 'p:cNvSpPr');
  const nvPr = createEl(doc, ns.p, 'p:nvPr');
  nvSpPr.appendChild(cNvPr);
  nvSpPr.appendChild(cNvSpPr);
  nvSpPr.appendChild(nvPr);

  const spPr = createEl(doc, ns.p, 'p:spPr');
  const xfrm = createEl(doc, ns.a, 'a:xfrm');
  const off = createEl(doc, ns.a, 'a:off');
  off.setAttribute('x', String(Math.round(rectEmu.x)));
  off.setAttribute('y', String(Math.round(rectEmu.y)));
  const ext = createEl(doc, ns.a, 'a:ext');
  ext.setAttribute('cx', String(Math.round(rectEmu.cx)));
  ext.setAttribute('cy', String(Math.round(rectEmu.cy)));
  xfrm.appendChild(off);
  xfrm.appendChild(ext);
  spPr.appendChild(xfrm);

  const prstGeom = createEl(doc, ns.a, 'a:prstGeom');
  prstGeom.setAttribute('prst', 'roundRect');
  prstGeom.appendChild(createEl(doc, ns.a, 'a:avLst'));
  spPr.appendChild(prstGeom);

  const fill = createEl(doc, ns.a, 'a:solidFill');
  const fillClr = createEl(doc, ns.a, 'a:srgbClr');
  fillClr.setAttribute('val', normalizeHex6(fillHex, '9FCFFF'));
  fill.appendChild(fillClr);
  spPr.appendChild(fill);

  const ln = createEl(doc, ns.a, 'a:ln');
  ln.setAttribute('w', '6350');
  const lnFill = createEl(doc, ns.a, 'a:solidFill');
  const lnClr = createEl(doc, ns.a, 'a:srgbClr');
  lnClr.setAttribute('val', normalizeHex6(strokeHex, '111111'));
  lnFill.appendChild(lnClr);
  ln.appendChild(lnFill);
  spPr.appendChild(ln);

  const txBody = createEl(doc, ns.p, 'p:txBody');
  const bodyPr = createEl(doc, ns.a, 'a:bodyPr');
  bodyPr.setAttribute('wrap', 'square');
  bodyPr.setAttribute('lIns', '50800');
  bodyPr.setAttribute('tIns', '50800');
  bodyPr.setAttribute('rIns', '50800');
  bodyPr.setAttribute('bIns', '50800');
  bodyPr.setAttribute('rtlCol', '0');
  bodyPr.setAttribute('anchor', 'ctr');
  txBody.appendChild(bodyPr);
  txBody.appendChild(createEl(doc, ns.a, 'a:lstStyle'));

  const p = createEl(doc, ns.a, 'a:p');

  // line 1
  const pPr1 = createEl(doc, ns.a, 'a:pPr');
  pPr1.setAttribute('algn', 'ctr');
  pPr1.setAttribute('indent', '0');
  pPr1.setAttribute('marL', '0');
  pPr1.appendChild(createEl(doc, ns.a, 'a:buNone'));
  p.appendChild(pPr1);

  const r1 = createEl(doc, ns.a, 'a:r');
  const rPr1 = createEl(doc, ns.a, 'a:rPr');
  rPr1.setAttribute('lang', 'en-US');
  rPr1.setAttribute('sz', '1400');
  rPr1.setAttribute('b', '1');
  rPr1.setAttribute('dirty', '0');
  const rFill1 = createEl(doc, ns.a, 'a:solidFill');
  const rClr1 = createEl(doc, ns.a, 'a:srgbClr');
  rClr1.setAttribute('val', normalizeHex6(textHex, '111111'));
  rFill1.appendChild(rClr1);
  rPr1.appendChild(rFill1);
  const latin1 = createEl(doc, ns.a, 'a:latin');
  latin1.setAttribute('typeface', 'Calibri');
  latin1.setAttribute('pitchFamily', '34');
  latin1.setAttribute('charset', '0');
  rPr1.appendChild(latin1);
  r1.appendChild(rPr1);
  const t1 = createEl(doc, ns.a, 'a:t');
  t1.textContent = (nameLine ?? '').trim() + (typeLine ? '\n' : '');
  r1.appendChild(t1);
  p.appendChild(r1);

  // line 2
  if (typeLine) {
    const pPr2 = createEl(doc, ns.a, 'a:pPr');
    pPr2.setAttribute('algn', 'ctr');
    pPr2.setAttribute('indent', '0');
    pPr2.setAttribute('marL', '0');
    pPr2.appendChild(createEl(doc, ns.a, 'a:buNone'));
    p.appendChild(pPr2);

    const r2 = createEl(doc, ns.a, 'a:r');
    const rPr2 = createEl(doc, ns.a, 'a:rPr');
    rPr2.setAttribute('lang', 'en-US');
    rPr2.setAttribute('sz', '1000');
    rPr2.setAttribute('i', '1');
    rPr2.setAttribute('dirty', '0');
    const rFill2 = createEl(doc, ns.a, 'a:solidFill');
    const rClr2 = createEl(doc, ns.a, 'a:srgbClr');
    rClr2.setAttribute('val', normalizeHex6(textHex, '111111'));
    rFill2.appendChild(rClr2);
    rPr2.appendChild(rFill2);
    const latin2 = createEl(doc, ns.a, 'a:latin');
    latin2.setAttribute('typeface', 'Calibri');
    latin2.setAttribute('pitchFamily', '34');
    latin2.setAttribute('charset', '0');
    rPr2.appendChild(latin2);
    r2.appendChild(rPr2);
    const t2 = createEl(doc, ns.a, 'a:t');
    t2.textContent = String(typeLine).trim();
    r2.appendChild(t2);
    p.appendChild(r2);
  }

  p.appendChild(createEl(doc, ns.a, 'a:endParaRPr'));
  txBody.appendChild(p);

  // Final assembly
  sp.appendChild(nvSpPr);
  sp.appendChild(spPr);
  sp.appendChild(txBody);
  return sp;
}
