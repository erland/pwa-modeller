import { Card } from './FactSheetPrimitives';
import { formatUmlAttribute, formatUmlOperation } from '../../utils/umlFormatters';

export type UmlMembers = {
  attributes: { name: string }[];
  operations: { name: string }[];
};

export function ElementUmlMembersCards(props: { umlMembers: any }) {
  const umlMembers = props.umlMembers as {
    attributes: any[];
    operations: any[];
  } | null;
  if (!umlMembers) return null;

  return (
    <>
      {umlMembers.attributes?.length ? (
        <Card title="Attributes">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {umlMembers.attributes.map((a, idx) => (
              <li
                key={`${String(a?.name ?? '')}-${idx}`}
                style={{
                  marginBottom: 4,
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                }}
              >
                {formatUmlAttribute(a)}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {umlMembers.operations?.length ? (
        <Card title="Operations">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {umlMembers.operations.map((o, idx) => (
              <li
                key={`${String(o?.name ?? '')}-${idx}`}
                style={{
                  marginBottom: 4,
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                }}
              >
                {formatUmlOperation(o)}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
