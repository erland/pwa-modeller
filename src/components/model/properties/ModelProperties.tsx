import type { Model } from '../../../domain';
import { modelStore } from '../../../store';

import { ExternalIdsSummary } from './ExternalIdsSummary';
import { TaggedValuesSummary } from './TaggedValuesSummary';

type Props = {
  model: Model;
  onEditModelProps: () => void;
};

export function ModelProperties({ model, onEditModelProps }: Props) {
  return (
    <div>
      <p className="panelHint">Model</p>
      <div className="propertiesGrid">
        <div className="propertiesRow">
          <div className="propertiesKey">Name</div>
          <div className="propertiesValue">
            {/* Avoid duplicating the model name as a text node (navigator already shows it). */}
            <input className="textInput" aria-label="Model name" value={model.metadata.name} readOnly />
          </div>
        </div>
        <div className="propertiesRow">
          <div className="propertiesKey">Version</div>
          <div className="propertiesValue">{model.metadata.version ?? '—'}</div>
        </div>
        <div className="propertiesRow">
          <div className="propertiesKey">Owner</div>
          <div className="propertiesValue">{model.metadata.owner ?? '—'}</div>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <button type="button" className="shellButton" onClick={onEditModelProps}>
          Edit model properties
        </button>
      </div>

      <ExternalIdsSummary externalIds={model.externalIds} />
      <TaggedValuesSummary
        taggedValues={model.taggedValues}
        onChange={(next) => modelStore.updateModelTaggedValues(next)}
        dialogTitle={`Model tagged values — ${model.metadata.name}`}
      />
    </div>
  );
}
