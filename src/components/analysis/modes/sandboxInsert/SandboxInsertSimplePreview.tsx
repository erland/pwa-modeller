import type { Dispatch, SetStateAction } from 'react';

import type { Model } from '../../../../domain';

import { SandboxInsertElementList } from './SandboxInsertElementList';
import type { PreviewState } from './types';

type Props = {
  model: Model;
  preview: PreviewState | null;
  error: string | null;
  existingSet: Set<string>;
  selectedIds: Set<string>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
};

export function SandboxInsertSimplePreview(props: Props) {
  const { model, preview, error, existingSet, selectedIds, setSelectedIds } = props;

  if (!preview) {
    return (
      <p className="crudHint" style={{ marginTop: 8 }}>
        Click “Preview” to see which elements will be inserted.
      </p>
    );
  }

  const candidatesCount = preview.candidates.length;
  const selectedCount = selectedIds.size;

  const selectAllNew = () => {
    const next = new Set<string>();
    for (const c of preview.candidates) {
      if (!c.alreadyInSandbox) next.add(c.id);
    }
    setSelectedIds(next);
  };

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      {error ? <p className="crudHint">{error}</p> : null}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <p className="crudHint" style={{ margin: 0 }}>
          Preview: {candidatesCount} candidate element(s) · Selected: {selectedCount}
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="miniLinkButton" onClick={selectAllNew}>
            Select all new
          </button>
          <button type="button" className="miniLinkButton" onClick={() => setSelectedIds(new Set())}>
            Select none
          </button>
        </div>
      </div>

      {preview.kind === 'intermediates' ? (
        preview.paths.length ? (
          <div style={{ marginTop: 8 }}>
            {preview.paths.map((p, idx) => (
              <div key={idx} style={{ marginBottom: 10, padding: 8, border: '1px solid var(--border)', borderRadius: 8 }}>
                <p className="crudHint" style={{ margin: 0, marginBottom: 6 }}>
                  Path {idx + 1}: {p.path.length} node(s)
                </p>
                {p.intermediates.length ? (
                  <SandboxInsertElementList
                    model={model}
                    elementIds={p.intermediates}
                    existingSet={existingSet}
                    selectedIds={selectedIds}
                    onToggleId={toggleId}
                  />
                ) : (
                  <p className="crudHint" style={{ margin: 0 }}>
                    No intermediate elements in this path.
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : null
      ) : (
        <div style={{ marginTop: 8 }}>
          {preview.groups.length ? (
            preview.groups.map((g) => (
              <div key={g.depth} style={{ marginBottom: 10, padding: 8, border: '1px solid var(--border)', borderRadius: 8 }}>
                <p className="crudHint" style={{ margin: 0, marginBottom: 6 }}>
                  Depth {g.depth}: {g.elementIds.length} element(s)
                </p>
                <SandboxInsertElementList
                  model={model}
                  elementIds={g.elementIds}
                  existingSet={existingSet}
                  selectedIds={selectedIds}
                  onToggleId={toggleId}
                />
              </div>
            ))
          ) : (
            <p className="crudHint" style={{ margin: 0 }}>
              No candidates found.
            </p>
          )}
        </div>
      )}
    </>
  );
}
