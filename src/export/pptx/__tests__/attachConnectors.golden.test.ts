import * as fs from 'node:fs';
import * as path from 'node:path';

import { rebuildConnectorsFromMeta, replaceAllLineShapesWithConnectors } from '../attachConnectors';
import { PptxPostProcessMeta } from '../pptxPostProcessMeta';

function readFixture(name: string): string {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

function normalizeXml(xml: string): string {
  // Make snapshots resilient to indentation / newlines.
  return xml.replace(/>\s+</g, '><').trim();
}

function countByLocalName(xml: string, localName: string): number {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  // namespace agnostic: rely on localName
  return Array.from(doc.getElementsByTagName('*')).filter((n) => (n as Element).localName === localName).length;
}

describe('pptx.attachConnectors golden output', () => {
  it('replaceAllLineShapesWithConnectors: replaces placeholder line shapes using markers', () => {
    const slideXml = readFixture('slide_with_markers.xml');

    const res = replaceAllLineShapesWithConnectors(slideXml, undefined);

    expect(res.replacedCount).toBe(1);
    expect(res.skippedCount).toBe(0);
    expect(countByLocalName(res.xml, 'cxnSp')).toBe(1);
    expect(countByLocalName(res.xml, 'sp')).toBe(2); // original line p:sp removed, 2 node shapes remain

    expect(normalizeXml(res.xml)).toMatchSnapshot();
  });

  it('rebuildConnectorsFromMeta: builds connectors from meta using EA_NODE markers', () => {
    const slideXml = readFixture('slide_with_markers.xml');
    const meta: PptxPostProcessMeta = {
      nodes: [
        {
          elementId: 'N1',
          name: 'Node 1',
          rectIn: { x: 1, y: 1, w: 2, h: 1 },
        },
        {
          elementId: 'N2',
          name: 'Node 2',
          rectIn: { x: 4, y: 1, w: 2, h: 1 },
        },
      ],
      edges: [
        {
          edgeId: 'E1',
          fromNodeId: 'N1',
          toNodeId: 'N2',
          linePattern: 'dashed',
          pptxHeadEnd: 'arrow',
          pptxTailEnd: 'none',
          x1In: 0,
          y1In: 0,
          x2In: 0,
          y2In: 0,
          rectIn: { x: 2, y: 1.5, w: 2, h: 0 },
        },
      ],
    };

    const res = rebuildConnectorsFromMeta(slideXml, meta);
    expect(res.replacedCount).toBe(1);
    expect(res.skippedCount).toBe(0);
    expect(countByLocalName(res.xml, 'cxnSp')).toBe(1);

    expect(normalizeXml(res.xml)).toMatchSnapshot();
  });

  it('rebuildConnectorsFromMeta: falls back to geometry matching when EA_NODE markers are missing', () => {
    const slideXml = readFixture('slide_no_markers.xml');
    const meta: PptxPostProcessMeta = {
      nodes: [
        {
          elementId: 'N1',
          name: 'Node 1',
          rectIn: { x: 1, y: 1, w: 2, h: 1 },
        },
        {
          elementId: 'N2',
          name: 'Node 2',
          rectIn: { x: 4, y: 1, w: 2, h: 1 },
        },
      ],
      edges: [
        {
          edgeId: 'E1',
          fromNodeId: 'N1',
          toNodeId: 'N2',
          linePattern: 'solid',
          pptxHeadEnd: 'none',
          pptxTailEnd: 'none',
          x1In: 0,
          y1In: 0,
          x2In: 0,
          y2In: 0,
          rectIn: { x: 2, y: 1.5, w: 2, h: 0 },
        },
      ],
    };

    const res = rebuildConnectorsFromMeta(slideXml, meta);

    expect(res.replacedCount).toBe(1);
    expect(res.skippedCount).toBe(0);
    expect(res.notes.join('\n')).toContain('Fallback node map via geometry');
    expect(countByLocalName(res.xml, 'cxnSp')).toBe(1);
    expect(countByLocalName(res.xml, 'sp')).toBe(2);

    expect(normalizeXml(res.xml)).toMatchSnapshot();
  });
});
