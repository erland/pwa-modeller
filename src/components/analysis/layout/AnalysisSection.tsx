import type { ReactNode } from 'react';

export type AnalysisSectionProps = {
  title?: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** Optional extra class on the outer section */
  className?: string;
  /** Optional extra class on the header row (crudHeader) */
  headerClassName?: string;
};

/**
 * Shared wrapper for analysis cards (Query / Results).
 *
 * Uses the existing crud.css visual language:
 * - crudSection
 * - crudHeader
 * - crudTitle
 * - crudHint
 *
 * You can optionally provide `actions` to render a right-aligned action cluster.
 */
export function AnalysisSection({
  title,
  hint,
  actions,
  children,
  className,
  headerClassName
}: AnalysisSectionProps): JSX.Element {
  const sectionClass = className ? `crudSection ${className}` : 'crudSection';
  const headerClass = headerClassName ? `crudHeader ${headerClassName}` : 'crudHeader';

  return (
    <section className={sectionClass}>
      {(title ?? hint ?? actions) ? (
        <div className={headerClass}>
          <div>
            {title ? <div className="crudTitle">{title}</div> : null}
            {hint ? <div className="crudHint">{hint}</div> : null}
          </div>
          {actions ? <div className="rowActions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
