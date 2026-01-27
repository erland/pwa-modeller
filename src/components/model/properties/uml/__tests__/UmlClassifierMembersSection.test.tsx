import { fireEvent, render, screen } from '@testing-library/react';

import type { Element } from '../../../../../domain';
import type { ModelActions } from '../../actions';
import { UmlClassifierMembersSection } from '../UmlClassifierMembersSection';

describe('UmlClassifierMembersSection', () => {
  function makeActions(overrides: Partial<ModelActions>): ModelActions {
    return overrides as unknown as ModelActions;
  }

  it('renders nothing for non-classifier elements', () => {
    const el: Element = { id: 'e1', name: 'X', type: 'uml.note' } as Element;
    const actions = makeActions({ updateElement: jest.fn() });

    const { container } = render(<UmlClassifierMembersSection element={el} actions={actions} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('adds an attribute and commits to element.attrs', () => {
    const updateElement = jest.fn();
    const el: Element = {
      id: 'c1',
      name: 'Customer',
      type: 'uml.class',
      attrs: { attributes: [], operations: [] },
    } as Element;

    const actions = makeActions({ updateElement });

    render(<UmlClassifierMembersSection element={el} actions={actions} />);

    // Open attributes dialog
    fireEvent.click(screen.getByLabelText('Edit UML attributes'));

    fireEvent.click(screen.getByText('Add attribute'));
    fireEvent.click(screen.getByText('Apply'));

    expect(updateElement).toHaveBeenCalled();
    const lastCall = updateElement.mock.calls[updateElement.mock.calls.length - 1];
    expect(lastCall[0]).toBe('c1');
    expect(lastCall[1]).toMatchObject({
      attrs: {
        attributes: [{ name: expect.any(String) }],
        operations: [],
      },
    });
  });

  it('edits attribute multiplicity in the attributes dialog and commits to element.attrs', () => {
    const updateElement = jest.fn();
    const el: Element = {
      id: 'c_mul',
      name: 'Order',
      type: 'uml.class',
      attrs: { attributes: [], operations: [] },
    } as Element;

    const actions = makeActions({ updateElement });
    render(<UmlClassifierMembersSection element={el} actions={actions} />);

    fireEvent.click(screen.getByLabelText('Edit UML attributes'));
    fireEvent.click(screen.getByText('Add attribute'));

    const lower = screen.getByLabelText('UML attribute multiplicity lower 1') as HTMLInputElement;
    const upper = screen.getByLabelText('UML attribute multiplicity upper 1') as HTMLInputElement;
    fireEvent.change(lower, { target: { value: '0' } });
    fireEvent.change(upper, { target: { value: '*' } });

    fireEvent.click(screen.getByText('Apply'));

    expect(updateElement).toHaveBeenCalled();
    const lastCall = updateElement.mock.calls[updateElement.mock.calls.length - 1];
    expect(lastCall[0]).toBe('c_mul');
    expect(lastCall[1]).toMatchObject({
      attrs: {
        attributes: [{ multiplicity: { lower: '0', upper: '*' } }],
      },
    });
  });

  it('updates operation return type and commits to element.attrs', () => {
    const updateElement = jest.fn();
    const el: Element = {
      id: 'c2',
      name: 'Customer',
      type: 'uml.class',
      attrs: { attributes: [], operations: [{ name: 'getId' }] },
    } as Element;

    const actions = makeActions({ updateElement });

    render(<UmlClassifierMembersSection element={el} actions={actions} />);

    // Open operations dialog
    fireEvent.click(screen.getByLabelText('Edit UML operations'));

    const input = screen.getByLabelText('UML operation return type 1');
    fireEvent.change(input, { target: { value: 'string' } });
    fireEvent.click(screen.getByText('Apply'));

    expect(updateElement).toHaveBeenCalled();
    const lastCall = updateElement.mock.calls[updateElement.mock.calls.length - 1];
    expect(lastCall[0]).toBe('c2');
    expect(lastCall[1]).toMatchObject({
      attrs: {
        operations: [{ name: 'getId', returnType: 'string' }],
      },
    });
  });

  it('treats uml.datatype as a classifier and allows editing members', () => {
    const updateElement = jest.fn();
    const el: Element = {
      id: 'd1',
      name: 'Money',
      type: 'uml.datatype',
      attrs: { attributes: [], operations: [] },
    } as Element;

    const actions = makeActions({ updateElement });

    render(<UmlClassifierMembersSection element={el} actions={actions} />);

    fireEvent.click(screen.getByLabelText('Edit UML attributes'));
    fireEvent.click(screen.getByText('Add attribute'));
    fireEvent.click(screen.getByText('Apply'));

    expect(updateElement).toHaveBeenCalled();
    const lastCall = updateElement.mock.calls[updateElement.mock.calls.length - 1];
    expect(lastCall[0]).toBe('d1');
    expect(lastCall[1]).toMatchObject({
      attrs: {
        attributes: [{ name: expect.any(String) }],
        operations: [],
      },
    });
  });

  it('does not display uml:* metaclass tokens as attribute datatypes (UI guard)', () => {
    const updateElement = jest.fn();
    const el: Element = {
      id: 'c3',
      name: 'Customer',
      type: 'uml.class',
      attrs: {
        attributes: [{ name: 'id', metaclass: 'uml:Property', dataTypeName: 'uml:Property' }],
        operations: [],
      },
    } as Element;

    const actions = makeActions({ updateElement });
    render(<UmlClassifierMembersSection element={el} actions={actions} />);

    // Inline list should show only the name (no bogus datatype)
    expect(screen.getByText('id')).toBeInTheDocument();
    expect(screen.queryByText(/uml:Property/)).not.toBeInTheDocument();

    // Dialog should also hide the bogus datatype
    fireEvent.click(screen.getByLabelText('Edit UML attributes'));
    const typeInput = screen.getByLabelText('UML attribute type 1') as HTMLInputElement;
    expect(typeInput.value).toBe('');
  });
});
