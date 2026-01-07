import type { Model, ViewObject } from '../../../domain';
import type { Selection } from '../selection';
import type { ModelActions } from './actions';

type Props = {
  model: Model;
  viewId: string;
  objectId: string;
  actions: ModelActions;
  onSelect?: (selection: Selection) => void;
};

function titleFor(obj: ViewObject): string {
  switch (obj.type) {
    case 'Note':
      return 'Note';
    case 'Label':
      return 'Label';
    case 'GroupBox':
      return 'Group box';
    case 'Divider':
      return 'Divider';
    default:
      return 'View object';
  }
}

export function ViewObjectProperties({ model, viewId, objectId, actions, onSelect }: Props) {
  const view = model.views[viewId];
  if (!view) return <p className="panelHint">View not found.</p>;

  const obj = view.objects?.[objectId];
  if (!obj) return <p className="panelHint">View object not found.</p>;

  const canEditText = obj.type === 'Note' || obj.type === 'Label';

  return (
    <div>
      <p className="panelHint">{titleFor(obj)}</p>

      <div className="propertiesGrid">
        <div className="propertiesRow">
          <div className="propertiesKey">View</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            <button
              type="button"
              className="miniButton"
              aria-label={`Select view ${view.name}`}
              onClick={() => onSelect?.({ kind: 'view', viewId })}
            >
              {view.name}
            </button>
          </div>
        </div>

        <div className="propertiesRow">
          <div className="propertiesKey">Type</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            {obj.type}
          </div>
        </div>

        <div className="propertiesRow">
          <div className="propertiesKey">Name</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            <input
              className="textInput"
              aria-label="View object property name"
              value={obj.name ?? ''}
              placeholder={obj.type === 'GroupBox' ? 'Title (optional)' : ''}
              onChange={(e) => actions.updateViewObject(viewId, objectId, { name: e.target.value || undefined })}
            />
          </div>
        </div>

        {canEditText && (
          <div className="propertiesRow">
            <div className="propertiesKey">Text</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <textarea
                className="textArea"
                aria-label="View object property text"
                value={obj.text ?? ''}
                onChange={(e) => actions.updateViewObject(viewId, objectId, { text: e.target.value || undefined })}
              />
            </div>
          </div>
        )}

        <div className="propertiesRow">
          <div className="propertiesKey">Style</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ minWidth: 54, opacity: 0.8 }}>Fill</span>
                <input
                  className="textInput"
                  aria-label="View object style fill"
                  value={obj.style?.fill ?? ''}
                  placeholder="#fff7c2"
                  onChange={(e) => actions.updateViewObject(viewId, objectId, { style: { fill: e.target.value || undefined } })}
                />
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ minWidth: 54, opacity: 0.8 }}>Stroke</span>
                <input
                  className="textInput"
                  aria-label="View object style stroke"
                  value={obj.style?.stroke ?? ''}
                  placeholder="#666"
                  onChange={(e) => actions.updateViewObject(viewId, objectId, { style: { stroke: e.target.value || undefined } })}
                />
              </label>

              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ minWidth: 54, opacity: 0.8 }}>Align</span>
                <select
                  className="textInput"
                  aria-label="View object style text align"
                  value={obj.style?.textAlign ?? ''}
                  onChange={(e) =>
                    actions.updateViewObject(viewId, objectId, {
                      style: { textAlign: (e.target.value || undefined) as any }
                    })
                  }
                >
                  <option value="">(default)</option>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          className="shellButton"
          onClick={() => {
            const ok = window.confirm('Delete this view object?');
            if (!ok) return;
            actions.deleteViewObject(viewId, objectId);
            onSelect?.({ kind: 'view', viewId });
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
