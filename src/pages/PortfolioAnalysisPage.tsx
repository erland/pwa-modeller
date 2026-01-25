import { useMemo, useState } from 'react';

import { ModelActions } from '../components/model/ModelActions';
import { ModelNavigator } from '../components/model/ModelNavigator';
import { ModelPropertiesDialog } from '../components/model/ModelPropertiesDialog';
import { PropertiesPanel } from '../components/model/PropertiesPanel';
import { noSelection, type Selection } from '../components/model/selection';
import { AppShell } from '../components/shell/AppShell';
import { AnalysisModeBar } from '../components/analysis/AnalysisModeBar';
import { PortfolioWorkspace } from '../components/analysis/PortfolioWorkspace';
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

  // Prefer the kind of the selected view if available, since analysis often acts on what the user is currently looking at.
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

  const anyView = Object.values(model.views ?? {})[0];
  return anyView?.kind ?? 'archimate';
}

export default function PortfolioAnalysisPage() {
  const [selection, setSelection] = useState<Selection>(noSelection);
  const [modelPropsOpen, setModelPropsOpen] = useState(false);
  const model = useModelStore((s) => s.model);
  const modelKind = useMemo(() => inferAnalysisKind(model, selection), [model, selection]);

  // Step 1: portfolio shell only. We still compute modelKind so later steps can share the same adapter selection logic.
  void modelKind;

  const shellSubtitle = useMemo(() => 'Portfolio view: compare and prioritize elements across your model', []);

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
        <AnalysisModeBar />
        <PortfolioWorkspace />
      </AppShell>

      <ModelPropertiesDialog isOpen={modelPropsOpen} onClose={() => setModelPropsOpen(false)} />
    </>
  );
}
