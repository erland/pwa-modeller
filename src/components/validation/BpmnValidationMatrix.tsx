import type { CSSProperties } from 'react';
import { useMemo } from 'react';

import type { ElementType, Model, RelationshipType } from '../../domain';
import { getElementTypeLabel, getElementTypeOptionsForKind } from '../../domain';
import { buildBpmnRelationshipMatrix } from '../../domain/config/bpmnPalette';

type Props = {
  model: Model;
};

function shortRel(rt: RelationshipType): string {
  if (rt === 'bpmn.sequenceFlow') return 'SF';
  if (rt === 'bpmn.messageFlow') return 'MF';
  if (rt === 'bpmn.association') return 'A';
  return String(rt);
}

function pillStyle(rt: RelationshipType): CSSProperties {
  // Keep styles inline to avoid adding new global CSS.
  const base: CSSProperties = {
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: 999,
    border: '1px solid var(--borderColor, rgba(0,0,0,0.2))',
    fontSize: 12,
    lineHeight: '18px',
    marginRight: 4,
    whiteSpace: 'nowrap',
  };
  // Light tinting via currentColor-ish; avoid hard-coded colors.
  if (rt === 'bpmn.sequenceFlow') return { ...base };
  if (rt === 'bpmn.messageFlow') return { ...base, borderStyle: 'dashed' };
  if (rt === 'bpmn.association') return { ...base, opacity: 0.9 };
  return base;
}

function bpmnMatrixTypesFromCatalog(): ElementType[] {
  // Pull from the catalog but remove containers and global defs. The matrix is about connectable semantics.
  const all = getElementTypeOptionsForKind('bpmn').map((o) => o.id as ElementType);
  const exclude = new Set<ElementType>(['bpmn.pool', 'bpmn.lane', 'bpmn.message', 'bpmn.signal', 'bpmn.error', 'bpmn.escalation']);
  return all.filter((t) => typeof t === 'string' && t.startsWith('bpmn.') && !exclude.has(t));
}

function bpmnMatrixTypesForModel(model: Model): ElementType[] {
  const exclude = new Set<ElementType>(['bpmn.pool', 'bpmn.lane', 'bpmn.message', 'bpmn.signal', 'bpmn.error', 'bpmn.escalation']);
  const present = new Set<ElementType>();
  for (const el of Object.values(model.elements ?? {})) {
    const t = el.type as ElementType;
    if (typeof t === 'string' && t.startsWith('bpmn.') && !exclude.has(t)) present.add(t);
  }
  const list = Array.from(present);
  // If the model doesn't contain any BPMN types yet, fall back to the full catalog list.
  return list.length ? list.sort() : bpmnMatrixTypesFromCatalog();
}

export function BpmnValidationMatrix({ model }: Props) {
  const types = useMemo(() => bpmnMatrixTypesForModel(model), [model]);

  const matrix = useMemo(() => {
    // Build from catalog types so it stays in sync when you add BPMN concepts.
    return buildBpmnRelationshipMatrix(types);
  }, [types]);

  const relLegend: RelationshipType[] = ['bpmn.sequenceFlow', 'bpmn.messageFlow', 'bpmn.association'];

  return (
    <div aria-label="BPMN validation matrix" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h3 style={{ margin: 0 }}>BPMN relationship matrix</h3>
        <p className="panelHint" style={{ marginTop: 6 }}>
          Shows which relationship types are allowed between BPMN element types in this tool.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }} aria-label="Legend">
          <span className="panelHint">Legend:</span>
          {relLegend.map((rt) => (
            <span key={rt} style={pillStyle(rt)} title={rt}>
              {shortRel(rt)}
            </span>
          ))}
        </div>
      </div>

      <div style={{ overflow: 'auto', border: '1px solid var(--borderColor, rgba(0,0,0,0.12))', borderRadius: 8 }}>
        <table className="dataTable" aria-label="BPMN relationship matrix table" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, background: 'var(--panelBg, #fff)', zIndex: 2 }}>Source \ Target</th>
              {types.map((t) => (
                <th key={t} className="mono" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', minWidth: 34 }}>
                  {getElementTypeLabel(t) ?? t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {types.map((s) => (
              <tr key={s}>
                <td
                  className="mono"
                  style={{ position: 'sticky', left: 0, background: 'var(--panelBg, #fff)', zIndex: 1, fontWeight: 600 }}
                >
                  {getElementTypeLabel(s) ?? s}
                </td>
                {types.map((t) => {
                  const entry = matrix.get(s)?.get(t);
                  const allowed = entry ? Array.from(entry.core) : [];
                  return (
                    <td key={`${s}__${t}`} style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      {allowed.length ? (
                        <span>
                          {allowed
                            .filter((rt) => String(rt).startsWith('bpmn.'))
                            .map((rt) => (
                              <span key={rt} style={pillStyle(rt)} title={rt}>
                                {shortRel(rt)}
                              </span>
                            ))}
                        </span>
                      ) : (
                        <span style={{ opacity: 0.25 }}>·</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="panelHint" style={{ margin: 0 }}>
        Note: The matrix is scoped to the BPMN subset currently supported by the tool (Sequence Flow, Message Flow, Association).
      </p>
    </div>
  );
}
