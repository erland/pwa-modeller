import { useMemo } from 'react';
import type { Model } from '../../domain';
import { buildPortalNavTree } from '../navigation/buildPortalNavTree';
import type { NavNode } from '../navigation/types';

export function usePortalNavTree(model: Model | null, rootFolderId: string | null): NavNode[] {
  return useMemo(() => {
    if (!model || !rootFolderId) return [];
    return buildPortalNavTree({ model, rootFolderId, includeElements: true });
  }, [model, rootFolderId]);
}
