import * as React from 'react';

export function Card(props: { title?: string; children: React.ReactNode; right?: React.ReactNode }) {
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

export function Pill(props: { children: React.ReactNode }) {
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

export function SmallButton(props: { onClick?: () => void; children: React.ReactNode; title?: string }) {
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
