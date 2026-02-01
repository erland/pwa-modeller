import type { Model } from '../../../../domain';

type Props = {
  model: Model;
  elementIds: string[];
  existingSet: Set<string>;
  selectedIds: Set<string>;
  onToggleId: (id: string) => void;
  /** Optional filter to hide some element IDs (e.g. based on search). */
  filterId?: (id: string) => boolean;
  /** If true, elements already in sandbox are disabled. Default true. */
  disableExisting?: boolean;
  /** Optional type label renderer. */
  renderType?: (typeId: string) => string;
  /** Optional extra label suffix for existing nodes. */
  existingSuffix?: string;
};

export function SandboxInsertElementList(props: Props) {
  const {
    model,
    elementIds,
    existingSet,
    selectedIds,
    onToggleId,
    filterId,
    disableExisting = true,
    renderType,
    existingSuffix = ' · already in sandbox',
  } = props;

  const ids = filterId ? elementIds.filter(filterId) : elementIds;

  if (ids.length === 0) {
    return null;
  }

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
      {ids.map((id) => {
        const el = model.elements[id];
        if (!el) return null;
        const already = existingSet.has(id);
        const checked = selectedIds.has(id);
        const disabled = disableExisting && already;

        return (
          <li key={id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              aria-disabled={disabled}
              onChange={() => onToggleId(id)}
            />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span>{el.name || '(unnamed)'}</span>
              <span className="crudHint" style={{ margin: 0 }}>
                {renderType ? renderType(el.type) : el.type}
                {already ? existingSuffix : ''}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
