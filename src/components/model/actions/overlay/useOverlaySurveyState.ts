import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Element, Model, Relationship } from '../../../../domain';
import { computeModelSignature } from '../../../../domain';
import { overlayStore } from '../../../../store';
import type { SurveyImportOptions, SurveyTargetSet } from '../../../../store/overlay';

export function useOverlaySurveyState(model: Model | null) {
  const [surveyTargetSet, setSurveyTargetSet] = useState<SurveyTargetSet>('elements');
  const [surveyElementTypes, setSurveyElementTypes] = useState<string[]>([]);
  const [surveyRelationshipTypes, setSurveyRelationshipTypes] = useState<string[]>([]);
  const [surveyTagKeysText, setSurveyTagKeysText] = useState<string>('');
  const [surveyImportOptions, setSurveyImportOptions] = useState<SurveyImportOptions>({ blankMode: 'ignore' });

  const availableSurveyElementTypes = useMemo(() => {
    if (!model) return [] as string[];
    const set = new Set<string>();
    for (const el of Object.values(model.elements ?? {})) {
      const t = String(el.type ?? '').trim();
      if (t) set.add(t);
    }
    return [...set.values()].sort();
  }, [model]);

  const availableSurveyRelationshipTypes = useMemo(() => {
    if (!model) return [] as string[];
    const set = new Set<string>();
    for (const rel of Object.values(model.relationships ?? {})) {
      const t = String(rel.type ?? '').trim();
      if (t) set.add(t);
    }
    return [...set.values()].sort();
  }, [model]);

  const modelSignature = useMemo(() => (model ? computeModelSignature(model) : ''), [model]);

  useEffect(() => {
    // When a new model is loaded/imported, reset survey type filters to "all".
    setSurveyElementTypes([]);
    setSurveyRelationshipTypes([]);
  }, [modelSignature]);

  const suggestSurveyKeys = useCallback(() => {
    if (!model) return { keys: [] as string[] };

    const set = new Set<string>();

    // Overlay keys
    for (const e of overlayStore.listEntries()) {
      for (const k0 of Object.keys(e.tags ?? {})) {
        const k = (k0 ?? '').toString().trim();
        if (k) set.add(k);
      }
    }

    // Core tagged values keys
    for (const el of Object.values(model.elements ?? {})) {
      const e = el as Element;
      for (const tv of e.taggedValues ?? []) {
        const k = (tv?.key ?? '').toString().trim();
        if (k) set.add(k);
      }
    }
    for (const rel of Object.values(model.relationships ?? {})) {
      const r = rel as Relationship;
      for (const tv of r.taggedValues ?? []) {
        const k = (tv?.key ?? '').toString().trim();
        if (k) set.add(k);
      }
    }

    const keys = [...set.values()]
      .map((s) => s.trim())
      .filter((s) => !!s)
      .sort()
      .slice(0, 40);

    setSurveyTagKeysText(keys.join('\n'));
    return { keys };
  }, [model]);

  return {
    surveyTargetSet,
    setSurveyTargetSet,
    availableSurveyElementTypes,
    availableSurveyRelationshipTypes,
    surveyElementTypes,
    setSurveyElementTypes,
    surveyRelationshipTypes,
    setSurveyRelationshipTypes,
    surveyTagKeysText,
    setSurveyTagKeysText,
    surveyImportOptions,
    setSurveyImportOptions,
    suggestSurveyKeys
  };
}
