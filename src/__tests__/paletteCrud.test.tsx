import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App';
import { modelStore } from '../store';

describe('Navigator CRUD', () => {
  beforeEach(() => {
    modelStore.reset();
    jest.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  afterEach(() => {
    (window.confirm as jest.Mock).mockRestore?.();
  });

  it('can create elements and relationships from the navigator and edit properties', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Create a new model.
    await user.click(screen.getByRole('button', { name: 'New' }));
    await user.type(screen.getByLabelText('Name'), 'Navigator Model');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    const left = screen.getByTestId('left-sidebar');
    const openCreateMenu = async () => {
      const buttons = within(left).getAllByRole('button', { name: 'Create…' });
      // The first Create… button is the global one next to the search field.
      await user.click(buttons[0]);
    };

    const chooseCreate = async (label: string) => {
      await openCreateMenu();
      await user.click(await screen.findByRole('menuitem', { name: label }));
    };

    // Create element A (via dialog).
    await chooseCreate('Element…');
    const createElA = screen.getByRole('dialog', { name: 'Create element' });
    await user.type(within(createElA).getByLabelText('Element name'), 'A');
    await user.selectOptions(within(createElA).getByLabelText('Layer'), 'Business');
    await user.selectOptions(within(createElA).getByLabelText('Type'), 'BusinessActor');
    await user.click(within(createElA).getByRole('button', { name: 'Create' }));

    // Create element B.
    await chooseCreate('Element…');
    const createElB = screen.getByRole('dialog', { name: 'Create element' });
    await user.type(within(createElB).getByLabelText('Element name'), 'B');
    await user.selectOptions(within(createElB).getByLabelText('Layer'), 'Business');
    await user.selectOptions(within(createElB).getByLabelText('Type'), 'BusinessService');
    await user.click(within(createElB).getByRole('button', { name: 'Create' }));

    // Create relationship A -> B (via dialog).
    await chooseCreate('Relationship…');
    const createRel = screen.getByRole('dialog', { name: 'Create relationship' });
    await user.type(within(createRel).getByLabelText('Relationship name'), 'Uses');
    // Serving must originate from the service and point to the actor (minimal ArchiMate rule).
    await user.selectOptions(within(createRel).getByLabelText('Source'), 'B (BusinessService)');
    await user.selectOptions(within(createRel).getByLabelText('Target'), 'A (BusinessActor)');
    await user.selectOptions(within(createRel).getByLabelText('Relationship type'), 'Serving');
    await user.click(within(createRel).getByRole('button', { name: 'Create' }));

    // Relationship appears in the navigator.
    expect(await screen.findByText('Serving: Uses')).toBeInTheDocument();

    // Edit the selected relationship name via properties panel.
    await user.clear(screen.getByLabelText('Relationship property name'));
    await user.type(screen.getByLabelText('Relationship property name'), 'Uses2');
    expect(screen.getByText('Serving: Uses2')).toBeInTheDocument();
  });
});
