import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App';
import { createElement, createView } from '../domain';
import { modelStore } from '../store';
import * as download from '../store/download';

describe('Step 11 – Reporting and Export', () => {
  beforeEach(() => {
    modelStore.reset();
  });

  it('shows element list report and exports CSV', async () => {
    const user = userEvent.setup();
    const spy = jest.spyOn(download, 'downloadTextFile').mockImplementation(() => {});

    // Prepare state BEFORE rendering to avoid act(...) warnings from external-store updates.
    modelStore.newModel({ name: 'Report Model' });
    modelStore.addElement(createElement({ name: 'Process A', layer: 'Business', type: 'BusinessProcess' }));
    modelStore.addElement(createElement({ name: 'Capability X', layer: 'Strategy', type: 'Capability' }));

    render(<App />);

    await user.click(screen.getByRole('tab', { name: 'Reports' }));
    expect(screen.getByRole('heading', { name: 'Reports' })).toBeInTheDocument();

    // Filter to Business Processes and ensure it shows only one row.
    await user.selectOptions(screen.getByLabelText('Category'), 'BusinessProcess');
    const elementTable = screen.getByRole('table', { name: 'Element report table' });
    expect(within(elementTable).getByRole('cell', { name: 'Process A' })).toBeInTheDocument();
    expect(within(elementTable).queryByRole('cell', { name: 'Capability X' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /export as csv/i }));
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toMatch(/\.csv$/i);
    expect(spy.mock.calls[0][2]).toBe('text/csv');

    spy.mockRestore();
  });

  it('exports the current view as an SVG image', async () => {
    const user = userEvent.setup();
    const spy = jest.spyOn(download, 'downloadTextFile').mockImplementation(() => {});

    // Prepare state BEFORE rendering to avoid act(...) warnings from external-store updates.
    modelStore.newModel({ name: 'Diagram Model' });
    const e1 = createElement({ name: 'Process A', layer: 'Business', type: 'BusinessProcess' });
    const e2 = createElement({ name: 'App X', layer: 'Application', type: 'ApplicationComponent' });
    modelStore.addElement(e1);
    modelStore.addElement(e2);
    const v = createView({ name: 'Main View', viewpointId: 'layered' });
    modelStore.addView(v);
    modelStore.addElementToView(v.id, e1.id);
    modelStore.addElementToView(v.id, e2.id);

    render(<App />);

    // Wait for the diagram canvas to show the created view (effect-driven).
    // NOTE: The Diagram UI currently renders two nodes with aria-label="Diagram canvas":
    // - an outer placeholder wrapper
    // - the actual interactive canvas (.diagramCanvas)
    // Pick the real one to avoid "Found multiple" query errors.
    const canvases = await screen.findAllByLabelText('Diagram canvas');
    const diagramCanvas =
      canvases.find((el) => el.classList.contains('diagramCanvas')) ?? canvases[0];
    expect(within(diagramCanvas).getByText('Main View')).toBeInTheDocument();

    const exportBtn = screen.getByRole('button', { name: /export as image/i });
    expect(exportBtn).toBeEnabled();
    await user.click(exportBtn);
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toMatch(/\.svg$/i);
    expect(spy.mock.calls[0][2]).toBe('image/svg+xml');

    spy.mockRestore();
  });
});
