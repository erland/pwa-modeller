import type { Model } from '../types';
import { UML_ELEMENT_TYPES, UML_RELATIONSHIP_TYPES } from '../config/catalog';
import { kindFromTypeId } from '../kindFromTypeId';
import { makeIssue } from './issues';
import type { ValidationIssue } from './types';

const UML_GENERALIZABLE_TYPES = new Set([
  'uml.class',
  'uml.interface',
  'uml.enum',
  'uml.datatype',
  'uml.primitiveType',
  'uml.component',
  'uml.node',
  'uml.device',
  'uml.executionEnvironment',
  'uml.actor',
  'uml.usecase',
]);

export function validateUmlBasics(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // ------------------------------
  // Unknown UML element/relationship types
  // ------------------------------
  const allowedElements = new Set(UML_ELEMENT_TYPES);
  const allowedRelationships = new Set(UML_RELATIONSHIP_TYPES);

  for (const el of Object.values(model.elements)) {
    const kind = el.kind ?? kindFromTypeId(el.type);
    if (kind !== 'uml') continue;
    if (el.type !== 'Unknown' && !allowedElements.has(el.type)) {
      issues.push(
        makeIssue(
          'warning',
          `UML element ${el.id} has unknown type: ${el.type}`,
          { kind: 'element', elementId: el.id },
          `uml-el-unknown-type:${el.id}`
        )
      );
    }
  }

  for (const rel of Object.values(model.relationships)) {
    const kind = rel.kind ?? kindFromTypeId(rel.type);
    if (kind !== 'uml') continue;
    if (rel.type !== 'Unknown' && !allowedRelationships.has(rel.type)) {
      issues.push(
        makeIssue(
          'warning',
          `UML relationship ${rel.id} has unknown type: ${rel.type}`,
          { kind: 'relationship', relationshipId: rel.id },
          `uml-rel-unknown-type:${rel.id}`
        )
      );
    }
  }



  // ------------------------------
  // Relationship endpoint sanity (selected UML relationships)
  // ------------------------------
  const UML_DEPLOYMENT_TARGET_TYPES = new Set(['uml.node', 'uml.device', 'uml.executionEnvironment']);

  for (const rel of Object.values(model.relationships)) {
    const kind = rel.kind ?? kindFromTypeId(rel.type);
    if (kind !== 'uml') continue;
    if (rel.type === 'Unknown') continue;
    if (!rel.sourceElementId || !rel.targetElementId) continue;
    const sEl = model.elements[rel.sourceElementId];
    const tEl = model.elements[rel.targetElementId];
    if (!sEl || !tEl) continue;
    const sType = sEl.type;
    const tType = tEl.type;

    if (rel.type === 'uml.include' || rel.type === 'uml.extend') {
      if (!(sType === 'uml.usecase' && tType === 'uml.usecase')) {
        issues.push(
          makeIssue(
            'warning',
            `UML ${rel.type} should connect UseCase -> UseCase (got ${sType} -> ${tType}).`,
            { kind: 'relationship', relationshipId: rel.id },
            `uml-rel-endpoints:${rel.id}`
          )
        );
      }
    }

    if (rel.type === 'uml.realization') {
      if (!((sType === 'uml.class' || sType === 'uml.component') && tType === 'uml.interface')) {
        issues.push(
          makeIssue(
            'warning',
            `UML realization should connect Class/Component -> Interface (got ${sType} -> ${tType}).`,
            { kind: 'relationship', relationshipId: rel.id },
            `uml-rel-endpoints:${rel.id}`
          )
        );
      }
    }

    if (rel.type === 'uml.deployment') {
      if (!(sType === 'uml.artifact' && UML_DEPLOYMENT_TARGET_TYPES.has(tType))) {
        issues.push(
          makeIssue(
            'warning',
            `UML deployment should connect Artifact -> Node/Device/ExecutionEnvironment (got ${sType} -> ${tType}).`,
            { kind: 'relationship', relationshipId: rel.id },
            `uml-rel-endpoints:${rel.id}`
          )
        );
      }
    }

    if (rel.type === 'uml.communicationPath') {
      if (!(UML_DEPLOYMENT_TARGET_TYPES.has(sType) && UML_DEPLOYMENT_TARGET_TYPES.has(tType))) {
        issues.push(
          makeIssue(
            'warning',
            `UML communicationPath should connect Node/Device/ExecutionEnvironment <-> Node/Device/ExecutionEnvironment (got ${sType} -> ${tType}).`,
            { kind: 'relationship', relationshipId: rel.id },
            `uml-rel-endpoints:${rel.id}`
          )
        );
      }
    }
  }

  // ------------------------------
  // View node kind mismatches (e.g. ArchiMate element placed in a UML view)
  // ------------------------------
  for (const view of Object.values(model.views)) {
    if (view.kind !== 'uml') continue;
    const nodes = view.layout?.nodes ?? [];
    for (const n of nodes) {
      if (!n.elementId) continue;
      const el = model.elements[n.elementId];
      if (!el) continue;
      const kind = el.kind ?? kindFromTypeId(el.type);
      if (kind !== 'uml') {
        issues.push(
          makeIssue(
            'warning',
            `UML view ${view.name} (${view.id}) contains a non-UML element: ${el.name} (${el.type})`,
            { kind: 'viewNode', viewId: view.id, elementId: el.id },
            `uml-viewnode-kind-mismatch:${view.id}:${el.id}`
          )
        );
      }
    }
  }

  // ------------------------------
  // Generalization cycle detection (classifier graph)
  // ------------------------------
  // Build adjacency: subclass -> superclass via uml.generalization
  const adj = new Map<string, Array<{ to: string; relId: string }>>();
  const umlGeneralizables = new Set<string>();
  for (const el of Object.values(model.elements)) {
    const kind = el.kind ?? kindFromTypeId(el.type);
    if (kind === 'uml' && UML_GENERALIZABLE_TYPES.has(el.type)) umlGeneralizables.add(el.id);
  }

  for (const rel of Object.values(model.relationships)) {
    if (rel.type !== 'uml.generalization') continue;
    if (!rel.sourceElementId || !rel.targetElementId) continue;
    if (!umlGeneralizables.has(rel.sourceElementId) || !umlGeneralizables.has(rel.targetElementId)) continue;
    const from = rel.sourceElementId;
    const to = rel.targetElementId;
    const list = adj.get(from) ?? [];
    list.push({ to, relId: rel.id });
    adj.set(from, list);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const parent = new Map<string, { prev: string; relId: string }>();
  const cycleRelIds = new Set<string>();

  function dfs(u: string) {
    visited.add(u);
    inStack.add(u);

    for (const e of adj.get(u) ?? []) {
      const v = e.to;
      if (!visited.has(v)) {
        parent.set(v, { prev: u, relId: e.relId });
        dfs(v);
      } else if (inStack.has(v)) {
        // Found a back edge u -> v. Collect rel ids on the cycle.
        cycleRelIds.add(e.relId);
        let cur = u;
        // Walk back until we reach v, collecting relationship ids along the path.
        while (cur !== v) {
          const p = parent.get(cur);
          if (!p) break;
          cycleRelIds.add(p.relId);
          cur = p.prev;
        }
      }
    }

    inStack.delete(u);
  }

  for (const nodeId of umlGeneralizables) {
    if (!visited.has(nodeId)) dfs(nodeId);
  }

  for (const relId of cycleRelIds) {
    issues.push(
      makeIssue(
        'error',
        `Generalization cycle detected (relationship ${relId}). UML generalization must be acyclic.`,
        { kind: 'relationship', relationshipId: relId },
        `uml-generalization-cycle:${relId}`
      )
    );
  }

  return issues;
}
