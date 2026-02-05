import type { AnalysisRequest } from '../../domain/analysis';
import type { AnalysisViewKind, AnalysisViewState } from '../../components/analysis/contracts/analysisViewState';
import type { ExportBundle } from '../contracts/ExportBundle';
import type { ExportOptions } from '../contracts/ExportOptions';

export type ExportReportItem = {
  id: string;
  createdAt: string; // ISO timestamp
  kind: AnalysisViewKind;
  title: string;
  modelName: string;
  exportOptions: ExportOptions;
  analysisRequest: AnalysisRequest;
  analysisViewState: AnalysisViewState;
  bundle: ExportBundle;
};

const STORAGE_KEY = 'ea_modeller_export_report_v1';

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadExportReport(): ExportReportItem[] {
  if (typeof localStorage === 'undefined') return [];
  const parsed = safeParse<ExportReportItem[]>(localStorage.getItem(STORAGE_KEY));
  if (!parsed || !Array.isArray(parsed)) return [];
  return parsed;
}

export function saveExportReport(items: ExportReportItem[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function addToExportReport(item: Omit<ExportReportItem, 'id' | 'createdAt'>): ExportReportItem {
  const full: ExportReportItem = {
    ...item,
    id: crypto?.randomUUID ? crypto.randomUUID() : `r_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
  };
  const items = loadExportReport();
  items.unshift(full);
  // Keep it lightweight: cap to 50 entries.
  saveExportReport(items.slice(0, 50));
  return full;
}

export function clearExportReport(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

export function exportReportAsJsonBlob(items: ExportReportItem[]): Blob {
  return new Blob([JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), items }, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
}
