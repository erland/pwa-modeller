import type { Renderer } from './types';

const renderStartEvent: Renderer = (type, f) => (
  <div style={{ ...f, border: '2px solid currentColor', borderRadius: 999 }} title={type} />
);

const renderEndEvent: Renderer = (type, f) => (
  <div style={{ ...f, border: '4px solid currentColor', borderRadius: 999 }} title={type} />
);

const renderIntermediateEvent: Renderer = (type, f) => (
  <div style={{ ...f, position: 'relative' }} title={type}>
    <div style={{ width: 18, height: 18, borderRadius: 999, border: '2px solid currentColor', boxSizing: 'border-box' }} />
    <div
      style={{
        position: 'absolute',
        width: 14,
        height: 14,
        borderRadius: 999,
        border: '1px solid currentColor',
        boxSizing: 'border-box',
        opacity: 0.9,
      }}
    />
    {type === 'bpmn.intermediateThrowEvent' ? (
      <div style={{ position: 'absolute', fontSize: 10, fontWeight: 900, lineHeight: 1 }}>↑</div>
    ) : null}
  </div>
);

const renderBoundaryEvent: Renderer = (type, f) => (
  <div style={{ ...f, border: '2px dashed currentColor', borderRadius: 999 }} title={type} />
);

export const eventRenderers: Record<string, Renderer> = {
  'bpmn.startEvent': renderStartEvent,
  'bpmn.endEvent': renderEndEvent,
  'bpmn.intermediateCatchEvent': renderIntermediateEvent,
  'bpmn.intermediateThrowEvent': renderIntermediateEvent,
  'bpmn.boundaryEvent': renderBoundaryEvent,
};
