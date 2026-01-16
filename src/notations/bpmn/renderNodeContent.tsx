import * as React from 'react';

import type { Element, ViewNodeLayout } from '../../domain';

function labelFor(element: Element): string {
  return (element.name || '').trim() || '(unnamed)';
}

function NodeLabel({ text }: { text: string }) {
  return (
    <div
      style={{
        marginTop: 6,
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

/**
 * BPMN node content rendering for v1.
 *
 * We keep it intentionally simple: recognisable shapes + element name.
 * More BPMN fidelity (markers, icons, subprocess, pools/lanes) can be layered on later.
 */
export function renderBpmnNodeContent(args: { element: Element; node: ViewNodeLayout }): React.ReactNode {
  const { element, node } = args;
  const type = element.type;
  const name = labelFor(element);

  const w = node.width ?? 120;
  const h = node.height ?? 60;

  // Size used for circle/diamond symbols so they don't stretch into ovals.
  const symbolSize = Math.max(28, Math.min(w, h) - 8);

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

    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: symbolSize,
            height: symbolSize,
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
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: symbolSize,
            height: symbolSize,
            transform: 'rotate(45deg) scale(0.78)',
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
