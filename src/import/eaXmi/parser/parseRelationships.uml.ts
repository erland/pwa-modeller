import type { ImportReport } from '../../importReport';
import type { IRRelationship } from '../../framework/ir';

import { attr, attrAny, localName } from '../../framework/xml';
import { inferUmlQualifiedRelationshipTypeFromEaClassifier } from '../mapping';
import { getXmiId, getXmiIdRef, getXmiType } from '../xmi';
import {
  ParseEaXmiRelationshipsResult,
  extractDocumentation,
  extractUmlGuardText,
  findOwningClassifierId,
  getEaGuid,
  getEaTypeHint,
  getStereotype,
  metaClassFromXmiType,
  normalizeMetaClassFromLocalName,
  parseEndpointsForMetaclass,
  resolveRefIds,
} from './parseRelationships.common';

import { writeStereotypes } from '../../../domain/umlStereotypes';

function findOwningPackageId(el: Element): string | undefined {
  let p: Element | null = el.parentElement;
  while (p) {
    // EA and other exporters sometimes use xmi:type, while others use xsi:type (as in UML2 default serialization).
    const effectiveType = (getXmiType(p) ?? attrAny(p, ['xsi:type']) ?? '').trim();
    const tLower = effectiveType.toLowerCase();
    if (tLower.startsWith('uml:')) {
      const mc = metaClassFromXmiType(effectiveType);
      if (mc && mc.toLowerCase() === 'package') {
        return getXmiId(p) ?? undefined;
      }
      // treat uml:Model as a package-like namespace for imports
      if (mc && mc.toLowerCase() === 'model') {
        return getXmiId(p) ?? undefined;
      }
    }
    p = p.parentElement;
  }
  return undefined;
}

/**
 * Step 7: Parse relationships (generalization/realization/dependency/include/extend).
 */
export function parseEaXmiRelationships(doc: Document, report: ImportReport): ParseEaXmiRelationshipsResult {
  const relationships: IRRelationship[] = [];
  const seenIds = new Set<string>();
  const seenTriples = new Set<string>();
  let synthCounter = 0;

  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all.item(i);
    if (!el) continue;

    const xmiType = getXmiType(el);
    let metaclass = metaClassFromXmiType(xmiType) ?? normalizeMetaClassFromLocalName(localName(el));
    const eaTypeHint = getEaTypeHint(el);
    if (eaTypeHint) {
      const hint = eaTypeHint.trim();
      if (hint === 'ControlFlow' || hint === 'ObjectFlow') metaclass = hint;
    }
    if (!metaclass) continue;

    // Only handle Step-7 relationship kinds.
    if (
      metaclass !== 'Generalization' &&
      metaclass !== 'Realization' &&
      metaclass !== 'InterfaceRealization' &&
      metaclass !== 'Dependency' &&
      metaclass !== 'Include' &&
      metaclass !== 'Extend' &&
      metaclass !== 'ControlFlow' &&
      metaclass !== 'ObjectFlow' &&
      metaclass !== 'PackageImport'
    ) {
      continue;
    }

    const stereotype = getStereotype(el);
    const stLower = (stereotype ?? '').trim().toLowerCase();

    // EA often exports UML include/extend as a Dependency with a stereotype.
    // Prefer the stereotype semantics when present.
    let qualifiedType = inferUmlQualifiedRelationshipTypeFromEaClassifier({ metaclass, stereotype });
    if (metaclass === 'Dependency') {
      if (stLower === 'include') qualifiedType = 'uml.include';
      else if (stLower === 'extend') qualifiedType = 'uml.extend';
      else if (stLower === 'deployment') qualifiedType = 'uml.deployment';
    }
    if (!qualifiedType) continue;

    // UML PackageImport is represented as <packageImport importedPackage="…"/> owned by the importing package.
    if (metaclass === 'PackageImport') {
      const sourceId = findOwningPackageId(el);
      const targetId = (attr(el, 'importedPackage') ?? '').trim();
      if (!sourceId || !targetId) continue;

      const id = getXmiId(el) ?? `pkgImport_synth_${++synthCounter}`;
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const triple = `${qualifiedType}|${sourceId}|${targetId}`;
      if (seenTriples.has(triple)) continue;
      seenTriples.add(triple);

      relationships.push({
        id,
        type: qualifiedType,
        sourceId,
        targetId,
        meta: {
          metaclass: 'PackageImport',
          ...(xmiType ? { xmiType } : {}),
        },
      });
      continue;
    }

    let { sources, targets } = parseEndpointsForMetaclass(el, metaclass);

    // Embedded forms often omit "client"/"specific" and rely on the owning classifier.
    if (sources.length === 0) {
      const owner = findOwningClassifierId(el);
      if (owner) sources = [owner];
    }

    // Special-case embedded generalization: <generalization general="…" /> under a classifier.
    if (metaclass === 'Generalization') {
      if (targets.length === 0) targets = resolveRefIds(el, 'general');
    }

    if (!sources.length || !targets.length) {
      report.warnings.push(
        `EA XMI: Skipped relationship (metaclass=${metaclass}) because endpoints could not be resolved (sources=${sources.join(
          ' ',
        ) || '∅'}, targets=${targets.join(' ') || '∅'}).`,
      );
      continue;
    }

    // Some XMI allows multiple clients/suppliers; we emit one IR relationship per pair.
    const baseId = getXmiId(el) ?? getXmiIdRef(el) ?? undefined;
    const eaGuid = getEaGuid(el);
    const docText = extractDocumentation(el);
    const name = (attr(el, 'name') ?? '').trim() || undefined;

    let pairIdx = 0;
    for (const src of sources) {
      for (const tgt of targets) {
        pairIdx++;
        let id = baseId;

        if (id && (sources.length > 1 || targets.length > 1)) {
          id = `${id}_${pairIdx}`;
        }
        if (!id) {
          synthCounter++;
          id = `eaRel_synth_${synthCounter}`;
        }

        const tripleKey = `${qualifiedType}|${src}|${tgt}`;
        if (seenIds.has(id)) {
          report.warnings.push(`EA XMI: Duplicate relationship id "${id}" encountered; skipping subsequent occurrence.`);
          continue;
        }
        // For synthetic ids, also avoid duplicates by type+endpoints.
        if (!baseId && seenTriples.has(tripleKey)) {
          continue;
        }
        seenIds.add(id);
        seenTriples.add(tripleKey);

        const externalIds = [
          ...(getXmiId(el) ? [{ system: 'xmi', id: getXmiId(el)!, kind: 'xmi-id' as const }] : []),
          ...(eaGuid ? [{ system: 'sparx-ea', id: eaGuid, kind: 'relationship-guid' as const }] : []),
        ];

        const taggedValues = [...(stereotype ? [{ key: 'stereotype', value: stereotype }] : [])];

        // Step 5 (UML Activity properties): capture guard text for ControlFlow/ObjectFlow when present.
        const guardText = metaclass === 'ControlFlow' || metaclass === 'ObjectFlow' ? extractUmlGuardText(el) : undefined;

        // Store UML stereotype in attrs (canonical stereotypes[], keep legacy stereotype string in sync).
        const baseAttrs: Record<string, unknown> = guardText ? ({ guard: guardText } as Record<string, unknown>) : {};
        const relAttrs = stereotype
          ? writeStereotypes(baseAttrs, [stereotype])
          : (Object.keys(baseAttrs).length ? baseAttrs : undefined);

        relationships.push({
          id,
          type: qualifiedType,
          sourceId: src,
          targetId: tgt,
          name,
          documentation: docText,
          ...(relAttrs ? { attrs: relAttrs } : {}),
          ...(externalIds.length ? { externalIds } : {}),
          ...(taggedValues.length ? { taggedValues } : {}),
          meta: {
            ...(xmiType ? { xmiType } : {}),
            metaclass,
          },
        });
      }
    }
  }

  return { relationships };
}
