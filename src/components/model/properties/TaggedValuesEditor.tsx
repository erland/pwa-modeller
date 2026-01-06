import type { ChangeEvent } from 'react';
import { useMemo } from 'react';

import type { TaggedValue, TaggedValueType } from '../../../domain';
import { createId } from '../../../domain';

export type TaggedValuesEditorProps = {
  taggedValues?: TaggedValue[];
  onChange: (next: TaggedValue[] | undefined) => void;
  title?: string;
  allowNamespaces?: boolean;
};

const TAG_TYPES: TaggedValueType[] = ['string', 'number', 'boolean', 'json'];

function toBoolString(checked: boolean): string {
  return checked ? 'true' : 'false';
}

function isTrueString(value: string | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === 'true';
}

function getValidationMessage(tv: TaggedValue): string | undefined {
  const type = tv.type ?? 'string';
  const raw = (tv.value ?? '').toString();
  const trimmed = raw.trim();

  if (type === 'number') {
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return 'Value is not a valid number.';
  }

  if (type === 'boolean') {
    if (!trimmed) return undefined;
    const v = trimmed.toLowerCase();
    if (v !== 'true' && v !== 'false') return 'Value should be true or false.';
  }

  if (type === 'json') {
    if (!trimmed) return undefined;
    try {
      JSON.parse(raw);
    } catch {
      return 'Value is not valid JSON.';
    }
  }

  return undefined;
}

export function TaggedValuesEditor({
  taggedValues,
  onChange,
  title = 'Tagged values',
  allowNamespaces = true
}: TaggedValuesEditorProps) {
  const list = taggedValues ?? [];

  const validations = useMemo(() => {
    const map = new Map<string, string>();
    for (const tv of list) {
      const msg = getValidationMessage(tv);
      if (msg) map.set(tv.id, msg);
    }
    return map;
  }, [list]);

  function emit(next: TaggedValue[]) {
    onChange(next.length ? next : undefined);
  }

  function addRow() {
    const next: TaggedValue[] = [
      ...list,
      {
        id: createId('tag'),
        ns: undefined,
        key: '',
        type: 'string',
        value: ''
      }
    ];
    emit(next);
  }

  function updateRow(id: string, patch: Partial<TaggedValue>) {
    const next = list.map((tv) => (tv.id === id ? { ...tv, ...patch } : tv));
    emit(next);
  }

  function removeRow(id: string) {
    emit(list.filter((tv) => tv.id !== id));
  }

  function onNsChange(id: string, e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    updateRow(id, { ns: raw.trim() ? raw : undefined });
  }

  function onKeyChange(id: string, e: ChangeEvent<HTMLInputElement>) {
    updateRow(id, { key: e.target.value });
  }

  function onTypeChange(id: string, e: ChangeEvent<HTMLSelectElement>) {
    const type = e.target.value as TaggedValueType;
    const current = list.find((t) => t.id === id);
    if (!current) return;

    // If switching to boolean, default to false when empty/invalid.
    if (type === 'boolean') {
      const raw = (current.value ?? '').trim().toLowerCase();
      const nextValue = raw === 'true' || raw === 'false' ? raw : 'false';
      updateRow(id, { type, value: nextValue });
      return;
    }

    updateRow(id, { type });
  }

  function renderValueEditor(tv: TaggedValue) {
    const type = tv.type ?? 'string';

    if (type === 'boolean') {
      return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={isTrueString(tv.value)}
            onChange={(e) => updateRow(tv.id, { value: toBoolString(e.target.checked) })}
            aria-label="Tagged value boolean"
          />
          <span style={{ opacity: 0.85 }}>{isTrueString(tv.value) ? 'true' : 'false'}</span>
        </label>
      );
    }

    if (type === 'json') {
      return (
        <textarea
          className="textArea"
          style={{ minHeight: 72 }}
          value={tv.value ?? ''}
          onChange={(e) => updateRow(tv.id, { value: e.target.value })}
          aria-label="Tagged value json"
          placeholder={'{\n  "example": true\n}'}
        />
      );
    }

    return (
      <input
        className="textInput"
        value={tv.value ?? ''}
        onChange={(e) => updateRow(tv.id, { value: e.target.value })}
        aria-label="Tagged value value"
        placeholder={type === 'number' ? '123' : ''}
      />
    );
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <p className="panelHint" style={{ margin: 0 }}>
          {title}
        </p>
        <button type="button" className="miniButton" onClick={addRow}>
          Add…
        </button>
      </div>

      {list.length === 0 ? (
        <p className="hintText" style={{ marginTop: 8 }}>
          None
        </p>
      ) : (
        <div className="propertiesGrid" style={{ marginTop: 8 }}>
          {list.map((tv, idx) => {
            const validation = validations.get(tv.id);
            return (
              <div key={tv.id} className="propertiesRow">
                <div className="propertiesKey">Tag {idx + 1}</div>
                <div className="propertiesValue" style={{ fontWeight: 400 }}>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: allowNamespaces ? '1fr 1fr 140px auto' : '1fr 140px auto',
                        gap: 8,
                        alignItems: 'center'
                      }}
                    >
                      {allowNamespaces ? (
                        <input
                          className="textInput"
                          value={tv.ns ?? ''}
                          onChange={(e) => onNsChange(tv.id, e)}
                          aria-label="Tagged value namespace"
                          placeholder="ns"
                        />
                      ) : null}
                      <input
                        className="textInput"
                        value={tv.key}
                        onChange={(e) => onKeyChange(tv.id, e)}
                        aria-label="Tagged value key"
                        placeholder="key"
                      />
                      <select
                        className="selectInput"
                        value={(tv.type ?? 'string') as TaggedValueType}
                        onChange={(e) => onTypeChange(tv.id, e)}
                        aria-label="Tagged value type"
                      >
                        {TAG_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="miniButton"
                        onClick={() => removeRow(tv.id)}
                        aria-label="Remove tagged value"
                        title="Remove"
                      >
                        Remove
                      </button>
                    </div>
                    <div>{renderValueEditor(tv)}</div>
                    {validation ? (
                      <p className="hintText" style={{ margin: 0 }}>
                        {validation}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
