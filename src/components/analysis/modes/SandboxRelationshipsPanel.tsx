import { useMemo } from 'react';

import type { SandboxRelationshipVisibilityMode, SandboxRelationshipsState } from '../workspace/controller/sandboxTypes';

export function SandboxRelationshipsPanel({
  nodesCount,
  maxNodes,
  relationships,
  edgeRouting,
  baseVisibleRelationshipsCount,
  availableRelationshipTypes,
  selectedTypeCount,
  enabledTypes,
  explicitIdsCount,
  onSetShowRelationships,
  onSetRelationshipMode,
  onSetEdgeRouting,
  onToggleEnabledRelationshipType,
  onSetEnabledRelationshipTypes,
}: {
  nodesCount: number;
  maxNodes: number;
  relationships: SandboxRelationshipsState;
  edgeRouting: 'straight' | 'orthogonal';
  baseVisibleRelationshipsCount: number;
  availableRelationshipTypes: string[];
  selectedTypeCount: number;
  enabledTypes: string[];
  explicitIdsCount: number;
  onSetShowRelationships: (show: boolean) => void;
  onSetRelationshipMode: (mode: SandboxRelationshipVisibilityMode) => void;
  onSetEdgeRouting: (routing: 'straight' | 'orthogonal') => void;
  onToggleEnabledRelationshipType: (type: string) => void;
  onSetEnabledRelationshipTypes: (types: string[]) => void;
}) {
  const enabledTypeSet = useMemo(() => new Set(enabledTypes), [enabledTypes]);

  return (
    <div className="toolbarGroup" style={{ minWidth: 240 }}>
      <label>Relationships</label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.9 }}>
        <input
          type="checkbox"
          checked={relationships.show}
          onChange={(e) => onSetShowRelationships(e.currentTarget.checked)}
        />
        <span>Show relationships</span>
      </label>

      {relationships.show ? (
        <select
          className="selectInput"
          value={relationships.mode}
          onChange={(e) => onSetRelationshipMode(e.currentTarget.value as SandboxRelationshipVisibilityMode)}
          aria-label="Relationship visibility mode"
        >
          <option value="all">All</option>
          <option value="types">Filter by type</option>
          <option value="explicit">Explicit set</option>
        </select>
      ) : null}

      {relationships.show ? (
        <select
          className="selectInput"
          value={edgeRouting}
          onChange={(e) => onSetEdgeRouting(e.currentTarget.value as 'straight' | 'orthogonal')}
          aria-label="Relationship routing style"
          title="How to draw relationships in the sandbox"
        >
          <option value="straight">Edges: Straight</option>
          <option value="orthogonal">Edges: Orthogonal</option>
        </select>
      ) : null}

      <p className="crudHint" style={{ margin: 0 }}>
        {relationships.show
          ? relationships.mode === 'explicit'
            ? `${baseVisibleRelationshipsCount} relationships between ${nodesCount}/${maxNodes} node(s) · explicit: ${explicitIdsCount} id(s)`
            : `${baseVisibleRelationshipsCount} relationships between ${nodesCount}/${maxNodes} node(s)`
          : 'Relationships are hidden'}
      </p>

      {relationships.show && relationships.mode === 'types' ? (
        <div style={{ marginTop: 10 }}>
          <label>
            Types ({selectedTypeCount}/{availableRelationshipTypes.length})
          </label>
          <div
            style={{
              maxHeight: 160,
              overflow: 'auto',
              border: '1px solid var(--border-1)',
              borderRadius: 10,
              padding: '8px 10px',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            {availableRelationshipTypes.length === 0 ? (
              <p className="crudHint" style={{ margin: 0 }}>
                No relationships found between sandbox nodes.
              </p>
            ) : (
              availableRelationshipTypes.map((t) => (
                <label
                  key={t}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.9, marginBottom: 6 }}
                >
                  <input
                    type="checkbox"
                    checked={enabledTypeSet.has(t)}
                    onChange={() => onToggleEnabledRelationshipType(t)}
                  />
                  <span title={t}>{t}</span>
                </label>
              ))
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="miniLinkButton"
              onClick={() => onSetEnabledRelationshipTypes(availableRelationshipTypes)}
              disabled={availableRelationshipTypes.length === 0}
              aria-disabled={availableRelationshipTypes.length === 0}
            >
              All
            </button>
            <button type="button" className="miniLinkButton" onClick={() => onSetEnabledRelationshipTypes([])}>
              None
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
