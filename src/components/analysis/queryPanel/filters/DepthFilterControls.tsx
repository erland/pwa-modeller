import type { AnalysisMode } from '../../AnalysisQueryPanel';

type Props = {
  mode: AnalysisMode;
  maxDepth: number;
  onChangeMaxDepth: (n: number) => void;
  includeStart: boolean;
  onChangeIncludeStart: (v: boolean) => void;
};

export function DepthFilterControls({
  mode,
  maxDepth,
  onChangeMaxDepth,
  includeStart,
  onChangeIncludeStart
}: Props) {
  if (mode === 'matrix' || mode === 'paths') {
    return null;
  }

  return (
    <div className="toolbarGroup">
      <label htmlFor="analysis-maxDepth">{mode === 'traceability' ? 'Expand depth' : 'Max depth'}</label>
      <select
        id="analysis-maxDepth"
        className="selectInput"
        value={String(maxDepth)}
        onChange={(e) => onChangeMaxDepth(Number(e.currentTarget.value))}
      >
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <option key={n} value={String(n)}>
            {n}
          </option>
        ))}
      </select>
      {mode === 'related' ? (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.85 }}>
          <input
            type="checkbox"
            checked={includeStart}
            onChange={(e) => onChangeIncludeStart(e.currentTarget.checked)}
          />
          Include start element
        </label>
      ) : null}
    </div>
  );
}
