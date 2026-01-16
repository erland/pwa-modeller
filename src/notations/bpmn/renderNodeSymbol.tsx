import * as React from 'react';

/**
 * Small, consistent symbols used in list UIs (and as a fallback if node content isn't overridden).
 *
 * v1+v2 goal: recognizable BPMN shapes without pulling in an external icon set.
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

  switch (nodeType) {
    case 'bpmn.pool':
      return (
        <div
          style={{
            ...frame,
            border: '1px solid currentColor',
            borderRadius: 2,
            position: 'relative',
            overflow: 'hidden',
          }}
          title={nodeType}
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

    case 'bpmn.lane':
      return (
        <div
          style={{
            ...frame,
            border: '1px solid currentColor',
            borderRadius: 2,
            position: 'relative',
          }}
          title={nodeType}
        >
          <div style={{ width: 16, height: 1, background: 'currentColor', opacity: 0.55 }} />
        </div>
      );

    case 'bpmn.task':
      return (
        <div
          style={{
            ...frame,
            border: '1px solid currentColor',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 800,
            lineHeight: 1,
          }}
          title={nodeType}
        >
          T
        </div>
      );

    case 'bpmn.startEvent':
      return <div style={{ ...frame, border: '2px solid currentColor', borderRadius: 999 }} title={nodeType} />;

    case 'bpmn.endEvent':
      return <div style={{ ...frame, border: '4px solid currentColor', borderRadius: 999 }} title={nodeType} />;

    case 'bpmn.gatewayExclusive':
      return (
        <div style={frame} title={nodeType}>
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
            <div style={{ transform: 'rotate(-45deg)', fontWeight: 900, fontSize: 10, lineHeight: 1 }}>X</div>
          </div>
        </div>
      );

    default:
      return (
        <div
          style={{
            ...frame,
            border: '1px solid currentColor',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 800,
            lineHeight: 1,
          }}
          title={nodeType}
        >
          B
        </div>
      );
  }
}
