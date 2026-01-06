import type { ExternalIdRef } from '../../../domain';

export type ExternalIdsSummaryProps = {
  externalIds?: ExternalIdRef[];
  title?: string;
  maxInline?: number;
};

export function ExternalIdsSummary({ externalIds, title = 'External IDs', maxInline = 4 }: ExternalIdsSummaryProps) {
  const list = externalIds ?? [];
  const inline = list.slice(0, Math.max(0, maxInline));
  const overflowCount = Math.max(0, list.length - inline.length);

  return (
    <div style={{ marginTop: 14 }}>
      <p className="panelHint" style={{ margin: 0 }}>
        {title}
      </p>

      {list.length === 0 ? (
        <p className="hintText" style={{ marginTop: 8 }}>
          None
        </p>
      ) : (
        <div className="propertiesGrid" style={{ marginTop: 8 }}>
          {inline.map((r, idx) => {
            const key = r.scope ? `${r.system} (${r.scope})` : r.system;
            return (
              <div key={`${r.system}:${r.scope ?? ''}:${r.id}:${idx}`} className="propertiesRow">
                <div className="propertiesKey" title={key}>
                  {key}
                </div>
                <div className="propertiesValue" style={{ fontWeight: 400 }}>
                  {r.id}
                </div>
              </div>
            );
          })}

          {overflowCount > 0 ? (
            <div className="propertiesRow">
              <div className="propertiesKey" />
              <div className="propertiesValue" style={{ fontWeight: 400, opacity: 0.75 }}>
                …and {overflowCount} more
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
