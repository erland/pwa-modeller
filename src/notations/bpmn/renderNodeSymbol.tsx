import * as React from 'react';

/**
 * Small, consistent symbols used in list UIs (and as a fallback if node content isn't overridden).
 *
 * Goal: recognizable BPMN shapes without pulling in an external icon set.
 */
export function renderBpmnNodeSymbol(nodeType: string): React.ReactNode {
  const frame: React.CSSProperties = {
    width: 22,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    userSelect: 'none',
    color: 'rgba(0,0,0,0.78)',
  };

  // Registry-first rendering (keeps this function small and makes it easy to extend).
  type Renderer = (type: string, frameStyle: React.CSSProperties) => React.ReactNode;

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

  const renderTaskLike: Renderer = (type, f) => {
    const glyph =
      type === 'bpmn.userTask'
        ? 'U'
        : type === 'bpmn.serviceTask'
          ? 'S'
          : type === 'bpmn.scriptTask'
            ? 'Sc'
            : type === 'bpmn.manualTask'
              ? 'M'
              : type === 'bpmn.callActivity'
                ? 'C'
                : type === 'bpmn.subProcess'
                  ? '+'
                  : 'T';

    return (
      <div
        style={{
          ...f,
          border: '1px solid currentColor',
          borderRadius: 6,
          fontSize: glyph.length > 1 ? 8 : 11,
          fontWeight: 900,
          lineHeight: 1,
        }}
        title={type}
      >
        {glyph}
      </div>
    );
  };

  const renderStartEvent: Renderer = (type, f) => (
    <div style={{ ...f, border: '2px solid currentColor', borderRadius: 999 }} title={type} />
  );
  const renderEndEvent: Renderer = (type, f) => <div style={{ ...f, border: '4px solid currentColor', borderRadius: 999 }} title={type} />;
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

  const renderGateway: Renderer = (type, f) => {
    const glyph =
      type === 'bpmn.gatewayParallel'
        ? '+'
        : type === 'bpmn.gatewayInclusive'
          ? 'O'
          : type === 'bpmn.gatewayEventBased'
            ? 'E'
            : 'X';

    return (
      <div style={f} title={type}>
        <div
          style={{
            width: 14,
            height: 14,
            border: '2px solid currentColor',
            transform: 'rotate(45deg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ transform: 'rotate(-45deg)', fontWeight: 900, fontSize: 10, lineHeight: 1 }}>{glyph}</div>
        </div>
      </div>
    );
  };

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

  const fallback: Renderer = (type, f) => (
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

  const taskLikeTypes: Record<string, true> = {
    'bpmn.task': true,
    'bpmn.userTask': true,
    'bpmn.serviceTask': true,
    'bpmn.scriptTask': true,
    'bpmn.manualTask': true,
    'bpmn.callActivity': true,
    'bpmn.subProcess': true,
  };
  const gatewayTypes: Record<string, true> = {
    'bpmn.gatewayExclusive': true,
    'bpmn.gatewayParallel': true,
    'bpmn.gatewayInclusive': true,
    'bpmn.gatewayEventBased': true,
  };

  const renderers: Record<string, Renderer> = {
    // Containers
    'bpmn.pool': renderPool,
    'bpmn.lane': renderLane,
    // Events
    'bpmn.startEvent': renderStartEvent,
    'bpmn.endEvent': renderEndEvent,
    'bpmn.intermediateCatchEvent': renderIntermediateEvent,
    'bpmn.intermediateThrowEvent': renderIntermediateEvent,
    'bpmn.boundaryEvent': renderBoundaryEvent,
    // Artifacts
    'bpmn.textAnnotation': renderTextAnnotation,
    'bpmn.dataObjectReference': renderDataObjectRef,
    'bpmn.dataStoreReference': renderDataStoreRef,
    'bpmn.group': renderGroup,
  };

  // Direct registry lookup first
  const direct = renderers[nodeType];
  if (direct) return direct(nodeType, frame);

  // Grouped families
  if (taskLikeTypes[nodeType]) return renderTaskLike(nodeType, frame);
  if (gatewayTypes[nodeType]) return renderGateway(nodeType, frame);

  return fallback(nodeType, frame);
}
