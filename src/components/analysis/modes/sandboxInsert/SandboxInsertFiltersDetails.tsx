import type { Dispatch, SetStateAction } from 'react';

import {
  getElementTypeLabel,
  getRelationshipTypeLabel,
} from '../../../../domain';
import type {
  SandboxAddRelatedDirection,
  SandboxInsertIntermediatesMode,
} from '../../workspace/controller/sandboxTypes';

import { SandboxInsertRelationshipTypePicker } from './SandboxInsertRelationshipTypePicker';
import { toggleString } from './utils';

type Props = {
  kind: 'intermediates' | 'related';
  allElementTypes: string[];
  enabledElementTypes: string[];
  setEnabledElementTypes: Dispatch<SetStateAction<string[]>>;

  relationshipTypes: string[];
  enabledRelationshipTypes: string[];
  setEnabledRelationshipTypes: Dispatch<SetStateAction<string[]>>;

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

export function SandboxInsertFiltersDetails(props: Props) {
  const {
    kind,
    allElementTypes,
    enabledElementTypes,
    setEnabledElementTypes,
    relationshipTypes,
    enabledRelationshipTypes,
    setEnabledRelationshipTypes,
    mode,
    setMode,
    k,
    setK,
    maxHops,
    setMaxHops,
    depth,
    setDepth,
    direction,
    setDirection,
  } = props;

  return (
    <details
      style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 10,
      }}
    >
      <summary style={{ cursor: 'pointer', fontSize: 12, opacity: 0.85 }}>Filters</summary>

      <div className="formGrid" style={{ marginTop: 10 }}>
        {kind === 'intermediates' ? (
          <div className="formRow">
            <label>Path options</label>
            <div className="sandboxInsertRow">
              <div className="sandboxInsertField sandboxInsertField--mode">
                <span className="crudHint" style={{ margin: 0 }}>
                  Mode
                </span>
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

              {mode === 'topk' ? (
                <div className="sandboxInsertField sandboxInsertField--k">
                  <span className="crudHint" style={{ margin: 0 }}>
                    K
                  </span>
                  <input
                    id="sandbox-insert-k"
                    className="textInput"
                    type="number"
                    min={1}
                    max={10}
                    value={k}
                    onChange={(e) => setK(Number(e.currentTarget.value))}
                  />
                </div>
              ) : null}

              <div className="sandboxInsertField sandboxInsertField--maxHops">
                <span className="crudHint" style={{ margin: 0 }}>
                  Max hops
                </span>
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

              <div className="sandboxInsertField sandboxInsertField--direction">
                <span className="crudHint" style={{ margin: 0 }}>
                  Direction
                </span>
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
            </div>
          </div>
        ) : (
          <div className="formRow">
            <label>Filters</label>
            <div className="sandboxInsertRow">
              <div className="sandboxInsertField sandboxInsertField--depth">
                <span className="crudHint" style={{ margin: 0 }}>
                  Depth
                </span>
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

              <div className="sandboxInsertField sandboxInsertField--direction">
                <span className="crudHint" style={{ margin: 0 }}>
                  Direction
                </span>
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
            </div>
          </div>
        )}

        <SandboxInsertRelationshipTypePicker
          allTypes={relationshipTypes}
          enabledTypes={enabledRelationshipTypes}
          setEnabledTypes={setEnabledRelationshipTypes}
          labelForType={getRelationshipTypeLabel}
          columns={2}
        />

        <div className="formRow">
          <label>Element types</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="miniLinkButton"
              onClick={() => setEnabledElementTypes(allElementTypes)}
              disabled={allElementTypes.length === 0}
              aria-disabled={allElementTypes.length === 0}
            >
              All
            </button>
            <button
              type="button"
              className="miniLinkButton"
              onClick={() => setEnabledElementTypes([])}
              disabled={allElementTypes.length === 0}
              aria-disabled={allElementTypes.length === 0}
            >
              None
            </button>
            <span className="crudHint" style={{ margin: 0 }}>
              {enabledElementTypes.length}/{allElementTypes.length}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, marginTop: 6 }}>
            {allElementTypes.map((t) => {
              const checked = enabledElementTypes.includes(t);
              return (
                <label key={t} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                  <input type="checkbox" checked={checked} onChange={() => setEnabledElementTypes((prev) => toggleString(prev, t))} />
                  <span>{getElementTypeLabel(t)}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </details>
  );
}
