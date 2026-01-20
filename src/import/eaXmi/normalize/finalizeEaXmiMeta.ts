import type { IRModel } from '../../framework/ir';

export function finalizeEaXmiMeta(ir: IRModel): IRModel['meta'] {
  return {
    ...(ir.meta ?? {}),
    format: (ir.meta?.format ?? 'ea-xmi-uml').toString(),
    tool: (ir.meta?.tool ?? 'Sparx Enterprise Architect').toString(),
    sourceSystem: (ir.meta?.sourceSystem ?? 'sparx-ea').toString(),
    importedAtIso: (ir.meta?.importedAtIso ?? new Date().toISOString()).toString()
  };
}
