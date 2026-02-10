import type { Model } from '../../../../../domain';
import {
  buildElementChildrenIndex,
  buildElementParentFolderIndex,
  buildElementParentIndex,
  canSetParent,
  getElementContainmentPathIds,
  getElementContainmentPathLabel,
} from '../../../../../domain';

import type { Selection } from '../../../selection';
import type { ModelActions } from '../../actions';

type Props = {
  model: Model;
  elementId: string;
  actions: ModelActions;
  currentFolderId: string | null;
  onSelect?: (selection: Selection) => void;
};

export function ElementContainmentSection({ model, elementId, actions, currentFolderId, onSelect }: Props) {
  const el = model.elements[elementId];
  if (!el) return null;

  const parentIdx = buildElementParentIndex(model);
  const childrenIdx = buildElementChildrenIndex(model);
  const elementParentFolder = buildElementParentFolderIndex(model);

  const parentId = el.parentElementId ?? null;

  const sameFolderElementIds = Object.keys(model.elements).filter((id) => elementParentFolder.get(id) === currentFolderId);

  const candidateParents = sameFolderElementIds
    .filter((id) => id !== el.id)
    .filter((id) => canSetParent(model, el.id, id));

  candidateParents.sort((a, b) => {
    const la = getElementContainmentPathLabel(model, a, parentIdx, { includeSelf: true });
    const lb = getElementContainmentPathLabel(model, b, parentIdx, { includeSelf: true });
    return la.localeCompare(lb);
  });

  const children = (childrenIdx.get(el.id) ?? []).slice();
  children.sort((a, b) => {
    const na = (model.elements[a]?.name ?? a).toString();
    const nb = (model.elements[b]?.name ?? b).toString();
    return na.localeCompare(nb);
  });

  const pathIds = getElementContainmentPathIds(model, el.id, parentIdx, { includeSelf: true });
  const onSelectSafe = onSelect ?? (() => undefined);

  return (
    <>
      <p className="panelHint">Hierarchy</p>

      <div className="propertiesGrid">
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ opacity: 0.8 }}>Breadcrumbs:</span>
            <button
              type="button"
              className="linkButton"
              onClick={() => actions.detachElementToRoot(el.id)}
              title="Detach to root"
            >
              Root
            </button>
            {pathIds.slice(0, -1).map((id) => {
              const a = model.elements[id];
              const label = (a?.name ?? id).toString();
              return (
                <span key={id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ opacity: 0.5 }}>/</span>
                  <button
                    type="button"
                    className="linkButton"
                    onClick={() => onSelectSafe({ kind: 'element', elementId: id })}
                    title="Select"
                  >
                    {label}
                  </button>
                </span>
              );
            })}
            <span style={{ opacity: 0.5 }}>/</span>
            <span style={{ fontWeight: 600 }}>{(el.name ?? el.id).toString()}</span>
          </div>
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ minWidth: 120, opacity: 0.8 }}>Parent element</span>
            <select
              className="selectInput"
              value={parentId ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                actions.moveElementToParent(el.id, v ? v : null);
              }}
              style={{ flex: 1 }}
            >
              <option value="">(root)</option>
              {candidateParents.map((id) => {
                const label = getElementContainmentPathLabel(model, id, parentIdx, { includeSelf: true });
                return (
                  <option key={id} value={id}>
                    {label}
                  </option>
                );
              })}
            </select>

            {parentId ? (
              <button type="button" className="shellButton" onClick={() => actions.detachElementToRoot(el.id)}>
                Detach
              </button>
            ) : null}
          </div>

          {parentId && elementParentFolder.get(parentId) !== currentFolderId ? (
            <p className="panelHint" style={{ marginTop: 6 }}>
              Note: parent is in a different folder. The navigator shows containment only within a folder.
            </p>
          ) : null}
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ opacity: 0.8 }}>Children</span>
            {children.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {children.map((id) => {
                  const c = model.elements[id];
                  const label = (c?.name ?? id).toString();
                  const crossFolder = elementParentFolder.get(id) !== currentFolderId;
                  return (
                    <div key={id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button
                        type="button"
                        className="linkButton"
                        onClick={() => onSelectSafe({ kind: 'element', elementId: id })}
                        title="Select"
                      >
                        {label}
                      </button>

                      {crossFolder ? <span style={{ opacity: 0.7 }} title="Child is in another folder">(other folder)</span> : null}

                      <div style={{ flex: 1 }} />

                      <button
                        type="button"
                        className="shellButton"
                        onClick={() => actions.moveElementToParent(id, null)}
                        title="Detach child to root"
                      >
                        Detach
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <span style={{ opacity: 0.7 }}>(none)</span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
