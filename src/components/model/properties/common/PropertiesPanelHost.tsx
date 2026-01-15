import type { ReactNode } from 'react';

export type PropertiesSection = {
  key: string;
  content: ReactNode;
};

/**
 * Lightweight host for properties "sections".
 *
 * Intentionally minimal: it preserves the existing markup and styling of each section,
 * while giving us a clean way to insert notation-specific sections without sprinkling
 * kind checks across the common panel.
 */
export function PropertiesPanelHost({ sections }: { sections: PropertiesSection[] }) {
  return (
    <>
      {sections.map((s) => (
        <div key={s.key}>{s.content}</div>
      ))}
    </>
  );
}
