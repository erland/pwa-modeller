import { useEffect, useMemo, useState } from 'react';

import type { Model, Relationship, RelationshipType } from '../../domain';
import { Dialog } from '../dialog/Dialog';

type CellInfo = {
  rowId: string;
  rowLabel: string;
  colId: string;
  colLabel: string;
  relationshipIds: string[];
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  model: Model;
  cell: CellInfo;
};

function getEndpointLabel(model: Model, elementId: string | undefined, connectorId: string | undefined): string {
  if (elementId) {
    const el = model.elements?.[elementId];
    return el ? `${el.name || '(unnamed)'} (${el.type})` : elementId;
  }
  if (connectorId) return `Connector ${connectorId}`;
  return '(none)';
}

function isDirected(rel: Relationship): boolean {
  const attrs = rel.attrs;
  // ArchiMate RelationshipAttributes uses isDirected; for others, default true.
  if (attrs && typeof attrs === 'object' && 'isDirected' in attrs) {
    const v = (attrs as { isDirected?: unknown }).isDirected;
    if (typeof v === 'boolean') return v;
  }
  return true;
}

export function RelationshipMatrixCellDialog({ isOpen, onClose, model, cell }: Props) {
  const [typeFilter, setTypeFilter] = useState<RelationshipType | ''>('');

  useEffect(() => {
    if (!isOpen) return;
    // Reset filters when opening / switching cells.
    setTypeFilter('');
  }, [isOpen, cell.rowId, cell.colId]);

  const relationships = useMemo(() => {
    const res: Relationship[] = [];
    for (const id of cell.relationshipIds) {
      const r = model.relationships?.[id];
      if (r) res.push(r);
    }
    // Stable ordering: type, then id.
    res.sort((a, b) => (a.type || '').localeCompare(b.type || '') || a.id.localeCompare(b.id));
    return res;
  }, [model, cell.relationshipIds]);

  const availableTypes = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of relationships) {
      m.set(r.type, (m.get(r.type) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([type, count]) => ({ type: type as RelationshipType, count }));
  }, [relationships]);

  const filtered = useMemo(() => {
    if (!typeFilter) return relationships;
    return relationships.filter((r) => r.type === typeFilter);
  }, [relationships, typeFilter]);

  const title = `Cell: ${cell.rowLabel} ↔ ${cell.colLabel}`;

  return (
    <Dialog
      title={title}
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <button type="button" className="shellButton" onClick={onClose}>
          Close
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="crudHint" style={{ marginTop: 0 }}>
          Relationships between <span className="mono">{cell.rowId}</span> and <span className="mono">{cell.colId}</span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, opacity: 0.85 }}>Type:</span>
          <button type="button" className="miniLinkButton" onClick={() => setTypeFilter('')} aria-pressed={!typeFilter}>
            All ({relationships.length})
          </button>
          {availableTypes.map((t) => (
            <button
              key={t.type}
              type="button"
              className="miniLinkButton"
              onClick={() => setTypeFilter((cur) => (cur === t.type ? '' : t.type))}
              aria-pressed={typeFilter === t.type}
              title={`Filter by ${t.type}`}
            >
              {t.type} ({t.count})
            </button>
          ))}
        </div>

        <div style={{ maxHeight: '60vh', overflow: 'auto', border: '1px solid var(--border-1)', borderRadius: 12 }}>
          <table className="dataTable" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th style={{ width: 220 }}>Type</th>
                <th>Source</th>
                <th style={{ width: 40 }} />
                <th>Target</th>
                <th style={{ width: 220 }}>Name / Id</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? (
                filtered.map((r) => {
                  const arrow = isDirected(r) ? '→' : '—';
                  return (
                    <tr key={r.id}>
                      <td className="mono">{r.type}</td>
                      <td title={r.sourceElementId || r.sourceConnectorId || ''}>
                        {getEndpointLabel(model, r.sourceElementId, r.sourceConnectorId)}
                      </td>
                      <td style={{ textAlign: 'center', opacity: 0.8 }}>{arrow}</td>
                      <td title={r.targetElementId || r.targetConnectorId || ''}>
                        {getEndpointLabel(model, r.targetElementId, r.targetConnectorId)}
                      </td>
                      <td title={r.id}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {r.name ? <div>{r.name}</div> : null}
                          <div className="mono" style={{ opacity: 0.75 }}>
                            {r.id}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} style={{ opacity: 0.75 }}>
                    No relationships in this cell.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Dialog>
  );
}
