import type { PathsBetweenQueryMode } from '../../../../store';

type Props = {
  pathsMode: PathsBetweenQueryMode;
  onChangePathsMode: (v: PathsBetweenQueryMode) => void;
  maxPaths: number;
  onChangeMaxPaths: (n: number) => void;
  maxPathLength: number | null;
  onChangeMaxPathLength: (n: number | null) => void;
};

export function PathsFilterControls({
  pathsMode,
  onChangePathsMode,
  maxPaths,
  onChangeMaxPaths,
  maxPathLength,
  onChangeMaxPathLength
}: Props) {
  return (
    <>
      <div className="toolbarGroup">
        <label htmlFor="analysis-pathsMode">Path engine</label>
        <select
          id="analysis-pathsMode"
          className="selectInput"
          value={pathsMode}
          onChange={(e) => onChangePathsMode(e.currentTarget.value as PathsBetweenQueryMode)}
          title={
            pathsMode === 'shortest'
              ? 'Enumerates all shortest paths (ties), up to Max paths.'
              : 'Enumerates up to K shortest simple paths (can include longer alternatives). Consider setting Max path length.'
          }
        >
          <option value="shortest">Shortest paths only</option>
          <option value="kShortest">Top-K paths (include longer)</option>
        </select>
        {pathsMode === 'kShortest' ? (
          <div className="crudHint" style={{ marginTop: 6 }}>
            Tip: set <span className="mono">Max path length</span> to keep results fast on dense models.
          </div>
        ) : null}
      </div>

      <div className="toolbarGroup">
        <label htmlFor="analysis-maxPaths">Max paths</label>
        <select
          id="analysis-maxPaths"
          className="selectInput"
          value={String(maxPaths)}
          onChange={(e) => onChangeMaxPaths(Number(e.currentTarget.value))}
        >
          {[1, 2, 3, 5, 10, 15, 20, 30, 50].map((n) => (
            <option key={n} value={String(n)}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div className="toolbarGroup">
        <label htmlFor="analysis-maxPathLength">Max path length</label>
        <select
          id="analysis-maxPathLength"
          className="selectInput"
          value={maxPathLength === null ? '' : String(maxPathLength)}
          onChange={(e) => {
            const v = e.currentTarget.value;
            onChangeMaxPathLength(v ? Number(v) : null);
          }}
        >
          <option value="">No cap</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15].map((n) => (
            <option key={n} value={String(n)}>
              {n}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
