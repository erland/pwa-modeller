import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Element, UmlAttribute, UmlOperation, UmlParameter, UmlVisibility } from '../../../../domain';
import { applyUmlClassifierMembersToAttrs, asUmlVisibility, coerceUmlClassifierMembersFromAttrs } from '../../../../domain';
import { Dialog } from '../../../dialog/Dialog';

import type { ModelActions } from '../actions';
import { PropertyRow } from '../editors/PropertyRow';

function nextName(prefix: string, used: Set<string>): string {
  if (!used.has(prefix)) return prefix;
  let i = 2;
  while (used.has(`${prefix}${i}`)) i += 1;
  return `${prefix}${i}`;
}

function visibilityLabel(v: UmlVisibility): string {
  switch (v) {
    case 'public':
      return 'public (+)';
    case 'private':
      return 'private (-)';
    case 'protected':
      return 'protected (#)';
    case 'package':
      return 'package (~)';
  }
}

function formatParams(params?: UmlParameter[]): string {
  const list = (params ?? [])
    .map((p) => {
      const name = (p.name || '').trim();
      if (!name) return '';
      const t = (p.type || '').trim();
      return t ? `${name}: ${t}` : name;
    })
    .filter(Boolean);
  return list.join(', ');
}

function parseParams(text: string): UmlParameter[] {
  const raw = text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const out: UmlParameter[] = [];
  for (const part of raw) {
    const idx = part.indexOf(':');
    if (idx === -1) {
      out.push({ name: part });
      continue;
    }
    const name = part.slice(0, idx).trim();
    if (!name) continue;
    const type = part.slice(idx + 1).trim();
    out.push({ name, type: type || undefined });
  }
  return out;
}

function NamesInline({ names, maxInline = 4 }: { names: string[]; maxInline?: number }) {
  const inline = useMemo(() => names.slice(0, Math.max(0, maxInline)), [names, maxInline]);
  const overflowCount = Math.max(0, names.length - inline.length);

  if (names.length === 0) {
    return <span style={{ opacity: 0.7 }}>None</span>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {inline.map((n, i) => (
        <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={n}>
          {n}
        </div>
      ))}
      {overflowCount > 0 ? <div style={{ opacity: 0.75 }}>…and {overflowCount} more</div> : null}
    </div>
  );
}

function UmlAttributesEditor({
  attributes,
  onChange,
}: {
  attributes: UmlAttribute[];
  onChange: (next: UmlAttribute[]) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {attributes.length === 0 ? <div style={{ opacity: 0.7 }}>No attributes</div> : null}

      {attributes.map((a, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="selectInput"
            aria-label={`UML attribute visibility ${idx + 1}`}
            value={a.visibility ?? ''}
            onChange={(e) => {
              const v = e.target.value || undefined;
              const nextVis = v ? asUmlVisibility(v) : undefined;
              const next = attributes.map((x, i) => (i === idx ? { ...x, visibility: nextVis } : x));
              onChange(next);
            }}
            style={{ width: 140 }}
          >
            <option value="">(default)</option>
            {(['public', 'private', 'protected', 'package'] as UmlVisibility[]).map((v) => (
              <option key={v} value={v}>
                {visibilityLabel(v)}
              </option>
            ))}
          </select>

          <input
            className="textInput"
            aria-label={`UML attribute name ${idx + 1}`}
            placeholder="name"
            value={a.name}
            onChange={(e) => {
              const next = attributes.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x));
              onChange(next);
            }}
          />

          <input
            className="textInput"
            aria-label={`UML attribute type ${idx + 1}`}
            placeholder="type"
            value={a.type ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              const next = attributes.map((x, i) => (i === idx ? { ...x, type: v || undefined } : x));
              onChange(next);
            }}
            style={{ width: 160 }}
          />

          <input
            className="textInput"
            aria-label={`UML attribute default value ${idx + 1}`}
            placeholder="default"
            value={a.defaultValue ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              const next = attributes.map((x, i) => (i === idx ? { ...x, defaultValue: v || undefined } : x));
              onChange(next);
            }}
            style={{ width: 140 }}
          />

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, opacity: 0.85 }}>
            <input
              type="checkbox"
              aria-label={`UML attribute static ${idx + 1}`}
              checked={!!a.isStatic}
              onChange={(e) => {
                const next = attributes.map((x, i) =>
                  i === idx ? { ...x, isStatic: e.target.checked ? true : undefined } : x,
                );
                onChange(next);
              }}
            />
            static
          </label>

          <button
            type="button"
            className="miniButton"
            aria-label={`Remove UML attribute ${idx + 1}`}
            onClick={() => {
              onChange(attributes.filter((_, i) => i !== idx));
            }}
          >
            Remove
          </button>
        </div>
      ))}

      <div>
        <button
          type="button"
          className="miniButton"
          onClick={() => {
            const used = new Set(attributes.map((a) => (a.name || '').trim()).filter(Boolean));
            const name = nextName('attribute', used);
            onChange([...attributes, { name }]);
          }}
        >
          Add attribute
        </button>
      </div>
    </div>
  );
}

function UmlOperationsEditor({
  operations,
  onChange,
}: {
  operations: UmlOperation[];
  onChange: (next: UmlOperation[]) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {operations.length === 0 ? <div style={{ opacity: 0.7 }}>No operations</div> : null}

      {operations.map((o, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="selectInput"
            aria-label={`UML operation visibility ${idx + 1}`}
            value={o.visibility ?? ''}
            onChange={(e) => {
              const v = e.target.value || undefined;
              const nextVis = v ? asUmlVisibility(v) : undefined;
              const next = operations.map((x, i) => (i === idx ? { ...x, visibility: nextVis } : x));
              onChange(next);
            }}
            style={{ width: 140 }}
          >
            <option value="">(default)</option>
            {(['public', 'private', 'protected', 'package'] as UmlVisibility[]).map((v) => (
              <option key={v} value={v}>
                {visibilityLabel(v)}
              </option>
            ))}
          </select>

          <input
            className="textInput"
            aria-label={`UML operation name ${idx + 1}`}
            placeholder="name"
            value={o.name}
            onChange={(e) => {
              const next = operations.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x));
              onChange(next);
            }}
          />

          <input
            className="textInput"
            aria-label={`UML operation return type ${idx + 1}`}
            placeholder="return type"
            value={o.returnType ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              const next = operations.map((x, i) => (i === idx ? { ...x, returnType: v || undefined } : x));
              onChange(next);
            }}
            style={{ width: 160 }}
          />

          <input
            className="textInput"
            aria-label={`UML operation params ${idx + 1}`}
            placeholder="params: a: Type, b: Type"
            value={formatParams(o.params)}
            onChange={(e) => {
              const nextParams = parseParams(e.target.value);
              const next = operations.map((x, i) => (i === idx ? { ...x, params: nextParams } : x));
              onChange(next);
            }}
            style={{ width: 220 }}
          />

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, opacity: 0.85 }}>
            <input
              type="checkbox"
              aria-label={`UML operation static ${idx + 1}`}
              checked={!!o.isStatic}
              onChange={(e) => {
                const next = operations.map((x, i) =>
                  i === idx ? { ...x, isStatic: e.target.checked ? true : undefined } : x,
                );
                onChange(next);
              }}
            />
            static
          </label>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, opacity: 0.85 }}>
            <input
              type="checkbox"
              aria-label={`UML operation abstract ${idx + 1}`}
              checked={!!o.isAbstract}
              onChange={(e) => {
                const next = operations.map((x, i) =>
                  i === idx ? { ...x, isAbstract: e.target.checked ? true : undefined } : x,
                );
                onChange(next);
              }}
            />
            abstract
          </label>

          <button
            type="button"
            className="miniButton"
            aria-label={`Remove UML operation ${idx + 1}`}
            onClick={() => {
              onChange(operations.filter((_, i) => i !== idx));
            }}
          >
            Remove
          </button>
        </div>
      ))}

      <div>
        <button
          type="button"
          className="miniButton"
          onClick={() => {
            const used = new Set(operations.map((o) => (o.name || '').trim()).filter(Boolean));
            const name = nextName('operation', used);
            onChange([...operations, { name }]);
          }}
        >
          Add operation
        </button>
      </div>
    </div>
  );
}

type Props = {
  element: Element;
  actions: ModelActions;
};

export function UmlClassifierMembersSection({ element: el, actions }: Props) {
  const isClassifier = el.type === 'uml.class' || el.type === 'uml.associationClass' || el.type === 'uml.interface' || el.type === 'uml.datatype';
  // NOTE: Hooks must never be called conditionally. Keep all hooks above the early return.
  // Also memoize derived members to avoid creating new array references every render
  // (which can otherwise cause effects to loop when dialogs are open).

  const base = useMemo((): Record<string, unknown> => {
    if (!isClassifier) return {};
    const rawAttrs = el.attrs as unknown;
    return rawAttrs && typeof rawAttrs === 'object' && !Array.isArray(rawAttrs)
      ? { ...(rawAttrs as Record<string, unknown>) }
      : {};
  }, [isClassifier, el.attrs]);

  const members = useMemo(() => {
    if (!isClassifier) return { attributes: [] as UmlAttribute[], operations: [] as UmlOperation[] };
    // Keep empty names while editing to avoid UI "eating" partially edited rows.
    return coerceUmlClassifierMembersFromAttrs(base, { includeEmptyNames: true });
  }, [isClassifier, base]);

  const { attributes, operations } = members;

  const commit = useCallback(
    (nextAttrs: UmlAttribute[], nextOps: UmlOperation[]) => {
      if (!isClassifier) return;
      const next = applyUmlClassifierMembersToAttrs(base, { attributes: nextAttrs, operations: nextOps });
      actions.updateElement(el.id, { attrs: next });
    },
    [actions, base, el.id, isClassifier]
  );

  const attrNames = useMemo(() => attributes.map((a) => a.name.trim()).filter(Boolean), [attributes]);
  const opNames = useMemo(() => operations.map((o) => o.name.trim()).filter(Boolean), [operations]);

  const [isAttrsOpen, setIsAttrsOpen] = useState(false);
  const [isOpsOpen, setIsOpsOpen] = useState(false);
  const [attrsDraft, setAttrsDraft] = useState<UmlAttribute[]>(attributes);
  const [opsDraft, setOpsDraft] = useState<UmlOperation[]>(operations);

  // When opening, take a fresh snapshot so Cancel works as expected.
  useEffect(() => {
    if (!isClassifier) return;
    if (!isAttrsOpen) return;
    setAttrsDraft(attributes);
  }, [isClassifier, isAttrsOpen, attributes]);

  useEffect(() => {
    if (!isClassifier) return;
    if (!isOpsOpen) return;
    setOpsDraft(operations);
  }, [isClassifier, isOpsOpen, operations]);

  if (!isClassifier) return null;

  return (
    <>
      <p className="panelHint">UML</p>
      <div className="propertiesGrid">
        <PropertyRow label="Attributes">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <NamesInline names={attrNames} />
            </div>
            <button
              type="button"
              className="miniButton"
              aria-label="Edit UML attributes"
              onClick={() => setIsAttrsOpen(true)}
            >
              {attrNames.length ? 'Edit…' : 'Add…'}
            </button>
          </div>
        </PropertyRow>

        <PropertyRow label="Operations">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <NamesInline names={opNames} />
            </div>
            <button
              type="button"
              className="miniButton"
              aria-label="Edit UML operations"
              onClick={() => setIsOpsOpen(true)}
            >
              {opNames.length ? 'Edit…' : 'Add…'}
            </button>
          </div>
        </PropertyRow>
      </div>

      <div className="panelHint" style={{ marginTop: 6 }}>
        These members are stored on the UML element (shared across all diagrams). Use node formatting to show/hide
        compartments per diagram.
      </div>

      <Dialog
        title="UML Attributes"
        isOpen={isAttrsOpen}
        onClose={() => setIsAttrsOpen(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="shellButton" onClick={() => setIsAttrsOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="shellButton"
              onClick={() => {
                commit(attrsDraft, operations);
                setIsAttrsOpen(false);
              }}
            >
              Apply
            </button>
          </div>
        }
      >
        <UmlAttributesEditor attributes={attrsDraft} onChange={setAttrsDraft} />
      </Dialog>

      <Dialog
        title="UML Operations"
        isOpen={isOpsOpen}
        onClose={() => setIsOpsOpen(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="shellButton" onClick={() => setIsOpsOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="shellButton"
              onClick={() => {
                commit(attributes, opsDraft);
                setIsOpsOpen(false);
              }}
            >
              Apply
            </button>
          </div>
        }
      >
        <UmlOperationsEditor operations={opsDraft} onChange={setOpsDraft} />
      </Dialog>
    </>
  );
}
