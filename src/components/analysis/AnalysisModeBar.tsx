import { NavLink } from 'react-router-dom';

type AnalysisModeBarProps = {
  className?: string;
};

/**
 * High-level analysis mode switcher.
 *
 * Note: This is separate from the internal tabs inside AnalysisWorkspace (related/paths/traceability/matrix).
 * Portfolio analysis is implemented as its own route in Step 1.
 */
export function AnalysisModeBar({ className }: AnalysisModeBarProps) {
  return (
    <div className={["analysisModeBar", className ?? null].filter(Boolean).join(' ')} role="tablist" aria-label="Analysis modes">
      <NavLink
        to="/analysis"
        end
        role="tab"
        className={({ isActive }) =>
          ["analysisModeLink", "tabButton", isActive ? "isActive" : null].filter(Boolean).join(' ')
        }
      >
        Analysis
      </NavLink>
      <NavLink
        to="/analysis/portfolio"
        role="tab"
        className={({ isActive }) =>
          ["analysisModeLink", "tabButton", isActive ? "isActive" : null].filter(Boolean).join(' ')
        }
      >
        Portfolio
      </NavLink>
    </div>
  );
}
