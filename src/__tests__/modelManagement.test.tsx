import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App';
import { createEmptyModel } from '../domain';
import { modelStore, serializeModel } from '../store';

describe('Model management UI', () => {
  beforeEach(() => {
    modelStore.reset();
    jest.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  afterEach(() => {
    (window.confirm as jest.Mock).mockRestore?.();
  });

  it('creates a new model from the header', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'New' }));
    await user.type(screen.getByLabelText('Name'), 'My Model');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.getByText('My Model')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeEnabled();
  });

  it('creates and deletes a folder under the model root', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'New' }));
    await user.type(screen.getByLabelText('Name'), 'Folder Test Model');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    // Create a folder via the navigator "Create…" menu. (Root is hidden in the UI.)
    const searchInput = screen.getByRole('textbox', { name: 'Search model' });
    // eslint-disable-next-line testing-library/no-node-access
    const headerRow = searchInput.parentElement as HTMLElement;
    await user.click(within(headerRow).getByRole('button', { name: 'Create…' }));
    await user.click(screen.getByRole('menuitem', { name: 'Folder…' }));
    await user.type(screen.getByLabelText('Folder name'), 'Foo');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.getByText('Foo')).toBeInTheDocument();

    // Delete via the properties pane (tree rows no longer contain delete buttons).
    await user.click(screen.getByRole('row', { name: /Foo/ }));
    const properties = screen.getByRole('complementary', { name: 'Properties panel' });
    await user.click(within(properties).getByRole('button', { name: 'Delete' }));

    // Folder deletion uses window.confirm (mocked to true in beforeEach), no dialog.
    // Assert removal by role to avoid matching the aria-live announcer ("Foo selected.").
    await waitFor(() => {
      expect(screen.queryByRole('row', { name: /Foo/ })).not.toBeInTheDocument();
    });
  });

  it('opens a model from a JSON file', async () => {
    render(<App />);

    const model = createEmptyModel({ name: 'Loaded Model' });
    const json = serializeModel(model);
    const file = new File([json], 'loaded-model.json', { type: 'application/json' });

    const input = screen.getByTestId('open-model-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText('Loaded Model')).toBeInTheDocument();
    expect(screen.getByText(/file: loaded-model\.json/i)).toBeInTheDocument();
  });

  it('edits model properties via dialog', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'New' }));
    await user.type(screen.getByLabelText('Name'), 'Props Model');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await user.click(screen.getByRole('button', { name: 'Model' }));
    await user.click(screen.getByRole('button', { name: 'Properties…' }));
    await user.clear(screen.getByLabelText('Version'));
    await user.type(screen.getByLabelText('Version'), '1.0');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('1.0')).toBeInTheDocument();
  });
});
