import { useEffect, useMemo, useState } from 'react';

import { Dialog } from '../../../dialog/Dialog';
import { toStereotypeDisplayName } from '../../../../domain/umlStereotypes';

type Option = {
  value: string;
  label: string;
  hint?: string;
};

function buildOptions(values: string[]): Option[] {
  const uniq = Array.from(new Set(values.filter(Boolean)));
  const byShort = new Map<string, string[]>();
  for (const v of uniq) {
    const short = toStereotypeDisplayName(v);
    const list = byShort.get(short) ?? [];
    list.push(v);
    byShort.set(short, list);
  }

  const out: Option[] = [];
  for (const [short, fullList] of byShort.entries()) {
    const sorted = [...fullList].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    for (const full of sorted) {
      const hint = sorted.length > 1 ? full : full.includes('::') ? full.split('::').slice(0, -1).join('::') : undefined;
      out.push({ value: full, label: short, hint });
    }
  }

  return out.sort((a, b) => {
    const c = a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    return c !== 0 ? c : a.value.localeCompare(b.value, undefined, { sensitivity: 'base' });
  });
}

type Props = {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  availableStereotypes: string[];
  value: string[];
  onConfirm: (next: string[]) => void;
};

export function StereotypePickerDialog({ title, isOpen, onClose, availableStereotypes, value, onConfirm }: Props) {
  const options = useMemo(() => buildOptions(availableStereotypes), [availableStereotypes]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string[]>(value);
  const [newItem, setNewItem] = useState('');

  // Reset local state when opening.
  useEffect(() => {
    if (!isOpen) return;
    setQ('');
    setSelected(value);
    setNewItem('');
  }, [isOpen, value]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return options;
    return options.filter((o) => o.label.toLowerCase().includes(qq) || o.value.toLowerCase().includes(qq));
  }, [options, q]);

  const toggle = (v: string) => {
    setSelected((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  };

  const addNew = () => {
    const t = newItem.trim();
    if (!t) return;
    // Store as entered (usually unqualified).
    setSelected((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setNewItem('');
  };

  return (
    <Dialog
      title={title}
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="textButton" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primaryButton"
            onClick={() => {
              const stable = Array.from(new Set(selected.map((s) => s.trim()).filter(Boolean)));
              onConfirm(stable);
              onClose();
            }}
          >
            Apply
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="textInput"
            type="search"
            placeholder="Filter stereotypes"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-autofocus="true"
          />
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="textInput"
            placeholder="Add new stereotype"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addNew();
              }
            }}
          />
          <button type="button" className="textButton" onClick={addNew}>
            Add
          </button>
        </div>

        <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}>
          {filtered.length ? (
            <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtered.map((o) => (
                <label
                  key={o.value}
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    padding: '6px 6px',
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                >
                  <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ fontSize: 13 }}>{o.label}</div>
                    {o.hint ? <div style={{ fontSize: 11, opacity: 0.7 }}>{o.hint}</div> : null}
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <div style={{ padding: 10, opacity: 0.75, fontSize: 12 }}>No matches.</div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
