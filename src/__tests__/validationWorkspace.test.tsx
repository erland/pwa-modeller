import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App';
import { createRelationship } from '../domain';
import { modelStore } from '../store';

describe('Validation UI', () => {
  beforeEach(() => {
    modelStore.reset();
    jest.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  afterEach(() => {
    (window.confirm as jest.Mock).mockRestore?.();
  });

  it('runs validation and navigates to a relationship issue', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Create a model + two elements via UI to avoid act warnings.
    await user.click(screen.getByRole('button', { name: 'New' }));
    await user.type(screen.getByLabelText('Name'), 'Validation Model');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    const left = screen.getByTestId('left-sidebar');
    const openCreateMenu = async () => {
      const buttons = within(left).getAllByRole('button', { name: 'Create…' });
      await user.click(buttons[0]);
    };
    const createElement = async (opts: { name: string; layer: string; type: string }) => {
      await openCreateMenu();
      await user.click(await screen.findByRole('menuitem', { name: 'Element…' }));
      const dlg = screen.getByRole('dialog', { name: 'Create element' });
      await user.selectOptions(within(dlg).getByLabelText('Layer'), opts.layer);
      await user.selectOptions(within(dlg).getByLabelText('Type'), opts.type);
      await user.type(within(dlg).getByLabelText('Element name'), opts.name);
      await user.click(within(dlg).getByRole('button', { name: 'Create' }));
    };

    await createElement({ name: 'Service', layer: 'Business', type: 'BusinessService' });
    await createElement({ name: 'Actor', layer: 'Business', type: 'BusinessActor' });

    // Inject an invalid relationship (Actor -> Service, Serving) to ensure the validator finds it.
    const current = modelStore.getState().model!;
    const actorId = Object.values(current.elements).find((e) => e.name === 'Actor')!.id;
    const serviceId = Object.values(current.elements).find((e) => e.name === 'Service')!.id;
    const invalidRel = createRelationship({
      type: 'Serving',
      sourceElementId: actorId,
      targetElementId: serviceId
    });

    act(() => {
      modelStore.addRelationship(invalidRel);
    });

    await user.click(screen.getByRole('tab', { name: 'Validation' }));
    await user.click(screen.getByRole('button', { name: 'Validate Model' }));

    expect(await screen.findByText(/must originate from a Service/i)).toBeInTheDocument();

    // Use the first "Go to" action and assert the right panel shows relationship properties.
    await user.click(screen.getByRole('button', { name: /go to/i }));
    expect(screen.getByLabelText('Relationship property type')).toBeInTheDocument();
  });
});
