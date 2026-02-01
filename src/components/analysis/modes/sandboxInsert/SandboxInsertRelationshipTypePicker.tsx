import { toggleString } from './utils';

type Props = {
  allTypes: string[];
  enabledTypes: string[];
  setEnabledTypes: (next: string[] | ((prev: string[]) => string[])) => void;
  labelForType?: (t: string) => string;
  columns?: 1 | 2 | 3;
};

export function SandboxInsertRelationshipTypePicker(props: Props) {
  const { allTypes, enabledTypes, setEnabledTypes, labelForType, columns = 2 } = props;

  const label = (t: string) => (labelForType ? labelForType(t) : t);

  return (
    <div className="formRow">
      <label>Relationship types</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="miniLinkButton"
          onClick={() => setEnabledTypes(allTypes)}
          disabled={allTypes.length === 0}
          aria-disabled={allTypes.length === 0}
        >
          All
        </button>
        <button
          type="button"
          className="miniLinkButton"
          onClick={() => setEnabledTypes([])}
          disabled={allTypes.length === 0}
          aria-disabled={allTypes.length === 0}
        >
          None
        </button>
        <span className="crudHint" style={{ margin: 0 }}>
          {enabledTypes.length}/{allTypes.length}
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: 6,
          marginTop: 6,
        }}
      >
        {allTypes.map((t) => {
          const checked = enabledTypes.includes(t);
          return (
            <label key={t} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
              <input type="checkbox" checked={checked} onChange={() => setEnabledTypes((prev) => toggleString(prev, t))} />
              <span>{label(t)}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
