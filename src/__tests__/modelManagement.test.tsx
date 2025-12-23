import { fireEvent, render, screen } from '@testing-library/react';
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

  it('creates and deletes a folder under Elements', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'New' }));
    await user.type(screen.getByLabelText('Name'), 'Folder Test Model');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    // First "Create folder" button belongs to the Elements root.
    const createButtons = screen.getAllByRole('button', { name: 'Create folder' });
    await user.click(createButtons[0]);
    await user.type(screen.getByLabelText('Folder name'), 'Foo');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.getByText('Foo')).toBeInTheDocument();

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete folder' });
    // The last delete button should be for the new folder
    await user.click(deleteButtons[deleteButtons.length - 1]);

    expect(screen.queryByText('Foo')).not.toBeInTheDocument();
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
    await user.clear(screen.getByLabelText('Version'));
    await user.type(screen.getByLabelText('Version'), '1.0');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('1.0')).toBeInTheDocument();
  });
});
