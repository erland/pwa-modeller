import { useMemo, useState, type ReactNode } from 'react';

import type { Model, Element, Relationship } from '../../domain/types';
import { buildOverlayModelExternalIdIndex, computeModelSignature } from '../../domain/overlay';
import { dedupeExternalIds } from '../../domain/externalIds';
import { resolveOverlayAgainstModel, useOverlayStore } from '../../store/overlay';

type LimitedListProps<T> = {
  title: string;
  items: T[];
  limit?: number;
  renderItem: (item: T, idx: number) => ReactNode;
  emptyText?: string;
};

function LimitedList<T>({ title, items, limit = 50, renderItem, emptyText }: LimitedListProps<T>) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, limit);
  const remaining = items.length - visible.length;

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 13 }}>{title}</h3>
        <span style={{ fontSize: 12, opacity: 0.7 }}>({items.length})</span>
        {items.length > limit ? (
          <button
            type="button"
            className="btnSecondary"
            style={{ marginLeft: 'auto' }}
            onClick={() => setShowAll((s) => !s)}
          >
            {showAll ? 'Show less' : `Show all (${items.length})`}
          </button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>{emptyText ?? 'None.'}</p>
      ) : (
        <table className="dataTable" style={{ marginTop: 8 }}>
          <tbody>
            {visible.map((it, idx) => (
              <tr key={idx}>{renderItem(it, idx)}</tr>
            ))}
            {remaining > 0 ? (
              <tr>
                <td colSpan={6} style={{ fontSize: 12, opacity: 0.7, padding: '8px 10px' }}>
                  … and {remaining} more
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      )}
    </div>
  );
}

function elementLabel(el: Element | undefined, id: string): string {
  if (!el) return id;
  const name = el.name?.trim();
  const type = el.type;
  return name ? `${name} (${type})` : `${id} (${type})`;
}

function relationshipLabel(rel: Relationship | undefined, id: string): string {
  if (!rel) return id;
  const name = rel.name?.trim();
  const type = rel.type;
  const src = rel.sourceElementId ?? rel.sourceConnectorId ?? '∅';
  const tgt = rel.targetElementId ?? rel.targetConnectorId ?? '∅';
  const base = `${type} ${src} → ${tgt}`;
  return name ? `${name} (${base})` : `${id} (${base})`;
}

type Collision = {
  kind: 'element' | 'relationship';
  externalKey: string;
  targets: string[];
};

function computeMissingExternalIds(model: Model | null): { elements: string[]; relationships: string[] } {
  if (!model) return { elements: [], relationships: [] };
  const missingElements: string[] = [];
  const missingRels: string[] = [];

  for (const id of Object.keys(model.elements ?? {}).sort()) {
    const el = model.elements[id];
    const refs = el ? dedupeExternalIds(el.externalIds) : [];
    if (!refs.length) missingElements.push(id);
  }

  for (const id of Object.keys(model.relationships ?? {}).sort()) {
    const rel = model.relationships[id];
    const refs = rel ? dedupeExternalIds(rel.externalIds) : [];
    if (!refs.length) missingRels.push(id);
  }

  return { elements: missingElements, relationships: missingRels };
}

function computeCollisions(model: Model | null): Collision[] {
  if (!model) return [];
  const idx = buildOverlayModelExternalIdIndex(model);
  const collisions: Collision[] = [];

  for (const [k, targets] of idx.entries()) {
    const els = targets.filter((t) => t.kind === 'element').map((t) => t.id);
    const rels = targets.filter((t) => t.kind === 'relationship').map((t) => t.id);

    if (els.length > 1) collisions.push({ kind: 'element', externalKey: k, targets: els.sort() });
    if (rels.length > 1) collisions.push({ kind: 'relationship', externalKey: k, targets: rels.sort() });
  }

  collisions.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.externalKey.localeCompare(b.externalKey);
  });

  return collisions;
}

export function OverlayDiagnosticsPanel({ model }: { model: Model | null }) {
  const overlayEntries = useOverlayStore((s) => s.listEntries());

  const signature = useMemo(() => (model ? computeModelSignature(model) : null), [model]);

  const resolveReport = useMemo(() => {
    if (!model) return null;
    const idx = buildOverlayModelExternalIdIndex(model);
    return resolveOverlayAgainstModel(overlayEntries, idx);
  }, [model, overlayEntries]);

  const missing = useMemo(() => computeMissingExternalIds(model), [model]);

  const collisions = useMemo(() => computeCollisions(model), [model]);

  const summary = useMemo(() => {
    if (!model) return null;
    return {
      overlayEntryCount: overlayEntries.length,
      attached: resolveReport?.counts.attached ?? 0,
      orphan: resolveReport?.counts.orphan ?? 0,
      ambiguous: resolveReport?.counts.ambiguous ?? 0,
      missingElementIds: missing.elements.length,
      missingRelationshipIds: missing.relationships.length,
      collisions: collisions.length
    };
  }, [model, overlayEntries.length, resolveReport, missing, collisions.length]);

  return (
    <section className="crudSection" aria-label="Overlay diagnostics">
      <div className="crudHeader">
        <div>
          <h2 className="crudTitle">Diagnostics</h2>
          <p className="crudHint">Read-only checks to help you bind overlay data reliably to the current model.</p>
        </div>
      </div>

      {!model ? (
        <p className="errorText" style={{ marginTop: 12 }}>
          No model is loaded.
        </p>
      ) : (
        <>
          <table className="dataTable" style={{ marginTop: 12 }}>
            <tbody>
              <tr>
                <th style={{ width: 240, textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>
                  Model signature
                </th>
                <td style={{ padding: '8px 10px', fontSize: 12 }} className="mono">
                  {signature ?? '—'}
                </td>
              </tr>
              <tr>
                <th style={{ width: 240, textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>
                  Overlay entries
                </th>
                <td style={{ padding: '8px 10px', fontSize: 12 }}>{summary?.overlayEntryCount ?? 0}</td>
              </tr>
              <tr>
                <th style={{ width: 240, textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>
                  Resolve (attached / orphan / ambiguous)
                </th>
                <td style={{ padding: '8px 10px', fontSize: 12 }}>
                  {summary ? `${summary.attached} / ${summary.orphan} / ${summary.ambiguous}` : '—'}
                </td>
              </tr>
              <tr>
                <th style={{ width: 240, textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>
                  Model objects missing external IDs
                </th>
                <td style={{ padding: '8px 10px', fontSize: 12 }}>
                  {summary ? `${summary.missingElementIds} elements, ${summary.missingRelationshipIds} relationships` : '—'}
                </td>
              </tr>
              <tr>
                <th style={{ width: 240, textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>
                  External ID collisions
                </th>
                <td style={{ padding: '8px 10px', fontSize: 12 }}>{summary?.collisions ?? 0}</td>
              </tr>
            </tbody>
          </table>

          <LimitedList
            title="Orphan overlay entries"
            items={resolveReport?.orphan ?? []}
            emptyText="All overlay entries resolve to at least one model object."
            renderItem={(o) => (
              <>
                <td style={{ padding: '8px 10px', fontSize: 12 }} className="mono">
                  {o.entryId}
                </td>
                <td style={{ padding: '8px 10px', fontSize: 12 }} className="mono">
                  {o.externalKeys.join(', ') || '—'}
                </td>
              </>
            )}
          />

          <LimitedList
            title="Ambiguous overlay entries"
            items={resolveReport?.ambiguous ?? []}
            emptyText="No ambiguous matches were detected."
            renderItem={(a) => (
              <>
                <td style={{ padding: '8px 10px', fontSize: 12 }} className="mono">
                  {a.entryId}
                </td>
                <td style={{ padding: '8px 10px', fontSize: 12 }} className="mono">
                  {a.viaExternalKeys.join(', ') || '—'}
                </td>
                <td style={{ padding: '8px 10px', fontSize: 12 }}>
                  {a.candidates
                    .map((c) => {
                      if (c.kind === 'element') return elementLabel(model.elements?.[c.id], c.id);
                      return relationshipLabel(model.relationships?.[c.id], c.id);
                    })
                    .join(' | ')}
                </td>
              </>
            )}
          />

          <LimitedList
            title="Model elements missing external IDs"
            items={missing.elements}
            emptyText="All elements have at least one external id (or the model has no elements)."
            renderItem={(id) => (
              <>
                <td style={{ padding: '8px 10px', fontSize: 12 }} className="mono">
                  {id}
                </td>
                <td style={{ padding: '8px 10px', fontSize: 12 }}>
                  {elementLabel(model.elements?.[id], id)}
                </td>
              </>
            )}
          />

          <LimitedList
            title="Model relationships missing external IDs"
            items={missing.relationships}
            emptyText="All relationships have at least one external id (or the model has no relationships)."
            renderItem={(id) => (
              <>
                <td style={{ padding: '8px 10px', fontSize: 12 }} className="mono">
                  {id}
                </td>
                <td style={{ padding: '8px 10px', fontSize: 12 }}>
                  {relationshipLabel(model.relationships?.[id], id)}
                </td>
              </>
            )}
          />

          <LimitedList
            title="External ID collisions"
            items={collisions}
            emptyText="No collisions detected (each external key maps to at most one element and at most one relationship)."
            renderItem={(c) => (
              <>
                <td style={{ padding: '8px 10px', fontSize: 12 }}>
                  {c.kind}
                </td>
                <td style={{ padding: '8px 10px', fontSize: 12 }} className="mono">
                  {c.externalKey}
                </td>
                <td style={{ padding: '8px 10px', fontSize: 12 }}>
                  {c.targets
                    .slice(0, 10)
                    .map((id) => (c.kind === 'element' ? elementLabel(model.elements?.[id], id) : relationshipLabel(model.relationships?.[id], id)))
                    .join(' | ')}
                  {c.targets.length > 10 ? ` | … +${c.targets.length - 10}` : ''}
                </td>
              </>
            )}
          />
        </>
      )}
    </section>
  );
}
