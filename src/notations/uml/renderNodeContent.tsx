import * as React from 'react';
import type { Element, ViewNodeLayout, UmlAttribute, UmlOperation, UmlVisibility } from '../../domain';
import { readUmlClassifierMembers } from '../../domain';
import { readUmlNodeAttrs } from './nodeAttrs';

function readShapeHint(node: ViewNodeLayout): { umlShape?: string; umlOrientation?: 'horizontal' | 'vertical' } {
  const raw = (node as unknown as { attrs?: unknown }).attrs;
  if (!isRecord(raw)) return {};
  const umlShape = typeof raw.umlShape === 'string' ? raw.umlShape : undefined;
  const o = raw.umlOrientation;
  const umlOrientation = o === 'horizontal' || o === 'vertical' ? o : undefined;
  return { umlShape, umlOrientation };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s.length ? s : undefined;
}

function visibilitySymbol(v?: UmlVisibility): string {
  switch (v) {
    case 'public':
      return '+';
    case 'private':
      return '-';
    case 'protected':
      return '#';
    case 'package':
      return '~';
    default:
      return '';
  }
}




function formatAttribute(a: UmlAttribute): string {
  const sym = visibilitySymbol(a.visibility);
  const head = sym ? `${sym} ${a.name}` : a.name;
  return a.type ? `${head}: ${a.type}` : head;
}

function formatOperation(o: UmlOperation): string {
  const sym = visibilitySymbol(o.visibility);
  const head = sym ? `${sym} ${o.name}` : o.name;
  const params = (o.params ?? [])
    .map((p) => (p.type ? `${p.name}: ${p.type}` : p.name))
    .filter((s) => s.trim().length);
  const sig = `${head}(${params.join(', ')})`;
  return o.returnType ? `${sig}: ${o.returnType}` : sig;
}

function splitLines(text?: string): string[] {
  if (!text) return [];
  const normalized = text.replace(/\r\n/g, '\n');
  // Avoid rendering a trailing blank line when user ends with \n.
  const trimmedEnd = normalized.replace(/\n+$/, '');
  return trimmedEnd.length ? trimmedEnd.split('\n') : [];
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '6px 8px',
        borderTop: '1px solid rgba(0,0,0,0.18)',
        fontSize: 12,
        lineHeight: 1.25,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

function Header({ stereotype, name, italic }: { stereotype?: string; name: string; italic?: boolean }) {
  return (
    <div style={{ padding: '6px 8px', textAlign: 'center' }}>
      {stereotype ? (
        <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 2 }}>{`«${stereotype}»`}</div>
      ) : null}
      <div style={{ fontWeight: 800, fontStyle: italic ? 'italic' : 'normal', fontSize: 13 }}>{name}</div>
    </div>
  );
}

export function renderUmlNodeContent(args: { element: Element; node: ViewNodeLayout }): React.ReactNode {
  const { element, node } = args;
  const attrs = readUmlNodeAttrs(node);
  const shapeHint = readShapeHint(node);

  // Node labels are semantic (element-level).
  const name = element.name || "(unnamed)";

  // Stereotype is semantic (element-level).
  const elementStereo = isRecord(element.attrs) ? asString(element.attrs['stereotype']) : undefined;

  const attrLines = splitLines(attrs.attributesText);
  const opLines = splitLines(attrs.operationsText);

  const nodeType = element.type;
  const isInterface = nodeType === "uml.interface";
  const isEnum = nodeType === "uml.enum";
  const isPackage = nodeType === "uml.package";
  const isUseCase = nodeType === "uml.usecase";
  const isActor = nodeType === "uml.actor";
  const isNote = nodeType === "uml.note";
  const isClass = nodeType === "uml.class";

  // Activity diagram v1
  const isActivity = nodeType === 'uml.activity';
  const isAction = nodeType === 'uml.action';
  const isInitialNode = nodeType === 'uml.initialNode';
  const isActivityFinalNode = nodeType === 'uml.activityFinalNode';
  const isFlowFinalNode = nodeType === 'uml.flowFinalNode';
  const isDecisionNode = nodeType === 'uml.decisionNode';
  const isMergeNode = nodeType === 'uml.mergeNode';
  const isForkNode = nodeType === 'uml.forkNode';
  const isJoinNode = nodeType === 'uml.joinNode';
  const isObjectNode = nodeType === 'uml.objectNode';

  // Step 2: minimal rendering targets (import readiness)
  const isDataType = nodeType === 'uml.datatype';
  const isPrimitiveType = nodeType === 'uml.primitiveType';
  const isComponent = nodeType === 'uml.component';
  const isArtifact = nodeType === 'uml.artifact';
  const isNode = nodeType === 'uml.node';
  const isDevice = nodeType === 'uml.device';
  const isExecutionEnvironment = nodeType === 'uml.executionEnvironment';
  const isSubject = nodeType === 'uml.subject';

  // Presentation flags are view-local; default to "show" to keep old diagrams usable.
  const collapsed = attrs.collapsed ?? false;
  const showAttributes = attrs.showAttributes ?? true;
  const showOperations = attrs.showOperations ?? true;

  // Default stereotype hints if not explicitly set on the element.
  const defaultStereo =
    elementStereo ??
    (isInterface
      ? 'interface'
      : isEnum
        ? 'enumeration'
        : isPackage
          ? 'package'
          : isComponent
            ? 'component'
            : isArtifact
              ? 'artifact'
              : isDataType
                ? 'datatype'
                : isPrimitiveType
                  ? 'primitive'
                  : isNode
                    ? 'node'
                    : isDevice
                      ? 'device'
                      : isExecutionEnvironment
                        ? 'execution environment'
                        : isSubject
                          ? 'subject'
                          : undefined);

  // ------------------------------
  // Activity diagram shapes (v1)
  // ------------------------------

  if (isInitialNode) {
    return (
      <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            width: '68%',
            height: '68%',
            borderRadius: 999,
            background: 'rgba(0,0,0,0.88)',
          }}
          title={name}
        />
      </div>
    );
  }

  if (isActivityFinalNode) {
    return (
      <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="100%" height="100%" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6" />
          <circle cx="50" cy="50" r="26" fill="currentColor" />
        </svg>
      </div>
    );
  }

  if (isFlowFinalNode) {
    return (
      <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="100%" height="100%" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6" />
          <line x1="30" y1="30" x2="70" y2="70" stroke="currentColor" strokeWidth="6" />
          <line x1="70" y1="30" x2="30" y2="70" stroke="currentColor" strokeWidth="6" />
        </svg>
      </div>
    );
  }

  if (isDecisionNode || isMergeNode) {
    // Decision/merge rendered as a diamond.
    return (
      <div style={{ height: '100%', width: '100%', position: 'relative', overflow: 'hidden' }}>
        <svg width="100%" height="100%" viewBox="0 0 100 70" aria-hidden="true">
          <polygon points="50,2 98,35 50,68 2,35" fill="rgba(255,255,255,0.92)" stroke="currentColor" strokeWidth="3" />
        </svg>
        {name && name !== '(unnamed)' ? (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: 12,
              fontWeight: 800,
              textAlign: 'center',
              padding: '0 6px',
              maxWidth: '90%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </div>
        ) : null}
      </div>
    );
  }

  if (isForkNode || isJoinNode) {
    const orientation = shapeHint.umlOrientation ?? 'horizontal';
    const isVertical = orientation === 'vertical';
    return (
      <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            width: isVertical ? 18 : '86%',
            height: isVertical ? '86%' : 18,
            borderRadius: 4,
            background: 'rgba(0,0,0,0.88)',
          }}
          title={name}
        />
      </div>
    );
  }

  if (isAction) {
    // Rounded rectangle.
    return (
      <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div
          style={{
            width: '100%',
            height: '100%',
            boxSizing: 'border-box',
            border: '2px solid rgba(0,0,0,0.28)',
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 10px',
            fontSize: 13,
            fontWeight: 800,
            overflow: 'hidden',
          }}
        >
          {name}
        </div>
      </div>
    );
  }

  if (isObjectNode) {
    return (
      <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div
          style={{
            width: '100%',
            height: '100%',
            boxSizing: 'border-box',
            border: '2px solid rgba(0,0,0,0.28)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 10px',
            fontSize: 13,
            fontWeight: 800,
            overflow: 'hidden',
          }}
        >
          {name}
        </div>
      </div>
    );
  }

  if (isActivity) {
    // Minimal container shape for v1.
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ fontWeight: 800, fontSize: 13, padding: '4px 6px' }}>{name}</div>
        {collapsed ? null : attrLines.length ? <Section>{attrLines.join('\n')}</Section> : null}
      </div>
    );
  }

  if (isNote) {
    return (
      <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
        {/* Folded corner */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            width: 0,
            height: 0,
            borderTop: '16px solid rgba(0,0,0,0.14)',
            borderLeft: '16px solid transparent',
          }}
        />
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.25,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            padding: '6px 8px',
          }}
        >
          {attrs.attributesText || element.documentation || element.name || ''}
        </div>
      </div>
    );
  }

  if (isPackage) {
    // Package is a simple header-only shape for v1.
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header stereotype={defaultStereo} name={name} />
        {attrLines.length ? <Section>{attrLines.join('\n')}</Section> : null}
      </div>
    );
  }

  if (isSubject) {
    // System boundary / subject: keep it minimal for import readiness.
    // Render a left-aligned header to feel more "container label"-like.
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '6px 8px', textAlign: 'left' }}>
          {defaultStereo ? (
            <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 2 }}>{`«${defaultStereo}»`}</div>
          ) : null}
          <div style={{ fontWeight: 800, fontSize: 13 }}>{name}</div>
        </div>
        {collapsed ? null : attrLines.length ? <Section>{attrLines.join('\n')}</Section> : null}
      </div>
    );
  }

  if (
    isPrimitiveType ||
    isComponent ||
    isArtifact ||
    isNode ||
    isDevice ||
    isExecutionEnvironment
  ) {
    // Minimal compartment-like rendering for common EA import targets.
    // These node types currently use legacy view-local text fields (attrs.attributesText/operationsText).
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header stereotype={defaultStereo} name={name} />
        {collapsed ? null : (
          <>
            {showAttributes ? (attrLines.length ? <Section>{attrLines.join('\n')}</Section> : <Section>{' '}</Section>) : null}
            {showOperations ? (opLines.length ? <Section>{opLines.join('\n')}</Section> : <Section>{' '}</Section>) : null}
          </>
        )}
      </div>
    );
  }

  if (isUseCase) {
    // Minimal use case rendering: draw an ellipse-like container inside the node.
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <div
          style={{
            width: '100%',
            height: '100%',
            boxSizing: 'border-box',
            border: '1px solid rgba(0,0,0,0.32)',
            borderRadius: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '6px 10px',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {name}
        </div>
      </div>
    );
  }

  if (isActor) {
    // Minimal actor rendering: stick figure + name.
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" style={{ opacity: 0.9 }}>
          <circle cx="22" cy="10" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
          <line x1="22" y1="16" x2="22" y2="30" stroke="currentColor" strokeWidth="2" />
          <line x1="10" y1="20" x2="34" y2="20" stroke="currentColor" strokeWidth="2" />
          <line x1="22" y1="30" x2="12" y2="42" stroke="currentColor" strokeWidth="2" />
          <line x1="22" y1="30" x2="32" y2="42" stroke="currentColor" strokeWidth="2" />
        </svg>
        <div style={{ marginTop: 4, textAlign: 'center', fontSize: 13, fontWeight: 700 }}>{name}</div>
      </div>
    );
  }

  // Class / Interface / DataType compartments render semantic members from the element.
  // DataType previously used view-local text fields; we keep a small compatibility fallback
  // so older diagrams don't lose text if semantic members are empty.
  if (isClass || isInterface || isDataType) {
    const members = readUmlClassifierMembers(element);
    const useLegacyText =
      isDataType &&
      members.attributes.length === 0 &&
      members.operations.length === 0 &&
      (attrLines.length > 0 || opLines.length > 0);

    const attributeLines = useLegacyText ? attrLines : members.attributes.map(formatAttribute);
    const operationLines = useLegacyText ? opLines : members.operations.map(formatOperation);

    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header stereotype={defaultStereo} name={name} italic={isInterface} />

        {collapsed ? null : (
          <>
            {showAttributes ? (
              attributeLines.length ? (
                <Section>{attributeLines.join('\n')}</Section>
              ) : (
                <Section>{' '}</Section>
              )
            ) : null}

            {showOperations ? (
              operationLines.length ? (
                <Section>{operationLines.join('\n')}</Section>
              ) : (
                <Section>{' '}</Section>
              )
            ) : null}
          </>
        )}
      </div>
    );
  }

  // Enum (compartment box) – keep v1 text-based rendering for now.
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Header stereotype={defaultStereo} name={name} italic={isInterface} />

      {/* Attributes (or enum literals) */}
      {attrLines.length ? <Section>{attrLines.join('\n')}</Section> : <Section>{' '}</Section>}

      {/* Operations (omit for enum if empty to reduce clutter) */}
      {opLines.length ? <Section>{opLines.join('\n')}</Section> : isEnum ? null : <Section>{' '}</Section>}
    </div>
  );
}
