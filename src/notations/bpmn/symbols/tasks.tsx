import type { Renderer } from './types';

export const taskLikeTypes: Record<string, true> = {
  'bpmn.task': true,
  'bpmn.userTask': true,
  'bpmn.serviceTask': true,
  'bpmn.scriptTask': true,
  'bpmn.manualTask': true,
  'bpmn.callActivity': true,
  'bpmn.subProcess': true,
};

export const renderTaskLike: Renderer = (type, f) => {
  const glyph =
    type === 'bpmn.userTask'
      ? 'U'
      : type === 'bpmn.serviceTask'
        ? 'S'
        : type === 'bpmn.scriptTask'
          ? 'Sc'
          : type === 'bpmn.manualTask'
            ? 'M'
            : type === 'bpmn.callActivity'
              ? 'C'
              : type === 'bpmn.subProcess'
                ? '+'
                : 'T';

  return (
    <div
      style={{
        ...f,
        border: '1px solid currentColor',
        borderRadius: 6,
        fontSize: glyph.length > 1 ? 8 : 11,
        fontWeight: 900,
        lineHeight: 1,
      }}
      title={type}
    >
      {glyph}
    </div>
  );
};
