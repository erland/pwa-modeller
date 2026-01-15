import type { FolderOption, Model } from '../../../domain';
import { kindFromTypeId } from '../../../domain';

import type { Selection } from '../selection';
import type { ModelActions } from './actions';
import { ArchimateElementPropertiesExtras } from './archimate/ArchimateElementPropertiesExtras';
import { CommonElementProperties } from './common/CommonElementProperties';

type Props = {
  model: Model;
  elementId: string;
  actions: ModelActions;
  elementFolders: FolderOption[];
  onSelect?: (selection: Selection) => void;
};

export function ElementProperties({ model, elementId, actions, elementFolders, onSelect }: Props) {
  const el = model.elements[elementId];
  if (!el) return <p className="panelHint">Element not found.</p>;

  const kind = kindFromTypeId(el.type);

  return (
    <CommonElementProperties
      model={model}
      elementId={elementId}
      actions={actions}
      elementFolders={elementFolders}
      onSelect={onSelect}
      extras={kind === 'archimate' ? (
        <ArchimateElementPropertiesExtras model={model} element={el} actions={actions} onSelect={onSelect} />
      ) : null}
    />
  );
}
