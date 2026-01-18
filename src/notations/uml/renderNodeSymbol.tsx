import * as React from 'react';

export function renderUmlNodeSymbol(nodeType: string): React.ReactNode {
  // Small, consistent symbol used in list UIs (and as a fallback if node content isn't overridden).
  let label = 'UML';
  switch (nodeType) {
    case 'uml.class':
      label = 'C';
      break;
    case 'uml.interface':
      label = 'I';
      break;
    case 'uml.enum':
      label = 'E';
      break;
    case 'uml.package':
      label = 'P';
      break;
    case 'uml.note':
      label = 'N';
      break;
    case 'uml.usecase':
      label = 'UC';
      break;
    case 'uml.actor':
      label = 'A';
      break;
    case 'uml.datatype':
      label = 'DT';
      break;
    case 'uml.primitiveType':
      label = 'PT';
      break;
    case 'uml.component':
      label = 'CMP';
      break;
    case 'uml.artifact':
      label = 'AR';
      break;
    case 'uml.node':
      label = 'N';
      break;
    case 'uml.device':
      label = 'DEV';
      break;
    case 'uml.executionEnvironment':
      label = 'EE';
      break;
    case 'uml.subject':
      label = 'SB';
      break;
  }

  return (
    <div
      style={{
        width: 22,
        height: 22,
        border: '1px solid currentColor',
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        lineHeight: 1,
        userSelect: 'none',
      }}
      title={nodeType}
    >
      {label}
    </div>
  );
}
