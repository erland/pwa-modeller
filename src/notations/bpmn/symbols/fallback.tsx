import type { Renderer } from './types';

export const renderFallback: Renderer = (type, f) => (
  <div
    style={{
      ...f,
      border: '1px solid currentColor',
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 800,
      lineHeight: 1,
    }}
    title={type}
  >
    B
  </div>
);
