import { type PptxPostProcessMeta } from './pptxPostProcessMeta';
import { buildNodeMap } from './nodeMap';
import { resolveEdgeStyle } from './edgeStyle';
import { buildCxnSp } from './builders/connectorBuilder';
import { createEl } from './xmlDom';
import {
  type ConnectorReplaceResult,
  getShapeMarker,
  center,
  readShapeRectEmu,
  cssColorToHex,
} from './attachConnectorsShared';




export function rebuildConnectorsFromMeta(slideXml: string, meta?: PptxPostProcessMeta): ConnectorReplaceResult {
  try {
    const notes: string[] = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(slideXml, 'application/xml');

    const ns = {
      p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
      a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
      r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    };

    // Locate spTree
    const spTree = doc.getElementsByTagNameNS(ns.p, 'spTree')[0];
    if (!spTree) {
      return { xml: slideXml, replacedCount: 0, skippedCount: 0, notes: ['No p:spTree found.'] };
    }

    const children = Array.from(spTree.childNodes).filter((n) => n.nodeType === 1) as Element[];

    // Build node map (markers first, then geometry fallback)
    const { map: nodeIdToShape, notes: nodeMapNotes } = buildNodeMap({
      children,
      nsP: ns.p,
      nsA: ns.a,
      meta,
      getShapeMarker,
      readShapeRectEmu,
    });
    notes.push(...nodeMapNotes);

// Remove existing connectors and any placeholder line shapes (p:sp with prstGeom line) to avoid duplicates
    let removed = 0;
    for (const el of children) {
      if (el.localName === 'cxnSp') {
        spTree.removeChild(el);
        removed++;
      } else if (el.localName === 'sp') {
        const prst = el.getElementsByTagNameNS(ns.a, 'prstGeom')[0]?.getAttribute('prst');
        if (prst === 'line') {
          spTree.removeChild(el);
          removed++;
        }
      }
    }

    const edges = meta?.edges ?? [];
    let replaced = 0;
    let skipped = 0;


    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const fromId = e.fromNodeId;
      const toId = e.toNodeId;
      if (!fromId || !toId) {
        skipped++;
        continue;
      }
      const from = nodeIdToShape.get(fromId);
      const to = nodeIdToShape.get(toId);
      if (!from || !to || from.id === to.id) {
        skipped++;
        continue;
      }

      // Compute connector bbox from node centers
      const aC = center(from.rect);
      const bC = center(to.rect);
      const x = Math.min(aC.x, bC.x);
      const y = Math.min(aC.y, bC.y);
      const minExt = 10000; // ~0.011" in EMU, prevents invisible connectors when nearly horizontal/vertical
      const cx = Math.max(minExt, Math.abs(aC.x - bC.x));
      const cy = Math.max(minExt, Math.abs(aC.y - bC.y));

      // Determine connection indices (0..3) on each shape
      // Connector index selection was used in early prototypes; current PPTX connector routing uses absolute geometry.
      // Style
      const style = resolveEdgeStyle(e, null);
      const pat = style.dash === 'dash' ? 'dashed' : style.dash === 'dot' ? 'dotted' : 'solid';
      let head = style.head;
      let tail = style.tail;
      const rt = String(e.relType ?? '').toLowerCase();
      if (rt.includes('composition') || rt.includes('aggregation')) {
        head = 'diamond';
        tail = 'none';
      }

      const strokeHex = cssColorToHex(e.strokeHex);
      const widthPt = typeof e.strokeWidthPt === 'number' ? e.strokeWidthPt : 1;
      const widthEmu = Math.max(12700, Math.round(widthPt * 12700)); // 1pt ~= 12700 EMU in DrawingML

      // a:ln
      const ln = createEl(doc, ns.a, 'a:ln');
      ln.setAttribute('w', String(widthEmu));

      const solidFill = createEl(doc, ns.a, 'a:solidFill');
      const srgb = createEl(doc, ns.a, 'a:srgbClr'); srgb.setAttribute('val', strokeHex);
      solidFill.appendChild(srgb);
      ln.appendChild(solidFill);

      if (pat === 'dashed') {
        const prstDash = createEl(doc, ns.a, 'a:prstDash'); prstDash.setAttribute('val','dash');
        ln.appendChild(prstDash);
      } else if (pat === 'dotted') {
        const prstDash = createEl(doc, ns.a, 'a:prstDash'); prstDash.setAttribute('val','dot');
        ln.appendChild(prstDash);
      }

      if (head && head !== 'none') {
        const he = createEl(doc, ns.a, 'a:headEnd'); he.setAttribute('type', head);
        if (head === 'diamond') { he.setAttribute('w','med'); he.setAttribute('len','med'); }
        ln.appendChild(he);
      }
      if (tail && tail !== 'none') {
        const te = createEl(doc, ns.a, 'a:tailEnd'); te.setAttribute('type', tail);
        if (tail === 'diamond') { te.setAttribute('w','med'); te.setAttribute('len','med'); }
        ln.appendChild(te);
      }

      const cxnSp = buildCxnSp(doc, { p: ns.p, a: ns.a }, {
        shapeId: 8000 + i,
        name: `EA_CXN:${e.edgeId ?? i}`,
        from: { id: from.id, idx: 0 },
        to: { id: to.id, idx: 0 },
        bbox: { x, y, cx, cy },
        prst: 'straightConnector1',
        includeConnections: false,
        ln,
      });

      spTree.appendChild(cxnSp);
      replaced++;
    }

    notes.push(`Node map: ${nodeIdToShape.size} nodes.`);
    notes.push(`Removed ${removed} existing connector/line shapes.`);
    notes.push(`Built ${replaced} connectors; skipped ${skipped}.`);

    return { xml: new XMLSerializer().serializeToString(doc), replacedCount: replaced, skippedCount: skipped, notes };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { xml: slideXml, replacedCount: 0, skippedCount: 0, notes: [`rebuildConnectorsFromMeta failed: ${msg}`] };
  }
}

