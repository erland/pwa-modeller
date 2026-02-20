import type { Element, UmlAttribute, UmlOperation } from '../../domain';
import { formatUmlAttributeLine, formatUmlClassifierMemberLines, formatUmlOperationLine } from './formatClassifierText';

function mkClassElement(attrs?: unknown): Element {
  return {
    id: 'e1',
    kind: 'uml',
    type: 'uml.class',
    name: 'Person',
    attrs,
  };
}

describe('formatClassifierText', () => {
  test('formats attribute visibility + datatype + multiplicity', () => {
    const a: UmlAttribute = {
      name: 'id',
      visibility: 'private',
      dataTypeName: 'string',
      multiplicity: { lower: '0', upper: '1' },
    };
    expect(formatUmlAttributeLine(a)).toBe('- id: string [0..1]');
  });

  test('hides clearly-wrong metaclass tokens leaked into datatype fields', () => {
    const a: UmlAttribute = {
      name: 'id',
      visibility: 'private',
      metaclass: 'uml:Property',
      dataTypeName: 'uml:Property',
    };
    expect(formatUmlAttributeLine(a)).toBe('- id');
  });

  test('formats operation signature with params and return type', () => {
    const o: UmlOperation = {
      name: 'getName',
      visibility: 'public',
      returnType: 'string',
      params: [{ name: 'format', type: 'string' }],
    };
    expect(formatUmlOperationLine(o)).toBe('+ getName(format: string): string');
  });

  test('maps semantic members from an element (non-legacy)', () => {
    const element = mkClassElement({
      attributes: [{ name: 'id', visibility: 'private', type: 'string' }],
      operations: [{ name: 'save' }],
    });

    const res = formatUmlClassifierMemberLines({ element });
    expect(res.usedLegacyText).toBe(false);
    expect(res.attributes).toEqual(['- id: string']);
    expect(res.operations).toEqual(['save()']);
  });
});
