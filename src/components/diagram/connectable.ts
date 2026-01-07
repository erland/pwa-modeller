export type ConnectableKind = 'element' | 'connector';

export type ConnectableRef = {
  kind: ConnectableKind;
  id: string;
};

export function refKey(ref: ConnectableRef): string {
  return `${ref.kind}:${ref.id}`;
}

export function sameRef(a: ConnectableRef | null | undefined, b: ConnectableRef | null | undefined): boolean {
  return Boolean(a && b && a.kind === b.kind && a.id === b.id);
}
