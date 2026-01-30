import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

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

describe('AnalysisWorkspace behavior safety net', () => {
  afterEach(() => {
    cleanup();
    act(() => {
      modelStore.reset();
    });
  });

  test('prefills from selection and auto-targets in paths mode when selection changes', async () => {
    const { model, elA, elB } = buildTestModel();
    const selectionA: Selection = { kind: 'element', elementId: elA.id };

    act(() => {
      modelStore.loadModel(model, 'test.json');
    });

    const ui = render(
      <AnalysisWorkspace
        modelKind="archimate"
        selection={selectionA}
        onSelect={() => {
          /* no-op */
        }}
      />
    );

    // Default mode is "related"; start element should be prefilled.
    await waitFor(() => {
      expect(screen.getByLabelText('Start element')).toHaveValue(
        'App A (ApplicationComponent, Application)'
      );
    });

    // Switch to paths mode; source should be kept in sync with start.
    clickTab(/Connection between two/i);
    expect(screen.getByLabelText('Source')).toHaveValue(
      'App A (ApplicationComponent, Application)'
    );
    expect(screen.getByLabelText('Target')).toHaveValue('');

    // Change selection to B; since source is already set, target should auto-fill.
    ui.rerender(
      <AnalysisWorkspace
        modelKind="archimate"
        selection={{ kind: 'element', elementId: elB.id }}
        onSelect={() => {
          /* no-op */
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Target')).toHaveValue(
        'App B (ApplicationComponent, Application)'
      );
    });
  });

  test('run in paths mode produces a connection paths result for a simple model', async () => {
    const { model, elA, elB } = buildTestModel();
    const selectionA: Selection = { kind: 'element', elementId: elA.id };

    act(() => {
      modelStore.loadModel(model, 'test.json');
    });

    const ui = render(
      <AnalysisWorkspace
        modelKind="archimate"
        selection={selectionA}
        onSelect={() => {
          /* no-op */
        }}
      />
    );

    // Enter paths mode.
    clickTab(/Connection between two/i);

    // Auto-fill target by changing selection to B.
    ui.rerender(
      <AnalysisWorkspace
        modelKind="archimate"
        selection={{ kind: 'element', elementId: elB.id }}
        onSelect={() => {
          /* no-op */
        }}
      />
    );

    // Wait until the query is runnable.
    const runButton = await screen.findByRole('button', { name: /Run analysis/i });
    await waitFor(() => expect(runButton).toBeEnabled());

    // Auto-run should trigger as soon as the query becomes runnable.

    // A simple direct Flow should yield at least one path.
    await waitFor(() => {
      expect(screen.getByRole('table', { name: /Connection paths/i })).toBeInTheDocument();
    });

    // Sanity check: the hint reflects the chosen endpoints.
    expect(screen.getByText(/Connection between “App A/i)).toBeInTheDocument();
    expect(screen.getByText(/and “App B/i)).toBeInTheDocument();
  });

  test('Clear preset resets global filters and resets matrix axes draft', async () => {
    const { model, elA } = buildTestModel();
    const selectionA: Selection = { kind: 'element', elementId: elA.id };

    act(() => {
      modelStore.loadModel(model, 'test.json');
    });

    render(
      <AnalysisWorkspace
        modelKind="archimate"
        selection={selectionA}
        onSelect={() => {
          /* no-op */
        }}
      />
    );

    // Change matrix axes away from defaults.
    clickTab(/^Matrix$/i);
    const rowSourceSelect = screen.getByTitle('How to pick row elements') as HTMLSelectElement;
    const colSourceSelect = screen.getByTitle('How to pick column elements') as HTMLSelectElement;

    fireEvent.change(rowSourceSelect, { target: { value: 'selection' } });
    fireEvent.change(colSourceSelect, { target: { value: 'selection' } });
    expect(rowSourceSelect.value).toBe('selection');
    expect(colSourceSelect.value).toBe('selection');

    // Switch back to a non-matrix mode to access presets.
    clickTab(/Related elements/i);

    // Open filters panel and change direction away from default.
    fireEvent.click(screen.getByText(/Filters & presets/i));
    const directionSelect = screen.getByLabelText('Direction') as HTMLSelectElement;
    fireEvent.change(directionSelect, { target: { value: 'incoming' } });
    expect(directionSelect.value).toBe('incoming');

    // Apply Clear preset.
    const filters = screen.getByLabelText('Analysis filters');
    fireEvent.click(within(filters).getByRole('button', { name: /^Clear$/i }));

    // Direction returns to Both.
    await waitFor(() => expect((screen.getByLabelText('Direction') as HTMLSelectElement).value).toBe('both'));

    // Matrix axes reset back to facet.
    clickTab(/^Matrix$/i);
    expect((screen.getByTitle('How to pick row elements') as HTMLSelectElement).value).toBe('facet');
    expect((screen.getByTitle('How to pick column elements') as HTMLSelectElement).value).toBe('facet');
  });
});
