import type { Renderer } from './types';

const renderTextAnnotation: Renderer = (type, f) => (
  <div
    style={{
      ...f,
      border: '1px solid currentColor',
      borderRight: 'none',
      borderRadius: 2,
      position: 'relative',
    }}
    title={type}
  >
    <div style={{ position: 'absolute', right: 3, top: 3, bottom: 3, width: 1, background: 'currentColor', opacity: 0.6 }} />
  </div>
);

const renderDataObjectRef: Renderer = (type, f) => (
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
        right: 0,
        top: 0,
        width: 8,
        height: 8,
        borderLeft: '1px solid currentColor',
        borderBottom: '1px solid currentColor',
        background: 'rgba(0,0,0,0.04)',
        transform: 'translate(2px,-2px) rotate(45deg)',
        transformOrigin: 'top right',
      }}
    />
  </div>
);

const renderDataStoreRef: Renderer = (type, f) => (
  <div style={{ ...f, position: 'relative' }} title={type}>
    <div
      style={{
        width: 14,
        height: 18,
        border: '1px solid currentColor',
        borderRadius: 999,
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', left: 0, right: 0, top: 4, height: 1, background: 'currentColor', opacity: 0.35 }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 4, height: 1, background: 'currentColor', opacity: 0.35 }} />
    </div>
  </div>
);

const renderGroup: Renderer = (type, f) => (
  <div
    style={{
      ...f,
      border: '1px dashed currentColor',
      borderRadius: 4,
    }}
    title={type}
  />
);

export const artifactRenderers: Record<string, Renderer> = {
  'bpmn.textAnnotation': renderTextAnnotation,
  'bpmn.dataObjectReference': renderDataObjectRef,
  'bpmn.dataStoreReference': renderDataStoreRef,
  'bpmn.group': renderGroup,
};
