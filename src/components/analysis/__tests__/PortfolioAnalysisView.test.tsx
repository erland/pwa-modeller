import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PortfolioAnalysisView } from '../PortfolioAnalysisView';
import { createElement, createEmptyModel } from '../../../domain/factories';
import type { Model } from '../../../domain/types';
import { noSelection } from '../../model/selection';

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
