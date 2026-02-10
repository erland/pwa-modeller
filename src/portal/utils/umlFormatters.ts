import type { UmlAttribute, UmlOperation } from '../../domain/uml/members';

export function isUmlClassifierType(t: string): boolean {
  return t === 'uml.class' || t === 'uml.associationClass' || t === 'uml.interface' || t === 'uml.datatype';
}

export function formatUmlVisibility(v?: string): string {
  switch (v) {
    case 'public':
      return '+';
    case 'private':
      return '-';
    case 'protected':
      return '#';
    case 'package':
      return '~';
  }
  return '';
}

export function formatMultiplicity(m?: { lower?: string; upper?: string }): string {
  const lo = (m?.lower ?? '').trim();
  const hi = (m?.upper ?? '').trim();
  if (!lo && !hi) return '';
  if (!hi) return `[${lo}]`;
  return `[${lo || '0'}..${hi}]`;
}

export function formatUmlAttribute(a: UmlAttribute): string {
  const vis = formatUmlVisibility(a.visibility);
  const name = a.name?.trim() ?? '';
  const type = (a.dataTypeName ?? '').trim();
  const mult = formatMultiplicity(a.multiplicity);
  const def = (a.defaultValue ?? '').trim();
  const parts: string[] = [];
  if (vis) parts.push(vis);
  parts.push(name || '(unnamed)');
  if (type) parts.push(`: ${type}`);
  if (mult) parts.push(` ${mult}`);
  if (a.isStatic) parts.push(' {static}');
  if (def) parts.push(` = ${def}`);
  return parts.join('');
}

export function formatUmlOperation(o: UmlOperation): string {
  const vis = formatUmlVisibility(o.visibility);
  const name = o.name?.trim() ?? '';
  const params = (o.params ?? []).map((p) => {
    const pn = (p.name ?? '').trim();
    const pt = (p.type ?? '').trim();
    return pt ? `${pn}: ${pt}` : pn;
  });
  const returnType = (o.returnType ?? '').trim();
  const parts: string[] = [];
  if (vis) parts.push(vis);
  parts.push(`${name || '(unnamed)'}(${params.filter(Boolean).join(', ')})`);
  if (returnType) parts.push(`: ${returnType}`);
  if (o.isAbstract) parts.push(' {abstract}');
  if (o.isStatic) parts.push(' {static}');
  return parts.join('');
}
