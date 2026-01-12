import { useEffect, useMemo, useState } from 'react';

import type { TaggedValue } from '../../../domain';
import { Dialog } from '../../dialog/Dialog';

import { TaggedValuesEditor } from './TaggedValuesEditor';

export type TaggedValuesSummaryProps = {
  /** Current tagged values from the model */
  taggedValues?: TaggedValue[];
  /** Persist changes back to the model */
  onChange: (next: TaggedValue[] | undefined) => void;
  /** Section title shown in the properties panel */
  title?: string;
  /** Dialog title */
  dialogTitle?: string;
  /** Whether to allow editing namespaces */
  allowNamespaces?: boolean;
  /** Max number of rows to show inline before collapsing */
  maxInline?: number;
};

function formatInlineValue(tv: TaggedValue): string {
  const type = tv.type ?? 'string';
  const raw = (tv.value ?? '').toString();
  const trimmed = raw.trim();
  if (!trimmed) return '';

  if (type === 'json') {
    // Avoid filling the panel with JSON. Show a compact hint.
    return trimmed.length > 32 ? `${trimmed.slice(0, 32)}…` : trimmed;
  }

  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed;
}

export function TaggedValuesSummary({
  taggedValues,
  onChange,
  title = 'Tagged values',
  dialogTitle = 'Tagged values',
  allowNamespaces = true,
  maxInline = 4
}: TaggedValuesSummaryProps) {
  const list = useMemo(() => taggedValues ?? [], [taggedValues]);

  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<TaggedValue[] | undefined>(taggedValues);

  // When opening, take a fresh snapshot so Cancel works as expected.
  useEffect(() => {
    if (!isOpen) return;
    setDraft(taggedValues);
  }, [isOpen, taggedValues]);

  const inline = useMemo(() => list.slice(0, Math.max(0, maxInline)), [list, maxInline]);
  const overflowCount = Math.max(0, list.length - inline.length);

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <p className="panelHint" style={{ margin: 0 }}>
          {title}
        </p>
        <button type="button" className="miniButton" onClick={() => setIsOpen(true)}>
          {list.length ? 'Edit…' : 'Add…'}
        </button>
      </div>

      {list.length === 0 ? (
        <p className="hintText" style={{ marginTop: 8 }}>
          None
        </p>
      ) : (
        <div className="propertiesGrid" style={{ marginTop: 8 }}>
          {inline.map((tv) => (
            <div key={tv.id} className="propertiesRow">
              <div className="propertiesKey" title={tv.ns ? `ns: ${tv.ns}` : undefined}>
                {tv.key || '(empty key)'}
              </div>
              <div className="propertiesValue" style={{ fontWeight: 400 }}>
                <div
                  title={tv.value ?? ''}
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {formatInlineValue(tv)}
                </div>
              </div>
            </div>
          ))}

          {overflowCount > 0 ? (
            <div className="propertiesRow">
              <div className="propertiesKey" />
              <div className="propertiesValue" style={{ fontWeight: 400, opacity: 0.75 }}>
                …and {overflowCount} more
              </div>
            </div>
          ) : null}
        </div>
      )}

      <Dialog
        title={dialogTitle}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="shellButton" onClick={() => setIsOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="shellButton"
              onClick={() => {
                onChange(draft);
                setIsOpen(false);
              }}
            >
              Apply
            </button>
          </div>
        }
      >
        <TaggedValuesEditor taggedValues={draft} onChange={setDraft} allowNamespaces={allowNamespaces} />
      </Dialog>
    </div>
  );
}
