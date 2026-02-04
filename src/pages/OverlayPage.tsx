import { useState } from 'react';

import { AppShell } from '../components/shell/AppShell';
import '../styles/crud.css';

import { OverlayStatusPanel } from '../components/overlay/OverlayStatusPanel';
import { OverlayLifecyclePanel } from '../components/overlay/OverlayLifecyclePanel';
import { OverlaySurveyCsvPanel } from '../components/overlay/OverlaySurveyCsvPanel';
import { OverlayDiagnosticsPanel } from '../components/overlay/OverlayDiagnosticsPanel';
import { OverlayCoveragePanel } from '../components/overlay/OverlayCoveragePanel';
import { useModelStore } from '../store';

type OverlayTab = 'overview' | 'survey' | 'diagnostics' | 'coverage';

export default function OverlayPage() {
  const { model, fileName } = useModelStore((s) => s);
  const [activeTab, setActiveTab] = useState<OverlayTab>('overview');

  return (
    <AppShell title="EA Modeller" subtitle="Manage overlay data: lifecycle, imports/exports, diagnostics, and coverage">
      <div className="overlayWorkspace" aria-label="Overlay workspace">
        <div className="workspaceHeader">
          <h1 className="workspaceTitle">Overlay</h1>
          <div className="workspaceTabs" role="tablist" aria-label="Overlay tabs">
            <button
              type="button"
              className={`tabButton ${activeTab === 'overview' ? 'isActive' : ''}`}
              role="tab"
              aria-selected={activeTab === 'overview'}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            <button
              type="button"
              className={`tabButton ${activeTab === 'survey' ? 'isActive' : ''}`}
              role="tab"
              aria-selected={activeTab === 'survey'}
              onClick={() => setActiveTab('survey')}
            >
              Survey CSV
            </button>
            <button
              type="button"
              className={`tabButton ${activeTab === 'diagnostics' ? 'isActive' : ''}`}
              role="tab"
              aria-selected={activeTab === 'diagnostics'}
              onClick={() => setActiveTab('diagnostics')}
            >
              Diagnostics
            </button>
            <button
              type="button"
              className={`tabButton ${activeTab === 'coverage' ? 'isActive' : ''}`}
              role="tab"
              aria-selected={activeTab === 'coverage'}
              onClick={() => setActiveTab('coverage')}
            >
              Coverage
            </button>
          </div>
        </div>

        <div style={{ padding: 16, maxWidth: 1100 }}>
          {!model ? (
            <div className="crudSection" aria-label="No model loaded">
              <div className="crudHeader">
                <div>
                  <h2 className="crudTitle">No model loaded</h2>
                  <p className="crudHint">Load or create a model to manage and diagnose overlay data.</p>
                </div>
              </div>
            </div>
          ) : activeTab === 'overview' ? (
            <>
              <OverlayLifecyclePanel />
              <div style={{ height: 12 }} />
              <OverlayStatusPanel />
            </>
          ) : activeTab === 'survey' ? (
            <OverlaySurveyCsvPanel model={model} fileName={fileName} />
          ) : activeTab === 'coverage' ? (
            <OverlayCoveragePanel model={model} />
          ) : (
            <OverlayDiagnosticsPanel model={model} />
          )}
        </div>
      </div>
    </AppShell>
  );
}
