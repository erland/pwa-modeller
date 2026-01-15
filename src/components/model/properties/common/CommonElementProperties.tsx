import { useEffect, useMemo, useState } from 'react';
import type { ElementType, FolderOption, Model, View, ViewNodeLayout } from '../../../../domain';
import { kindFromTypeId, computeRelationshipTrace } from '../../../../domain';
import { getNotation } from '../../../../notations/registry';

import type { Selection } from '../../selection';
import type { ModelActions } from '../actions';
import { PropertiesPanelHost, type PropertiesSection } from './PropertiesPanelHost';
import { findFolderContaining, getElementLabel, splitRelationshipsForElement } from '../utils';
import { CreateRelationshipDialog } from '../../navigator/dialogs/CreateRelationshipDialog';
import { NameEditorRow } from '../editors/NameEditorRow';
import { DocumentationEditorRow } from '../editors/DocumentationEditorRow';
import { ExternalIdsSection } from '../sections/ExternalIdsSection';
import { TaggedValuesSection } from '../sections/TaggedValuesSection';
import { PropertyRow } from '../editors/PropertyRow';

type TraceDirection = 'outgoing' | 'incoming' | 'both';

type Props = {
  model: Model;
  elementId: string;
  actions: ModelActions;
  elementFolders: FolderOption[];
  onSelect?: (selection: Selection) => void;
  /** Notation-specific sections (rendered as-is). */
  notationSections?: PropertiesSection[];
};

export function CommonElementProperties({ model, elementId, actions, elementFolders, onSelect, notationSections }: Props) {
  // Note: Avoid conditional hooks by allowing the component to render a fallback
  // after all hooks have been invoked.
  const el = model.elements[elementId];
  const hasElement = Boolean(el);
  const kind: 'archimate' | 'uml' | 'bpmn' = hasElement ? (el!.kind ?? kindFromTypeId(el!.type as unknown as string)) : 'archimate';
  const safeType: ElementType = hasElement ? (el!.type as ElementType) : ('Unknown' as ElementType);

  const [createRelationshipOpen, setCreateRelationshipOpen] = useState(false);

  const [traceDirection, setTraceDirection] = useState<TraceDirection>('both');
  const [traceDepth, setTraceDepth] = useState<number>(1);

  const kindTypeOptions = useMemo(() => getNotation(kind).getElementTypeOptions(), [kind]);
  const kindTypeIds = useMemo<ElementType[]>(() => kindTypeOptions.map((o) => o.id as ElementType), [kindTypeOptions]);
  const kindTypeLabelById = useMemo(() => new Map(kindTypeOptions.map((o) => [o.id, o.label] as const)), [kindTypeOptions]);

  const elementTypeOptions = useMemo<ElementType[]>(() => {
    const base = kindTypeIds;
    const withUnknown = safeType === 'Unknown' ? (['Unknown', ...base] as ElementType[]) : base;

    // Keep current value visible even if it is out-of-sync (e.g., imported data).
    return withUnknown.includes(safeType) ? withUnknown : ([safeType, ...withUnknown] as ElementType[]);
  }, [kindTypeIds, safeType]);

  useEffect(() => {
    setTraceDirection('both');
    setTraceDepth(1);
  }, [elementId]);

  const currentFolderId = hasElement ? findFolderContaining(model, 'element', el!.id) : null;

  const relatedForElement = useMemo(() => {
    return splitRelationshipsForElement(model, elementId);
  }, [model, elementId]);

  const traceSteps = useMemo(() => {
    return computeRelationshipTrace(model, elementId, traceDirection, traceDepth);
  }, [model, elementId, traceDirection, traceDepth]);

  const incoming = relatedForElement.incoming;
  const outgoing = relatedForElement.outgoing;

  const usedInViews = useMemo(() => {
    return (Object.values(model.views) as View[])
      .filter(
        (v) =>
          hasElement &&
          Boolean(v.layout) &&
          v.layout!.nodes.some((n: ViewNodeLayout) => n.elementId === elementId),
      )
      .map((v) => {
        const count = v.layout && hasElement ? v.layout.nodes.filter((n: ViewNodeLayout) => n.elementId === elementId).length : 0;
        return { id: v.id, name: v.name, count };
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [model, hasElement, elementId]);

  const onSelectSafe = onSelect ?? (() => undefined);
  const canCreateRelationship = kind === 'archimate' && Object.keys(model.elements).length >= 2;

  type RelationshipLike = { type: string; unknownType?: { name?: string } };
  const relationshipTypeLabel = (r: unknown): string => {
    const rel = r as RelationshipLike;
    return rel.type === 'Unknown'
      ? rel.unknownType?.name
        ? `Unknown: ${rel.unknownType.name}`
        : 'Unknown'
      : rel.type;
  };

  if (!hasElement) return <p className="panelHint">Element not found.</p>;


  return (
    <div>
      <p className="panelHint">Element</p>
      <div className="propertiesGrid">
        <NameEditorRow
          ariaLabel="Element property name"
          required
          value={el.name}
          onChange={(next) => actions.updateElement(el.id, { name: next ?? '' })}
        />
                {kind !== 'archimate' ? (
          <PropertyRow label="Type">
            <select
              className="selectInput"
              value={el.type}
              onChange={(e) => {
                const nextType = e.target.value as ElementType;
                const nextKind = kindFromTypeId(nextType as unknown as string);

                // If switching between notations, keep the element consistent.
                if (nextKind !== kind) {
                  actions.updateElement(el.id, { type: nextType, kind: nextKind, layer: undefined });
                } else {
                  actions.updateElement(el.id, { type: nextType });
                }
              }}
            >
              {elementTypeOptions.map((t) => {
                const label =
                  t === 'Unknown'
                    ? el.unknownType?.name
                      ? `Unknown: ${el.unknownType.name}`
                      : 'Unknown'
                    : (kindTypeLabelById.get(t) ?? t);
                return (
                  <option key={t} value={t}>
                    {label}
                  </option>
                );
              })}
            </select>
          </PropertyRow>
        ) : null}


        <DocumentationEditorRow
          label="Documentation"
          ariaLabel="Element property documentation"
          value={el.documentation}
          onChange={(next) => actions.updateElement(el.id, { documentation: next })}
        />
        <PropertyRow label="Folder">
            <select
              className="selectInput"
              value={currentFolderId ?? ''}
              onChange={(e) => {
                const targetId = e.target.value;
                if (targetId) actions.moveElementToFolder(el.id, targetId);
              }}
            >
              {elementFolders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
        </PropertyRow>
      </div>

      {notationSections ? <PropertiesPanelHost sections={notationSections} /> : null}

      <ExternalIdsSection externalIds={el.externalIds} />

      <TaggedValuesSection
        taggedValues={el.taggedValues}
        onChange={(next) => actions.updateElement(el.id, { taggedValues: next })}
        dialogTitle={`Element tagged values — ${el.name || el.id}`}
      />

      <div style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <p className="panelHint" style={{ margin: 0 }}>
            Relationships
          </p>
          <button
            type="button"
            className="miniButton"
            disabled={!canCreateRelationship}
            title={
              kind !== 'archimate'
                ? 'Relationship creation from this panel is ArchiMate-only (for now).'
                : canCreateRelationship
                  ? 'Create relationship'
                  : 'Create at least two elements first'
            }
            onClick={() => setCreateRelationshipOpen(true)}
          >
            New relationship…
          </button>
        </div>
        <div className="propertiesGrid">
          <div className="propertiesRow">
            <div className="propertiesKey">Used in views</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              {usedInViews.length === 0 ? (
                <span style={{ opacity: 0.7 }}>None</span>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {usedInViews.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className="miniButton"
                      aria-label={`Select view ${v.name}`}
                      onClick={() => onSelect?.({ kind: 'viewNode', viewId: v.id, elementId: el.id })}
                    >
                      {v.name}
                      {v.count > 1 ? ` (${v.count})` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="propertiesRow">
            <div className="propertiesKey">Outgoing</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              {outgoing.length === 0 ? (
                <span style={{ opacity: 0.7 }}>None</span>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  {outgoing.map((r) => {
                    const targetSelection: Selection | null = r.targetElementId
                      ? { kind: 'element', elementId: r.targetElementId }
                      : r.targetConnectorId
                        ? { kind: 'connector', connectorId: r.targetConnectorId }
                        : null;

                    const targetName = r.targetElementId
                      ? getElementLabel(model, r.targetElementId)
                      : r.targetConnectorId
                        ? (() => {
                            const c = model.connectors?.[r.targetConnectorId];
                            const typeLabel = c?.type ?? 'Connector';
                            return c?.name ? `${c.name} (${typeLabel})` : typeLabel;
                          })()
                        : '(missing endpoint)';
                    const relLabel = `${relationshipTypeLabel(r)}${r.name ? ` — ${r.name}` : ''}`;
                    return (
                      <div key={r.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                        <button
                          type="button"
                          className="miniButton"
                          aria-label={`Select relationship ${relLabel}`}
                          onClick={() => onSelect?.({ kind: 'relationship', relationshipId: r.id })}
                        >
                          {relLabel}
                        </button>
                        <span style={{ opacity: 0.7 }}>→</span>
                        {targetSelection ? (
                          <button
                            type="button"
                            className="miniButton"
                            aria-label={`Select target ${targetName}`}
                            onClick={() => onSelect?.(targetSelection)}
                          >
                            {targetName}
                          </button>
                        ) : (
                          <span style={{ opacity: 0.8 }}>{targetName}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="propertiesRow">
            <div className="propertiesKey">Incoming</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              {incoming.length === 0 ? (
                <span style={{ opacity: 0.7 }}>None</span>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  {incoming.map((r) => {
                    const sourceSelection: Selection | null = r.sourceElementId
                      ? { kind: 'element', elementId: r.sourceElementId }
                      : r.sourceConnectorId
                        ? { kind: 'connector', connectorId: r.sourceConnectorId }
                        : null;

                    const sourceName = r.sourceElementId
                      ? getElementLabel(model, r.sourceElementId)
                      : r.sourceConnectorId
                        ? (() => {
                            const c = model.connectors?.[r.sourceConnectorId];
                            const typeLabel = c?.type ?? 'Connector';
                            return c?.name ? `${c.name} (${typeLabel})` : typeLabel;
                          })()
                        : '(missing endpoint)';
                    const relLabel = `${relationshipTypeLabel(r)}${r.name ? ` — ${r.name}` : ''}`;
                    return (
                      <div key={r.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                        {sourceSelection ? (
                          <button
                            type="button"
                            className="miniButton"
                            aria-label={`Select source ${sourceName}`}
                            onClick={() => onSelect?.(sourceSelection)}
                          >
                            {sourceName}
                          </button>
                        ) : (
                          <span style={{ opacity: 0.8 }}>{sourceName}</span>
                        )}
                        <span style={{ opacity: 0.7 }}>→</span>
                        <button
                          type="button"
                          className="miniButton"
                          aria-label={`Select relationship ${relLabel}`}
                          onClick={() => onSelect?.({ kind: 'relationship', relationshipId: r.id })}
                        >
                          {relLabel}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <p className="panelHint">Trace</p>
        <div className="propertiesGrid">
          <div className="propertiesRow">
            <div className="propertiesKey">Direction</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="Trace direction"
                value={traceDirection}
                onChange={(e) => setTraceDirection(e.target.value as TraceDirection)}
              >
                <option value="both">Both</option>
                <option value="outgoing">Outgoing</option>
                <option value="incoming">Incoming</option>
              </select>
            </div>
          </div>

          <div className="propertiesRow">
            <div className="propertiesKey">Depth</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="Trace depth"
                value={String(traceDepth)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setTraceDepth(Number.isFinite(n) && n >= 1 && n <= 5 ? n : 1);
                }}
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
          {traceSteps.length === 0 ? (
            <div style={{ opacity: 0.7 }}>No trace results.</div>
          ) : (
            traceSteps.map((s, idx) => {
              const relLabel = `${relationshipTypeLabel(s.relationship)}${s.relationship.name ? ` — ${s.relationship.name}` : ''}`;
              const fromName = getElementLabel(model, s.fromId);
              const toName = getElementLabel(model, s.toId);
              return (
                <div
                  key={`${s.relationship.id}_${idx}`}
                  style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}
                >
                  <span style={{ opacity: 0.7 }}>d{s.depth}</span>
                  <button
                    type="button"
                    className="miniButton"
                    aria-label={`Select relationship ${relLabel}`}
                    onClick={() => onSelect?.({ kind: 'relationship', relationshipId: s.relationship.id })}
                  >
                    {relLabel}
                  </button>
                  <span style={{ opacity: 0.7 }}>:</span>
                  <button
                    type="button"
                    className="miniButton"
                    aria-label={`Select element ${fromName}`}
                    onClick={() => onSelect?.({ kind: 'element', elementId: s.fromId })}
                  >
                    {fromName}
                  </button>
                  <span style={{ opacity: 0.7 }}>→</span>
                  <button
                    type="button"
                    className="miniButton"
                    aria-label={`Select element ${toName}`}
                    onClick={() => onSelect?.({ kind: 'element', elementId: s.toId })}
                  >
                    {toName}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          className="shellButton"
          onClick={() => {
            const ok = window.confirm('Delete this element? Relationships referencing it will also be removed.');
            if (!ok) return;
            actions.deleteElement(el.id);
          }}
        >
          Delete element
        </button>
      </div>

      <CreateRelationshipDialog
        model={model}
        isOpen={createRelationshipOpen}
        prefillSourceElementId={el.id}
        onClose={() => setCreateRelationshipOpen(false)}
        onSelect={onSelectSafe}
      />
    </div>
  );
}
