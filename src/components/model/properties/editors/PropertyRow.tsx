import type { CSSProperties, ReactNode } from 'react';

export type PropertyRowProps = {
  label: ReactNode;
  children: ReactNode;
  valueStyle?: CSSProperties;
};

export function PropertyRow({ label, children, valueStyle }: PropertyRowProps) {
  return (
    <div className="propertiesRow">
      <div className="propertiesKey">{label}</div>
      <div
        className="propertiesValue"
        style={{
          fontWeight: 400,
          ...(valueStyle ?? {})
        }}
      >
        {children}
      </div>
    </div>
  );
}
