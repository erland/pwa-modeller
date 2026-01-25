import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { MiniGraphOptionsToggles, defaultMiniGraphOptions } from '../MiniGraphOptions';

describe('MiniGraphOptions property overlay', () => {
  test('shows property key input when Property overlay is selected', () => {
    const onChange = jest.fn();

    render(
      <MiniGraphOptionsToggles
        options={defaultMiniGraphOptions}
        onChange={onChange}
        availablePropertyKeys={['risk', 'x:cost']}
      />
    );

    const select = screen.getByLabelText('Node overlay') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'nodePropertyNumber' } });

    expect(onChange).toHaveBeenCalled();
  });

  test('renders property key input with datalist when active', () => {
    const opts = { ...defaultMiniGraphOptions, nodeOverlayMetricId: 'nodePropertyNumber' as const, nodeOverlayPropertyKey: 'risk' };

    render(
      <MiniGraphOptionsToggles
        options={opts}
        onChange={() => {}}
        availablePropertyKeys={['risk', 'x:cost']}
      />
    );

    expect(screen.getByLabelText('Overlay property key')).toBeInTheDocument();
    // Datalist options should exist in the DOM.
    expect(screen.getByDisplayValue('risk')).toBeInTheDocument();
  });
});
