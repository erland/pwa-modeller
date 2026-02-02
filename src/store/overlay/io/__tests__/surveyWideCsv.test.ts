import type { Model } from '../../../../domain/types';
import { computeModelSignature } from '../../../../domain/overlay';
import { OverlayStore } from '../../OverlayStore';
import { importOverlaySurveyCsvToStore, parseCsv, serializeOverlaySurveyCsv } from '../surveyWideCsv';

function makeModel(): Model {
  return {
    id: 'm1',
    metadata: { name: 'Test' },
    elements: {
      e1: {
        id: 'e1',
        type: 'BusinessActor' as any,
        name: 'E1',
        layer: 'Business',
        externalIds: [{ system: 'xmi', id: 'EAID_1' }],
        taggedValues: [{ id: 't1', key: 'owner', value: 'core', type: 'string', ns: '' }] as any
      } as any
    },
    relationships: {},
    views: {},
    folders: {}
  };
}

describe('survey wide csv io', () => {
  test('export includes header and model signature row', () => {
    const model = makeModel();
    const store = new OverlayStore();
    const csv = serializeOverlaySurveyCsv({
      model,
      overlayStore: store,
      options: { targetSet: 'elements', tagKeys: ['owner'], prefillFromEffectiveTags: true }
    });

    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(['kind', 'target_id', 'ref_scheme', 'ref_scope', 'ref_value', 'name', 'type', 'owner']);
    expect(rows[1][0]).toBe('#model_signature');
    expect(rows[1][1]).toBe(computeModelSignature(model));
  });

  test('import updates matching overlay entry and produces resolve report', () => {
    const model = makeModel();
    const store = new OverlayStore();

    // existing overlay tag to be overwritten
    store.upsertEntry({ kind: 'element', externalRefs: [{ scheme: 'xmi', value: 'EAID_1' }], tags: { owner: 'old' } });

    const csv = [
      'kind,target_id,ref_scheme,ref_scope,ref_value,name,type,owner',
      `#model_signature,${computeModelSignature(model)},,,,,,`,
      'element,e1,xmi,,EAID_1,E1,BusinessActor,alice'
    ].join('\n');

    const res = importOverlaySurveyCsvToStore({ model, overlayStore: store, csvText: csv, options: { blankMode: 'ignore' } });
    const entry = store.listEntries()[0];
    expect(entry.tags.owner).toBe('alice');
    expect(res.resolveReport.counts.attached).toBeGreaterThanOrEqual(1);
  });

  test('signature mismatch yields warning', () => {
    const model = makeModel();
    const store = new OverlayStore();
    const csv = [
      'kind,target_id,ref_scheme,ref_scope,ref_value,name,type,owner',
      '#model_signature,other,,,,,,',
      'element,e1,xmi,,EAID_1,E1,BusinessActor,alice'
    ].join('\n');

    const res = importOverlaySurveyCsvToStore({ model, overlayStore: store, csvText: csv, options: { blankMode: 'ignore' } });
    expect(res.warnings.some((w) => w.includes('signature mismatch'))).toBe(true);
  });

  test('import supports semicolon and tab separators', () => {
    const model = makeModel();
    const store = new OverlayStore();

    const run = (sep: string) => {
      store.clear();
      store.upsertEntry({ kind: 'element', externalRefs: [{ scheme: 'xmi', value: 'EAID_1' }], tags: { owner: 'old' } });
      const lines = [
        ['kind', 'target_id', 'ref_scheme', 'ref_scope', 'ref_value', 'name', 'type', 'owner'].join(sep),
        ['#model_signature', computeModelSignature(model), '', '', '', '', '', ''].join(sep),
        ['element', 'e1', 'xmi', '', 'EAID_1', 'E1', 'BusinessActor', 'bob'].join(sep)
      ].join('\n');
      const res = importOverlaySurveyCsvToStore({ model, overlayStore: store, csvText: lines, options: { blankMode: 'ignore' } });
      const entry = store.listEntries()[0];
      expect(entry.tags.owner).toBe('bob');
      expect(res.resolveReport.counts.attached).toBeGreaterThanOrEqual(1);
    };

    run(';');
    run('\t');
  });
});
