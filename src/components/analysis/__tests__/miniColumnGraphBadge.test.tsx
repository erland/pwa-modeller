import React from 'react';
import { render, screen } from '@testing-library/react';

import { MiniColumnGraph } from '../MiniColumnGraph';

describe('MiniColumnGraph badge rendering', () => {
  test('renders a node badge when provided', () => {
    render(
      <MiniColumnGraph
        nodes={[{ id: 'n1', label: 'Node A', level: 0, badge: '99' }]}
        edges={[]}
        ariaLabel='test graph'
      />
    );

    expect(screen.getByText('99')).toBeInTheDocument();
  });
});
