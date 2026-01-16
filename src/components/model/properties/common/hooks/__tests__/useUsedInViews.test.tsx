import React from 'react';
import { render, screen } from '@testing-library/react';

import { createElement, createEmptyModel, createView } from '../../../../../../domain/factories';
import type { Model, View } from '../../../../../../domain';

import { useUsedInViews } from '../useUsedInViews';

function Probe(props: { model: Model; elementId: string; hasElement: boolean }) {
  const used = useUsedInViews(props.model, props.elementId, props.hasElement);
  return <pre data-testid="out">{JSON.stringify(used)}</pre>;
}

describe('useUsedInViews', () => {
  test('returns view usage entries with counts and sorts by view name (case-insensitive)', () => {
    const model = createEmptyModel({ name: 'M' });

    const el = createElement({ id: 'e1', name: 'E', layer: 'Business', type: 'BusinessActor' });
    model.elements[el.id] = el;

    const viewA: View = {
      ...createView({ id: 'vA', name: 'a view', viewpointId: 'layered' }),
      layout: {
        nodes: [
          { elementId: el.id, x: 10, y: 10, width: 100, height: 60 },
          { elementId: el.id, x: 200, y: 10, width: 100, height: 60 }
        ],
        relationships: []
      }
    };
    const viewB: View = {
      ...createView({ id: 'vB', name: 'B view', viewpointId: 'layered' }),
      layout: {
        nodes: [{ elementId: el.id, x: 10, y: 10, width: 100, height: 60 }],
        relationships: []
      }
    };
    const viewEmpty: View = {
      ...createView({ id: 'vC', name: 'C view', viewpointId: 'layered' }),
      layout: {
        nodes: [{ elementId: 'other', x: 10, y: 10, width: 100, height: 60 }],
        relationships: []
      }
    };

    model.views[viewA.id] = viewA;
    model.views[viewB.id] = viewB;
    model.views[viewEmpty.id] = viewEmpty;

    render(<Probe model={model} elementId={el.id} hasElement={true} />);
    const out = screen.getByTestId('out').textContent || '[]';
    const used = JSON.parse(out);

    expect(used).toEqual([
      { id: 'vA', name: 'a view', count: 2 },
      { id: 'vB', name: 'B view', count: 1 }
    ]);
  });
});
