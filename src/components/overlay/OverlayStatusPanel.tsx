import { useMemo } from 'react';

import { computeModelSignature } from '../../domain/overlay';
import { useModelStore } from '../../store';
import { loadPersistedOverlayMeta, useOverlayStore } from '../../store/overlay';

type KvRowProps = { label: string; value: string | number | null | undefined; mono?: boolean };

function KvRow({ label, value, mono }: KvRowProps) {
  return (
    <tr>
      <th style={{ width: 220, fontWeight: 700, fontSize: 12, opacity: 0.85, textAlign: 'left', padding: '8px 10px' }}>
        {label}
      </th>
      <td style={{ padding: '8px 10px', fontSize: 12 }} className={mono ? 'mono' : undefined}>
        {value ?? '—'}
      </td>
    </tr>
  );
}

export function OverlayStatusPanel() {
  const model = useModelStore((s) => s.model);

  const overlayStats = useOverlayStore((store) => {
    // Cheap summary only; keep selectors light.
    const entries = store.listEntries();
    return {
      entryCount: entries.length
    };
  });

  const signature = useMemo(() => {
    if (!model) return null;
    return computeModelSignature(model);
  }, [model]);

  const persisted = useMemo(() => {
    if (!signature) return null;
    return loadPersistedOverlayMeta(signature);
  }, [signature]);

  const basis = signature?.startsWith('ext-') ? 'external ids' : signature?.startsWith('int-') ? 'internal ids' : '—';

  const elementCount = model ? Object.keys(model.elements).length : 0;
  const relationshipCount = model ? Object.keys(model.relationships).length : 0;

  return (
    <section className="crudSection" aria-label="Overlay status">
      <div className="crudHeader">
        <div>
          <h2 className="crudTitle">Overlay status</h2>
          <p className="crudHint">
            Read-only overview of overlay data currently in memory and the persistence binding to the active model.
          </p>
        </div>
      </div>

      {!model ? (
        <p className="errorText" style={{ marginTop: 12 }}>
          No model is loaded. Overlay persistence is keyed per model signature, so overlay status will appear once a model is
          available.
        </p>
      ) : null}

      <table className="dataTable" style={{ marginTop: 12 }}>
        <tbody>
          <KvRow label="Model elements" value={model ? elementCount : '—'} />
          <KvRow label="Model relationships" value={model ? relationshipCount : '—'} />
          <KvRow label="Model signature" value={signature ?? '—'} mono />
          <KvRow label="Signature basis" value={signature ? basis : '—'} />
          <KvRow label="Overlay entries (in memory)" value={overlayStats.entryCount} />
          <KvRow label="Persisted entries" value={persisted ? persisted.entryCount : '—'} />
          <KvRow
            label="Persisted saved at"
            value={persisted?.savedAt ? new Date(persisted.savedAt).toLocaleString() : '—'}
          />
        </tbody>
      </table>
    </section>
  );
}
