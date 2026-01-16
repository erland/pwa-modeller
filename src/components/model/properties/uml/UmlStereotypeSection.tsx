import type { Element } from '../../../../domain';

import type { ModelActions } from '../actions';
import { PropertyRow } from '../editors/PropertyRow';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asTrimmedOrUndef(v: string): string | undefined {
  const s = v.trim();
  return s.length ? s : undefined;
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
  if (typeof el.type !== 'string' || !el.type.startsWith('uml.')) return null;

  const raw = el.attrs;
  const base: Record<string, unknown> = isRecord(raw) ? { ...raw } : {};
  const stereo = typeof base.stereotype === 'string' ? base.stereotype : '';

  const commit = (nextValue: string) => {
    const v = asTrimmedOrUndef(nextValue);
    const next: Record<string, unknown> = { ...base };
    if (v) next.stereotype = v;
    else delete next.stereotype;

    // If the attrs object becomes empty, store it as undefined.
    const hasKeys = Object.keys(next).length > 0;
    actions.updateElement(el.id, { attrs: hasKeys ? next : undefined });
  };

  return (
    <>
      <p className="panelHint">UML</p>
      <div className="propertiesGrid">
        <PropertyRow label="Stereotype">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <input
              className="textInput"
              aria-label="UML element stereotype"
              placeholder={defaultPlaceholder(el.type)}
              value={stereo}
              onChange={(e) => commit(e.target.value)}
            />
            <div style={{ fontSize: 12, opacity: 0.75 }}>Shown as «stereotype». Leave blank for default.</div>
          </div>
        </PropertyRow>
      </div>
    </>
  );
}
