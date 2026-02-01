import type { AnalysisDirection } from '../../../../domain';

type Props = {
  direction: AnalysisDirection;
  onChangeDirection: (dir: AnalysisDirection) => void;
};

export function DirectionFilterControl({ direction, onChangeDirection }: Props) {
  return (
    <div className="toolbarGroup">
      <label htmlFor="analysis-direction">Direction</label>
      <select
        id="analysis-direction"
        className="selectInput"
        value={direction}
        onChange={(e) => onChangeDirection(e.currentTarget.value as AnalysisDirection)}
      >
        <option value="both">Both</option>
        <option value="outgoing">Downstream (outgoing)</option>
        <option value="incoming">Upstream (incoming)</option>
      </select>
    </div>
  );
}
