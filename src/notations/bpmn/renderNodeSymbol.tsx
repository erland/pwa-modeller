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

  // ------------------------------
  // Containers
  // ------------------------------
  if (nodeType === 'bpmn.pool') {
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
  }

  if (nodeType === 'bpmn.lane') {
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
  }

  // ------------------------------
  // Activities
  // ------------------------------
  const isTaskLike =
    nodeType === 'bpmn.task' ||
    nodeType === 'bpmn.userTask' ||
    nodeType === 'bpmn.serviceTask' ||
    nodeType === 'bpmn.scriptTask' ||
    nodeType === 'bpmn.manualTask' ||
    nodeType === 'bpmn.callActivity' ||
    nodeType === 'bpmn.subProcess';

  if (isTaskLike) {
    const glyph =
      nodeType === 'bpmn.userTask'
        ? 'U'
        : nodeType === 'bpmn.serviceTask'
          ? 'S'
          : nodeType === 'bpmn.scriptTask'
            ? 'Sc'
            : nodeType === 'bpmn.manualTask'
              ? 'M'
              : nodeType === 'bpmn.callActivity'
                ? 'C'
                : nodeType === 'bpmn.subProcess'
                  ? '+'
                  : 'T';

    return (
      <div
        style={{
          ...frame,
          border: '1px solid currentColor',
          borderRadius: 6,
          fontSize: glyph.length > 1 ? 8 : 11,
          fontWeight: 900,
          lineHeight: 1,
        }}
        title={nodeType}
      >
        {glyph}
      </div>
    );
  }

  // ------------------------------
  // Events
  // ------------------------------
  if (nodeType === 'bpmn.startEvent') {
    return <div style={{ ...frame, border: '2px solid currentColor', borderRadius: 999 }} title={nodeType} />;
  }

  if (nodeType === 'bpmn.endEvent') {
    return <div style={{ ...frame, border: '4px solid currentColor', borderRadius: 999 }} title={nodeType} />;
  }

  if (nodeType === 'bpmn.intermediateCatchEvent' || nodeType === 'bpmn.intermediateThrowEvent') {
    return (
      <div style={{ ...frame, position: 'relative' }} title={nodeType}>
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
        {nodeType === 'bpmn.intermediateThrowEvent' ? (
          <div style={{ position: 'absolute', fontSize: 10, fontWeight: 900, lineHeight: 1 }}>↑</div>
        ) : null}
      </div>
    );
  }

  if (nodeType === 'bpmn.boundaryEvent') {
    return <div style={{ ...frame, border: '2px dashed currentColor', borderRadius: 999 }} title={nodeType} />;
  }

  // ------------------------------
  // Gateways
  // ------------------------------
  const isGateway =
    nodeType === 'bpmn.gatewayExclusive' ||
    nodeType === 'bpmn.gatewayParallel' ||
    nodeType === 'bpmn.gatewayInclusive' ||
    nodeType === 'bpmn.gatewayEventBased';

  if (isGateway) {
    const glyph =
      nodeType === 'bpmn.gatewayParallel'
        ? '+'
        : nodeType === 'bpmn.gatewayInclusive'
          ? 'O'
          : nodeType === 'bpmn.gatewayEventBased'
            ? 'E'
            : 'X';

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
          <div style={{ transform: 'rotate(-45deg)', fontWeight: 900, fontSize: 10, lineHeight: 1 }}>{glyph}</div>
        </div>
      </div>
    );
  }

  // ------------------------------
  // Artifacts
  // ------------------------------
  if (nodeType === 'bpmn.textAnnotation') {
    return (
      <div
        style={{
          ...frame,
          border: '1px solid currentColor',
          borderRight: 'none',
          borderRadius: 2,
          position: 'relative',
        }}
        title={nodeType}
      >
        <div style={{ position: 'absolute', right: 3, top: 3, bottom: 3, width: 1, background: 'currentColor', opacity: 0.6 }} />
      </div>
    );
  }



  if (nodeType === 'bpmn.dataObjectReference') {
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
  }

  if (nodeType === 'bpmn.dataStoreReference') {
    return (
      <div style={{ ...frame, position: 'relative' }} title={nodeType}>
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
  }

  if (nodeType === 'bpmn.group') {
    return (
      <div
        style={{
          ...frame,
          border: '1px dashed currentColor',
          borderRadius: 4,
        }}
        title={nodeType}
      />
    );
  }
  // Fallback
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
