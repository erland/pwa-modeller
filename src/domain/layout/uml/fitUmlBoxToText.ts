import type { Element, ViewNodeLayout } from '../../types';
import { readUmlClassifierMembers } from '../../uml/members';
import { readStereotypeDisplayText } from '../../umlStereotypes';
import { readUmlNodeAttrs } from '../../../notations/uml/nodeAttrs';
import { measureTextWidthPx } from '../measureText';

function splitLines(text?: string): string[] {
  if (!text) return [];
  const normalized = text.replace(/\r\n/g, '\n');
  const trimmedEnd = normalized.replace(/\n+$/, '');
  return trimmedEnd.length ? trimmedEnd.split('\n') : [];
}

function clampMin(n: number, min: number): number {
  return n < min ? min : n;
}

type UmlVisibilityLike = 'public' | 'private' | 'protected' | 'package' | (string & {});
type UmlMultiplicityLike = { lower?: string; upper?: string };
type UmlAttributeLike = {
  name: string;
  visibility?: UmlVisibilityLike;
  dataTypeName?: string;
  metaclass?: string;
  multiplicity?: UmlMultiplicityLike;
};
type UmlOpParamLike = { name: string; type?: string };
type UmlOperationLike = {
  name: string;
  visibility?: UmlVisibilityLike;
  params?: UmlOpParamLike[];
  returnType?: string;
};

function visibilitySymbol(v?: UmlVisibilityLike): string {
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

function isClearlyWrongDatatype(typeName: string | undefined, metaclass: string | undefined): boolean {
  const t = (typeName ?? '').trim();
  if (!t) return false;
  if (t.startsWith('uml:') || t.startsWith('xmi:')) return true;
  if (metaclass && t === metaclass) return true;
  return false;
}

function displayDataTypeName(a: UmlAttributeLike): string {
  const raw = (a.dataTypeName ?? '').trim();
  if (!raw) return '';
  if (isClearlyWrongDatatype(raw, a.metaclass)) return '';
  return raw;
}

// Keep formatting in sync with notations/uml/renderNodeContent.tsx
function formatAttribute(a: UmlAttributeLike): string {
  const sym = visibilitySymbol(a.visibility);
  const head = sym ? `${sym} ${a.name}` : a.name;

  const type = displayDataTypeName(a);
  const typePart = type ? `: ${type}` : '';

  const m = a.multiplicity;
  const lower = m?.lower?.trim() ?? '';
  const upper = m?.upper?.trim() ?? '';
  const multPart = lower || upper ? ` [${lower}..${upper}]` : '';

  return `${head}${typePart}${multPart}`;
}

function formatOperation(o: UmlOperationLike): string {
  const sym = visibilitySymbol(o.visibility);
  const head = sym ? `${sym} ${o.name}` : o.name;
  const params = (o.params ?? [])
    .map((p: UmlOpParamLike) => (p.type ? `${p.name}: ${p.type}` : p.name))
    .filter((s: string) => s.trim().length);
  const sig = `${head}(${params.join(', ')})`;
  return o.returnType ? `${sig}: ${o.returnType}` : sig;
}

/**
 * Computes a size for UML box-like nodes so visible text fits.
 *
 * Includes: name, stereotype line, and (when enabled) attributes/operations.
 * For class/interface/datatype, members are semantic and read from the element.
 */
export function fitUmlBoxToText(el: Element, node: ViewNodeLayout): { width: number; height: number } | null {
  const t = String(el.type);

  const isBoxLike =
    t === 'uml.class' ||
    t === 'uml.interface' ||
    t === 'uml.enum' ||
    t === 'uml.datatype' ||
    t === 'uml.primitiveType' ||
    t === 'uml.component' ||
    t === 'uml.package' ||
    t === 'uml.note' ||
    t === 'uml.artifact' ||
    t === 'uml.node' ||
    t === 'uml.device' ||
    t === 'uml.executionEnvironment' ||
    t === 'uml.subject' ||
    t === 'uml.associationClass';

  if (!isBoxLike) return null;

  const attrs = readUmlNodeAttrs(node);
  const collapsed = attrs.collapsed ?? false;
  const showAttributes = attrs.showAttributes ?? true;
  const showOperations = attrs.showOperations ?? true;

  const name = el.name || '(unnamed)';
  const stereo = readStereotypeDisplayText(el.attrs) || '';

  // Render constants from notations/uml/renderNodeContent.tsx
  const padX = 8;
  const headerPadY = 6;

  const stereoFont = '11px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  const nameFont = '800 13px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  const sectionFont = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';

  const nameW = measureTextWidthPx(name, nameFont);
  const stereoW = stereo ? measureTextWidthPx(`«${stereo}»`, stereoFont) : 0;
  let contentW = Math.max(nameW, stereoW);

  // Determine the exact lines that renderNodeContent will show.
  const isClass = t === 'uml.class' || t === 'uml.associationClass';
  const isInterface = t === 'uml.interface';
  const isDataType = t === 'uml.datatype' || t === 'uml.primitiveType';
  const isEnum = t === 'uml.enum';

  const legacyAttrLines = splitLines(attrs.attributesText);
  const legacyOpLines = splitLines(attrs.operationsText);

  let attrLines: string[] = [];
  let opLines: string[] = [];

  if (!collapsed) {
    if (isClass || isInterface || isDataType) {
      const members = readUmlClassifierMembers(el);
      const useLegacyText =
        isDataType &&
        members.attributes.length === 0 &&
        members.operations.length === 0 &&
        (legacyAttrLines.length > 0 || legacyOpLines.length > 0);

      const attributeLines = useLegacyText ? legacyAttrLines : members.attributes.map(formatAttribute);
      const operationLines = useLegacyText ? legacyOpLines : members.operations.map(formatOperation);

      attrLines = showAttributes ? attributeLines : [];
      opLines = showOperations ? operationLines : [];
    } else if (isEnum) {
      // Enum currently uses legacy text-based compartments.
      attrLines = legacyAttrLines;
      opLines = legacyOpLines;
    } else {
      // Notes/packages/etc rely on node-local text fields.
      attrLines = showAttributes ? legacyAttrLines : [];
      opLines = showOperations ? legacyOpLines : [];
    }
  }

  for (const line of attrLines) contentW = Math.max(contentW, measureTextWidthPx(line, sectionFont));
  for (const line of opLines) contentW = Math.max(contentW, measureTextWidthPx(line, sectionFont));

  // Box width = content + padding (both sides)
  const minWidth = 120;
  const width = clampMin(Math.ceil(contentW + padX * 2 + 2), minWidth);

  // Height: header + optional sections
  const stereoLineH = stereo ? 13 : 0;
  const stereoGap = stereo ? 2 : 0;
  const nameLineH = 16;
  const headerH = headerPadY * 2 + stereoLineH + stereoGap + nameLineH;

  let sectionsH = 0;
  const sectionPadY = 6;
  // Renderer uses fontSize: 12 and lineHeight: 1.25 (~15px). Add a safety margin
  // to avoid clipping due to rounding or when long lines wrap.
  const sectionLineH = 17;
  const sectionBorderH = 1;
  const sectionExtraSlack = 6; // per compartment

  if (!collapsed) {
    if (showAttributes) {
      const lines = attrLines.length ? attrLines : [' '];
      sectionsH += sectionBorderH + sectionPadY * 2 + sectionLineH * Math.max(1, lines.length) + sectionExtraSlack;
    }
    if (showOperations) {
      const lines = opLines.length ? opLines : [' '];
      sectionsH += sectionBorderH + sectionPadY * 2 + sectionLineH * Math.max(1, lines.length) + sectionExtraSlack;
    }
  }

  const minHeight = 60;
  // A small global slack helps avoid "half visible" last lines due to rounding.
  const globalSlack = 10;
  const height = clampMin(Math.ceil(headerH + sectionsH + globalSlack), minHeight);

  return { width, height };
}
