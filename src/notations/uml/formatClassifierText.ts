import type { Element } from '../../domain';
import type { UmlAttribute, UmlOperation, UmlVisibility } from '../../domain/uml/members';
import { readUmlClassifierMembers } from '../../domain';
import { readStereotypeDisplayText } from '../../domain/umlStereotypes';

export function readUmlElementStereotype(element: Element): string | undefined {
  const text = readStereotypeDisplayText(element.attrs);
  return text.trim().length ? text.trim() : undefined;
}

function visibilitySymbol(v?: UmlVisibility): string {
  switch (v) {
    case 'public':
      return '+';
    case 'private':
      return '-';
    case 'protected':
      return '#';
    case 'package':
      return '~';
    default:
      return '';
  }
}

function isClearlyWrongDatatypeToken(v: string | undefined, metaclass?: string): boolean {
  const s = (v ?? '').trim();
  if (!s) return false;
  if (s.startsWith('uml:') || s.startsWith('xmi:')) return true;
  const mc = (metaclass ?? '').trim();
  return mc.length > 0 && s === mc;
}

function formatMultiplicity(m?: { lower?: string; upper?: string }): string {
  if (!m) return '';
  const lower = (m.lower ?? '').trim();
  const upper = (m.upper ?? '').trim();
  if (!lower && !upper) return '';
  const l = lower || '0';
  const u = upper || '*';
  return ` [${l}..${u}]`;
}

export function formatUmlAttributeLine(a: UmlAttribute): string {
  const sym = visibilitySymbol(a.visibility);
  const head = sym ? `${sym} ` : '';
  const name = (a.name ?? '').trim();
  const typeName = isClearlyWrongDatatypeToken(a.dataTypeName, a.metaclass) ? undefined : (a.dataTypeName ?? '').trim();
  const typePart = typeName ? `: ${typeName}` : '';
  const mult = formatMultiplicity(a.multiplicity);
  const base = `${head}${name}${typePart}${mult}`.trimEnd();
  return base.length ? base : name;
}

export function formatUmlOperationLine(o: UmlOperation): string {
  const sym = visibilitySymbol(o.visibility);
  const head = sym ? `${sym} ` : '';
  const name = (o.name ?? '').trim();
  const params = (o.params ?? [])
    .map((p) => {
      const pn = (p.name ?? '').trim();
      const pt = (p.type ?? '').trim();
      return pt ? `${pn}: ${pt}` : pn;
    })
    .filter(Boolean)
    .join(', ');
  const retType = isClearlyWrongDatatypeToken(o.returnType, undefined) ? '' : (o.returnType ?? '').trim();
  const ret = retType ? `: ${retType}` : '';
  return `${head}${name}(${params})${ret}`.trim();
}

export type FormatUmlClassifierMemberLinesArgs = {
  element: Element;
  legacyAttributesLines?: string[];
  legacyOperationsLines?: string[];
  useLegacyText?: boolean;
};

export function formatUmlClassifierMemberLines(
  args: FormatUmlClassifierMemberLinesArgs,
): { attributes: string[]; operations: string[]; usedLegacyText: boolean } {
  const { element, legacyAttributesLines, legacyOperationsLines, useLegacyText } = args;

  if (useLegacyText) {
    return {
      attributes: (legacyAttributesLines ?? []).filter((l) => l.trim().length > 0),
      operations: (legacyOperationsLines ?? []).filter((l) => l.trim().length > 0),
      usedLegacyText: true,
    };
  }

  const members = readUmlClassifierMembers(element);
  const attributes = members.attributes.map(formatUmlAttributeLine).filter((l) => l.trim().length > 0);
  const operations = members.operations.map(formatUmlOperationLine).filter((l) => l.trim().length > 0);

  return { attributes, operations, usedLegacyText: false };
}