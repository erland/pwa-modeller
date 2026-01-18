import type { Element } from '../../../../domain';

import type { ModelActions } from '../actions';
import { PropertyRow } from '../editors/PropertyRow';

type UmlVisibility = 'public' | 'private' | 'protected' | 'package';

type UmlAttribute = {
  name: string;
  type?: string;
  visibility?: UmlVisibility;
  isStatic?: boolean;
  defaultValue?: string;
};

type UmlParam = {
  name: string;
  type?: string;
};

type UmlOperation = {
  name: string;
  returnType?: string;
  visibility?: UmlVisibility;
  params?: UmlParam[];
  isStatic?: boolean;
  isAbstract?: boolean;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
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

function readClassifierMembers(el: Element): {
  attributes: UmlAttribute[];
  operations: UmlOperation[];
  base: Record<string, unknown>;
} {
  const raw = el.attrs;
  const base: Record<string, unknown> = isRecord(raw) ? { ...raw } : {};

  const attributes: UmlAttribute[] = [];
  const operations: UmlOperation[] = [];

  const rawAttrs = base.attributes;
  if (Array.isArray(rawAttrs)) {
    for (const a of rawAttrs) {
      if (!isRecord(a)) continue;
      const name = typeof a.name === 'string' ? a.name : '';
      attributes.push({
        name,
        type: typeof a.type === 'string' ? a.type : undefined,
        visibility: asVisibility(a.visibility),
        isStatic: typeof a.isStatic === 'boolean' ? a.isStatic : undefined,
        defaultValue: typeof a.defaultValue === 'string' ? a.defaultValue : undefined,
      });
    }
  }

  const rawOps = base.operations;
  if (Array.isArray(rawOps)) {
    for (const o of rawOps) {
      if (!isRecord(o)) continue;
      const name = typeof o.name === 'string' ? o.name : '';

      const params: UmlParam[] = [];
      if (Array.isArray(o.params)) {
        for (const p of o.params) {
          if (!isRecord(p)) continue;
          const pName = typeof p.name === 'string' ? p.name : '';
          if (!pName.trim()) continue;
          params.push({
            name: pName,
            type: typeof p.type === 'string' ? p.type : undefined,
          });
        }
      }

      operations.push({
        name,
        returnType: typeof o.returnType === 'string' ? o.returnType : undefined,
        visibility: asVisibility(o.visibility),
        params,
        isStatic: typeof o.isStatic === 'boolean' ? o.isStatic : undefined,
        isAbstract: typeof o.isAbstract === 'boolean' ? o.isAbstract : undefined,
      });
    }
  }

  return { attributes, operations, base };
}

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

function formatParams(params?: UmlParam[]): string {
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

function parseParams(text: string): UmlParam[] {
  const raw = text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const out: UmlParam[] = [];
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

type Props = {
  element: Element;
  actions: ModelActions;
};

export function UmlClassifierMembersSection({ element: el, actions }: Props) {
  const isClassifier = el.type === 'uml.class' || el.type === 'uml.interface';
  if (!isClassifier) return null;

  const { attributes, operations, base } = readClassifierMembers(el);

  const commit = (nextAttrs: UmlAttribute[], nextOps: UmlOperation[]) => {
    const next = { ...base };
    next.attributes = nextAttrs;
    next.operations = nextOps;
    actions.updateElement(el.id, { attrs: next });
  };

  return (
    <>
      <p className="panelHint">UML</p>
      <div className="propertiesGrid">
        <PropertyRow label="Attributes">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {attributes.length === 0 ? <div style={{ opacity: 0.7 }}>No attributes</div> : null}

            {attributes.map((a, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select
                  className="selectInput"
                  aria-label={`UML attribute visibility ${idx + 1}`}
                  value={a.visibility ?? ''}
                  onChange={(e) => {
                    const v = e.target.value || undefined;
                    const nextVis = v ? asVisibility(v) : undefined;
                    const next = attributes.map((x, i) => (i === idx ? { ...x, visibility: nextVis } : x));
                    commit(next, operations);
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
                    commit(next, operations);
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
                    commit(next, operations);
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
                    commit(next, operations);
                  }}
                  style={{ width: 140 }}
                />

                <label
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, opacity: 0.85 }}
                  title="Static"
                >
                  <input
                    type="checkbox"
                    aria-label={`UML attribute static ${idx + 1}`}
                    checked={!!a.isStatic}
                    onChange={(e) => {
                      const next = attributes.map((x, i) =>
                        i === idx ? { ...x, isStatic: e.target.checked ? true : undefined } : x
                      );
                      commit(next, operations);
                    }}
                  />
                  static
                </label>

                <button
                  type="button"
                  className="miniButton"
                  aria-label={`Remove UML attribute ${idx + 1}`}
                  onClick={() => {
                    const next = attributes.filter((_, i) => i !== idx);
                    commit(next, operations);
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
                  commit([...attributes, { name }], operations);
                }}
              >
                Add attribute
              </button>
            </div>
          </div>
        </PropertyRow>

        <PropertyRow label="Operations">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {operations.length === 0 ? <div style={{ opacity: 0.7 }}>No operations</div> : null}

            {operations.map((o, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select
                  className="selectInput"
                  aria-label={`UML operation visibility ${idx + 1}`}
                  value={o.visibility ?? ''}
                  onChange={(e) => {
                    const v = e.target.value || undefined;
                    const nextVis = v ? asVisibility(v) : undefined;
                    const next = operations.map((x, i) => (i === idx ? { ...x, visibility: nextVis } : x));
                    commit(attributes, next);
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
                    commit(attributes, next);
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
                    commit(attributes, next);
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
                    commit(attributes, next);
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
                        i === idx ? { ...x, isStatic: e.target.checked ? true : undefined } : x
                      );
                      commit(attributes, next);
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
                        i === idx ? { ...x, isAbstract: e.target.checked ? true : undefined } : x
                      );
                      commit(attributes, next);
                    }}
                  />
                  abstract
                </label>

                <button
                  type="button"
                  className="miniButton"
                  aria-label={`Remove UML operation ${idx + 1}`}
                  onClick={() => {
                    const next = operations.filter((_, i) => i !== idx);
                    commit(attributes, next);
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
                  commit(attributes, [...operations, { name }]);
                }}
              >
                Add operation
              </button>
            </div>
          </div>
        </PropertyRow>
      </div>

      <div className="panelHint" style={{ marginTop: 6 }}>
        These members are stored on the UML element (shared across all diagrams). Use node formatting to show/hide
        compartments per diagram.
      </div>
    </>
  );
}
