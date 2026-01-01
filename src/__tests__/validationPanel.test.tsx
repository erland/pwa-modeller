import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App';
import { createElement, createEmptyModel, createRelationship } from '../domain';
import { modelStore } from '../store';

describe('Validation panel (Step 12)', () => {
  beforeEach(() => {
    modelStore.reset();
  });

  it('runs validation and shows issues', async () => {
    const model = createEmptyModel({ name: 'Invalid Model' });
    const rootFolder = Object.values(model.folders).find((f) => f.kind === 'root');
    if (!rootFolder) throw new Error('Missing root folder');

    const actor = createElement({ name: 'Actor', layer: 'Business', type: 'BusinessActor' });
    const service = createElement({ name: 'Service', layer: 'Business', type: 'BusinessService' });

    model.elements[actor.id] = actor;
    model.elements[service.id] = service;
    model.folders[rootFolder.id] = {
      ...rootFolder,
      elementIds: [...rootFolder.elementIds, actor.id, service.id]
    };

    // Invalid direction for Serving (per minimal ruleset): Actor -> Service
    const rel = createRelationship({ type: 'Serving', sourceElementId: actor.id, targetElementId: service.id });
    model.relationships[rel.id] = rel;

    modelStore.loadModel(model);

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('tab', { name: 'Validation' }));
    await user.click(screen.getByRole('button', { name: /validate model/i }));

    expect(await screen.findByRole('table', { name: 'Validation issues' })).toBeInTheDocument();
    expect(screen.getByText(/not allowed/i)).toBeInTheDocument();
  });
});
