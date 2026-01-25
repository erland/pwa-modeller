import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PortfolioAnalysisView } from '../PortfolioAnalysisView';
import { createElement, createEmptyModel } from '../../../domain/factories';
import type { Model } from '../../../domain/types';
import { noSelection } from '../../model/selection';
import * as download from '../../../store/download';

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
