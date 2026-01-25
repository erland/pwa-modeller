export type PortfolioPresetStateV1 = {
  layers: string[];
  types: string[];
  search: string;
  primaryMetricKey: string;
  hideMissingMetric: boolean;
  showDegree: boolean;
  showReach3: boolean;
  groupBy: 'none' | 'type' | 'layer';
  sortKey: 'name' | 'type' | 'layer' | 'metric' | 'degree' | 'reach3';
  sortDir: 'asc' | 'desc';
};

export type PortfolioPresetV1 = {
  version: 1;
  id: string;
  name: string;
  createdAt: string; // ISO
  state: Partial<PortfolioPresetStateV1>;
};

type AnyPreset = PortfolioPresetV1;

function key(modelId: string): string {
  return `ea-modeller:analysis:portfolio:presets:${modelId}`;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

const DEFAULT_STATE: PortfolioPresetStateV1 = {
  layers: [],
  types: [],
  search: '',
  primaryMetricKey: '',
  hideMissingMetric: false,
  showDegree: false,
  showReach3: false,
  groupBy: 'none',
  sortKey: 'name',
  sortDir: 'asc'
};

export function normalizePortfolioPresetState(input: Partial<PortfolioPresetStateV1> | null | undefined): PortfolioPresetStateV1 {
  const s = input ?? {};
  const layers = Array.isArray(s.layers) ? s.layers.filter((x) => typeof x === 'string') : [];
  const types = Array.isArray(s.types) ? s.types.filter((x) => typeof x === 'string') : [];
  const groupBy = s.groupBy === 'type' || s.groupBy === 'layer' || s.groupBy === 'none' ? s.groupBy : DEFAULT_STATE.groupBy;
  const sortKey =
    s.sortKey === 'name' ||
    s.sortKey === 'type' ||
    s.sortKey === 'layer' ||
    s.sortKey === 'metric' ||
    s.sortKey === 'degree' ||
    s.sortKey === 'reach3'
      ? s.sortKey
      : DEFAULT_STATE.sortKey;
  const sortDir = s.sortDir === 'desc' || s.sortDir === 'asc' ? s.sortDir : DEFAULT_STATE.sortDir;

  return {
    layers,
    types,
    search: typeof s.search === 'string' ? s.search : DEFAULT_STATE.search,
    primaryMetricKey: typeof s.primaryMetricKey === 'string' ? s.primaryMetricKey : DEFAULT_STATE.primaryMetricKey,
    hideMissingMetric: typeof s.hideMissingMetric === 'boolean' ? s.hideMissingMetric : DEFAULT_STATE.hideMissingMetric,
    showDegree: typeof s.showDegree === 'boolean' ? s.showDegree : DEFAULT_STATE.showDegree,
    showReach3: typeof s.showReach3 === 'boolean' ? s.showReach3 : DEFAULT_STATE.showReach3,
    groupBy,
    sortKey,
    sortDir
  };
}

function normalizePreset(input: unknown): AnyPreset | null {
  if (!input || typeof input !== 'object') return null;
  const p = input as Partial<AnyPreset>;
  if (p.version !== 1) return null;
  if (!p.id || typeof p.id !== 'string') return null;
  if (!p.name || typeof p.name !== 'string') return null;
  if (!p.createdAt || typeof p.createdAt !== 'string') return null;
  return {
    version: 1,
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    state: normalizePortfolioPresetState(p.state as Partial<PortfolioPresetStateV1>)
  };
}

export function loadPortfolioPresets(modelId: string): AnyPreset[] {
  if (!modelId) return [];
  const parsed = safeParse<unknown>(localStorage.getItem(key(modelId)));
  if (!Array.isArray(parsed)) return [];
  const out: AnyPreset[] = [];
  for (const x of parsed) {
    const p = normalizePreset(x);
    if (p) out.push(p);
  }
  // Newest first.
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function savePortfolioPresets(modelId: string, presets: AnyPreset[]): void {
  if (!modelId) return;
  localStorage.setItem(key(modelId), JSON.stringify(presets));
}
