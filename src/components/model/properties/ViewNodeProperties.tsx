import type { Model } from '../../../domain';
import type { FolderOption } from '../../../domain';
import type { ModelActions } from './actions';
import type { Selection } from '../selection';
import { ElementProperties } from './ElementProperties';

type Props = {
  model: Model;
  viewId: string;
  elementId: string;
  actions: ModelActions;
  elementFolders: FolderOption[];
  onSelect?: (selection: Selection) => void;
};

export function ViewNodeProperties({ model, viewId, elementId, actions, elementFolders, onSelect }: Props) {
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
        <h2 className="panelTitle">Element</h2>
        <p className="panelHint" style={{ marginTop: 6 }}>
          Editing the underlying element (affects all views).
        </p>
        <ElementProperties
          model={model}
          elementId={element.id}
          actions={actions}
          elementFolders={elementFolders}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}
