import * as React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { usePortalStore } from '../store/usePortalStore';
import { getElementFactSheetData, resolveElementIdFromExternalId } from '../indexes/portalIndexes';

type PortalElementPageProps = { mode: 'internalId' } | { mode: 'externalId' };

function Card(props: { title?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ padding: 12, border: '1px solid var(--borderColor, rgba(0,0,0,0.12))', borderRadius: 12 }}>
      {props.title ? (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <div style={{ fontWeight: 800 }}>{props.title}</div>
          {props.right ? <div>{props.right}</div> : null}
        </div>
      ) : null}
      {props.children}
    </div>
  );
}

function Pill(props: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 999,
        border: '1px solid var(--borderColor, rgba(0,0,0,0.12))',
        fontSize: 12,
        opacity: 0.9
      }}
    >
      {props.children}
    </span>
  );
}

function SmallButton(props: { onClick?: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={props.title}
      onClick={props.onClick}
      style={{
        padding: '4px 8px',
        borderRadius: 10,
        border: '1px solid var(--borderColor, rgba(0,0,0,0.12))',
        background: 'transparent',
        cursor: 'pointer'
      }}
    >
      {props.children}
    </button>
  );
}

async function copyText(text: string): Promise<boolean> {
  const t = (text ?? '').trim();
  if (!t) return false;

  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    // Best-effort fallback
    try {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function formatTaggedValue(tv: any): string {
  if (!tv) return '';
  const ns = (tv.ns ?? '').trim();
  const key = (tv.key ?? '').trim();
  const type = (tv.type ?? '').trim();
  const value = String(tv.value ?? '');
  const label = ns ? `${ns}:${key}` : key;
  return type ? `${label} (${type}) = ${value}` : `${label} = ${value}`;
}

function safeJsonStringify(value: any, maxLen = 40000): string {
  try {
    const s = JSON.stringify(value, null, 2);
    if (s.length <= maxLen) return s;
    return `${s.slice(0, maxLen)}\n…(truncated)…`;
  } catch {
    return String(value);
  }
}

export default function PortalElementPage(props: PortalElementPageProps) {
  const params = useParams();
  const { datasetMeta, model, indexes } = usePortalStore();
  const [copied, setCopied] = useState<string | null>(null);

  const label = useMemo(() => {
    if (props.mode === 'externalId') return params.externalId ?? '';
    return params.id ?? '';
  }, [params, props.mode]);

  const resolvedElementId = useMemo(() => {
    if (!datasetMeta || !model || !indexes) return null;
    if (props.mode === 'internalId') return params.id ?? null;
    const ext = params.externalId ?? '';
    return ext ? resolveElementIdFromExternalId(indexes, ext) : null;
  }, [datasetMeta, indexes, model, params.externalId, params.id, props.mode]);

  const data = useMemo(() => {
    if (!datasetMeta || !model || !indexes || !resolvedElementId) return null;
    return getElementFactSheetData(model, indexes, resolvedElementId);
  }, [datasetMeta, indexes, model, resolvedElementId]);

  const internalLink = useMemo(() => {
    if (!data) return '';
    return `${location.origin}${location.pathname}#/portal/e/${encodeURIComponent(data.elementId)}`;
  }, [data]);

  const bestExternalIdKey = useMemo(() => {
    if (!data?.externalIdKeys?.length) return '';
    return data.externalIdKeys[0];
  }, [data]);

  const externalLink = useMemo(() => {
    if (!bestExternalIdKey) return '';
    return `${location.origin}${location.pathname}#/portal/e/ext/${encodeURIComponent(bestExternalIdKey)}`;
  }, [bestExternalIdKey]);

  const onCopy = useCallback(async (kind: string, value: string) => {
    const ok = await copyText(value);
    setCopied(ok ? kind : 'copy-failed');
    window.setTimeout(() => setCopied(null), 1200);
  }, []);

  const elementDisplayName = data?.element?.name || '(unnamed)';
  const elementType = data ? String(data.element?.type ?? '') : '';
  const elementKind = data?.element?.kind;
  const elementLayer = data?.element?.layer;

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            <Link to="/portal">Portal</Link>
            <span style={{ opacity: 0.6 }}> / </span>
            <span>Element</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>{data ? elementDisplayName : 'Element'}</h2>
            {data ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Pill>
                  <code>{elementType || 'Unknown'}</code>
                </Pill>
                {elementKind ? <Pill>{elementKind}</Pill> : null}
                {elementLayer ? <Pill>{elementLayer}</Pill> : null}
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {data ? (
            <>
              <SmallButton title="Copy internal link" onClick={() => onCopy('internal-link', internalLink)}>
                Copy link
              </SmallButton>
              {bestExternalIdKey ? (
                <SmallButton title="Copy externalId link" onClick={() => onCopy('external-link', externalLink)}>
                  Copy externalId link
                </SmallButton>
              ) : null}
            </>
          ) : null}
          {copied ? <span style={{ fontSize: 12, opacity: 0.75 }}>{copied === 'copy-failed' ? 'Copy failed' : 'Copied'}</span> : null}
        </div>
      </div>

      {!datasetMeta ? (
        <Card>
          <strong>No dataset loaded.</strong>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            Use <em>Change dataset</em> in the top bar to point the portal to a hosted <code>latest.json</code>.
          </div>
        </Card>
      ) : !model || !indexes ? (
        <Card>
          <strong>Dataset is loading…</strong>
        </Card>
      ) : !resolvedElementId ? (
        <Card>
          <strong>Element not found.</strong>
          {props.mode === 'externalId' ? (
            <div style={{ marginTop: 6, opacity: 0.85 }}>
              No match for externalId <code>{params.externalId}</code>.
            </div>
          ) : (
            <div style={{ marginTop: 6, opacity: 0.85 }}>
              No match for id <code>{params.id}</code>.
            </div>
          )}
        </Card>
      ) : !data ? (
        <Card>
          <strong>Element not found in model.</strong>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, alignItems: 'start' }}>
          {/* Main column */}
          <div style={{ display: 'grid', gap: 12 }}>
            <Card title="Summary">
              {data.element.documentation ? (
                <div style={{ whiteSpace: 'pre-wrap' }}>{data.element.documentation}</div>
              ) : (
                <div style={{ opacity: 0.7 }}>(No description)</div>
              )}
            </Card>

            <Card title="Relationships">
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Outgoing</div>
                  {data.relations.outgoing.length ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {data.relations.outgoing.map((g) => (
                        <div key={`out-${g.relType}`}>
                          <div style={{ opacity: 0.85, marginBottom: 4 }}>
                            <code>{g.relType}</code> <span style={{ opacity: 0.7 }}>· {g.items.length}</span>
                          </div>
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {g.items.map((it) => (
                              <li key={it.id} style={{ marginBottom: 4 }}>
                                {it.otherElementId ? (
                                  <Link to={`/portal/e/${encodeURIComponent(it.otherElementId)}`}>{it.otherElementName || it.otherElementId}</Link>
                                ) : (
                                  <span style={{ opacity: 0.7 }}>(non-element endpoint)</span>
                                )}
                                <span style={{ opacity: 0.75 }}> — </span>
                                <span style={{ opacity: 0.85 }}>
                                  <code>{it.type}</code>
                                  {it.name ? <span style={{ opacity: 0.85 }}> · {it.name}</span> : null}
                                </span>
                                {it.documentation ? (
                                  <div style={{ opacity: 0.75, fontSize: 12, marginTop: 2, whiteSpace: 'pre-wrap' }}>{it.documentation}</div>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ opacity: 0.7 }}>(none)</div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid var(--borderColor, rgba(0,0,0,0.12))', paddingTop: 10 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Incoming</div>
                  {data.relations.incoming.length ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {data.relations.incoming.map((g) => (
                        <div key={`in-${g.relType}`}>
                          <div style={{ opacity: 0.85, marginBottom: 4 }}>
                            <code>{g.relType}</code> <span style={{ opacity: 0.7 }}>· {g.items.length}</span>
                          </div>
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {g.items.map((it) => (
                              <li key={it.id} style={{ marginBottom: 4 }}>
                                {it.otherElementId ? (
                                  <Link to={`/portal/e/${encodeURIComponent(it.otherElementId)}`}>{it.otherElementName || it.otherElementId}</Link>
                                ) : (
                                  <span style={{ opacity: 0.7 }}>(non-element endpoint)</span>
                                )}
                                <span style={{ opacity: 0.75 }}> — </span>
                                <span style={{ opacity: 0.85 }}>
                                  <code>{it.type}</code>
                                  {it.name ? <span style={{ opacity: 0.85 }}> · {it.name}</span> : null}
                                </span>
                                {it.documentation ? (
                                  <div style={{ opacity: 0.75, fontSize: 12, marginTop: 2, whiteSpace: 'pre-wrap' }}>{it.documentation}</div>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ opacity: 0.7 }}>(none)</div>
                  )}
                </div>
              </div>
            </Card>

            <Card title="Used in views">
              {data.usedInViews.length ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {data.usedInViews.map((v) => (
                    <li key={v.id}>
                      <Link to={`/portal/v/${encodeURIComponent(v.id)}`}>{v.name}</Link> <span style={{ opacity: 0.7 }}>({v.kind})</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ opacity: 0.7 }}>(none)</div>
              )}
            </Card>
          </div>

          {/* Sidebar */}
          <div style={{ display: 'grid', gap: 12 }}>
            <Card
              title="Identifiers"
              right={
                <SmallButton title="Copy internal id" onClick={() => onCopy('id', data.elementId)}>
                  Copy id
                </SmallButton>
              }
            >
              <div style={{ display: 'grid', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Internal id</div>
                  <code style={{ wordBreak: 'break-all' }}>{data.elementId}</code>
                </div>

                <div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>External ids</div>
                  {data.externalIdKeys.length ? (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {data.externalIdKeys.map((k) => (
                        <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <Link to={`/portal/e/ext/${encodeURIComponent(k)}`} style={{ wordBreak: 'break-all' }}>
                            {k}
                          </Link>
                          <SmallButton title="Copy external id" onClick={() => onCopy('externalId', k)}>
                            Copy
                          </SmallButton>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ opacity: 0.7 }}>(none)</div>
                  )}
                </div>
              </div>
            </Card>

            <Card title="Properties">
              <div style={{ display: 'grid', gap: 10 }}>
                {Array.isArray(data.element.taggedValues) && data.element.taggedValues.length ? (
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Tagged values</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {data.element.taggedValues.map((tv: any) => (
                        <li key={tv.id} style={{ wordBreak: 'break-word' }}>
                          {formatTaggedValue(tv)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div style={{ opacity: 0.7 }}>(No tagged values)</div>
                )}

                {data.element.attrs != null ? (
                  <details>
                    <summary style={{ cursor: 'pointer', opacity: 0.85 }}>Attributes (raw)</summary>
                    <pre style={{ marginTop: 8, padding: 10, borderRadius: 10, border: '1px solid var(--borderColor, rgba(0,0,0,0.12))', overflow: 'auto' }}>
                      {safeJsonStringify(data.element.attrs)}
                    </pre>
                  </details>
                ) : null}
              </div>
            </Card>

            <Card title="Related elements">
              {data.relatedElements.length ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {data.relatedElements.slice(0, 30).map((e) => (
                    <li key={e.id} style={{ marginBottom: 4 }}>
                      <Link to={`/portal/e/${encodeURIComponent(e.id)}`}>{e.name || e.id}</Link>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        <code>{e.type}</code>
                        {e.kind ? <span> · {e.kind}</span> : null}
                        {e.layer ? <span> · {e.layer}</span> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ opacity: 0.7 }}>(none)</div>
              )}
              {data.relatedElements.length > 30 ? (
                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>Showing 30 of {data.relatedElements.length}.</div>
              ) : null}
            </Card>

            <Card title="Route info">
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
                {props.mode === 'externalId' ? 'Loaded via externalId' : 'Loaded via internal id'}
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Param</div>
                <code style={{ wordBreak: 'break-all' }}>{label || '(missing param)'}</code>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
