import type { Element, Model } from '../../../../domain';

import type { ModelActions } from '../actions';
import { TextAreaRow } from '../editors/TextAreaRow';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

type Props = {
  model: Model;
  element: Element;
  actions: ModelActions;
};

/** TextAnnotation properties (attrs.text). */
export function BpmnTextAnnotationPropertiesSection({ model, element: el, actions }: Props) {
  void model;
  if (String(el.type) !== 'bpmn.textAnnotation') return null;

  const attrs = isRecord(el.attrs) ? (el.attrs as Record<string, unknown>) : {};
  const text = typeof attrs.text === 'string' ? attrs.text : '';

  return (
    <>
      <p className="panelHint">BPMN</p>
      <div className="propertiesGrid">
        <TextAreaRow
          label="Text"
          ariaLabel="BPMN text annotation text"
          value={text}
          onChange={(v) => actions.setBpmnTextAnnotationText(el.id, v)}
          placeholder="(annotation text)"
        />
      </div>
    </>
  );
}
