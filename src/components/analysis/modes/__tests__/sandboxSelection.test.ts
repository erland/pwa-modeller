import { describe, expect, it } from '@jest/globals';

import {
  computeSelectedEdge,
  toggleEdgeSelection,
  updatePairSelectionOnNodeClick,
} from '../sandboxSelection';

describe('sandboxSelection pure helpers', () => {
  describe('updatePairSelectionOnNodeClick', () => {
    it('normal click sets primary selection', () => {
      expect(updatePairSelectionOnNodeClick([], 'A', false)).toEqual(['A']);
      expect(updatePairSelectionOnNodeClick(['B'], 'A', false)).toEqual(['A']);
      expect(updatePairSelectionOnNodeClick(['B', 'C'], 'A', false)).toEqual(['A']);
    });

    it('shift-click builds a stable pair, toggles endpoints, and replaces secondary', () => {
      // first shift click
      expect(updatePairSelectionOnNodeClick([], 'A', true)).toEqual(['A']);
      // add second
      expect(updatePairSelectionOnNodeClick(['A'], 'B', true)).toEqual(['A', 'B']);
      // clicking same as primary removes it and keeps secondary
      expect(updatePairSelectionOnNodeClick(['A', 'B'], 'A', true)).toEqual(['B']);
      // clicking same as secondary removes it and keeps primary
      expect(updatePairSelectionOnNodeClick(['A', 'B'], 'B', true)).toEqual(['A']);
      // replace secondary but keep primary stable
      expect(updatePairSelectionOnNodeClick(['A', 'B'], 'C', true)).toEqual(['A', 'C']);
    });
  });

  describe('toggleEdgeSelection', () => {
    it('toggles selected edge id', () => {
      expect(toggleEdgeSelection(null, 'R1')).toBe('R1');
      expect(toggleEdgeSelection('R1', 'R1')).toBeNull();
      expect(toggleEdgeSelection('R1', 'R2')).toBe('R2');
    });
  });

  describe('computeSelectedEdge', () => {
    it('returns null if relationship endpoints are missing from sandbox nodes', () => {
      const nodeById = new Map<string, any>([['A', { id: 'A' }]]);
      const modelRelationships: Record<string, any> = {
        R1: { id: 'R1', type: 'Serving', sourceElementId: 'A', targetElementId: 'B' },
      };
      expect(computeSelectedEdge('R1', modelRelationships, nodeById)).toBeNull();
    });
  });
});
