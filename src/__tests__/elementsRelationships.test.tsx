import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App';
import { modelStore } from '../store';

describe('Elements & Relationships CRUD', () => {
  beforeEach(() => {
    modelStore.reset();
    jest.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  afterEach(() => {
    (window.confirm as jest.Mock).mockRestore?.();
  });

  async function createModel(name: string) {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'New' }));
    await user.type(screen.getByLabelText('Name'), name);
    await user.click(screen.getByRole('button', { name: 'Create' }));
    return user;
  }

  it('creates, edits and deletes an element', async () => {
    const user = await createModel('My Model');

    await user.click(screen.getByRole('tab', { name: 'Elements' }));
    await user.click(screen.getByRole('button', { name: 'Create Element' }));
    await user.selectOptions(screen.getByLabelText('Layer'), 'Business');
    await user.selectOptions(screen.getByLabelText('Type'), 'BusinessActor');
    await user.type(screen.getByLabelText('Name'), 'Actor A');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.getByText('Actor A')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /edit element Actor A/i }));
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Actor A2');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Actor A2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /delete element Actor A2/i }));
    expect(screen.queryByText('Actor A2')).not.toBeInTheDocument();
  });

  it('creates and deletes a relationship', async () => {
    const user = await createModel('Rel Model');

    await user.click(screen.getByRole('tab', { name: 'Elements' }));
    await user.click(screen.getByRole('button', { name: 'Create Element' }));
    await user.selectOptions(screen.getByLabelText('Layer'), 'Business');
    await user.selectOptions(screen.getByLabelText('Type'), 'BusinessService');
    await user.type(screen.getByLabelText('Name'), 'Service');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await user.click(screen.getByRole('button', { name: 'Create Element' }));
    await user.selectOptions(screen.getByLabelText('Layer'), 'Business');
    await user.selectOptions(screen.getByLabelText('Type'), 'BusinessActor');
    await user.type(screen.getByLabelText('Name'), 'Actor');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await user.click(screen.getByRole('tab', { name: 'Relationships' }));
    await user.click(screen.getByRole('button', { name: 'Create Relationship' }));
    // default source/target are preselected; choose Serving explicitly.
    await user.selectOptions(screen.getByLabelText('Type'), 'Serving');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.getByRole('table', { name: 'Relationships list' })).toBeInTheDocument();
    expect(screen.getAllByText('Serving').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /delete relationship Serving/i }));
    // Relationship list should fall back to empty state
    expect(screen.getByText(/no relationships yet/i)).toBeInTheDocument();
  });
});
