import { useMemo, useState } from 'react';

import type { Model } from '../../domain';
import type { Selection } from '../../components/model/selection';
import { formatElementTypeLabel, formatRelationshipTypeLabel } from '../../components/ui/typeLabels';
import { readUmlClassifierMembers, type UmlAttribute, type UmlOperation } from '../../domain/uml/members';
import { isUmlClassifierTypeId } from '../../domain/uml/typeGroups';
import { curateTaggedValues } from '../utils/taggedValueCuration';

type PortalIndexesLike = {
  // Keep the prop flexible: the inspector skeleton should not *require* indexes.
  // Future steps can tighten this once we depend on portal indexes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
} | null;

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 12,
        border: '1px solid var(--borderColor, rgba(0,0,0,0.12))',
        borderRadius: 12,
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 8 }}>{props.title}</div>
      {props.children}
    </div>
  );
}

function visibilityToken(v: string | undefined): string {
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

function renderMultiplicity(a: UmlAttribute): string {
  const lower = a.multiplicity?.lower?.trim();
  const upper = a.multiplicity?.upper?.trim();
  if (!lower && !upper) return '';
  const l = lower ?? '';
  const u = upper ?? '';
  if (l && u) return `[${l}..${u}]`;
  if (l && !u) return `[${l}..]`;
  if (!l && u) return `[..${u}]`;
  return '';
}

function renderAttributeSignature(a: UmlAttribute): string {
  const vis = visibilityToken(a.visibility);
  const name = a.name?.trim() || '(unnamed)';
  const t = (a.dataTypeName ?? '').trim();
  const mult = renderMultiplicity(a);
  const def = (a.defaultValue ?? '').trim();
  const parts: string[] = [];
  if (vis) parts.push(vis);
  parts.push(name);
  if (t) parts.push(`: ${t}`);
  if (mult) parts.push(` ${mult}`);
  if (def) parts.push(` = ${def}`);
  if (a.isStatic) parts.push(' {static}');
  return parts.join('');
}

function renderOperationSignature(o: UmlOperation): string {
  const vis = visibilityToken(o.visibility);
  const name = o.name?.trim() || '(unnamed)';
  const params = (o.params ?? [])
    .map((p) => {
      const pn = (p.name ?? '').trim();
      const pt = (p.type ?? '').trim();
      if (!pn && !pt) return '';
      if (pn && pt) return `${pn}: ${pt}`;
      return pn || pt;
    })
    .filter(Boolean)
    .join(', ');
  const rt = (o.returnType ?? '').trim();
  const parts: string[] = [];
  if (vis) parts.push(vis);
  parts.push(`${name}(${params})`);
  if (rt) parts.push(`: ${rt}`);
  if (o.isStatic) parts.push(' {static}');
  if (o.isAbstract) parts.push(' {abstract}');
  return parts.join('');
}

function MembersList(props: { items: string[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {props.items.map((s, idx) => (
        <div
          key={idx}
          style={{
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: 12,
            lineHeight: 1.3,
            padding: '6px 8px',
            borderRadius: 10,
            border: '1px solid var(--borderColor, rgba(0,0,0,0.12))',
            background: 'rgba(0,0,0,0.02)',
            overflowX: 'auto',
          }}
          title={s}
        >
          {s}
        </div>
      ))}
    </div>
  );
}

function resolveEndpoint(
  model: Model,
  ref: { elementId?: string; connectorId?: string }
): { title: string; subtitle?: string; id: string } | null {
  if (ref.elementId) {
    const el = model.elements[ref.elementId];
    if (!el) return { title: '(missing element)', subtitle: ref.elementId, id: ref.elementId };
    const t = String(el.type ?? '');
    return {
      title: el.name?.trim() || '(unnamed)',
      subtitle: formatElementTypeLabel({ type: t }) || t || 'Unknown',
      id: el.id,
    };
  }
  if (ref.connectorId) {
    const c = model.connectors?.[ref.connectorId];
    if (!c) return { title: '(missing connector)', subtitle: ref.connectorId, id: ref.connectorId };
    const t = String(c.type ?? '');
    return {
      title: c.name?.trim() || '(connector)',
      subtitle: t,
      id: c.id,
    };
  }
  return null;
}

function toTrimmedString(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = typeof v === 'string' ? v : String(v);
  const t = s.trim();
  return t.length ? t : undefined;
}

export function PortalInspectorPanel(props: {
  model: Model;
  selection: Selection;
  indexes?: PortalIndexesLike;
}) {
  const { model, selection } = props;
  const [docExpanded, setDocExpanded] = useState(false);

  const selected = useMemo(() => {
    if (selection.kind === 'element' || selection.kind === 'viewNode') {
      const elementId = selection.kind === 'element' ? selection.elementId : selection.elementId;
      const el = model.elements[elementId];
      if (!el) return { kind: 'none' as const };
      return { kind: 'element' as const, elementId, element: el };
    }
    if (selection.kind === 'relationship') {
      const relationshipId = selection.relationshipId;
      const rel = model.relationships[relationshipId];
      if (!rel) return { kind: 'none' as const };
      return { kind: 'relationship' as const, relationshipId, relationship: rel };
    }
    return { kind: 'none' as const };
  }, [model, selection]);

  const header = useMemo(() => {
    if (selected.kind === 'element') {
      const name = selected.element.name?.trim() || '(unnamed)';
      const type = String(selected.element.type ?? '');
      return {
        title: name,
        subtitle: formatElementTypeLabel({ type }) || type || 'Unknown',
        documentation: (selected.element.documentation ?? '').trim(),
        kind: 'element' as const,
      };
    }
    if (selected.kind === 'relationship') {
      const name = (selected.relationship.name ?? '').trim();
      const type = String(selected.relationship.type ?? '');
      return {
        title: name || '(unnamed relationship)',
        subtitle: formatRelationshipTypeLabel({ type }) || type || 'Unknown',
        documentation: (selected.relationship.documentation ?? '').trim(),
        kind: 'relationship' as const,
      };
    }
    return null;
  }, [selected]);

  const umlMembers = useMemo(() => {
    if (selected.kind !== 'element') return null;
    const t = String(selected.element.type ?? '');
    if (!isUmlClassifierTypeId(t)) return null;
    const m = readUmlClassifierMembers(selected.element, { includeEmptyNames: false });
    const attributes = (m.attributes ?? []).map(renderAttributeSignature).filter(Boolean);
    const operations = (m.operations ?? []).map(renderOperationSignature).filter(Boolean);
    if (!attributes.length && !operations.length) return null;
    return { attributes, operations };
  }, [selected]);

  const taggedValuesInfo = useMemo(() => {
    const list =
      selected.kind === 'element'
        ? selected.element.taggedValues
        : selected.kind === 'relationship'
          ? selected.relationship.taggedValues
          : undefined;

    const hasAny = (list?.length ?? 0) > 0;
    const curated = curateTaggedValues(list);
    return { hasAny, curated };
  }, [selected]);

  const relationshipDetails = useMemo(() => {
    if (selected.kind !== 'relationship') return null;

    const rel = selected.relationship;
    const from = resolveEndpoint(model, { elementId: rel.sourceElementId, connectorId: rel.sourceConnectorId });
    const to = resolveEndpoint(model, { elementId: rel.targetElementId, connectorId: rel.targetConnectorId });

    const attrs = (rel.attrs && typeof rel.attrs === 'object' ? (rel.attrs as Record<string, unknown>) : undefined) ?? {};

    const fields: Array<{ label: string; value: string }> = [];

    // Common intrinsic fields
    if (from) fields.push({ label: 'From', value: `${from.title} — ${from.subtitle ?? ''}`.trim() });
    if (to) fields.push({ label: 'To', value: `${to.title} — ${to.subtitle ?? ''}`.trim() });

    // ArchiMate intrinsic attrs
    if (rel.type === 'Access') {
      const v = toTrimmedString(attrs.accessType);
      if (v) fields.push({ label: 'Access', value: v });
    }
    if (rel.type === 'Association') {
      const v = typeof attrs.isDirected === 'boolean' ? (attrs.isDirected ? 'Yes' : 'No') : undefined;
      if (v) fields.push({ label: 'Directed', value: v });
    }
    if (rel.type === 'Influence') {
      const v = toTrimmedString(attrs.influenceStrength);
      if (v) fields.push({ label: 'Strength', value: v });
    }

    // UML end metadata (if present)
    if (typeof rel.type === 'string' && rel.type.startsWith('uml.')) {
      const stereotype = toTrimmedString(attrs.stereotype);
      if (stereotype) fields.push({ label: 'Stereotype', value: stereotype });

      const sr = toTrimmedString(attrs.sourceRole);
      const tr = toTrimmedString(attrs.targetRole);
      if (sr) fields.push({ label: 'Source role', value: sr });
      if (tr) fields.push({ label: 'Target role', value: tr });

      const sm = toTrimmedString(attrs.sourceMultiplicity);
      const tm = toTrimmedString(attrs.targetMultiplicity);
      if (sm) fields.push({ label: 'Source multiplicity', value: sm });
      if (tm) fields.push({ label: 'Target multiplicity', value: tm });

      if (typeof attrs.sourceNavigable === 'boolean')
        fields.push({ label: 'Source navigable', value: attrs.sourceNavigable ? 'Yes' : 'No' });
      if (typeof attrs.targetNavigable === 'boolean')
        fields.push({ label: 'Target navigable', value: attrs.targetNavigable ? 'Yes' : 'No' });
    }

    return fields.length ? fields : null;
  }, [model, selected]);

  return (
    <div
      style={{
        width: 400,
        minWidth: 360,
        maxWidth: 460,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          padding: 12,
          border: '1px solid var(--borderColor, rgba(0,0,0,0.12))',
          borderRadius: 12,
        }}
      >
        {header ? (
          <>
            <div style={{ fontSize: 16, fontWeight: 900, lineHeight: 1.2 }}>{header.title}</div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>{header.subtitle}</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 16, fontWeight: 900, lineHeight: 1.2 }}>Inspector</div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>Click a node or edge to inspect it.</div>
          </>
        )}
      </div>

      {header?.documentation ? (
        <Section title="Description">
          <div
            style={
              docExpanded
                ? { whiteSpace: 'pre-wrap', lineHeight: 1.35 }
                : {
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.35,
                    display: '-webkit-box',
                    WebkitLineClamp: 10,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }
            }
          >
            {header.documentation}
          </div>
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              onClick={() => setDocExpanded((v) => !v)}
              style={{
                padding: '4px 8px',
                borderRadius: 10,
                border: '1px solid var(--borderColor, rgba(0,0,0,0.12))',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              {docExpanded ? 'Show less' : 'Show more'}
            </button>
          </div>
        </Section>
      ) : null}

      {relationshipDetails ? (
        <Section title="Relationship">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {relationshipDetails.map((f) => (
              <div
                key={f.label}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 1fr',
                  gap: 10,
                  alignItems: 'start',
                  fontSize: 12,
                  lineHeight: 1.35,
                }}
              >
                <div style={{ fontWeight: 800, opacity: 0.85 }}>{f.label}</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{f.value}</div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {umlMembers?.attributes?.length ? (
        <Section title="UML Attributes">
          <MembersList items={umlMembers.attributes} />
        </Section>
      ) : null}

      {umlMembers?.operations?.length ? (
        <Section title="UML Operations">
          <MembersList items={umlMembers.operations} />
        </Section>
      ) : null}

      {taggedValuesInfo.hasAny ? (
        <Section title="Tagged values">
          {taggedValuesInfo.curated.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {taggedValuesInfo.curated.map((t) => (
                <div
                  key={`${t.label}:${t.value}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '140px 1fr',
                    gap: 10,
                    alignItems: 'start',
                    fontSize: 12,
                    lineHeight: 1.35,
                  }}
                >
                  <div style={{ fontWeight: 800, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.label}>
                    {t.label}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{t.value}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.75 }}>No key metadata.</div>
          )}
        </Section>
      ) : null}
    </div>
  );
}
