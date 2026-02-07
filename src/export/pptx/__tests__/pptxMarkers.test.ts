import { parseEdgeIdStyleMarker, parseEdgeMarker, parseNodeMarker } from '../pptxMarkers';

describe('pptxMarkers', () => {
  describe('parseNodeMarker', () => {
    it('parses EA_NODE:<id>', () => {
      expect(parseNodeMarker('EA_NODE:abc')).toBe('abc');
    });

    it('trims whitespace', () => {
      expect(parseNodeMarker('EA_NODE:  abc  ')).toBe('abc');
    });

    it('returns null for non-matching strings', () => {
      expect(parseNodeMarker('EA_EDGE:abc->def')).toBeNull();
    });

    it('returns null for empty id', () => {
      expect(parseNodeMarker('EA_NODE:   ')).toBeNull();
    });
  });

  describe('parseEdgeMarker', () => {
    it('parses EA_EDGE:from->to', () => {
      expect(parseEdgeMarker('EA_EDGE:from->to')).toEqual({ from: 'from', to: 'to', relType: undefined });
    });

    it('parses EA_EDGE:from->to|RelType', () => {
      expect(parseEdgeMarker('EA_EDGE:from->to|Serving')).toEqual({ from: 'from', to: 'to', relType: 'Serving' });
    });

    it('returns null if core is malformed', () => {
      expect(parseEdgeMarker('EA_EDGE:from-to')).toBeNull();
      expect(parseEdgeMarker('EA_EDGE:')).toBeNull();
    });
  });

  describe('parseEdgeIdStyleMarker', () => {
    it('parses EA_EDGEID:<id>', () => {
      expect(parseEdgeIdStyleMarker('EA_EDGEID:123')).toEqual({
        edgeId: '123',
        from: undefined,
        to: undefined,
        relType: undefined,
        head: undefined,
        tail: undefined,
        pattern: undefined,
      });
    });

    it('parses id + from/to + relType + style params', () => {
      expect(parseEdgeIdStyleMarker('EA_EDGEID:99|A->B|Serving|h=triangle|t=none|p=dashed')).toEqual({
        edgeId: '99',
        from: 'A',
        to: 'B',
        relType: 'Serving',
        head: 'triangle',
        tail: 'none',
        pattern: 'dashed',
      });
    });

    it('ignores unknown marker-end/pattern values', () => {
      expect(parseEdgeIdStyleMarker('EA_EDGEID:1|A->B|Rel|h=weird|t=oval|p=nope')).toEqual({
        edgeId: '1',
        from: 'A',
        to: 'B',
        relType: 'Rel',
        head: undefined,
        tail: 'oval',
        pattern: undefined,
      });
    });

    it('returns null if missing edgeId', () => {
      expect(parseEdgeIdStyleMarker('EA_EDGEID:')).toBeNull();
      expect(parseEdgeIdStyleMarker('EA_EDGEID:   |A->B')).toBeNull();
    });

    it('returns null for non-matching strings', () => {
      expect(parseEdgeIdStyleMarker('EA_EDGE:1|A->B')).toBeNull();
    });
  });
});
