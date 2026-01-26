import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { AnalysisWorkspace } from '../AnalysisWorkspace';
import { modelStore } from '../../../store/modelStore';
import { createEmptyModel, createElement, createRelationship } from '../../../domain';
import type { Selection } from '../../model/selection';

function buildTestModel() {
  const model = createEmptyModel(
    { name: 'Test model', description: '', version: '', owner: '' },
    'model-test'
  );

  const elA = createElement({
    kind: 'archimate',
    name: 'App A',
    layer: 'Application',
    type: 'ApplicationComponent'
  });

  const elB = createElement({
    kind: 'archimate',
    name: 'App B',
    layer: 'Application',
    type: 'ApplicationComponent'
  });

  model.elements[elA.id] = elA;
  model.elements[elB.id] = elB;

  const rel = createRelationship({
    kind: 'archimate',
    type: 'Flow',
    sourceElementId: elA.id,
    targetElementId: elB.id
  });

  model.relationships[rel.id] = rel;

  // Put elements in root folder so pickers/tree UIs have something to show.
  const rootId = Object.keys(model.folders)[0];
  const root = model.folders[rootId];
  model.folders[rootId] = { ...root, elementIds: [elA.id, elB.id] };

  return { model, elA, elB };
}

function clickTab(name: RegExp): void {
  fireEvent.click(screen.getByRole('tab', { name }));
}

describe('Analysis workspace UI consistency', () => {
  let selection: Selection;

  beforeEach(() => {
    const { model, elA } = buildTestModel();
    selection = { kind: 'element', elementId: elA.id };
    act(() => {
      modelStore.loadModel(model, 'test.json');
    });
  });

  afterEach(() => {
    cleanup();
    act(() => {
      modelStore.reset();
    });
  });

  test('tabs render a consistent Query/Results layout', () => {
    render(
      <AnalysisWorkspace
        modelKind="archimate"
        selection={selection}
        onSelect={() => {
          /* no-op */
        }}
      />
    );

    // Related elements (default)
    expect(screen.getByText('Query')).toBeInTheDocument();
    expect(screen.getByText('Results')).toBeInTheDocument();

    // Connection between two
    clickTab(/Connection between two/i);
    expect(screen.getByText('Query')).toBeInTheDocument();
    expect(screen.getByText('Results')).toBeInTheDocument();

    // Traceability explorer
    clickTab(/Traceability explorer/i);
    expect(screen.getByText('Query')).toBeInTheDocument();
    expect(screen.getByText('Results')).toBeInTheDocument();
    // Avoid ambiguous text match (tab label + section title). Assert via role instead.
    expect(screen.getByRole('tab', { name: /Traceability explorer/i })).toBeInTheDocument();

    // Matrix: build once so Results appear
    clickTab(/^Matrix$/i);
    expect(screen.getByText('Query')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Build matrix/i }));
    expect(screen.getByText('Results')).toBeInTheDocument();

    // Portfolio
    clickTab(/^Portfolio$/i);
    expect(screen.getByText('Query')).toBeInTheDocument();
    expect(screen.getByText('Results')).toBeInTheDocument();
  });
});
