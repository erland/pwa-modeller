import { getAnalysisAdapter } from '../../../analysis/adapters/registry';
import { createElement, createEmptyModel } from '../../factories';
import type { Model } from '../../types';
import { buildPortfolioPopulation } from '../index';

function buildSmallModel(): Model {
  const model = createEmptyModel({ name: 't' });

  const a = createElement({ id: 'A', name: 'Alice', type: 'BusinessActor', layer: 'Business' });
  const b = createElement({ id: 'B', name: 'Billing', type: 'ApplicationComponent', layer: 'Application' });
  const c = createElement({ id: 'C', name: 'Compute', type: 'Node', layer: 'Technology' });
  const d = createElement({ id: 'D', name: 'Role: Clerk', type: 'BusinessRole', layer: 'Business' });

  model.elements[a.id] = a;
  model.elements[b.id] = b;
  model.elements[c.id] = c;
  model.elements[d.id] = d;

  return model;
}

describe('portfolio population builder', () => {
  test('returns all rows (sorted) with type/layer labels when no filters are set', () => {
    const model = buildSmallModel();
    const adapter = getAnalysisAdapter('archimate');

    const rows = buildPortfolioPopulation({ model, adapter });

    expect(rows.map((r) => r.elementId)).toEqual(['A', 'B', 'C', 'D']);
    expect(rows.find((r) => r.elementId === 'B')?.typeLabel).toBe('ApplicationComponent');
    expect(rows.find((r) => r.elementId === 'B')?.layerLabel).toBe('Application');
  });

  test('filters by layer, type, and search', () => {
    const model = buildSmallModel();
    const adapter = getAnalysisAdapter('archimate');

    const byLayer = buildPortfolioPopulation({ model, adapter, filter: { layers: ['Business'] } });
    expect(byLayer.map((r) => r.elementId).sort()).toEqual(['A', 'D']);

    const byType = buildPortfolioPopulation({ model, adapter, filter: { types: ['ApplicationComponent'] } });
    expect(byType.map((r) => r.elementId)).toEqual(['B']);

    const bySearch = buildPortfolioPopulation({ model, adapter, filter: { search: 'clerk' } });
    expect(bySearch.map((r) => r.elementId)).toEqual(['D']);
  });
});
