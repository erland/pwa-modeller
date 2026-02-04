import { useEffect, useMemo, useState } from 'react';

import type { Model, TaggedValue } from '../../domain/types';
import { computeModelSignature } from '../../domain/overlay';
import {
  getEffectiveTagsForElement,
  getEffectiveTagsForRelationship,
  loadRequiredTags,
  parseRequiredTags,
  saveRequiredTags,
  useOverlayStore
} from '../../store/overlay';

function normalizeKey(k: string): string {
  return (k ?? '').toString().trim().toLowerCase();
}

function hasTag(effective: TaggedValue[] | undefined, key: string): boolean {
  const nk = normalizeKey(key);
  if (!nk) return false;
  for (const tv of effective ?? []) {
    if (normalizeKey(tv.key) !== nk) continue;
    if ((tv.value ?? '').toString().trim().length === 0) continue;
    return true;
  }
  return false;
}

type CoverageStats = {
  totalElements: number;
  totalRelationships: number;
  completeElements: number;
  completeRelationships: number;
  perTag: { key: string; elementsWith: number; relationshipsWith: number }[];
};

export function OverlayCoveragePanel({ model }: { model: Model | null }) {
  const overlayVersion = useOverlayStore((s) => s.getVersion());
  const overlayStore = useOverlayStore((s) => s); // stable instance (selector returns store)

  const signature = useMemo(() => (model ? computeModelSignature(model) : ''), [model]);

  const [requiredText, setRequiredText] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<string>('');

  useEffect(() => {
    if (!signature) {
      setRequiredText('');
      setLastSavedAt('');
      return;
    }
    const meta = loadRequiredTags(signature);
    setRequiredText((meta.tags ?? []).join('\n'));
    setLastSavedAt(meta.updatedAt);
  }, [signature]);

  const requiredKeys = useMemo(() => parseRequiredTags(requiredText), [requiredText]);

  const stats: CoverageStats = useMemo(() => {
    if (!model) {
      return {
        totalElements: 0,
        totalRelationships: 0,
        completeElements: 0,
        completeRelationships: 0,
        perTag: []
      };
    }

    const elementIds = Object.keys(model.elements ?? {}).sort();
    const relationshipIds = Object.keys(model.relationships ?? {}).sort();

    const perTagCounts = new Map<string, { e: number; r: number }>();
    for (const k of requiredKeys) perTagCounts.set(k, { e: 0, r: 0 });

    let completeElements = 0;
    let completeRelationships = 0;

    for (const id of elementIds) {
      const el = model.elements[id];
      if (!el) continue;
      const eff = getEffectiveTagsForElement(model, el, overlayStore).effectiveTaggedValues;
      let ok = true;
      for (const k of requiredKeys) {
        const present = hasTag(eff, k);
        if (present) {
          const cur = perTagCounts.get(k);
          if (cur) cur.e++;
        } else {
          ok = false;
        }
      }
      if (requiredKeys.length === 0) ok = true;
      if (ok) completeElements++;
    }

    for (const id of relationshipIds) {
      const rel = model.relationships[id];
      if (!rel) continue;
      const eff = getEffectiveTagsForRelationship(model, rel, overlayStore).effectiveTaggedValues;
      let ok = true;
      for (const k of requiredKeys) {
        const present = hasTag(eff, k);
        if (present) {
          const cur = perTagCounts.get(k);
          if (cur) cur.r++;
        } else {
          ok = false;
        }
      }
      if (requiredKeys.length === 0) ok = true;
      if (ok) completeRelationships++;
    }

    const perTag = requiredKeys.map((k) => ({
      key: k,
      elementsWith: perTagCounts.get(k)?.e ?? 0,
      relationshipsWith: perTagCounts.get(k)?.r ?? 0
    }));

    return {
      totalElements: elementIds.length,
      totalRelationships: relationshipIds.length,
      completeElements,
      completeRelationships,
      perTag
    };
    // overlayVersion ensures recompute when overlay changes
  }, [model, overlayStore, requiredKeys, overlayVersion]);

  const onSaveRequired = () => {
    if (!signature) return;
    const keys = parseRequiredTags(requiredText);
    saveRequiredTags(signature, keys);
    const meta = loadRequiredTags(signature);
    setLastSavedAt(meta.updatedAt);
    setRequiredText((meta.tags ?? []).join('\n'));
  };

  return (
    <section className="crudSection" aria-label="Overlay coverage">
      <div className="crudHeader">
        <div>
          <h2 className="crudTitle">Coverage</h2>
          <p className="crudHint">
            Completeness checks for a set of required tag keys. Coverage uses <span className="mono">effective</span>{' '}
            tagged values (core + overlay).
          </p>
        </div>
      </div>

      {!model ? (
        <p className="errorText" style={{ marginTop: 12 }}>
          No model is loaded.
        </p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                Required tag keys
              </label>
              <textarea
                value={requiredText}
                onChange={(e) => setRequiredText(e.target.value)}
                placeholder="One key per line (or comma/semicolon-separated)"
                style={{ width: '100%', minHeight: 120, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: 12 }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <button type="button" className="btnPrimary" onClick={onSaveRequired}>
                  Save required keys
                </button>
                <span style={{ fontSize: 12, opacity: 0.75 }}>
                  {lastSavedAt ? `Saved: ${new Date(lastSavedAt).toLocaleString()}` : 'Not saved yet'}
                </span>
              </div>
            </div>

            <div>
              <table className="dataTable" style={{ width: '100%' }}>
                <tbody>
                  <tr>
                    <th style={{ width: 240, textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>
                      Required keys
                    </th>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{requiredKeys.length}</td>
                  </tr>
                  <tr>
                    <th style={{ width: 240, textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>
                      Elements complete
                    </th>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>
                      {stats.completeElements} / {stats.totalElements}
                      {stats.totalElements ? ` (${Math.round((stats.completeElements / stats.totalElements) * 100)}%)` : ''}
                    </td>
                  </tr>
                  <tr>
                    <th style={{ width: 240, textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>
                      Relationships complete
                    </th>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>
                      {stats.completeRelationships} / {stats.totalRelationships}
                      {stats.totalRelationships
                        ? ` (${Math.round((stats.completeRelationships / stats.totalRelationships) * 100)}%)`
                        : ''}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <h3 style={{ margin: 0, fontSize: 13 }}>Per-key coverage</h3>
            {requiredKeys.length === 0 ? (
              <p style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                Add one or more required keys to see coverage.
              </p>
            ) : (
              <table className="dataTable" style={{ marginTop: 8 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12 }}>Key</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 12 }}>Elements</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 12 }}>Relationships</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.perTag.map((row) => (
                    <tr key={row.key}>
                      <td style={{ padding: '8px 10px', fontSize: 12 }} className="mono">
                        {row.key}
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: 12, textAlign: 'right' }}>
                        {row.elementsWith} / {stats.totalElements}
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: 12, textAlign: 'right' }}>
                        {row.relationshipsWith} / {stats.totalRelationships}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </section>
  );
}
