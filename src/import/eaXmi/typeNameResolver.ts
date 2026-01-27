import { attr, attrAny, childByLocalName } from '../framework/xml';
import { resolveById, resolveHrefId } from './resolve';
import { getXmiIdRef } from './xmi';

function looksLikeInternalId(id: string): boolean {
  return (
    id.startsWith('_') ||
    id.startsWith('EAID_') ||
    id.startsWith('EAPK_') ||
    id.startsWith('eaEl_synth_') ||
    id.startsWith('EAGen_')
  );
}

function isHumanReadableTypeToken(s: string | undefined | null): boolean {
  const v = (s ?? '').trim();
  if (!v) return false;
  if (v.length > 120) return false;
  // HREFs are handled explicitly by the resolver.
  if (v.includes('://')) return false;
  // Never treat UML/XMI metaclass tokens as datatypes.
  if (v.startsWith('uml:') || v.startsWith('xmi:')) return false;
  if (looksLikeInternalId(v)) return false;
  return true;
}

function tryResolvePrimitiveTypeNameFromHref(href: string): string | undefined {
  const s = href.trim();
  if (!s || !s.includes('://')) return undefined;

  // Common patterns:
  // - http://schema.omg.org/spec/UML/2.1/String
  // - http://schema.omg.org/spec/UML/2.1/Types.xmi#String
  const afterHash = s.includes('#') ? s.split('#').pop() : undefined;
  const tail = afterHash && afterHash.trim() ? afterHash.trim() : s.split('/').filter(Boolean).pop();
  const token = (tail ?? '').trim();
  if (!token) return undefined;

  // Avoid returning UML metaclasses from the profile (e.g. Property, Class).
  const forbidden = new Set([
    'Property',
    'Class',
    'Association',
    'Dependency',
    'Activity',
    'Artifact',
    'Generalization',
  ]);
  if (forbidden.has(token)) return undefined;

  if (!isHumanReadableTypeToken(token)) return undefined;
  return token;
}

function tryResolveTypeNameFromElementContext(contextEl: Element): string | undefined {
  const props = childByLocalName(contextEl, 'properties');
  if (props) {
    const t = attrAny(props, ['type', 'datatype', 'dataType', 'typename', 'typeName', 'classifier', 'classifierName']);
    if (isHumanReadableTypeToken(t)) return (t ?? '').trim();
  }

  const typeChild = childByLocalName(contextEl, 'type');
  if (typeChild) {
    const n = attrAny(typeChild, ['name', 'type', 'typename', 'typeName']);
    if (isHumanReadableTypeToken(n)) return (n ?? '').trim();
  }

  const keyCandidates = new Set(['type', 'datatype', 'datatypename', 'typename', 'classifier', 'classifiername']);
  const all = contextEl.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all.item(i);
    if (!el) continue;

    const key = (attrAny(el, ['tag', 'name', 'key']) ?? '').trim().toLowerCase();
    if (!key || !keyCandidates.has(key)) continue;

    const val = attrAny(el, ['value', 'val', 'body', 'text']) ?? el.textContent;
    if (isHumanReadableTypeToken(val)) return (val ?? '').trim();
  }

  return undefined;
}

export type TypeResolution = {
  /** Raw ref (idref or href or token) as found in XMI. */
  ref?: string;
  /** Resolved human name when available (String, Person, MyDataType). */
  name?: string;
};

function isClearlyWrongDatatypeToken(token: string | undefined | null, metaclass?: string): boolean {
  const v = (token ?? '').trim();
  if (!v) return true;
  if (v.startsWith('uml:') || v.startsWith('xmi:')) return true;
  if (metaclass && v === metaclass) return true;
  return false;
}

export function createTypeNameResolver(index: Map<string, Element>, idToName?: Map<string, string>) {
  const cache = new Map<string, string | undefined>();

  const resolveFromRef = (rawRef: string, contextEl?: Element, metaclass?: string): string | undefined => {
    const ref = rawRef.trim();
    if (!ref) return undefined;
    if (ref.startsWith('uml:') || ref.startsWith('xmi:')) return undefined;

    // Never accept the metaclass token as a datatype.
    if (metaclass && ref === metaclass) return undefined;

    if (cache.has(ref)) return cache.get(ref);

    let resolved: string | undefined;

    const primitiveFromHref = tryResolvePrimitiveTypeNameFromHref(ref);
    if (primitiveFromHref) {
      resolved = primitiveFromHref;
    } else {
      const hrefId = resolveHrefId(ref);
      const id = hrefId ?? ref;
      const target = resolveById(index, id);
      if (target) {
        const n = (idToName?.get(id) ?? attr(target, 'name') ?? '').trim();
        resolved = n || undefined;
      }

      if (!resolved && contextEl) {
        resolved = tryResolveTypeNameFromElementContext(contextEl);
      }

      if (!resolved && isHumanReadableTypeToken(id)) {
        resolved = id;
      }
    }

    // Hard guardrail: never return uml:* tokens or the metaclass as datatype.
    if (isClearlyWrongDatatypeToken(resolved, metaclass)) resolved = undefined;

    cache.set(ref, resolved);
    return resolved;
  };

  const readTypeRefFromElement = (el: Element, metaclass?: string): string | undefined => {
    const direct = attr(el, 'type');
    if (direct && direct.trim()) {
      const v = direct.trim();
      // Guard against xmi:type leakage.
      if (!v.startsWith('uml:') && !v.startsWith('xmi:') && (!metaclass || v !== metaclass)) return v;
    }

    const typeChild = childByLocalName(el, 'type');
    if (typeChild) {
      const idref = getXmiIdRef(typeChild);
      if (idref && (!metaclass || idref !== metaclass)) return idref;

      const href = attrAny(typeChild, ['href']);
      if (href && href.trim()) return href.trim();
    }

    return undefined;
  };

  const resolveFromElement = (el: Element, metaclass?: string): TypeResolution => {
    const ref = readTypeRefFromElement(el, metaclass);
    const name = ref ? resolveFromRef(ref, el, metaclass) : undefined;

    // Final safety: never emit obviously-wrong refs/names.
    const safeRef = isClearlyWrongDatatypeToken(ref, metaclass) ? undefined : ref;
    const safeName = isClearlyWrongDatatypeToken(name, metaclass) ? undefined : name;
    return { ref: safeRef ?? undefined, name: safeName ?? undefined };
  };

  return {
    readTypeRefFromElement,
    resolveFromRef,
    resolveFromElement,
  };
}
