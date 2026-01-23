import * as React from 'react';

import type { Element, ViewNodeLayout } from '../../domain';
import { isBpmnActivityAttrs } from '../../domain/bpmnAttrs';

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

function TaskBadge({ text }: { text: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 6,
        top: 6,
        padding: '1px 5px',
        border: '1px solid rgba(0,0,0,0.25)',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 900,
        lineHeight: 1.1,
        opacity: 0.85,
        background: 'rgba(0,0,0,0.02)',
        userSelect: 'none',
      }}
    >
      {text}
    </div>
  );
}

function ActivityMarkers({ loopType, isForCompensation }: { loopType?: string; isForCompensation?: boolean }) {
  const parts: string[] = [];

  // Loop markers (compact, UI-friendly approximations).
  if (loopType === 'standard') parts.push('↻');
  if (loopType === 'multiInstanceParallel') parts.push('≡');
  if (loopType === 'multiInstanceSequential') parts.push('⋮');

  // Compensation marker.
  if (isForCompensation) parts.push('↺');

  if (!parts.length) return null;
  return (
    <div
      style={{
        position: 'absolute',
        right: 6,
        bottom: 6,
        display: 'inline-flex',
        gap: 4,
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1px 5px',
        border: '1px solid rgba(0,0,0,0.22)',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 900,
        lineHeight: 1,
        opacity: 0.78,
        background: 'rgba(0,0,0,0.02)',
        userSelect: 'none',
      }}
      aria-hidden="true"
      title={
        [
          loopType === 'standard'
            ? 'Standard loop'
            : loopType === 'multiInstanceParallel'
              ? 'Multi-instance (parallel)'
              : loopType === 'multiInstanceSequential'
                ? 'Multi-instance (sequential)'
                : null,
          isForCompensation ? 'Compensation activity' : null,
        ]
          .filter(Boolean)
          .join(' • ')
      }
    >
      {parts.join('')}
    </div>
  );
}

function TaskNode({
  name,
  badge,
  isCallActivity,
  isSubProcess,
  loopType,
  isForCompensation,
}: {
  name: string;
  badge?: string;
  isCallActivity?: boolean;
  isSubProcess?: boolean;
  loopType?: string;
  isForCompensation?: boolean;
}) {
  const border = isCallActivity ? '3px solid rgba(0,0,0,0.34)' : '2px solid rgba(0,0,0,0.32)';
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        border,
        borderRadius: 12,
        background: 'rgba(255,255,255,0.92)',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '10px 10px 8px',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {badge ? <TaskBadge text={badge} /> : null}
      <ActivityMarkers loopType={loopType} isForCompensation={isForCompensation} />
      {isSubProcess ? (
        <div
          style={{
            position: 'absolute',
            bottom: 6,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 16,
            height: 16,
            border: '1px solid rgba(0,0,0,0.3)',
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 900,
            opacity: 0.75,
            userSelect: 'none',
          }}
        >
          +
        </div>
      ) : null}
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

function EventNode({ name, variant }: { name: string; variant: 'start' | 'end' | 'intermediateCatch' | 'intermediateThrow' | 'boundary' }) {
  const borderWidth = variant === 'end' ? 4 : 2;
  const borderStyle = variant === 'boundary' ? 'dashed' : 'solid';

  const showDoubleRing = variant === 'intermediateCatch' || variant === 'intermediateThrow';
  const showThrowArrow = variant === 'intermediateThrow';

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
          width: 42,
          height: 42,
          borderRadius: 999,
          border: `${borderWidth}px ${borderStyle} rgba(0,0,0,0.40)`,
          background: 'rgba(255,255,255,0.92)',
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        {showDoubleRing ? (
          <div
            style={{
              position: 'absolute',
              left: 6,
              top: 6,
              right: 6,
              bottom: 6,
              borderRadius: 999,
              border: '1px solid rgba(0,0,0,0.36)',
              boxSizing: 'border-box',
            }}
          />
        ) : null}
        {showThrowArrow ? (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%,-55%)',
              fontSize: 16,
              fontWeight: 900,
              lineHeight: 1,
              opacity: 0.75,
              userSelect: 'none',
            }}
          >
            ↑
          </div>
        ) : null}
      </div>
      <NodeLabel text={name} />
    </div>
  );
}

function GatewayNode({ name, kind }: { name: string; kind: 'exclusive' | 'parallel' | 'inclusive' | 'eventBased' }) {
  const glyph = kind === 'parallel' ? '+' : kind === 'inclusive' ? 'O' : kind === 'eventBased' ? 'E' : 'X';

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
          width: 44,
          height: 44,
          transform: 'rotate(45deg) scale(0.66)',
          border: '2px solid rgba(0,0,0,0.40)',
          background: 'rgba(255,255,255,0.92)',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ transform: 'rotate(-45deg)', fontWeight: 900, fontSize: 18, lineHeight: 1 }}>{glyph}</div>
      </div>
      <NodeLabel text={name} />
    </div>
  );
}

function TextAnnotationNode({ name }: { name: string }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        border: '2px solid rgba(0,0,0,0.22)',
        borderRight: 'none',
        borderRadius: 4,
        background: 'rgba(255,255,255,0.92)',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px 10px',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div style={{ position: 'absolute', right: 6, top: 6, bottom: 6, width: 2, background: 'rgba(0,0,0,0.18)' }} />
      <div style={{ fontSize: 13, fontWeight: 800, textAlign: 'center', wordBreak: 'break-word' }}>{name}</div>
    </div>
  );
}

function DataObjectNode({ name }: { name: string }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        border: '2px solid rgba(0,0,0,0.24)',
        borderRadius: 4,
        background: 'rgba(255,255,255,0.92)',
        boxSizing: 'border-box',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px 10px',
      }}
    >
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: 22,
          height: 22,
          borderLeft: '2px solid rgba(0,0,0,0.20)',
          borderBottom: '2px solid rgba(0,0,0,0.20)',
          background: 'rgba(0,0,0,0.03)',
          transform: 'translate(8px,-8px) rotate(45deg)',
          transformOrigin: 'top right',
        }}
      />
      <div style={{ fontSize: 13, fontWeight: 800, textAlign: 'center', wordBreak: 'break-word' }}>{name}</div>
    </div>
  );
}

function DataStoreNode({ name }: { name: string }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        border: '2px solid rgba(0,0,0,0.24)',
        borderRadius: 999,
        background: 'rgba(255,255,255,0.92)',
        boxSizing: 'border-box',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px 10px',
      }}
    >
      <div style={{ position: 'absolute', left: 10, right: 10, top: 12, height: 1, background: 'rgba(0,0,0,0.18)' }} />
      <div style={{ position: 'absolute', left: 10, right: 10, bottom: 12, height: 1, background: 'rgba(0,0,0,0.18)' }} />
      <div style={{ fontSize: 13, fontWeight: 800, textAlign: 'center', wordBreak: 'break-word' }}>{name}</div>
    </div>
  );
}

function GroupNode({ name }: { name: string }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        border: '2px dashed rgba(0,0,0,0.24)',
        borderRadius: 8,
        background: 'rgba(0,0,0,0.01)',
        boxSizing: 'border-box',
        overflow: 'hidden',
        position: 'relative',
        padding: '6px 8px',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
    </div>
  );
}


/**
 * BPMN node content rendering.
 *
 * v1: tasks/events/gateways
 * v2: pools/lanes as lightweight containers (geometry-based containment)
 * Step-1 expansion: richer set of activities/events/gateways + text annotation
 */
export function renderBpmnNodeContent(args: { element: Element; node: ViewNodeLayout }): React.ReactNode {
  const { element, node } = args;
  const type = String(element.type);
  const name = labelFor(element);

  const w = node.width ?? 120;

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

  // Activities
  if (
    type === 'bpmn.task' ||
    type === 'bpmn.userTask' ||
    type === 'bpmn.serviceTask' ||
    type === 'bpmn.scriptTask' ||
    type === 'bpmn.manualTask' ||
    type === 'bpmn.callActivity' ||
    type === 'bpmn.subProcess'
  ) {
    const badge =
      type === 'bpmn.userTask'
        ? 'User'
        : type === 'bpmn.serviceTask'
          ? 'Service'
          : type === 'bpmn.scriptTask'
            ? 'Script'
            : type === 'bpmn.manualTask'
              ? 'Manual'
              : type === 'bpmn.callActivity'
                ? 'Call'
                : type === 'bpmn.subProcess'
                  ? 'Sub'
                  : undefined;

    const raw = element.attrs;
    const parsed = isBpmnActivityAttrs(raw) ? raw : undefined;
    return (
      <TaskNode
        name={name}
        badge={badge}
        isCallActivity={type === 'bpmn.callActivity'}
        isSubProcess={type === 'bpmn.subProcess'}
        loopType={parsed?.loopType}
        isForCompensation={parsed?.isForCompensation}
      />
    );
  }

  // Events
  if (type === 'bpmn.startEvent') return <EventNode name={name} variant="start" />;
  if (type === 'bpmn.endEvent') return <EventNode name={name} variant="end" />;
  if (type === 'bpmn.intermediateCatchEvent') return <EventNode name={name} variant="intermediateCatch" />;
  if (type === 'bpmn.intermediateThrowEvent') return <EventNode name={name} variant="intermediateThrow" />;
  if (type === 'bpmn.boundaryEvent') return <EventNode name={name} variant="boundary" />;

  // Gateways
  if (type === 'bpmn.gatewayExclusive') return <GatewayNode name={name} kind="exclusive" />;
  if (type === 'bpmn.gatewayParallel') return <GatewayNode name={name} kind="parallel" />;
  if (type === 'bpmn.gatewayInclusive') return <GatewayNode name={name} kind="inclusive" />;
  if (type === 'bpmn.gatewayEventBased') return <GatewayNode name={name} kind="eventBased" />;

  // Artifacts
  if (type === 'bpmn.textAnnotation') return <TextAnnotationNode name={name} />;
  if (type === 'bpmn.dataObjectReference') return <DataObjectNode name={name} />;
  if (type === 'bpmn.dataStoreReference') return <DataStoreNode name={name} />;
  if (type === 'bpmn.group') return <GroupNode name={name} />;

  // Fallback: treat unknown BPMN types as a task-like rounded box.
  return <TaskNode name={name} />;
}
