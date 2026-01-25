import React from 'react';
import { render } from '@testing-library/react';

import { MiniColumnGraph } from '../MiniColumnGraph';

describe('MiniColumnGraph sizeScale', () => {
  test('scales node width/height when sizeScale is provided', () => {
    const { container } = render(
      <MiniColumnGraph
        nodes={[
          { id: 'a', label: 'A', level: 0, sizeScale: 0.85 },
          { id: 'b', label: 'B', level: 0, sizeScale: 1.25 }
        ]}
        edges={[]}
        wrapLabels={false}
        autoFitColumns={false}
        responsive={false}
        ariaLabel="scale test"
      />
    );

    const rects = Array.from(container.querySelectorAll('svg rect'))
      // Exclude any defs/marker rects (none expected) and keep node rectangles.
      .filter((r) => r.getAttribute('width') && r.getAttribute('height'));

    // We expect exactly two node rectangles.
    expect(rects.length).toBe(2);

    const w1 = Number(rects[0].getAttribute('width'));
    const w2 = Number(rects[1].getAttribute('width'));

    // The second node should be wider due to a higher scale.
    expect(w2).toBeGreaterThan(w1);
  });
});
