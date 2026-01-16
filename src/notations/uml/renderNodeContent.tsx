import * as React from 'react';
import type { Element, ViewNodeLayout } from '../../domain';
import { readUmlNodeAttrs } from './nodeAttrs';

type UmlVisibility = 'public' | 'private' | 'protected' | 'package';

type UmlParam = {
  name: string;
  type?: string;
};

type UmlAttribute = {
  name: string;
  type?: string;
  visibility?: UmlVisibility;
};

type UmlOperation = {
  name: string;
  returnType?: string;
  visibility?: UmlVisibility;
  params?: UmlParam[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s.length ? s : undefined;
}

function asVisibility(v: unknown): UmlVisibility | undefined {
  switch (v) {
    case 'public':
    case 'private':
    case 'protected':
    case 'package':
      return v;
  }
  return undefined;
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

function readUmlClassifierMembers(element: Element): { attributes: UmlAttribute[]; operations: UmlOperation[] } {
  const raw = element.attrs;
  if (!isRecord(raw)) return { attributes: [], operations: [] };

  const attrs: UmlAttribute[] = [];
  const ops: UmlOperation[] = [];

  const rawAttrs = raw.attributes;
  if (Array.isArray(rawAttrs)) {
    for (const a of rawAttrs) {
      if (!isRecord(a)) continue;
      const name = asString(a.name);
      if (!name) continue;
      attrs.push({
        name,
        type: asString(a.type),
        visibility: asVisibility(a.visibility),
      });
    }
  }

  const rawOps = raw.operations;
  if (Array.isArray(rawOps)) {
    for (const o of rawOps) {
      if (!isRecord(o)) continue;
      const name = asString(o.name);
      if (!name) continue;

      const params: UmlParam[] = [];
      const rawParams = o.params;
      if (Array.isArray(rawParams)) {
        for (const p of rawParams) {
          if (!isRecord(p)) continue;
          const pName = asString(p.name);
          if (!pName) continue;
          params.push({ name: pName, type: asString(p.type) });
        }
      }

      ops.push({
        name,
        returnType: asString(o.returnType),
        visibility: asVisibility(o.visibility),
        params,
      });
    }
  }

  return { attributes: attrs, operations: ops };
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

  const name = (attrs.name ?? '').trim() || element.name || '(unnamed)';
  const stereotype = attrs.stereotype;

  const attrLines = splitLines(attrs.attributesText);
  const opLines = splitLines(attrs.operationsText);

  const nodeType = element.type;
  const isInterface = nodeType === 'uml.interface';
  const isEnum = nodeType === 'uml.enum';
  const isPackage = nodeType === 'uml.package';
  const isNote = nodeType === 'uml.note';
  const isClass = nodeType === 'uml.class';

  // Presentation flags are view-local; default to "show" to keep old diagrams usable.
  const collapsed = attrs.collapsed ?? false;
  const showAttributes = attrs.showAttributes ?? true;
  const showOperations = attrs.showOperations ?? true;

  // Default stereotype hints if not explicitly set.
  const defaultStereo =
    stereotype ??
    (isInterface ? 'interface' : isEnum ? 'enumeration' : isPackage ? 'package' : undefined);

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

  // Class / Interface compartments render semantic members from the element.
  if (isClass || isInterface) {
    const members = readUmlClassifierMembers(element);
    const attributeLines = members.attributes.map(formatAttribute);
    const operationLines = members.operations.map(formatOperation);

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
