import type { Element, ViewFormatting, ViewNodeLayout } from '../../types';
import { readUmlClassifierMembers } from '../../uml/members';
import { readStereotypeDisplayText } from '../../umlStereotypes';
import { readUmlNodeAttrs } from '../../../notations/uml/nodeAttrs';
import { measureTextWidthPx } from '../measureText';
import { UML_CLASSIFIER_METRICS, measureUmlClassifierBoxHeights } from '../../../notations/uml/measureClassifierText';

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
export function fitUmlBoxToText(
  el: Element,
  node: ViewNodeLayout,
  viewFormatting?: ViewFormatting
): { width: number; height: number } | null {
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
  const viewAllowsAttributes = viewFormatting?.umlUseNodeAttributes ?? true;
  const viewAllowsOperations = viewFormatting?.umlUseNodeOperations ?? true;

  const showAttributes = viewAllowsAttributes ? (attrs.showAttributes ?? true) : false;
  const showOperations = viewAllowsOperations ? (attrs.showOperations ?? true) : false;

  const name = el.name || '(unnamed)';
  const stereo = readStereotypeDisplayText(el.attrs) || '';

  // Render constants from notations/uml/renderNodeContent.tsx
  const { padX, minWidth } = UML_CLASSIFIER_METRICS;

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
  const width = clampMin(Math.ceil(contentW + padX * 2 + 2), minWidth);

  // Height: header + optional sections
  const h = measureUmlClassifierBoxHeights({
    hasStereotype: Boolean(stereo),
    collapsed,
    showAttributes,
    showOperations,
    attributeLines: attrLines.length,
    operationLines: opLines.length,
  });

  return { width, height: h.totalH };
}
