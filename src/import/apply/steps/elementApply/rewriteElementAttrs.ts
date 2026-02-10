import type { ApplyImportContext } from '../../applyImportTypes';
import { pushWarning } from '../../applyImportHelpers';

const isStringId = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;

export function mapParentElementId(opts: {
  ctx: Pick<ApplyImportContext, 'mappings' | 'report'>;
  ownerId: string;
  ownerName?: string;
  parentRef: unknown;
}): string | undefined {
  const { ctx, ownerId, ownerName, parentRef } = opts;
  if (parentRef === null || parentRef === undefined) return undefined;
  if (!isStringId(parentRef)) {
    pushWarning(ctx.report, `Import: element "${ownerName ?? ownerId}" has non-string parentElementId (cleared)`);
    return undefined;
  }
  const mapped = ctx.mappings.elements[parentRef];
  if (!mapped) {
    pushWarning(
      ctx.report,
      `Import: element "${ownerName ?? ownerId}" references missing parentElementId "${parentRef}" (cleared)`
    );
    return undefined;
  }
  return mapped;
}

function mapRefStrict(opts: {
  ctx: Pick<ApplyImportContext, 'mappings' | 'report'>;
  ownerId: string;
  ownerName?: string;
  field: string;
  ref: unknown;
}): { mapped?: string; unresolved?: string } {
  const { ctx, ownerId, ownerName, field, ref } = opts;
  if (!isStringId(ref)) return {};
  const mapped = ctx.mappings.elements[ref];
  if (mapped) return { mapped };
  pushWarning(ctx.report, `BPMN: element "${ownerName ?? ownerId}" has unresolved reference ${field}="${ref}" (cleared)`);
  return { unresolved: ref };
}

export function rewriteBpmnAttrs(opts: {
  ctx: Pick<ApplyImportContext, 'mappings' | 'report'>;
  ownerId: string;
  ownerName?: string;
  attrs: unknown;
}): unknown {
  const { ctx, ownerId, ownerName, attrs } = opts;
  if (!attrs || typeof attrs !== 'object') return attrs;

  const a: any = { ...(attrs as any) };
  const unresolvedRefs: Record<string, unknown> = {};

  const rewriteField = (field: string) => {
    if (!isStringId(a[field])) return;
    const { mapped, unresolved } = mapRefStrict({ ctx, ownerId, ownerName, field, ref: a[field] });
    if (mapped) a[field] = mapped;
    else if (unresolved) {
      delete a[field];
      unresolvedRefs[field] = unresolved;
    }
  };

  rewriteField('attachedToRef');
  rewriteField('dataObjectRef');
  rewriteField('dataStoreRef');
  rewriteField('processRef');

  if (Array.isArray(a.flowNodeRefs)) {
    const kept: string[] = [];
    const dropped: string[] = [];
    for (const r of a.flowNodeRefs as unknown[]) {
      const { mapped, unresolved } = mapRefStrict({ ctx, ownerId, ownerName, field: 'flowNodeRefs', ref: r });
      if (mapped) kept.push(mapped);
      else if (unresolved) dropped.push(unresolved);
    }
    if (kept.length) a.flowNodeRefs = kept;
    else delete a.flowNodeRefs;
    if (dropped.length) unresolvedRefs.flowNodeRefs = dropped;
  }

  const ed = a.eventDefinition;
  if (ed && typeof ed === 'object') {
    const ed2: any = { ...(ed as any) };

    const rewriteEd = (field: 'messageRef' | 'signalRef' | 'errorRef' | 'escalationRef') => {
      if (!isStringId(ed2[field])) return;
      const { mapped, unresolved } = mapRefStrict({
        ctx,
        ownerId,
        ownerName,
        field: `eventDefinition.${field}`,
        ref: ed2[field]
      });
      if (mapped) ed2[field] = mapped;
      else if (unresolved) {
        delete ed2[field];
        unresolvedRefs[`eventDefinition.${field}`] = unresolved;
      }
    };

    rewriteEd('messageRef');
    rewriteEd('signalRef');
    rewriteEd('errorRef');
    rewriteEd('escalationRef');

    a.eventDefinition = ed2;
  }

  // Gateway defaultFlowRef may point to a relationship id, not an element. We intentionally do not rewrite it.

  if (Object.keys(unresolvedRefs).length) {
    a.unresolvedRefs = unresolvedRefs;
  }
  return a;
}

export function rewriteUmlAttrs(opts: {
  ctx: Pick<ApplyImportContext, 'mappings' | 'report'>;
  ownerId: string;
  ownerName?: string;
  attrs: unknown;
}): unknown {
  const { ctx, ownerId, ownerName, attrs } = opts;
  if (!attrs || typeof attrs !== 'object') return attrs;

  const a: any = { ...(attrs as any) };
  const unresolvedRefs: Record<string, unknown> = {};

  const rewriteField = (field: string) => {
    if (!isStringId(a[field])) return;
    const mapped = ctx.mappings.elements[a[field]];
    if (mapped) a[field] = mapped;
    else {
      unresolvedRefs[field] = a[field];
      delete a[field];
    }
  };

  rewriteField('activityId');

  if (Array.isArray(a.ownedNodeRefs)) {
    const kept: string[] = [];
    const dropped: string[] = [];
    for (const r of a.ownedNodeRefs as unknown[]) {
      if (!isStringId(r)) continue;
      const mapped = ctx.mappings.elements[r];
      if (mapped) kept.push(mapped);
      else dropped.push(r);
    }
    if (kept.length) a.ownedNodeRefs = kept;
    else delete a.ownedNodeRefs;
    if (dropped.length) unresolvedRefs.ownedNodeRefs = dropped;
  }

  if (Object.keys(unresolvedRefs).length) {
    a.unresolvedRefs = { ...(a.unresolvedRefs ?? {}), ...unresolvedRefs };
    pushWarning(ctx.report, `UML: element "${ownerName ?? ownerId}" has unresolved references in attrs (some fields cleared)`);
  }

  return a;
}
