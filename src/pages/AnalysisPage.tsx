import { useEffect, useMemo, useState } from 'react';

import { useLocation, useNavigate } from 'react-router-dom';

import { ModelActions } from '../components/model/ModelActions';
import { ModelNavigator } from '../components/model/ModelNavigator';
import { ModelPropertiesDialog } from '../components/model/ModelPropertiesDialog';
import { PropertiesPanel } from '../components/model/PropertiesPanel';
import { noSelection, type Selection } from '../components/model/selection';
import { AppShell } from '../components/shell/AppShell';
import { AnalysisWorkspace } from '../components/analysis/AnalysisWorkspace';
import type { Model, ModelKind } from '../domain';
import { kindFromTypeId } from '../domain';
import { useModelStore } from '../store';

function inferAnalysisKind(model: Model | null, selection: Selection): ModelKind {
  if (!model) return 'archimate';

  const viewKind = (viewId: string | undefined): ModelKind | null => {
    if (!viewId) return null;
    const v = model.views?.[viewId];
    return v?.kind ?? null;
  };

  // Prefer the kind of the selected view if available, since the Analysis workspace often
  // acts on what the user is currently looking at.
  switch (selection.kind) {
    case 'view':
    case 'viewNode':
    case 'viewObject': {
      return viewKind(selection.viewId) ?? 'archimate';
    }
    case 'relationship': {
      const vk = viewKind(selection.viewId);
      if (vk) return vk;
      const r = model.relationships?.[selection.relationshipId];
      return (r?.kind ?? (r ? kindFromTypeId(r.type) : null)) ?? 'archimate';
    }
    case 'element': {
      const el = model.elements?.[selection.elementId];
      return (el?.kind ?? (el ? kindFromTypeId(el.type) : null)) ?? 'archimate';
    }
    default:
      break;
  }

  // Stable fallback: if there are any views, use the first view's kind; otherwise default.
  const anyView = Object.values(model.views ?? {})[0];
  return anyView?.kind ?? 'archimate';
}

export default function AnalysisPage() {
  const [selection, setSelection] = useState<Selection>(noSelection);
  const [modelPropsOpen, setModelPropsOpen] = useState(false);
  const model = useModelStore((s) => s.model);
  const modelKind = useMemo(() => inferAnalysisKind(model, selection), [model, selection]);

  const location = useLocation();
  const navigate = useNavigate();
  const sandboxSeedViewId =
    (location.state as { openSandboxFromViewId?: string } | null)?.openSandboxFromViewId ?? null;

  // Clear navigation state after consuming it to avoid re-seeding when navigating back.
  useEffect(() => {
    if (!sandboxSeedViewId) return;
    navigate('/analysis', { replace: true, state: {} });
  }, [navigate, sandboxSeedViewId]);

  // In Analysis, we mostly care about element/relationship selection, but keep this generic
  // so the same PropertiesPanel works.
  const shellSubtitle = useMemo(
    () => 'Explore your model: dependencies, impact, and traceability',
    []
  );

  return (
    <>
      <AppShell
        title="EA Modeller"
        subtitle={shellSubtitle}
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
        <AnalysisWorkspace
          modelKind={modelKind}
          selection={selection}
          onSelect={setSelection}
          sandboxSeedViewId={sandboxSeedViewId}
          onOpenViewInWorkspace={(openViewId) => navigate('/', { state: { openViewId } })}
        />
      </AppShell>

      <ModelPropertiesDialog isOpen={modelPropsOpen} onClose={() => setModelPropsOpen(false)} />
    </>
  );
}
