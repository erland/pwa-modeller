import { render, screen, within } from '@testing-library/react';
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

    await user.click(screen.getByRole('button', { name: 'Model' }));
    await user.click(screen.getByRole('button', { name: 'New' }));
    await user.type(screen.getByLabelText('Name'), name);
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

    const createElement = async (opts: { name: string; layer: string; type: string }) => {
      await chooseCreate('ArchiMate Element…');
      const dlg = screen.getByRole('dialog', { name: 'Create element' });
      await user.selectOptions(within(dlg).getByLabelText('Layer'), opts.layer);
      await user.selectOptions(within(dlg).getByLabelText('Type'), opts.type);
      await user.type(within(dlg).getByLabelText('Element name'), opts.name);
      await user.click(within(dlg).getByRole('button', { name: 'Create' }));
    };

    const createRelationship = async (opts: {
      name: string;
      type: string;
      sourceLabel: string;
      targetLabel: string;
    }) => {
      // Relationships are created from the Element properties panel.
      await user.click(within(left).getByText(opts.sourceLabel.split(' (')[0]));
      await user.click(screen.getByRole('button', { name: 'New relationship…' }));
      const dlg = screen.getByRole('dialog', { name: 'Create relationship' });
      await user.selectOptions(within(dlg).getByLabelText('Source'), opts.sourceLabel);
      await user.selectOptions(within(dlg).getByLabelText('Target'), opts.targetLabel);
      await user.selectOptions(within(dlg).getByLabelText('Relationship type'), opts.type);
      await user.type(within(dlg).getByLabelText('Relationship name'), opts.name);
      await user.click(within(dlg).getByRole('button', { name: 'Create' }));
    };

    return { user, left, chooseCreate, createElement, createRelationship };
  }

  it('creates, edits and deletes an element', async () => {
    const { user, left, createElement } = await createModel('My Model');

    await createElement({ name: 'Actor A', layer: 'Business', type: 'BusinessActor' });
    expect(within(left).getByText('Actor A')).toBeInTheDocument();

    // Select in the tree and edit via the properties panel.
    await user.click(within(left).getByText('Actor A'));
    await user.clear(screen.getByLabelText('Element property name'));
    await user.type(screen.getByLabelText('Element property name'), 'Actor A2');
    expect(within(left).getByText('Actor A2')).toBeInTheDocument();

    // Delete via keyboard shortcut (Delete/Backspace).
    await user.keyboard('{Delete}');
    expect(within(left).queryByText('Actor A2')).not.toBeInTheDocument();
  });

  it('creates and deletes a relationship', async () => {
    const { user, left, createElement, createRelationship } = await createModel('Rel Model');

    await createElement({ name: 'Service', layer: 'Business', type: 'BusinessService' });
    await createElement({ name: 'Actor', layer: 'Business', type: 'BusinessActor' });

    // Serving must originate from the service and point to the actor.
    await createRelationship({
      name: 'Uses',
      type: 'Serving',
      sourceLabel: 'Service (BusinessService)',
      targetLabel: 'Actor (BusinessActor)'
    });

    // After creation, the dialog selects the new relationship.
    expect(screen.getByText('Relationship')).toBeInTheDocument();
    expect(screen.getByLabelText('Relationship property type')).toHaveValue('Serving');
    expect(screen.getByLabelText('Relationship property name')).toHaveValue('Uses');

    // Delete via the relationship properties panel.
    await user.click(screen.getByRole('button', { name: 'Delete relationship' }));

    // Confirm the relationship is gone by returning to the source element and checking outgoing list.
    await user.click(within(left).getByText('Service'));
    expect(screen.queryByRole('button', { name: /Select relationship Serving/i })).not.toBeInTheDocument();
  });
});
