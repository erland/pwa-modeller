import * as React from 'react';

import type { Element, ViewNodeLayout } from '../../domain';

function labelFor(element: Element): string {
  return (element.name || '').trim() || '(unnamed)';
}

function NodeLabel({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: '0 4px',
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1.15,
        textAlign: 'center',
        wordBreak: 'break-word',
        overflow: 'hidden',
      }}
    >
      {text}
    </div>
  );
}

function ContainerLabel({ text, vertical }: { text: string; vertical?: boolean }) {
  if (vertical) {
    return (
      <div
        style={{
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: 0.3,
          opacity: 0.85,
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </div>
    );
  }

  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 800,
        lineHeight: 1.1,
        opacity: 0.88,
        userSelect: 'none',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {text}
    </div>
  );
}

/**
 * BPMN node content rendering.
 *
 * v1: tasks/events/gateways
 * v2: pools/lanes as lightweight containers (geometry-based containment)
 */
export function renderBpmnNodeContent(args: { element: Element; node: ViewNodeLayout }): React.ReactNode {
  const { element, node } = args;
  const type = element.type;
  const name = labelFor(element);

  const w = node.width ?? 120;
  const h = node.height ?? 60;

  // Size used for square-ish symbols. Events/gateways also need room for a label,
  // so they use a smaller per-type size below.
  const symbolSize = Math.max(28, Math.min(w, h) - 8);

  if (type === 'bpmn.pool') {
    // Participant / Pool: container with a vertical label band on the left.
    const bandW = Math.min(36, Math.max(24, Math.round(w * 0.06)));
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          border: '2px solid rgba(0,0,0,0.32)',
          borderRadius: 6,
          background: 'rgba(255,255,255,0.92)',
          boxSizing: 'border-box',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'stretch',
        }}
      >
        <div
          style={{
            width: bandW,
            borderRight: '2px solid rgba(0,0,0,0.24)',
            background: 'rgba(0,0,0,0.03)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 4,
            boxSizing: 'border-box',
          }}
        >
          <ContainerLabel text={name} vertical />
        </div>
        <div style={{ flex: 1 }} />
      </div>
    );
  }

  if (type === 'bpmn.lane') {
    // Lane: simple horizontal band container.
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          border: '2px solid rgba(0,0,0,0.22)',
          borderRadius: 4,
          background: 'rgba(0,0,0,0.02)',
          boxSizing: 'border-box',
          overflow: 'hidden',
          padding: '6px 8px',
          display: 'flex',
          alignItems: 'flex-start',
        }}
      >
        <ContainerLabel text={name} />
      </div>
    );
  }

  if (type === 'bpmn.task') {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          border: '2px solid rgba(0,0,0,0.32)',
          borderRadius: 12,
          background: 'rgba(255,255,255,0.92)',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '6px 8px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            lineHeight: 1.1,
            textAlign: 'center',
            wordBreak: 'break-word',
          }}
        >
          {name}
        </div>
      </div>
    );
  }

  if (type === 'bpmn.startEvent' || type === 'bpmn.endEvent') {
    const borderWidth = type === 'bpmn.endEvent' ? 4 : 2;

    // Leave room for the label under the symbol. The previous sizing used
    // nearly the full node height which caused clipping on smaller nodes.
    const eventSymbolSize = Math.max(22, Math.min(w, Math.round(h * 0.55)));

    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          padding: '4px 4px 6px',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: eventSymbolSize,
            height: eventSymbolSize,
            borderRadius: 999,
            border: `${borderWidth}px solid rgba(0,0,0,0.40)`,
            background: 'rgba(255,255,255,0.92)',
            boxSizing: 'border-box',
          }}
        />
        <NodeLabel text={name} />
      </div>
    );
  }

  if (type === 'bpmn.gatewayExclusive') {
    // Diamond with X.

    // Leave room for the label under the symbol.
    const gatewaySymbolSize = Math.max(22, Math.min(w, Math.round(h * 0.55)));

    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          padding: '4px 4px 6px',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: gatewaySymbolSize,
            height: gatewaySymbolSize,
            transform: 'rotate(45deg) scale(0.66)',
            border: '2px solid rgba(0,0,0,0.40)',
            background: 'rgba(255,255,255,0.92)',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ transform: 'rotate(-45deg)', fontWeight: 900, fontSize: 18, lineHeight: 1 }}>X</div>
        </div>
        <NodeLabel text={name} />
      </div>
    );
  }

  // Fallback: treat unknown BPMN types as a task-like rounded box.
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        border: '2px solid rgba(0,0,0,0.22)',
        borderRadius: 12,
        background: 'rgba(255,255,255,0.92)',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px 8px',
        overflow: 'hidden',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, textAlign: 'center', wordBreak: 'break-word' }}>{name}</div>
    </div>
  );
}
