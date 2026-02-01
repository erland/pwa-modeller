import type { PathsBetweenResult } from '../../../domain/analysis/queries/pathsBetween';
import type { RelatedElementsResult } from '../../../domain/analysis/queries/relatedElements';

// Mock store exports used by the export module.
jest.mock('../../../store', () => {
  const actual = jest.requireActual('../../../store');
  return {
    ...actual,
    downloadTextFile: jest.fn()
  };
});

import { downloadTextFile } from '../../../store';
import { exportPathsCsv, exportRelatedCsv } from './analysisResultExport';

describe('analysisResultExport', () => {
  beforeEach(() => {
    (downloadTextFile as jest.Mock).mockClear();
  });

  describe('exportRelatedCsv', () => {
    it('does not export when there are no hits', () => {
      const related: RelatedElementsResult = { startElementId: 's', hits: [] };

      exportRelatedCsv({
        modelName: 'M',
        relatedResult: related,
        formatters: {
          nodeLabel: (id) => id,
          nodeType: () => 'Type',
          nodeLayer: () => 'Layer'
        }
      });

      expect(downloadTextFile).not.toHaveBeenCalled();
    });

    it('exports a CSV using human-readable formatter functions and CSV escaping', () => {
      const related: RelatedElementsResult = {
        startElementId: 'start',
        hits: [
          { elementId: 'e1', distance: 1 },
          { elementId: 'e2', distance: 2 }
        ]
      };

      exportRelatedCsv({
        modelName: 'My Model',
        relatedResult: related,
        formatters: {
          nodeLabel: (id) => (id === 'start' ? 'Start Node' : id === 'e1' ? 'Name, One' : 'Name "Two"'),
          nodeType: (id) => (id === 'e1' ? 'Application Component' : 'Business Process'),
          nodeLayer: (id) => (id === 'e1' ? 'Application' : 'Business')
        }
      });

      expect(downloadTextFile).toHaveBeenCalledTimes(1);
      const [fileName, contents, mime] = (downloadTextFile as jest.Mock).mock.calls[0];

      expect(String(fileName)).toMatch(/my-model-analysis-related.*\.csv$/i);
      expect(mime).toBe('text/csv');

      const lines = String(contents).split('\n');
      expect(lines[0]).toBe('distance,elementId,name,type,layer');
      expect(lines[1]).toBe('1,e1,"Name, One",Application Component,Application');
      expect(lines[2]).toBe('2,e2,"Name ""Two""",Business Process,Business');
    });
  });

  describe('exportPathsCsv', () => {
    it('does not export when there are no paths', () => {
      const paths: PathsBetweenResult = { sourceElementId: 'a', targetElementId: 'b', paths: [] };

      exportPathsCsv({
        modelName: 'M',
        pathsResult: paths,
        formatters: { nodeLabel: (id) => id, pathTitle: () => '' }
      });

      expect(downloadTextFile).not.toHaveBeenCalled();
    });

    it('exports a step-per-row CSV with deterministic indices', () => {
      const paths: PathsBetweenResult = {
        sourceElementId: 'a',
        targetElementId: 'c',
        paths: [
          {
            elementIds: ['a', 'b', 'c'],
            steps: [
              {
                relationshipId: 'r1',
                relationshipType: 'Serving' as any,
                relationship: undefined,
                fromId: 'a',
                toId: 'b',
                reversed: false
              },
              {
                relationshipId: 'r2',
                relationshipType: 'Assignment' as any,
                relationship: undefined,
                fromId: 'b',
                toId: 'c',
                reversed: false
              }
            ]
          }
        ]
      };

      exportPathsCsv({
        modelName: 'Model',
        pathsResult: paths,
        formatters: {
          nodeLabel: (id) => (id === 'b' ? 'Node, B' : id.toUpperCase()),
          pathTitle: () => ''
        }
      });

      expect(downloadTextFile).toHaveBeenCalledTimes(1);
      const [fileName, contents, mime] = (downloadTextFile as jest.Mock).mock.calls[0];

      expect(String(fileName)).toMatch(/model-analysis-paths\.csv$/i);
      expect(mime).toBe('text/csv');

      const lines = String(contents).split('\n');
      expect(lines[0]).toBe(
        'pathIndex,hopIndex,fromId,fromName,relationshipId,relationshipType,toId,toName'
      );
      expect(lines[1]).toBe('1,1,a,A,r1,Serving,b,"Node, B"');
      expect(lines[2]).toBe('1,2,b,"Node, B",r2,Assignment,c,C');
    });
  });
});
