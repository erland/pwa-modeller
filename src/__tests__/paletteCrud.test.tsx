import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App';
import { modelStore } from '../store';

describe('Palette CRUD', () => {
  beforeEach(() => {
    modelStore.reset();
    jest.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  afterEach(() => {
    (window.confirm as jest.Mock).mockRestore?.();
  });

  it('can create elements and relationships from the palette and edit properties', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Create a new model.
    await user.click(screen.getByRole('button', { name: 'New' }));
    await user.type(screen.getByLabelText('Name'), 'Palette Model');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    // Create element A (via dialog).
    await user.click(screen.getByRole('tab', { name: 'Elements' }));
    await user.click(screen.getByRole('button', { name: 'Create Element' }));
    const createElA = screen.getByRole('dialog', { name: 'Create element' });
    await user.type(within(createElA).getByLabelText('Name'), 'A');
    await user.selectOptions(within(createElA).getByLabelText('Layer'), 'Business');
    await user.selectOptions(within(createElA).getByLabelText('Element type'), 'BusinessActor');
    await user.click(within(createElA).getByRole('button', { name: 'Create' }));

    // Create element B.
    await user.click(screen.getByRole('button', { name: 'Create Element' }));
    const createElB = screen.getByRole('dialog', { name: 'Create element' });
    await user.type(within(createElB).getByLabelText('Name'), 'B');
    await user.selectOptions(within(createElB).getByLabelText('Layer'), 'Business');
    await user.selectOptions(within(createElB).getByLabelText('Element type'), 'BusinessService');
    await user.click(within(createElB).getByRole('button', { name: 'Create' }));

    // Create relationship A -> B (via dialog).
    await user.click(screen.getByRole('tab', { name: 'Relationships' }));
    await user.click(screen.getByRole('button', { name: 'Create Relationship' }));
    const createRel = screen.getByRole('dialog', { name: 'Create relationship' });
    await user.type(within(createRel).getByLabelText('Name'), 'Uses');
    // Serving must originate from the service and point to the actor (minimal ArchiMate rule).
    await user.selectOptions(within(createRel).getByLabelText('Source'), 'B (BusinessService)');
    await user.selectOptions(within(createRel).getByLabelText('Target'), 'A (BusinessActor)');
    await user.selectOptions(within(createRel).getByLabelText('Type'), 'Serving');
    await user.click(within(createRel).getByRole('button', { name: 'Create' }));

    // Relationship appears in the navigator.
    expect(await screen.findByText('Serving: Uses')).toBeInTheDocument();

    // Edit the selected relationship name via properties panel.
    await user.clear(screen.getByLabelText('Relationship property name'));
    await user.type(screen.getByLabelText('Relationship property name'), 'Uses2');
    expect(screen.getByText('Serving: Uses2')).toBeInTheDocument();
  });
});
