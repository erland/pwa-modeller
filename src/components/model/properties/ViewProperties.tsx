import type { Model } from '../../../domain';
import { ARCHIMATE_LAYERS, VIEWPOINTS } from '../../../domain';
import type { FolderOption } from '../../../domain';

import type { Selection } from '../selection';
import type { ModelActions } from './actions';
import { findFolderContaining } from './utils';

type Props = {
  model: Model;
  viewId: string;
  viewFolders: FolderOption[];
  actions: ModelActions;
  onSelect?: (selection: Selection) => void;
};

export function ViewProperties({ model, viewId, viewFolders, actions, onSelect }: Props) {
  const view = model.views[viewId];
  if (!view) return <p className="panelHint">View not found.</p>;

  const currentFolderId = findFolderContaining(model, 'view', view.id);
  const viewpointLabel = (id: string) => VIEWPOINTS.find((v) => v.id === id)?.name ?? id;

  return (
    <div>
      <p className="panelHint">View</p>
      <div className="propertiesGrid">
        <div className="propertiesRow">
          <div className="propertiesKey">Name</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            <input
              className="textInput"
              aria-label="View property name"
              value={view.name}
              onChange={(e) => actions.updateView(view.id, { name: e.target.value })}
            />
          </div>
        </div>
        <div className="propertiesRow">
          <div className="propertiesKey">Viewpoint</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            <select
              className="selectInput"
              aria-label="View property viewpoint"
              value={view.viewpointId}
              onChange={(e) => actions.updateView(view.id, { viewpointId: e.target.value })}
            >
              {VIEWPOINTS.map((vp) => (
                <option key={vp.id} value={vp.id}>
                  {vp.name}
                </option>
              ))}
            </select>
            <p className="panelHint" style={{ marginTop: 6 }}>
              {viewpointLabel(view.viewpointId)}
            </p>
          </div>
        </div>
        <div className="propertiesRow">
          <div className="propertiesKey">Description</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            <textarea
              className="textArea"
              aria-label="View property description"
              value={view.description ?? ''}
              onChange={(e) => actions.updateView(view.id, { description: e.target.value || undefined })}
            />
          </div>
        </div>
        <div className="propertiesRow">
          <div className="propertiesKey">Docs</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            <textarea
              className="textArea"
              aria-label="View property documentation"
              value={view.documentation ?? ''}
              onChange={(e) => actions.updateView(view.id, { documentation: e.target.value || undefined })}
            />
          </div>
        </div>
        <div className="propertiesRow">
          <div className="propertiesKey">Folder</div>
          <div className="propertiesValue">
            <select
              className="selectInput"
              value={currentFolderId ?? ''}
              onChange={(e) => {
                const targetId = e.target.value;
                if (targetId) actions.moveViewToFolder(view.id, targetId);
              }}
            >
              {!currentFolderId ? (
                <option value="">{view.centerElementId ? '(centered on element)' : '(not in folder)'}</option>
              ) : null}
              {viewFolders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
            {view.centerElementId ? (
              <p className="panelHint" style={{ marginTop: 6 }}>
                Centered on: {model.elements[view.centerElementId]?.name ?? view.centerElementId}
              </p>
            ) : null}
          </div>
        </div>

        <div className="propertiesRow">
          <div className="propertiesKey">Snap</div>
          <div className="propertiesValue">
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={view.formatting?.snapToGrid ?? true}
                onChange={(e) => actions.updateViewFormatting(view.id, { snapToGrid: e.target.checked })}
              />
              <span>Snap to grid</span>
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <span className="panelHint" style={{ margin: 0 }}>
                Grid size
              </span>
              <input
                aria-label="Grid size"
                type="number"
                min={2}
                className="textInput"
                style={{ width: 100 }}
                value={view.formatting?.gridSize ?? 20}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  actions.updateViewFormatting(view.id, { gridSize: Number.isFinite(n) && n > 1 ? n : 20 });
                }}
              />
            </div>
          </div>
        </div>

        <div className="propertiesRow">
          <div className="propertiesKey">Defaults</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            <div className="panelHint" style={{ margin: 0 }}>
              Default style tag per layer
            </div>
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              {ARCHIMATE_LAYERS.map((layer) => {
                const value = view.formatting?.layerStyleTags?.[layer] ?? '';
                return (
                  <div
                    key={layer}
                    style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, alignItems: 'center' }}
                  >
                    <div className="panelHint" style={{ margin: 0 }}>
                      {layer}
                    </div>
                    <input
                      aria-label={`Default style tag ${layer}`}
                      className="textInput"
                      placeholder="(none)"
                      value={value}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        const nextTags = { ...(view.formatting?.layerStyleTags ?? {}) } as Record<string, string>;
                        if (!nextValue) delete nextTags[layer];
                        else nextTags[layer] = nextValue;
                        actions.updateViewFormatting(view.id, { layerStyleTags: nextTags as any });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          className="shellButton"
          onClick={() => {
            const id = actions.cloneView(view.id);
            if (id) onSelect?.({ kind: 'view', viewId: id });
          }}
        >
          Duplicate view
        </button>
        <button
          type="button"
          className="shellButton"
          onClick={() => {
            const ok = window.confirm('Delete this view?');
            if (!ok) return;
            actions.deleteView(view.id);
          }}
        >
          Delete view
        </button>
      </div>
    </div>
  );
}
