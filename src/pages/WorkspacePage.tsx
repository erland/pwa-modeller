import { useMemo, useState } from 'react';

import { ModelActions } from '../components/model/ModelActions';
import { ModelNavigator } from '../components/model/ModelNavigator';
import { ModelPalette } from '../components/model/ModelPalette';
import { ModelPropertiesDialog } from '../components/model/ModelPropertiesDialog';
import { PropertiesPanel } from '../components/model/PropertiesPanel';
import { noSelection, type Selection } from '../components/model/selection';
import { DiagramCanvas } from '../components/diagram/DiagramCanvas';
import { ReportsWorkspace } from '../components/reports/ReportsWorkspace';
import { AppShell } from '../components/shell/AppShell';
import { VIEWPOINTS } from '../domain';
import { useModelStore } from '../store/useModelStore';

function WorkspaceMainPlaceholder({
  selection,
  mainTab,
  onChangeTab,
  onSelect
}: {
  selection: Selection;
  mainTab: 'diagram' | 'reports';
  onChangeTab: (tab: 'diagram' | 'reports') => void;
  onSelect: (sel: Selection) => void;
}) {
  const model = useModelStore((s) => s.model);
  const currentView = useMemo(() => {
    if (!model) return null;
    if (selection.kind === 'view') return model.views[selection.viewId] ?? null;
    if (selection.kind === 'viewNode') return model.views[selection.viewId] ?? null;
    // If a view exists, show the first one as context even if nothing is selected.
    return Object.values(model.views)[0] ?? null;
  }, [model, selection]);

  const currentViewpointTitle = useMemo(() => {
    if (!currentView) return null;
    return VIEWPOINTS.find((v) => v.id === currentView.viewpointId)?.name ?? currentView.viewpointId;
  }, [currentView]);

  return (
    <div className="workspace">
      <div className="workspaceHeader">
        <h1 className="workspaceTitle">Model workspace</h1>
        <div className="workspaceTabs" role="tablist" aria-label="Workspace tabs">
          <button
            type="button"
            className={`tabButton ${mainTab === 'diagram' ? 'isActive' : ''}`}
            role="tab"
            aria-selected={mainTab === 'diagram'}
            onClick={() => onChangeTab('diagram')}
          >
            Diagram
          </button>
          <button
            type="button"
            className={`tabButton ${mainTab === 'reports' ? 'isActive' : ''}`}
            role="tab"
            aria-selected={mainTab === 'reports'}
            onClick={() => onChangeTab('reports')}
          >
            Reports
          </button>
        </div>
      </div>

      {mainTab === 'diagram' ? (
        <div className="canvasPlaceholder" aria-label="Diagram canvas">
          <div className="canvasPlaceholderInner" style={{ padding: 0 }}>
            <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
              <p className="canvasTitle" style={{ marginBottom: 6 }}>
                Diagram canvas
              </p>
              {currentView ? (
                <p className="canvasHint" style={{ marginBottom: 0 }}>
                  <strong>Current view:</strong> {currentView.name}
                  {currentViewpointTitle ? ` — ${currentViewpointTitle}` : ''}
                </p>
              ) : (
                <p className="canvasHint" style={{ marginBottom: 0 }}>
                  No views yet — create one from the <strong>Views</strong> tab in the palette.
                </p>
              )}
            </div>

            <DiagramCanvas selection={selection} onSelect={onSelect} />
          </div>
        </div>
      ) : (
        <ReportsWorkspace />
      )}
    </div>
  );
}

export default function WorkspacePage() {
  const [selection, setSelection] = useState<Selection>(noSelection);
  const [modelPropsOpen, setModelPropsOpen] = useState(false);
  const [mainTab, setMainTab] = useState<'diagram' | 'reports'>('diagram');

  return (
    <>
      <AppShell
        title="PWA Modeller"
        subtitle="Enterprise Architecture Modeling PWA (ArchiMate® 3.2)"
        actions={<ModelActions onEditModelProps={() => setModelPropsOpen(true)} />}
        leftSidebar={<ModelNavigator selection={selection} onSelect={setSelection} />}
        rightSidebar={
          <PropertiesPanel
            selection={selection}
            onSelect={setSelection}
            onEditModelProps={() => setModelPropsOpen(true)}
          />
        }
      >
        <ModelPalette onSelect={setSelection} />
        <WorkspaceMainPlaceholder
          selection={selection}
          mainTab={mainTab}
          onChangeTab={setMainTab}
          onSelect={setSelection}
        />
      </AppShell>

      <ModelPropertiesDialog isOpen={modelPropsOpen} onClose={() => setModelPropsOpen(false)} />
    </>
  );
}
