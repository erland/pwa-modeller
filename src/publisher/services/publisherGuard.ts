function getQueryParam(search: string, key: string): string | null {
  try {
    const sp = new URLSearchParams(search);
    const v = sp.get(key);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}

export function isPublisherEnabled(search: string): boolean {
  const q = getQueryParam(search, 'publisher');
  if (q === '1' || q === 'true') return true;
  try {
    return localStorage.getItem('publisher.enabled') === '1';
  } catch {
    return false;
  }
}

export function setPublisherEnabled(value: boolean): void {
  try {
    localStorage.setItem('publisher.enabled', value ? '1' : '0');
  } catch {
    // ignore
  }
}
