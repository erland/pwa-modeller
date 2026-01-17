import { useMemo, useState } from 'react';

import { ModelActions } from '../components/model/ModelActions';
import { ModelNavigator } from '../components/model/ModelNavigator';
import { ModelPropertiesDialog } from '../components/model/ModelPropertiesDialog';
import { PropertiesPanel } from '../components/model/PropertiesPanel';
import { noSelection, type Selection } from '../components/model/selection';
import { AppShell } from '../components/shell/AppShell';
import { AnalysisWorkspace } from '../components/analysis/AnalysisWorkspace';

export default function AnalysisPage() {
  const [selection, setSelection] = useState<Selection>(noSelection);
  const [modelPropsOpen, setModelPropsOpen] = useState(false);

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
        <AnalysisWorkspace selection={selection} onSelect={setSelection} />
      </AppShell>

      <ModelPropertiesDialog isOpen={modelPropsOpen} onClose={() => setModelPropsOpen(false)} />
    </>
  );
}
