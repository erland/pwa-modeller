import type { Renderer } from './types';

export const gatewayTypes: Record<string, true> = {
  'bpmn.gatewayExclusive': true,
  'bpmn.gatewayParallel': true,
  'bpmn.gatewayInclusive': true,
  'bpmn.gatewayEventBased': true,
};

export const renderGateway: Renderer = (type, f) => {
  const glyph =
    type === 'bpmn.gatewayParallel'
      ? '+'
      : type === 'bpmn.gatewayInclusive'
        ? 'O'
        : type === 'bpmn.gatewayEventBased'
          ? 'E'
          : 'X';

  return (
    <div style={f} title={type}>
      <div
        style={{
          width: 14,
          height: 14,
          border: '2px solid currentColor',
          transform: 'rotate(45deg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ transform: 'rotate(-45deg)', fontWeight: 900, fontSize: 10, lineHeight: 1 }}>{glyph}</div>
      </div>
    </div>
  );
};
