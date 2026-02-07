import { inchToEmu, type PptxEmuRect, type PptxPostProcessMeta } from './pptxPostProcessMeta';
import { resolveEdgeStyle } from './edgeStyle';
import { buildCxnSp } from './builders/connectorBuilder';
import { buildNodeSp } from './builders/nodeBuilder';
import { createEl } from './xmlDom';
import { type ConnectorReplaceResult, center, chooseConnIdx } from './attachConnectorsShared';




export function rebuildSlideFromMeta(slideXml: string, meta?: PptxPostProcessMeta): ConnectorReplaceResult {
  try {
    const notes: string[] = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(slideXml, 'application/xml');

    const ns = {
      p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
      a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
    };

    const spTree = doc.getElementsByTagNameNS(ns.p, 'spTree')[0];
    if (!spTree) return { xml: slideXml, replacedCount: 0, skippedCount: 0, notes: ['No p:spTree found.'] };

    const all = Array.from(spTree.childNodes).filter((n) => n.nodeType === 1) as Element[];

    // Keep only the mandatory group props
    for (const el of all) {
      const ln = el.localName;
      if (ln === 'nvGrpSpPr' || ln === 'grpSpPr') continue;
      spTree.removeChild(el);
    }

    const nodes = meta?.nodes ?? [];
    const edges = meta?.edges ?? [];
    notes.push(`Meta: ${nodes.length} nodes, ${edges.length} edges.`);

    // Allocate deterministic shape ids
    let nextId = 4;
    const nodeShapeIdByElementId = new Map<string, number>();
    const nodeRectEmuByElementId = new Map<string, PptxEmuRect>();

    for (const n of nodes) {
      const id = nextId++;
      nodeShapeIdByElementId.set(String(n.elementId), id);

      const r = n.rectIn;
      const rectEmu: PptxEmuRect = { x: inchToEmu(r.x), y: inchToEmu(r.y), cx: inchToEmu(r.w), cy: inchToEmu(r.h) };
      nodeRectEmuByElementId.set(String(n.elementId), rectEmu);

      const sp = buildNodeSp(
        doc,
        { p: ns.p, a: ns.a },
        id,
        rectEmu,
        n.name,
        n.typeLabel,
        n.fillHex,
        n.strokeHex,
        n.textHex
      );

      // Tag element id in marker so future steps can recover
      const cNvPr = sp.getElementsByTagNameNS(ns.p, 'cNvPr')[0];
      if (cNvPr) cNvPr.setAttribute('descr', `EA_NODEID:${String(n.elementId)}`);

      spTree.appendChild(sp);
    }

    // Build connectors after nodes, but insert before first node so they appear behind.
    const firstNodeEl = Array.from(spTree.childNodes).find(
      (n): n is Element => n.nodeType === 1 && (n as Element).localName === 'sp'
    );
    let replaced = 0;
    let skipped = 0;

    const chooseIdx = (from: PptxEmuRect, to: PptxEmuRect) => chooseConnIdx(center(from), center(to));

    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const fromEl = e.fromNodeId;
      const toEl = e.toNodeId;
      if (!fromEl || !toEl) { skipped++; continue; }

      const fromId = nodeShapeIdByElementId.get(String(fromEl));
      const toId = nodeShapeIdByElementId.get(String(toEl));
      const fromRect = nodeRectEmuByElementId.get(String(fromEl));
      const toRect = nodeRectEmuByElementId.get(String(toEl));
      if (!fromId || !toId || !fromRect || !toRect || fromId === toId) { skipped++; continue; }

      const aC = center(fromRect);
      const bC = center(toRect);
      const x = Math.min(aC.x, bC.x);
      const y = Math.min(aC.y, bC.y);
      const minExt = 10000;
      const cx = Math.max(minExt, Math.abs(aC.x - bC.x));
      const cy = Math.max(minExt, Math.abs(aC.y - bC.y));

      const stIdx = chooseIdx(fromRect, toRect);
      const enIdx = chooseIdx(toRect, fromRect);

      const style = resolveEdgeStyle(e, null);
      const pat = style.dash === 'dash' ? 'dashed' : style.dash === 'dot' ? 'dotted' : 'solid';
      const head = style.head;
      const tail = style.tail;
      const strokeHex = normalizeHex6(e.strokeHex, '111111');
      const widthPt = typeof e.strokeWidthPt === 'number' ? e.strokeWidthPt : 1;
      const widthEmu = Math.max(12700, Math.round(widthPt * 12700));

      // Build connector with strict child ordering

      const ln = createEl(doc, ns.a, 'a:ln');
      ln.setAttribute('w', String(widthEmu));
      const solidFill = createEl(doc, ns.a, 'a:solidFill');
      const clr = createEl(doc, ns.a, 'a:srgbClr'); clr.setAttribute('val', strokeHex);
      solidFill.appendChild(clr);
      ln.appendChild(solidFill);
      if (pat === 'dashed') { const d = createEl(doc, ns.a, 'a:prstDash'); d.setAttribute('val','dash'); ln.appendChild(d); }
      else if (pat === 'dotted') { const d = createEl(doc, ns.a, 'a:prstDash'); d.setAttribute('val','dot'); ln.appendChild(d); }

      if (head && head !== 'none') { const he = createEl(doc, ns.a, 'a:headEnd'); he.setAttribute('type', head); if (head==='diamond'){he.setAttribute('w','med'); he.setAttribute('len','med');} ln.appendChild(he); }
      if (tail && tail !== 'none') { const te = createEl(doc, ns.a, 'a:tailEnd'); te.setAttribute('type', tail); if (tail==='diamond'){te.setAttribute('w','med'); te.setAttribute('len','med');} ln.appendChild(te); }

      const cxnSp = buildCxnSp(doc, { p: ns.p, a: ns.a }, {
        shapeId: 8000 + i,
        name: `EA_CXN:${String(e.edgeId ?? i)}`,
        from: { id: fromId, idx: stIdx },
        to: { id: toId, idx: enIdx },
        bbox: { x, y, cx, cy },
        prst: 'straightConnector1',
        locksAttrs: { noGrp: '1' },
        ln,
      });
      
      if (firstNodeEl) spTree.insertBefore(cxnSp, firstNodeEl);
      else spTree.appendChild(cxnSp);
      replaced++;
    }

    notes.push(`Built ${replaced} connectors; skipped ${skipped}.`);

    return { xml: new XMLSerializer().serializeToString(doc), replacedCount: replaced, skippedCount: skipped, notes };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { xml: slideXml, replacedCount: 0, skippedCount: 0, notes: [`rebuildSlideFromMeta failed: ${msg}`] };
  }
}


function normalizeHex6(v: string | undefined | null, fallback: string): string {
  const s = (v ?? '').trim();
  const m = s.match(/^[0-9a-fA-F]{6}$/);
  return m ? s.toUpperCase() : fallback;
}
