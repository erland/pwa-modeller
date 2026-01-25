import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PortfolioAnalysisView } from '../PortfolioAnalysisView';
import { createElement, createEmptyModel, createRelationship } from '../../../domain/factories';
import type { Model } from '../../../domain/types';
import { noSelection } from '../../model/selection';
import * as download from '../../../store/download';

const PRESET_KEY = (modelId: string): string => `ea-modeller:analysis:portfolio:presets:${modelId}`;

function buildModelWithCost(): Model {
  const model = createEmptyModel({ name: 't' });

  const a = createElement({
    id: 'A',
    name: 'Alpha',
    type: 'ApplicationComponent',
    layer: 'Application',
    taggedValues: [{ key: 'cost', value: 10 }]
  });
  const b = createElement({
    id: 'B',
    name: 'Beta',
    type: 'ApplicationComponent',
    layer: 'Application',
    taggedValues: [{ key: 'cost', value: 60 }]
  });
  const c = createElement({
    id: 'C',
    name: 'Gamma',
    type: 'ApplicationComponent',
    layer: 'Application'
  });

  model.elements[a.id] = a;
  model.elements[b.id] = b;
  model.elements[c.id] = c;
  return model;
}

function buildModelForSorting(): Model {
  const model = createEmptyModel({ name: 'Sort Model' });

  const bravo = createElement({
    id: 'A',
    name: 'Bravo',
    type: 'BusinessProcess',
    layer: 'Business',
    taggedValues: [{ key: 'cost', value: 30 }]
  });
  const alpha = createElement({
    id: 'B',
    name: 'Alpha',
    type: 'ApplicationComponent',
    layer: 'Application',
    taggedValues: [{ key: 'cost', value: 10 }]
  });
  const charlie = createElement({
    id: 'C',
    name: 'Charlie',
    type: 'ApplicationComponent',
    layer: 'Technology'
  });

  model.elements[bravo.id] = bravo;
  model.elements[alpha.id] = alpha;
  model.elements[charlie.id] = charlie;
  return model;
}

function buildModelForStructuralMetrics(): Model {
  const model = createEmptyModel({ name: 'Structural' });

  const alpha = createElement({ id: 'A', name: 'Alpha', type: 'ApplicationComponent', layer: 'Application' });
  const beta = createElement({ id: 'B', name: 'Beta', type: 'ApplicationComponent', layer: 'Application' });
  const gamma = createElement({ id: 'C', name: 'Gamma', type: 'ApplicationComponent', layer: 'Application' });
  const delta = createElement({ id: 'D', name: 'Delta', type: 'ApplicationComponent', layer: 'Application' });
  const epsilon = createElement({ id: 'E', name: 'Epsilon', type: 'ApplicationComponent', layer: 'Application' });

  model.elements[alpha.id] = alpha;
  model.elements[beta.id] = beta;
  model.elements[gamma.id] = gamma;
  model.elements[delta.id] = delta;
  model.elements[epsilon.id] = epsilon;

  // A -> B, B -> C, B -> D (E is disconnected)
  const r1 = createRelationship({
    id: 'r1',
    kind: 'archimate',
    type: 'Flow',
    sourceElementId: 'A',
    targetElementId: 'B',
    name: ''
  });
  const r2 = createRelationship({
    id: 'r2',
    kind: 'archimate',
    type: 'Flow',
    sourceElementId: 'B',
    targetElementId: 'C',
    name: ''
  });
  const r3 = createRelationship({
    id: 'r3',
    kind: 'archimate',
    type: 'Flow',
    sourceElementId: 'B',
    targetElementId: 'D',
    name: ''
  });
  model.relationships[r1.id] = r1;
  model.relationships[r2.id] = r2;
  model.relationships[r3.id] = r3;

  return model;
}

function buildModelForGrouping(): Model {
  const model = createEmptyModel({ name: 'Grouping' });

  const app1 = createElement({
    id: 'A',
    name: 'Alpha',
    type: 'ApplicationComponent',
    layer: 'Application',
    taggedValues: [{ key: 'cost', value: 10 }]
  });
  const app2 = createElement({
    id: 'B',
    name: 'Beta',
    type: 'ApplicationComponent',
    layer: 'Application',
    taggedValues: [{ key: 'cost', value: 40 }]
  });
  const biz1 = createElement({
    id: 'C',
    name: 'Bravo',
    type: 'BusinessProcess',
    layer: 'Business',
    taggedValues: [{ key: 'cost', value: 30 }]
  });
  const biz2 = createElement({ id: 'D', name: 'Delta', type: 'BusinessProcess', layer: 'Business' });

  model.elements[app1.id] = app1;
  model.elements[app2.id] = app2;
  model.elements[biz1.id] = biz1;
  model.elements[biz2.id] = biz2;
  return model;
}

function tableRowNames(table: HTMLElement): string[] {
  const rows = within(table).getAllByRole('row').slice(1); // skip header
  return rows.map((r) => within(r).getAllByRole('cell')[0].textContent || '');
}

describe('PortfolioAnalysisView primary metric column', () => {
  test('reads numeric property values and applies heat intensity metadata', async () => {
    const user = userEvent.setup();
    const model = buildModelWithCost();
    const onSelectElement = jest.fn();

    render(
      <PortfolioAnalysisView
        model={model}
        modelKind="archimate"
        selection={noSelection}
        onSelectElement={onSelectElement}
      />
    );

    const metricInput = screen.getByLabelText('Primary metric') as HTMLInputElement;
    await user.clear(metricInput);
    await user.type(metricInput, 'cost');

    // Values render (scope to the table to avoid matching legend text).
    const table = screen.getByRole('table', { name: 'Portfolio population table' });
    expect(within(table).getByText('10')).toBeInTheDocument();
    expect(within(table).getByText('60')).toBeInTheDocument();

    // Legend shows the range.
    expect(screen.getByText(/Low \(/)).toHaveTextContent('Low (10)');
    expect(screen.getByText(/High \(/)).toHaveTextContent('High (60)');

    // Heat intensity differs between low and high values.
    const rowAlpha = within(table).getByText('Alpha').closest('tr');
    const rowBeta = within(table).getByText('Beta').closest('tr');
    expect(rowAlpha).toBeTruthy();
    expect(rowBeta).toBeTruthy();

    const alphaMetricCell = within(rowAlpha as HTMLElement).getByText('10');
    const betaMetricCell = within(rowBeta as HTMLElement).getByText('60');

    // Alpha is min -> intensity 0 (attribute missing), Beta is max -> intensity 1 (attribute set).
    expect(alphaMetricCell.getAttribute('data-heat')).toBeNull();
    expect(betaMetricCell.getAttribute('data-heat')).toBe('1.000');

    // Hide missing removes rows without the selected metric.
    const hideMissing = screen.getByLabelText('Hide missing') as HTMLInputElement;
    await user.click(hideMissing);
    expect(screen.queryByText('Gamma')).not.toBeInTheDocument();
  });
});

describe('PortfolioAnalysisView completeness widget', () => {
  test('shows population size and metric completeness when a primary metric is selected', async () => {
    const user = userEvent.setup();
    const model = buildModelWithCost();
    const onSelectElement = jest.fn();

    render(
      <PortfolioAnalysisView
        model={model}
        modelKind="archimate"
        selection={noSelection}
        onSelectElement={onSelectElement}
      />
    );

    // Always shows population.
    expect(screen.getByTestId('portfolio-completeness-total')).toHaveTextContent('3');
    expect(screen.getByText('Choose a primary metric to see completeness.')).toBeInTheDocument();

    // Once a metric is selected, completeness numbers are shown.
    const metricInput = screen.getByLabelText('Primary metric') as HTMLInputElement;
    await user.clear(metricInput);
    await user.type(metricInput, 'cost');

    expect(screen.getByTestId('portfolio-completeness-present')).toHaveTextContent('2');
    expect(screen.getByTestId('portfolio-completeness-missing')).toHaveTextContent('1');
    expect(screen.getByTestId('portfolio-completeness-percent')).toHaveTextContent('67%');
  });
});

describe('PortfolioAnalysisView presets', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('loads presets per model and applies the selected preset', async () => {
    const user = userEvent.setup();
    const model = buildModelForSorting();

    // Seed localStorage with a preset that filters to only "Alpha".
    window.localStorage.setItem(
      PRESET_KEY(model.id),
      JSON.stringify([
        {
          version: 1,
          id: 'p1',
          name: 'Only Alpha',
          createdAt: '2026-01-25T00:00:00.000Z',
          state: { search: 'Alpha' }
        }
      ])
    );

    render(
      <PortfolioAnalysisView
        model={model}
        modelKind="archimate"
        selection={noSelection}
        onSelectElement={jest.fn()}
      />
    );

    const table = screen.getByRole('table', { name: 'Portfolio population table' });
    expect(tableRowNames(table)).toEqual(['Alpha', 'Bravo', 'Charlie']);

    const presetSelect = screen.getByLabelText('Preset') as HTMLSelectElement;
    await user.selectOptions(presetSelect, 'p1');

    expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe('Alpha');
    expect(tableRowNames(table)).toEqual(['Alpha']);
  });
});

describe('PortfolioAnalysisView sorting and CSV export', () => {
  test('sorts by columns and exports the current table order as CSV', async () => {
    const user = userEvent.setup();
    const model = buildModelForSorting();
    const onSelectElement = jest.fn();
    const spy = jest.spyOn(download, 'downloadTextFile').mockImplementation(() => {});

    render(
      <PortfolioAnalysisView
        model={model}
        modelKind="archimate"
        selection={noSelection}
        onSelectElement={onSelectElement}
      />
    );

    const table = screen.getByRole('table', { name: 'Portfolio population table' });

    // Default sort is by name (asc).
    expect(tableRowNames(table)).toEqual(['Alpha', 'Bravo', 'Charlie']);

    // Sort by type (asc), then desc.
    await user.click(within(table).getByRole('button', { name: /^Type/ }));
    expect(tableRowNames(table)).toEqual(['Alpha', 'Charlie', 'Bravo']);
    await user.click(within(table).getByRole('button', { name: /^Type/ }));
    expect(tableRowNames(table)).toEqual(['Bravo', 'Alpha', 'Charlie']);

    // Enable metric and sort by it (desc keeps missing values last).
    const metricInput = screen.getByLabelText('Primary metric') as HTMLInputElement;
    await user.clear(metricInput);
    await user.type(metricInput, 'cost');
    await user.click(within(table).getByRole('button', { name: /^Metric/ })); // metric asc
    await user.click(within(table).getByRole('button', { name: /^Metric/ })); // metric desc
    expect(tableRowNames(table)).toEqual(['Bravo', 'Alpha', 'Charlie']);

    // Export CSV reflects the current sorted rows.
    await user.click(screen.getByRole('button', { name: /export csv/i }));
    expect(spy).toHaveBeenCalled();
    const csv = spy.mock.calls[0][1] as string;
    const lines = csv.split('\n');
    expect(lines[0]).toBe('elementId,name,type,layer,cost');
    expect(lines[1]).toBe('A,Bravo,BusinessProcess,Business,30');
    expect(lines[2]).toBe('B,Alpha,ApplicationComponent,Application,10');
    // Missing metric exports as an empty cell.
    expect(lines[3]).toBe('C,Charlie,ApplicationComponent,Technology,');

    spy.mockRestore();
  });
});

describe('PortfolioAnalysisView structural metrics columns', () => {
  test('shows Degree and Reach(3) columns, supports sorting, and exports those metrics', async () => {
    const user = userEvent.setup();
    const model = buildModelForStructuralMetrics();
    const onSelectElement = jest.fn();
    const spy = jest.spyOn(download, 'downloadTextFile').mockImplementation(() => {});

    render(
      <PortfolioAnalysisView
        model={model}
        modelKind="archimate"
        selection={noSelection}
        onSelectElement={onSelectElement}
      />
    );

    const degreeToggle = screen.getByLabelText('Degree') as HTMLInputElement;
    await user.click(degreeToggle);

    const table = screen.getByRole('table', { name: 'Portfolio population table' });
    const rowBeta = within(table).getByText('Beta').closest('tr') as HTMLElement;
    const rowEpsilon = within(table).getByText('Epsilon').closest('tr') as HTMLElement;
    expect(within(rowBeta).getByText('3')).toBeInTheDocument();
    expect(within(rowEpsilon).getByText('0')).toBeInTheDocument();

    // Sort by Degree desc -> Beta (degree 3) should be first.
    await user.click(within(table).getByRole('button', { name: /^Degree/ })); // asc
    await user.click(within(table).getByRole('button', { name: /^Degree/ })); // desc
    expect(tableRowNames(table)[0]).toBe('Beta');

    // Enable Reach(3) and verify disconnected node has 0 reach.
    const reachToggle = screen.getByLabelText('Reach(3)') as HTMLInputElement;
    await user.click(reachToggle);

    // Row now contains two separate '0' cells (Degree + Reach), so assert by column.
    const headers = within(table).getAllByRole('columnheader');
    const findCol = (re: RegExp): number => {
      const idx = headers.findIndex((h) => {
        const btn = within(h).queryByRole('button');
        const label = (btn ?? h).textContent ?? '';
        return re.test(label.trim());
      });
      expect(idx).toBeGreaterThanOrEqual(0);
      return idx;
    };
    const degreeIdx = findCol(/^Degree/);
    const reachIdx = findCol(/^Reach\(3\)/);
    const epsilonCells = within(rowEpsilon).getAllByRole('cell');
    expect((epsilonCells[degreeIdx].textContent ?? '').trim()).toBe('0');
    expect((epsilonCells[reachIdx].textContent ?? '').trim()).toBe('0');

    // Export includes extra columns when enabled.
    await user.click(screen.getByRole('button', { name: /export csv/i }));
    const csv = spy.mock.calls[0][1] as string;
    const header = csv.split('\n')[0];
    expect(header).toBe('elementId,name,type,layer,metric,degree,reach3');

    spy.mockRestore();
  });
});

describe('PortfolioAnalysisView grouping and rollups', () => {
  test('groups by Type and shows count/sum/avg/missing totals for the primary metric', async () => {
    const user = userEvent.setup();
    const model = buildModelForGrouping();
    const onSelectElement = jest.fn();

    render(
      <PortfolioAnalysisView
        model={model}
        modelKind="archimate"
        selection={noSelection}
        onSelectElement={onSelectElement}
      />
    );

    const metricInput = screen.getByLabelText('Primary metric') as HTMLInputElement;
    await user.clear(metricInput);
    await user.type(metricInput, 'cost');

    const groupBy = screen.getByLabelText('Group by') as HTMLSelectElement;
    await user.selectOptions(groupBy, 'type');

    const appGroup = screen.getByTestId('portfolio-group-type-ApplicationComponent');
    expect(appGroup).toHaveTextContent('ApplicationComponent');
    expect(appGroup).toHaveTextContent('Count: 2');
    expect(appGroup).toHaveTextContent('Sum cost: 50');
    expect(appGroup).toHaveTextContent('Avg: 25');
    expect(appGroup).toHaveTextContent('Missing: 0');

    const bizGroup = screen.getByTestId('portfolio-group-type-BusinessProcess');
    expect(bizGroup).toHaveTextContent('BusinessProcess');
    expect(bizGroup).toHaveTextContent('Count: 2');
    expect(bizGroup).toHaveTextContent('Sum cost: 30');
    expect(bizGroup).toHaveTextContent('Avg: 30');
    expect(bizGroup).toHaveTextContent('Missing: 1');
  });
});
