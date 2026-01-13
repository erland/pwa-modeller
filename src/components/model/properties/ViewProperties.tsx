import type { ArchimateLayer, Model } from '../../../domain';
import { ARCHIMATE_LAYERS, VIEWPOINTS } from '../../../domain';
import type { FolderOption } from '../../../domain';

import type { Selection } from '../selection';
import type { ModelActions } from './actions';
import { findFolderContaining } from './utils';
import { NameEditorRow } from './editors/NameEditorRow';
import { DocumentationEditorRow } from './editors/DocumentationEditorRow';
import { PropertyRow } from './editors/PropertyRow';
import { ExternalIdsSection } from './sections/ExternalIdsSection';
import { TaggedValuesSection } from './sections/TaggedValuesSection';

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

  const viewpointOptions = VIEWPOINTS.filter((vp) => {
    const hasQualified = vp.allowedElementTypes.some((t) => String(t).includes('.'));
    return view.kind === 'archimate' ? !hasQualified : hasQualified;
  });

  const isCentered = Boolean(view.ownerRef && view.ownerRef.kind === 'archimate');
  const rootFolderId = viewFolders[0]?.id;
  const elementOptions = Object.values(model.elements)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .map((e) => ({ id: e.id, label: e.name }));

  return (
    <div>
      <p className="panelHint">View</p>
      <div className="propertiesGrid">
        <NameEditorRow
          ariaLabel="View property name"
          required
          value={view.name}
          onChange={(next) => actions.updateView(view.id, { name: next ?? '' })}
        />
        <PropertyRow label="Viewpoint">
            <select
              className="selectInput"
              aria-label="View property viewpoint"
              value={view.viewpointId}
              onChange={(e) => actions.updateView(view.id, { viewpointId: e.target.value })}
            >
              {viewpointOptions.map((vp) => (
                <option key={vp.id} value={vp.id}>
                  {vp.name}
                </option>
              ))}
            </select>
            <p className="panelHint" style={{ marginTop: 6 }}>
              {viewpointLabel(view.viewpointId)}
            </p>
        </PropertyRow>        <DocumentationEditorRow
          label="Documentation"
          ariaLabel="View property documentation"
          value={view.documentation}
          onChange={(next) => actions.updateView(view.id, { documentation: next })}
        />
        <div className="propertiesRow">
          <div className="propertiesKey">Placement</div>
          <div className="propertiesValue">
            <select
              className="selectInput"
              aria-label="View property placement"
              value={isCentered ? 'centered' : 'folder'}
              onChange={(e) => {
                const mode = e.target.value;

                if (mode === 'folder') {
                  // If the view is currently centered (and thus not in any folder), move it to root by default.
                  const target = currentFolderId ?? rootFolderId;
                  if (target) actions.moveViewToFolder(view.id, target);
                  return;
                }

                // mode === 'centered'
                const preferred = (view.ownerRef && view.ownerRef.kind === 'archimate' ? view.ownerRef.id : undefined) ?? elementOptions[0]?.id;
                if (preferred) actions.moveViewToElement(view.id, preferred);
              }}
            >
              <option value="folder">In folder</option>
              <option value="centered" disabled={elementOptions.length === 0}>
                Centered on element
              </option>
            </select>

            {!isCentered ? (
              <div style={{ marginTop: 8 }}>
                <select
                  className="selectInput"
                  aria-label="View property folder"
                  value={currentFolderId ?? ''}
                  onChange={(e) => {
                    const targetId = e.target.value;
                    if (targetId) actions.moveViewToFolder(view.id, targetId);
                  }}
                >
                  {!currentFolderId ? <option value="">(choose folder)</option> : null}
                  {viewFolders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{ marginTop: 8 }}>
                <select
                  className="selectInput"
                  aria-label="View property centered element"
                  value={(view.ownerRef && view.ownerRef.kind === 'archimate' ? view.ownerRef.id : '')}
                  onChange={(e) => {
                    const targetId = e.target.value;
                    if (targetId) actions.moveViewToElement(view.id, targetId);
                  }}
                >
                  {elementOptions.length === 0 ? <option value="">(no elements)</option> : null}
                  {elementOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {view.ownerRef && view.ownerRef.kind === 'archimate' ? (
                  <p className="panelHint" style={{ marginTop: 6 }}>
                    Centered on: {model.elements[view.ownerRef.id]?.name ?? view.ownerRef.id}
                  </p>
                ) : null}
              </div>
            )}
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

        {view.kind === 'archimate' ? (
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
                          const nextTags: Partial<Record<ArchimateLayer, string>> = {
                            ...(view.formatting?.layerStyleTags ?? {}),
                          };
                          if (!nextValue) delete nextTags[layer];
                          else nextTags[layer] = nextValue;
                          actions.updateViewFormatting(view.id, { layerStyleTags: nextTags });
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <ExternalIdsSection externalIds={view.externalIds} />

      <TaggedValuesSection
        taggedValues={view.taggedValues}
        onChange={(next) => actions.updateView(view.id, { taggedValues: next })}
        dialogTitle={`View tagged values — ${view.name || view.id}`}
      />

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
