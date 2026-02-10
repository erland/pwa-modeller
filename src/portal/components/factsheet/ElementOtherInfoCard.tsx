import { Card } from './FactSheetPrimitives';
import { readTaggedValue } from '../../utils/taggedValues';
import { safeJsonStringify } from '../../utils/safeJsonStringify';

export function ElementOtherInfoCard(props: { taggedValues: unknown; attrs: unknown }) {
  const taggedValues = props.taggedValues;
  const attrs = props.attrs;

  return (
    <Card title="Other information">
      <div style={{ display: 'grid', gap: 10 }}>
        {Array.isArray(taggedValues) && taggedValues.length ? (
          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Tagged values</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {taggedValues
                .map((tv) => readTaggedValue(tv))
                .filter(Boolean)
                .map((tv, idx) => {
                  const t = tv as { label: string; type?: string; value: string };
                  return (
                    <div
                      key={`${t.label}-${idx}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(140px, 1fr) 2fr',
                        gap: 10,
                        alignItems: 'baseline',
                      }}
                    >
                      <div
                        style={{
                          fontFamily:
                            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                          opacity: 0.9,
                        }}
                      >
                        {t.label}
                        {t.type ? <span style={{ opacity: 0.7 }}> ({t.type})</span> : null}
                      </div>
                      <div style={{ wordBreak: 'break-word' }}>{t.value}</div>
                    </div>
                  );
                })}
            </div>
          </div>
        ) : (
          <div style={{ opacity: 0.7 }}>(No tagged values)</div>
        )}

        {attrs != null ? (
          <details>
            <summary style={{ cursor: 'pointer', opacity: 0.85 }}>Raw attributes</summary>
            <pre
              style={{
                marginTop: 8,
                padding: 10,
                borderRadius: 10,
                border: '1px solid var(--borderColor, rgba(0,0,0,0.12))',
                overflow: 'auto',
              }}
            >
              {safeJsonStringify(attrs)}
            </pre>
          </details>
        ) : null}
      </div>
    </Card>
  );
}
