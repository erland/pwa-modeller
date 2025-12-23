import { render, screen } from '@testing-library/react';
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

    // Create element A.
    await user.type(screen.getByLabelText('Element name'), 'A');
    await user.click(screen.getByRole('button', { name: 'Create element' }));

    // Create element B.
    await user.type(screen.getByLabelText('Element name'), 'B');
    await user.click(screen.getByRole('button', { name: 'Create element' }));

    // Create relationship A -> B.
    await user.type(screen.getByLabelText('Relationship name'), 'Uses');
    await user.selectOptions(screen.getByLabelText('Relationship type'), 'Serving');
    // Source/Target default to first two elements, but make the test explicit.
    const source = screen.getByLabelText('Source element');
    const target = screen.getByLabelText('Target element');
    await user.selectOptions(source, (source as HTMLSelectElement).options[0].value);
    await user.selectOptions(target, (target as HTMLSelectElement).options[1].value);
    await user.click(screen.getByRole('button', { name: 'Create relationship' }));

    // Relationship appears in the navigator.
    expect(await screen.findByText('Serving: Uses')).toBeInTheDocument();

    // Edit the selected relationship name via properties panel.
    await user.clear(screen.getByLabelText('Relationship property name'));
    await user.type(screen.getByLabelText('Relationship property name'), 'Uses2');
    expect(screen.getByText('Serving: Uses2')).toBeInTheDocument();
  });
});
