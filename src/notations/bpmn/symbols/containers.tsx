import type { Renderer } from './types';

const renderPool: Renderer = (type, f) => (
  <div
    style={{
      ...f,
      border: '1px solid currentColor',
      borderRadius: 2,
      position: 'relative',
      overflow: 'hidden',
    }}
    title={type}
  >
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 5,
        background: 'currentColor',
        opacity: 0.25,
      }}
    />
  </div>
);

const renderLane: Renderer = (type, f) => (
  <div
    style={{
      ...f,
      border: '1px solid currentColor',
      borderRadius: 2,
      position: 'relative',
    }}
    title={type}
  >
    <div style={{ width: 16, height: 1, background: 'currentColor', opacity: 0.55 }} />
  </div>
);

export const containerRenderers: Record<string, Renderer> = {
  'bpmn.pool': renderPool,
  'bpmn.lane': renderLane,
};
