import type { Model } from '../../../../domain';

type Props =
  | {
      kind: 'intermediates';
      model: Model;
      sourceElementId: string;
      targetElementId: string;
      contextLabel?: string;
      contextRelationshipType?: string;
    }
  | {
      kind: 'related';
      model: Model;
      anchorElementIds: string[];
      contextLabel?: string;
    };

export function SandboxInsertContextRow(props: Props) {
  if (props.kind === 'intermediates') {
    const { model, sourceElementId, targetElementId, contextLabel, contextRelationshipType } = props;
    return (
      <div className="formRow">
        <label>{contextLabel || 'Between'}</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="crudHint" style={{ margin: 0 }}>
            {model.elements[sourceElementId]?.name || sourceElementId}
          </span>
          <span className="crudHint" style={{ margin: 0 }}>
            →
          </span>
          <span className="crudHint" style={{ margin: 0 }}>
            {model.elements[targetElementId]?.name || targetElementId}
          </span>
          {contextRelationshipType ? (
            <span className="crudHint" style={{ margin: 0 }}>
              · {contextRelationshipType}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  const { model, anchorElementIds, contextLabel } = props;
  const shown = anchorElementIds
    .filter((id) => Boolean(model.elements[id]))
    .slice(0, 3)
    .map((id) => model.elements[id]?.name || id);
  const more = Math.max(0, anchorElementIds.length - shown.length);

  return (
    <div className="formRow">
      <label>{contextLabel || 'From'}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {shown.map((name) => (
          <span key={name} className="crudHint" style={{ margin: 0 }}>
            {name}
          </span>
        ))}
        {more > 0 ? (
          <span className="crudHint" style={{ margin: 0 }}>
            · +{more} more
          </span>
        ) : null}
      </div>
    </div>
  );
}
