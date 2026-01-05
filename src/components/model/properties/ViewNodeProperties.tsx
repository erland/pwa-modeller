import type { Model } from '../../../domain';
import type { FolderOption } from '../../../domain';
import { ARCHIMATE_LAYERS, ELEMENT_TYPES } from '../../../domain';
import type { ModelActions } from './actions';
import { findFolderContaining } from './utils';

type Props = {
  model: Model;
  viewId: string;
  elementId: string;
  actions: ModelActions;
  elementFolders: FolderOption[];
};

export function ViewNodeProperties({ model, viewId, elementId, actions, elementFolders }: Props) {
  const view = model.views[viewId];
  const element = model.elements[elementId];
  const node = view?.layout?.nodes.find((n) => n.elementId === elementId);

  if (!view || !element || !node) {
    return (
      <div>
        <h2 className="panelTitle">Properties</h2>
        <p className="panelHint">Select something to edit its properties.</p>
      </div>
    );
  }

  const currentFolderId = findFolderContaining(model, 'element', element.id);

  return (
    <div>
      <h2 className="panelTitle">Node formatting</h2>
      <p className="panelHint" style={{ marginTop: 6 }}>
        {element.name} <span style={{ opacity: 0.75 }}>in</span> {view.name}
      </p>

      <div className="fieldGroup">
        <label className="fieldLabel">
          <input
            type="checkbox"
            checked={Boolean(node.highlighted)}
            onChange={(e) => actions.updateViewNodeLayout(view.id, element.id, { highlighted: e.target.checked })}
          />{' '}
          Highlight
        </label>
      </div>

      <div className="fieldGroup">
        <label className="fieldLabel" htmlFor="node-style-tag">
          Style tag
        </label>
        <input
          id="node-style-tag"
          aria-label="Node style tag"
          className="textInput"
          placeholder="e.g. Critical"
          value={node.styleTag ?? ''}
          onChange={(e) => actions.updateViewNodeLayout(view.id, element.id, { styleTag: e.target.value || undefined })}
        />
        <p className="panelHint">View-only label; does not change the underlying element.</p>
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-2)' }}>
        <h2 className="panelTitle">Element properties</h2>

        <p className="panelHint" style={{ marginTop: 6 }}>
          Editing the underlying element (affects all views).
        </p>

        <div className="propertiesGrid">
          <div className="propertiesRow">
            <div className="propertiesKey">Name</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <input
                className="textInput"
                aria-label="Element property name"
                value={element.name}
                onChange={(e) => actions.updateElement(element.id, { name: e.target.value })}
              />
            </div>
          </div>

          <div className="propertiesRow">
            <div className="propertiesKey">Type</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="Element property type"
                value={element.type}
                onChange={(e) => actions.updateElement(element.id, { type: e.target.value as any })}
              >
                {ELEMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="propertiesRow">
            <div className="propertiesKey">Layer</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="Element property layer"
                value={element.layer}
                onChange={(e) => actions.updateElement(element.id, { layer: e.target.value as any })}
              >
                {ARCHIMATE_LAYERS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="propertiesRow">
            <div className="propertiesKey">Description</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <textarea
                className="textArea"
                aria-label="Element property description"
                value={element.description ?? ''}
                onChange={(e) => actions.updateElement(element.id, { description: e.target.value || undefined })}
              />
            </div>
          </div>

          <div className="propertiesRow">
            <div className="propertiesKey">Docs</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <textarea
                className="textArea"
                aria-label="Element property documentation"
                value={element.documentation ?? ''}
                onChange={(e) => actions.updateElement(element.id, { documentation: e.target.value || undefined })}
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
                  if (targetId) actions.moveElementToFolder(element.id, targetId);
                }}
              >
                {elementFolders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
