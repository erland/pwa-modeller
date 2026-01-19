import { parseXml } from '../framework/xml';
import { getXmiId } from './xmi';

type Inventory = Record<string, { count: number; sampleIds: string[] }>;

type TechSignals = {
  attributeNames: Record<string, { count: number; samples: string[] }>;
  elementNames: Record<string, { count: number; sampleIds: string[] }>;
};

export type EaXmiTechFingerprint = {
  namespaces: Record<string, string>;
  extensionTags: Inventory;
  profileTags: Inventory;
  stereotypeSignals: TechSignals;
  taggedValueSignals: TechSignals;
};

function addToInventory(inv: Inventory, key: string, id?: string): void {
  const entry = (inv[key] ??= { count: 0, sampleIds: [] });
  entry.count += 1;
  if (id && entry.sampleIds.length < 3 && !entry.sampleIds.includes(id)) entry.sampleIds.push(id);
}

function addToAttrSignals(
  sig: TechSignals,
  attrName: string,
  value: string | null,
  maxSamples = 3
): void {
  const k = attrName;
  const entry = (sig.attributeNames[k] ??= { count: 0, samples: [] });
  entry.count += 1;
  const v = (value ?? '').trim();
  if (!v) return;
  if (entry.samples.length >= maxSamples) return;
  if (!entry.samples.includes(v)) entry.samples.push(v);
}

function addToElementSignals(sig: TechSignals, elementTag: string, id?: string): void {
  const entry = (sig.elementNames[elementTag] ??= { count: 0, sampleIds: [] });
  entry.count += 1;
  if (id && entry.sampleIds.length < 3 && !entry.sampleIds.includes(id)) entry.sampleIds.push(id);
}

function isCorePrefix(prefix: string): boolean {
  const p = prefix.toLowerCase();
  return p === 'xmi' || p === 'uml' || p === 'xsi' || p === 'xml';
}

function nameLooksLikeStereotype(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes('stereotype');
}

function nameLooksLikeTaggedValue(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes('tagged') || n.includes('tagvalue') || n.includes('tag_value');
}

function sortedKeys<T extends Record<string, unknown>>(o: T): string[] {
  return Object.keys(o).sort((a, b) => a.localeCompare(b));
}

export function fingerprintEaXmiXmlText(xmlText: string): EaXmiTechFingerprint {
  const doc = parseXml(xmlText);
  return fingerprintEaXmiDocument(doc);
}

export function fingerprintEaXmiDocument(doc: Document): EaXmiTechFingerprint {
  const namespaces: Record<string, string> = {};
  const extensionTags: Inventory = {};
  const profileTags: Inventory = {};

  const stereotypeSignals: TechSignals = { attributeNames: {}, elementNames: {} };
  const taggedValueSignals: TechSignals = { attributeNames: {}, elementNames: {} };

  const root = doc.documentElement;
  if (!root) {
    return { namespaces, extensionTags, profileTags, stereotypeSignals, taggedValueSignals };
  }

  const collectNamespaceDecls = (el: Element) => {
    for (const a of Array.from(el.attributes)) {
      const name = a.name;
      if (name === 'xmlns') {
        if (!namespaces['(default)']) namespaces['(default)'] = a.value;
      } else if (name.startsWith('xmlns:')) {
        const prefix = name.slice('xmlns:'.length);
        if (prefix && !namespaces[prefix]) namespaces[prefix] = a.value;
      }
    }
    const prefix = el.prefix;
    const uri = el.namespaceURI;
    if (prefix && uri && !namespaces[prefix]) namespaces[prefix] = uri;
  };

  const walk = (el: Element, inExtension: boolean) => {
    collectNamespaceDecls(el);

    const tag = el.tagName;
    const id = getXmiId(el);
    const local = (el.localName || '').toLowerCase();

    const becomesExtensionRoot = local === 'extension' && (el.getAttribute('extender') || '').includes('Enterprise Architect');
    const nextInExtension = inExtension || becomesExtensionRoot;

    if (nextInExtension && !becomesExtensionRoot) {
      addToInventory(extensionTags, tag, id);
    }

    const prefix = el.prefix;
    if (!nextInExtension && prefix && !isCorePrefix(prefix)) {
      addToInventory(profileTags, tag, id);
    }

    for (const a of Array.from(el.attributes)) {
      const an = a.name;
      if (nameLooksLikeStereotype(an)) addToAttrSignals(stereotypeSignals, an, a.value);
      if (nameLooksLikeTaggedValue(an)) addToAttrSignals(taggedValueSignals, an, a.value);
    }

    if (nameLooksLikeStereotype(tag)) addToElementSignals(stereotypeSignals, tag, id);
    if (nameLooksLikeTaggedValue(tag)) addToElementSignals(taggedValueSignals, tag, id);

    for (const c of Array.from(el.children)) {
      walk(c, nextInExtension);
    }
  };

  walk(root, false);

  return { namespaces, extensionTags, profileTags, stereotypeSignals, taggedValueSignals };
}

function fmtInventory(inv: Inventory): string[] {
  const lines: string[] = [];
  for (const k of sortedKeys(inv)) {
    const v = inv[k];
    const ids = v.sampleIds.length ? ` ids=[${v.sampleIds.join(', ')}]` : '';
    lines.push(`- ${k}: ${v.count}${ids}`);
  }
  return lines;
}

function fmtSignals(sig: TechSignals): string[] {
  const out: string[] = [];
  const attrs = sig.attributeNames;
  const els = sig.elementNames;

  out.push('Attributes:');
  if (!Object.keys(attrs).length) {
    out.push('- (none)');
  } else {
    for (const k of sortedKeys(attrs)) {
      const v = attrs[k];
      const s = v.samples.length ? ` samples=[${v.samples.join(' | ')}]` : '';
      out.push(`- ${k}: ${v.count}${s}`);
    }
  }

  out.push('Elements:');
  if (!Object.keys(els).length) {
    out.push('- (none)');
  } else {
    for (const k of sortedKeys(els)) {
      const v = els[k];
      const ids = v.sampleIds.length ? ` ids=[${v.sampleIds.join(', ')}]` : '';
      out.push(`- ${k}: ${v.count}${ids}`);
    }
  }

  return out;
}

export function formatEaXmiTechFingerprint(fp: EaXmiTechFingerprint): string {
  const lines: string[] = [];
  lines.push('EA XMI tech fingerprint');
  lines.push('');

  lines.push('Namespaces:');
  if (!Object.keys(fp.namespaces).length) {
    lines.push('- (none)');
  } else {
    for (const k of sortedKeys(fp.namespaces)) {
      lines.push(`- ${k}: ${fp.namespaces[k]}`);
    }
  }

  lines.push('');
  lines.push('EA extension tags:');
  lines.push(...(Object.keys(fp.extensionTags).length ? fmtInventory(fp.extensionTags) : ['- (none)']));

  lines.push('');
  lines.push('Profile element tags:');
  lines.push(...(Object.keys(fp.profileTags).length ? fmtInventory(fp.profileTags) : ['- (none)']));

  lines.push('');
  lines.push('Stereotype signals:');
  lines.push(...fmtSignals(fp.stereotypeSignals));

  lines.push('');
  lines.push('Tagged value signals:');
  lines.push(...fmtSignals(fp.taggedValueSignals));

  return lines.join('\n');
}
