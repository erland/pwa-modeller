import type { Element } from '../../../../domain';
import { useMemo, useState } from 'react';

import { readStereotypeDisplayText, readStereotypes, writeStereotypes } from '../../../../domain/umlStereotypes';
import { useModelStore } from '../../../../store/useModelStore';

import type { ModelActions } from '../actions';
import { PropertyRow } from '../editors/PropertyRow';
import { StereotypePickerDialog } from './StereotypePickerDialog';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function defaultPlaceholder(type: string): string {
  switch (type) {
    case 'uml.interface':
      return 'interface';
    case 'uml.enum':
      return 'enumeration';
    case 'uml.package':
      return 'package';
    default:
      return '';
  }
}

type Props = {
  element: Element;
  actions: ModelActions;
};

/**
 * UML stereotype is semantic (element-level), not view-level.
 */
export function UmlStereotypeSection({ element: el, actions }: Props) {
  const isUml = typeof el.type === 'string' && el.type.startsWith('uml.');

  const raw = el.attrs;
  const base: Record<string, unknown> = isRecord(raw) ? { ...raw } : {};
  const stereoDisplay = readStereotypeDisplayText(base);
  const selected = readStereotypes(base);
  const [isOpen, setIsOpen] = useState(false);

  const availableStereotypes = useModelStore(
    useMemo(
      () => (s) => {
        const m = s.model;
        if (!m) return [];
        const out: string[] = [];
        for (const e of Object.values(m.elements)) {
          if (!e?.attrs) continue;
          out.push(...readStereotypes(e.attrs));
        }
        for (const r of Object.values(m.relationships)) {
          if (!r?.attrs) continue;
          out.push(...readStereotypes(r.attrs));
        }
        return Array.from(new Set(out));
      },
      []
    )
  );

  const commitList = (list: string[]) => {
    const next = writeStereotypes(base, list);

    // If the attrs object becomes empty, store it as undefined.
    const hasKeys = Object.keys(next).length > 0;
    actions.updateElement(el.id, { attrs: hasKeys ? next : undefined });
  };

  if (!isUml) return null;

  return (
    <>
      <p className="panelHint">UML</p>
      <div className="propertiesGrid">
        <PropertyRow label="Stereotype">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="textInput"
                aria-label="UML element stereotypes"
                placeholder={defaultPlaceholder(el.type)}
                value={stereoDisplay}
                readOnly
              />
              <button type="button" className="textButton" onClick={() => setIsOpen(true)}>
                Edit
              </button>
            </div>

            {!!selected.length && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {selected.map((s) => (
                  <span key={s} className="pill">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        </PropertyRow>
      </div>

      <StereotypePickerDialog
        isOpen={isOpen}
        title="UML stereotypes"
        availableStereotypes={availableStereotypes}
        value={selected}
        onClose={() => setIsOpen(false)}
        onConfirm={(list: string[]) => {
          commitList(list);
        }}
      />
    </>
  );
}
