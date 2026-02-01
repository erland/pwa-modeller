import type { Dispatch, SetStateAction } from 'react';

import type {
  SandboxAddRelatedDirection,
  SandboxInsertIntermediatesMode,
} from '../../workspace/controller/sandboxTypes';

type Props = {
  kind: 'intermediates' | 'related';
  mode: SandboxInsertIntermediatesMode;
  setMode: Dispatch<SetStateAction<SandboxInsertIntermediatesMode>>;
  k: number;
  setK: Dispatch<SetStateAction<number>>;
  maxHops: number;
  setMaxHops: Dispatch<SetStateAction<number>>;
  depth: number;
  setDepth: Dispatch<SetStateAction<number>>;
  direction: SandboxAddRelatedDirection;
  setDirection: Dispatch<SetStateAction<SandboxAddRelatedDirection>>;
};

export function SandboxInsertSimpleOptions(props: Props) {
  const { kind, mode, setMode, k, setK, maxHops, setMaxHops, depth, setDepth, direction, setDirection } = props;

  if (kind === 'related') {
    return (
      <>
        <div className="formRow">
          <label htmlFor="sandbox-related-depth">Depth</label>
          <input
            id="sandbox-related-depth"
            className="textInput"
            type="number"
            min={1}
            max={6}
            value={depth}
            onChange={(e) => setDepth(Number(e.currentTarget.value))}
          />
        </div>

        <div className="formRow">
          <label htmlFor="sandbox-related-direction">Direction</label>
          <select
            id="sandbox-related-direction"
            className="selectInput"
            value={direction}
            onChange={(e) => setDirection(e.currentTarget.value as SandboxAddRelatedDirection)}
          >
            <option value="both">Both</option>
            <option value="outgoing">Outgoing</option>
            <option value="incoming">Incoming</option>
          </select>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="formRow">
        <label htmlFor="sandbox-insert-mode">Mode</label>
        <select
          id="sandbox-insert-mode"
          className="selectInput"
          value={mode}
          onChange={(e) => setMode(e.currentTarget.value as SandboxInsertIntermediatesMode)}
        >
          <option value="shortest">Shortest path</option>
          <option value="topk">Top-K shortest paths</option>
        </select>
      </div>

      <div className="formRow">
        <label htmlFor="sandbox-insert-k">K</label>
        <input
          id="sandbox-insert-k"
          className="textInput"
          type="number"
          min={1}
          max={10}
          value={k}
          disabled={mode !== 'topk'}
          aria-disabled={mode !== 'topk'}
          onChange={(e) => setK(Number(e.currentTarget.value))}
        />
      </div>

      <div className="formRow">
        <label htmlFor="sandbox-insert-maxhops">Max hops</label>
        <input
          id="sandbox-insert-maxhops"
          className="textInput"
          type="number"
          min={1}
          max={16}
          value={maxHops}
          onChange={(e) => setMaxHops(Number(e.currentTarget.value))}
        />
      </div>

      <div className="formRow">
        <label htmlFor="sandbox-insert-direction">Direction</label>
        <select
          id="sandbox-insert-direction"
          className="selectInput"
          value={direction}
          onChange={(e) => setDirection(e.currentTarget.value as SandboxAddRelatedDirection)}
        >
          <option value="both">Both</option>
          <option value="outgoing">Outgoing</option>
          <option value="incoming">Incoming</option>
        </select>
      </div>
    </>
  );
}
