import { createElement, createEmptyModel, createRelationship } from '../../factories';
import type { Model } from '../../types';
import { buildRelationshipMatrix } from '../relationshipMatrix';

function buildSmallModel(): Model {
  const model = createEmptyModel({ name: 't' });

  const a = createElement({ id: 'A', name: 'A', type: 'BusinessActor', layer: 'Business' });
  const b = createElement({ id: 'B', name: 'B', type: 'ApplicationComponent', layer: 'Application' });
  const c = createElement({ id: 'C', name: 'C', type: 'Node', layer: 'Technology' });
  const d = createElement({ id: 'D', name: 'D', type: 'BusinessRole', layer: 'Business' });

  model.elements[a.id] = a;
  model.elements[b.id] = b;
  model.elements[c.id] = c;
  model.elements[d.id] = d;

  // A -> B -> C
  const r1 = createRelationship({ id: 'R1', type: 'Serving', sourceElementId: a.id, targetElementId: b.id });
  const r2 = createRelationship({ id: 'R2', type: 'Flow', sourceElementId: b.id, targetElementId: c.id });

  // Undirected association between A and D
  const r3 = createRelationship({
    id: 'R3',
    type: 'Association',
    sourceElementId: a.id,
    targetElementId: d.id,
    attrs: { isDirected: false }
  });

  model.relationships[r1.id] = r1;
  model.relationships[r2.id] = r2;
  model.relationships[r3.id] = r3;

  return model;
}

describe('relationship matrix (domain)', () => {
  test('buildRelationshipMatrix counts links row->col and respects undirected relationships', () => {
    const model = buildSmallModel();

    const res = buildRelationshipMatrix(model, ['A', 'B', 'D'], ['B', 'C', 'A'], { direction: 'rowToCol' });

    // Row A -> Col B: R1
    expect(res.cells[0][0]).toEqual({ count: 1, relationshipIds: ['R1'] });
    // Row B -> Col C: R2
    expect(res.cells[1][1]).toEqual({ count: 1, relationshipIds: ['R2'] });
    // Row D -> Col A should include R3 because it is undirected even though stored as A -> D
    expect(res.cells[2][2]).toEqual({ count: 1, relationshipIds: ['R3'] });

    expect(res.rowTotals).toEqual([1, 1, 1]);
    expect(res.colTotals).toEqual([1, 1, 1]);
    expect(res.grandTotal).toBe(3);
  });

  test('relationship type filter limits which relationships are counted', () => {
    const model = buildSmallModel();

    const res = buildRelationshipMatrix(
      model,
      ['A', 'B', 'D'],
      ['B', 'C', 'A'],
      { direction: 'rowToCol', relationshipTypes: ['Serving'] }
    );

    expect(res.grandTotal).toBe(1);
    expect(res.cells[0][0]).toEqual({ count: 1, relationshipIds: ['R1'] });
    expect(res.cells[1][1].count).toBe(0);
    expect(res.cells[2][2].count).toBe(0);
  });

  test('direction colToRow counts links from column set to row set', () => {
    const model = buildSmallModel();

    // R1 is A -> B. With rows=[B] cols=[A] and direction colToRow, it should be counted.
    const res = buildRelationshipMatrix(model, ['B'], ['A'], { direction: 'colToRow' });
    expect(res.cells[0][0]).toEqual({ count: 1, relationshipIds: ['R1'] });
  });

  test('includeSelf controls whether self-relationships are counted', () => {
    const model = buildSmallModel();

    const self = createRelationship({ id: 'R4', type: 'Association', sourceElementId: 'A', targetElementId: 'A' });
    model.relationships[self.id] = self;

    const resExcluded = buildRelationshipMatrix(model, ['A'], ['A'], { direction: 'rowToCol' }, { includeSelf: false });
    expect(resExcluded.cells[0][0].count).toBe(0);

    const resIncluded = buildRelationshipMatrix(model, ['A'], ['A'], { direction: 'rowToCol' }, { includeSelf: true });
    expect(resIncluded.cells[0][0]).toEqual({ count: 1, relationshipIds: ['R4'] });
  });
});
