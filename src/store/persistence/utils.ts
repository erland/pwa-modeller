export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function uniquePush(target: string[], ids: string[]): void {
  for (const id of ids) {
    if (!target.includes(id)) target.push(id);
  }
}
