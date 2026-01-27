import * as React from 'react';
import { render, screen } from '@testing-library/react';
import type { Element, ViewNodeLayout } from '../../domain';
import { renderUmlNodeContent } from './renderNodeContent';

function mkNode(attrs?: unknown): ViewNodeLayout {
  return {
    elementId: 'e1',
    x: 0,
    y: 0,
    width: 200,
    height: 120,
    attrs,
  };
}

function mkClassElement(attrs?: unknown): Element {
  return {
    id: 'e1',
    kind: 'uml',
    type: 'uml.class',
    name: 'Person',
    attrs,
  };
}

function mkAssociationClassElement(attrs?: unknown): Element {
  return {
    id: 'e1',
    kind: 'uml',
    type: 'uml.associationClass',
    name: 'Enrollment',
    attrs,
  };
}

describe('renderUmlNodeContent (semantic members + view flags)', () => {
  test('renders class members from element attrs (ignores node text fields)', () => {
    const element = mkClassElement({
      attributes: [{ name: 'id', type: 'string', visibility: 'private' }],
      operations: [
        {
          name: 'getName',
          returnType: 'string',
          visibility: 'public',
          params: [{ name: 'format', type: 'string' }],
        },
      ],
    });

    const node = mkNode({
      showAttributes: true,
      showOperations: true,
      collapsed: false,
      // Legacy fields that should not be used for class/interface rendering anymore.
      attributesText: 'SHOULD NOT SHOW',
      operationsText: 'SHOULD NOT SHOW',
    });

    render(<div>{renderUmlNodeContent({ element, node })}</div>);

    expect(screen.getByText('- id: string')).toBeInTheDocument();
    expect(screen.getByText('+ getName(format: string): string')).toBeInTheDocument();
    expect(screen.queryByText('SHOULD NOT SHOW')).not.toBeInTheDocument();
  });

  test('respects per-node presentation flags', () => {
    const element = mkClassElement({
      attributes: [{ name: 'id', type: 'string' }],
      operations: [{ name: 'save' }],
    });

    const nodeHiddenAttrs = mkNode({ showAttributes: false, showOperations: true, collapsed: false });
    const first = render(<div>{renderUmlNodeContent({ element, node: nodeHiddenAttrs })}</div>);
    expect(screen.queryByText('id: string')).not.toBeInTheDocument();
    expect(screen.getByText('save()')).toBeInTheDocument();

    first.unmount();

    const nodeCollapsed = mkNode({ showAttributes: true, showOperations: true, collapsed: true });
    render(<div>{renderUmlNodeContent({ element, node: nodeCollapsed })}</div>);
    expect(screen.queryByText('save()')).not.toBeInTheDocument();
  });

  test('renders association class as a class-like box with an AssociationClass marker', () => {
    const element = mkAssociationClassElement({
      attributes: [{ name: 'since', type: 'date' }],
    });

    const node = mkNode({ showAttributes: true, showOperations: false, collapsed: false });
    render(<div>{renderUmlNodeContent({ element, node })}</div>);

    // Header marker + name
    expect(screen.getByText('«AssociationClass»')).toBeInTheDocument();
    expect(screen.getByText('Enrollment')).toBeInTheDocument();
    // Members still render like a class
    expect(screen.getByText('since: date')).toBeInTheDocument();
  });
});
