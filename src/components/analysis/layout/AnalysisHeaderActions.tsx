import type { ReactNode } from 'react';

export type AnalysisHeaderActionsProps = {
  /**
   * Optional primary action (usually the “Run / Build / Apply” button).
   * Rendered before any secondary actions.
   */
  primary?: ReactNode;

  /**
   * Optional secondary actions (export, settings, save preset, etc.).
   * Can be a single node or an array of nodes.
   */
  secondary?: ReactNode;

  /**
   * If provided, `children` wins over `primary`/`secondary` and is rendered as-is.
   * Useful when a caller already has a prepared action cluster.
   */
  children?: ReactNode;

  /** Optional extra class name applied to the action container. */
  className?: string;
};

/**
 * Standard action cluster for analysis section headers.
 *
 * Uses the existing `.rowActions` styling from `crud.css` to ensure consistent
 * spacing and right-alignment across all analysis views.
 */
export function AnalysisHeaderActions({
  primary,
  secondary,
  children,
  className
}: AnalysisHeaderActionsProps): JSX.Element {
  const cls = className ? `rowActions ${className}` : 'rowActions';

  if (children) {
    return <div className={cls}>{children}</div>;
  }

  return (
    <div className={cls}>
      {primary ?? null}
      {secondary ?? null}
    </div>
  );
}
