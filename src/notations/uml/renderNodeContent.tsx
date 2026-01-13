import * as React from 'react';
import type { Element, ViewNodeLayout } from '../../domain';
import { readUmlNodeAttrs } from './nodeAttrs';

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

  // Class / Interface / Enum (compartment box)
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
