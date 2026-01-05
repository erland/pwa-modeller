import type { ReactNode } from 'react';
import type { ElementType } from '../../domain';

type Props = {
  type: ElementType;
  /** Optional accessible title (defaults to element type). */
  title?: string;
};

function IconBase({ children, title }: { children: ReactNode; title: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      role="img"
      aria-label={title}
      focusable="false"
    >
      {children}
    </svg>
  );
}

// Small helper primitives
const Stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/**
 * Notation-inspired (simple) symbols per ArchiMate element type.
 *
 * These are intentionally lightweight and embedded (no asset pipeline).
 * If you want to match an exact published icon set pixel-for-pixel, we can
 * swap these out for a licensed icon pack.
 */
export function ArchimateSymbol({ type, title }: Props) {
  const t = title ?? type;

  switch (type) {
    // Strategy / Motivation
    case 'Goal':
      return (
        <IconBase title={t}>
          <circle cx="12" cy="12" r="8" {...Stroke} />
          <circle cx="12" cy="12" r="4" {...Stroke} />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
        </IconBase>
      );
    case 'Requirement':
      return (
        <IconBase title={t}>
          <path d="M7 4h7l3 3v13H7z" {...Stroke} />
          <path d="M14 4v4h4" {...Stroke} />
          <path d="M9 14l2 2 4-5" {...Stroke} />
        </IconBase>
      );
    case 'Capability':
      return (
        <IconBase title={t}>
          <path d="M6 17V7" {...Stroke} />
          <path d="M10 17V10" {...Stroke} />
          <path d="M14 17V12" {...Stroke} />
          <path d="M18 17V8" {...Stroke} />
          <path d="M5 17h14" {...Stroke} />
        </IconBase>
      );
    case 'CourseOfAction':
      return (
        <IconBase title={t}>
          <path d="M6 16c4 0 4-8 8-8h4" {...Stroke} />
          <path d="M16 6l2 2-2 2" {...Stroke} />
          <circle cx="6" cy="16" r="1.5" fill="currentColor" />
        </IconBase>
      );
    case 'Resource':
      return (
        <IconBase title={t}>
          <path d="M7 9l5-3 5 3v6l-5 3-5-3z" {...Stroke} />
          <path d="M12 6v12" {...Stroke} />
          <path d="M7 9l5 3 5-3" {...Stroke} />
        </IconBase>
      );
    case 'Outcome':
      return (
        <IconBase title={t}>
          <path d="M8 7h8v3c0 3-2 5-4 5s-4-2-4-5z" {...Stroke} />
          <path d="M10 18h4" {...Stroke} />
          <path d="M12 15v3" {...Stroke} />
        </IconBase>
      );

    // Business
    case 'BusinessActor':
      return (
        <IconBase title={t}>
          <circle cx="12" cy="8" r="2.5" {...Stroke} />
          <path d="M7.5 20c0-3 2-5 4.5-5s4.5 2 4.5 5" {...Stroke} />
        </IconBase>
      );
    case 'BusinessRole':
      return (
        <IconBase title={t}>
          <circle cx="12" cy="8" r="2.3" {...Stroke} />
          <path d="M8 20c0-2.7 1.8-4.6 4-4.6s4 1.9 4 4.6" {...Stroke} />
          <path d="M16.5 10.5l1.8 1-.6 2-2 .2-1.2-1.6.8-1.6z" {...Stroke} />
        </IconBase>
      );
    case 'BusinessProcess':
      return (
        <IconBase title={t}>
          <path d="M7 8h7l3 4-3 4H7z" {...Stroke} />
          <path d="M9 12h6" {...Stroke} />
        </IconBase>
      );
    case 'BusinessFunction':
      return (
        <IconBase title={t}>
          <path d="M12 5l1.2 2.1 2.4.5-1.6 1.7.4 2.4-2.4-1.1-2.4 1.1.4-2.4-1.6-1.7 2.4-.5z" {...Stroke} />
          <path d="M6 18h12" {...Stroke} />
        </IconBase>
      );
    case 'BusinessService':
      return (
        <IconBase title={t}>
          <path d="M12 6a6 6 0 1 0 6 6" {...Stroke} />
          <path d="M12 6v6h6" {...Stroke} />
          <path d="M18 12a6 6 0 0 1-6 6" {...Stroke} />
        </IconBase>
      );
    case 'Product':
      return (
        <IconBase title={t}>
          <path d="M7 8h10v10H7z" {...Stroke} />
          <path d="M7 11h10" {...Stroke} />
          <path d="M10 8v3" {...Stroke} />
        </IconBase>
      );

    // Application
    case 'ApplicationComponent':
      return (
        <IconBase title={t}>
          <path d="M7 7h10v10H7z" {...Stroke} />
          <path d="M9 9h3v3H9z" {...Stroke} />
          <path d="M12.5 12.5H15.5V15.5H12.5z" {...Stroke} />
        </IconBase>
      );
    case 'ApplicationFunction':
      return (
        <IconBase title={t}>
          <path d="M12 6l1 2 2.2.3-1.6 1.6.4 2.2-2-1-2 1 .4-2.2L8.8 8.3 11 8z" {...Stroke} />
          <path d="M6.5 17.5h11" {...Stroke} />
        </IconBase>
      );
    case 'ApplicationService':
      return (
        <IconBase title={t}>
          <path d="M9 8h6v3H9z" {...Stroke} />
          <path d="M8 11v5" {...Stroke} />
          <path d="M16 11v5" {...Stroke} />
          <path d="M10 16h4" {...Stroke} />
          <path d="M14 16v2" {...Stroke} />
        </IconBase>
      );
    case 'DataObject':
      return (
        <IconBase title={t}>
          <path d="M7 5h7l3 3v11H7z" {...Stroke} />
          <path d="M14 5v4h4" {...Stroke} />
          <path d="M9 12h6" {...Stroke} />
          <path d="M9 15h6" {...Stroke} />
        </IconBase>
      );

    // Technology / Physical
    case 'Node':
      return (
        <IconBase title={t}>
          <path d="M7 7h10v4H7z" {...Stroke} />
          <path d="M7 13h10v4H7z" {...Stroke} />
          <path d="M9 9h2" {...Stroke} />
          <path d="M9 15h2" {...Stroke} />
        </IconBase>
      );
    case 'Device':
      return (
        <IconBase title={t}>
          <path d="M9 6h6v12H9z" {...Stroke} />
          <path d="M11 16h2" {...Stroke} />
        </IconBase>
      );
    case 'SystemSoftware':
      return (
        <IconBase title={t}>
          <path d="M9 9h6v6H9z" {...Stroke} />
          <path d="M12 6v3" {...Stroke} />
          <path d="M12 15v3" {...Stroke} />
          <path d="M6 12h3" {...Stroke} />
          <path d="M15 12h3" {...Stroke} />
        </IconBase>
      );
    case 'TechnologyService':
      return (
        <IconBase title={t}>
          <path d="M9 17h8a4 4 0 0 0 0-8 5 5 0 0 0-9.7 1.2A3.5 3.5 0 0 0 9 17z" {...Stroke} />
        </IconBase>
      );
    case 'Artifact':
      return (
        <IconBase title={t}>
          <path d="M7 5h7l3 3v11H7z" {...Stroke} />
          <path d="M14 5v4h4" {...Stroke} />
          <path d="M9 13h6" {...Stroke} />
        </IconBase>
      );
    case 'Facility':
      return (
        <IconBase title={t}>
          <path d="M7 20V8l5-3 5 3v12" {...Stroke} />
          <path d="M10 20v-5h4v5" {...Stroke} />
        </IconBase>
      );
    case 'Equipment':
      return (
        <IconBase title={t}>
          <path d="M14 7l3 3-3 3-3-3z" {...Stroke} />
          <path d="M7 20l6-6" {...Stroke} />
          <path d="M6 18l2 2" {...Stroke} />
        </IconBase>
      );

    // Implementation & Migration
    case 'WorkPackage':
      return (
        <IconBase title={t}>
          <path d="M7 9h10v9H7z" {...Stroke} />
          <path d="M9 9V7h6v2" {...Stroke} />
          <path d="M7 12h10" {...Stroke} />
        </IconBase>
      );
    case 'Deliverable':
      return (
        <IconBase title={t}>
          <path d="M7 9h10v9H7z" {...Stroke} />
          <path d="M9 9V7h6v2" {...Stroke} />
          <path d="M9 14l2 2 4-5" {...Stroke} />
        </IconBase>
      );
    case 'Plateau':
      return (
        <IconBase title={t}>
          <path d="M7 16h10" {...Stroke} />
          <path d="M8.5 13h9" {...Stroke} />
          <path d="M10 10h7" {...Stroke} />
        </IconBase>
      );
    case 'Gap':
      return (
        <IconBase title={t}>
          <path d="M6 12h5" {...Stroke} />
          <path d="M13 12h5" {...Stroke} />
          <path d="M11 10l2 2-2 2" {...Stroke} />
        </IconBase>
      );

    default:
      return (
        <IconBase title={t}>
          <rect x="7" y="7" width="10" height="10" {...Stroke} />
        </IconBase>
      );
  }
}
