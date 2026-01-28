import { useMemo, useState } from 'react';

import type { Model } from '../../../domain';
import { ElementChooserDialog } from '../../model/pickers/ElementChooserDialog';

type Which = 'start' | 'source' | 'target';

export type UseElementChooserArgs = {
  model: Model;
  draftStartId: string;
  onChangeDraftStartId: (id: string) => void;
  draftSourceId: string;
  onChangeDraftSourceId: (id: string) => void;
  draftTargetId: string;
  onChangeDraftTargetId: (id: string) => void;
};

export type ElementChooserApi = {
  openChooser: (which: Which) => void;
  chooserDialog: JSX.Element;
};

/**
 * Small shared helper for AnalysisQueryPanel.
 * Keeps the chooser state + ElementChooserDialog wiring out of the big render.
 */
export function useElementChooser({
  model,
  draftStartId,
  onChangeDraftStartId,
  draftSourceId,
  onChangeDraftSourceId,
  draftTargetId,
  onChangeDraftTargetId
}: UseElementChooserArgs): ElementChooserApi {
  const [chooser, setChooser] = useState<null | { which: Which }>(null);

  const title = useMemo(() => {
    return chooser?.which === 'start'
      ? 'Choose start element'
      : chooser?.which === 'source'
        ? 'Choose source element'
        : chooser?.which === 'target'
          ? 'Choose target element'
          : 'Choose element';
  }, [chooser?.which]);

  const value = useMemo(() => {
    return chooser?.which === 'start'
      ? draftStartId
      : chooser?.which === 'source'
        ? draftSourceId
        : chooser?.which === 'target'
          ? draftTargetId
          : '';
  }, [chooser?.which, draftStartId, draftSourceId, draftTargetId]);

  return {
    openChooser: (which) => setChooser({ which }),
    chooserDialog: (
      <ElementChooserDialog
        title={title}
        isOpen={!!chooser}
        model={model}
        value={value}
        onClose={() => setChooser(null)}
        onChoose={(id) => {
          if (chooser?.which === 'start') onChangeDraftStartId(id);
          else if (chooser?.which === 'source') onChangeDraftSourceId(id);
          else if (chooser?.which === 'target') onChangeDraftTargetId(id);
          setChooser(null);
        }}
      />
    )
  };
}
