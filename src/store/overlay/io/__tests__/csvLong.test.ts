import type { Model } from '../../../../domain/types';
import { OVERLAY_FILE_FORMAT_V1 } from '../../../../domain/overlay';
import { OverlayStore } from '../../OverlayStore';
import { importCsvLongToStore, parseCsvLong, serializeOverlayStoreToCsvLong } from '../csvLong';

function makeEmptyModel(): Model {
  return {
    id: 'm1',
    metadata: { name: 'Test' },
    elements: {},
    relationships: {},
    views: {},
    folders: {}
  };
}

describe('csv long overlay io', () => {
  test('parse: basic rows', () => {
    const csv = [
      'kind,entry_id,primary_ref_scheme,primary_ref_value,refs_json,tag_key,tag_value,tag_value_json',
      'element,ovl1,archimate-exchange,id-1,"[{""scheme"":""archimate-exchange"",""value"":""id-1""}]",owner,alice,"\"alice\""'
    ].join('\n');

    const res = parseCsvLong(csv);
    expect(res.warnings).toEqual([]);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].kind).toBe('element');
    expect(res.rows[0].entryId).toBe('ovl1');
    expect(res.rows[0].tagKey).toBe('owner');
  });

  test('export: emits at least header and one row', () => {
    const store = new OverlayStore();
    store.upsertEntry({
      kind: 'element',
      externalRefs: [{ scheme: 'archimate-exchange', value: 'id-1' }],
      tags: { owner: 'alice' }
    });

    const csv = serializeOverlayStoreToCsvLong({ overlayStore: store });
    expect(csv.split('\n')[0]).toContain('kind,entry_id');
    expect(csv).toContain('owner');
  });

  test('import: merge applies tags and produces report', () => {
    const model = makeEmptyModel();
    model.elements.e1 = {
      id: 'e1',
      type: 'BusinessActor' as any,
      name: 'E1',
      layer: 'Business',
      externalIds: [{ system: 'archimate-exchange', id: 'id-1' }]
    } as any;

    const csv = [
      'kind,entry_id,primary_ref_scheme,primary_ref_value,refs_json,tag_key,tag_value,tag_value_json',
      'element,,archimate-exchange,id-1,,owner,alice,"\"alice\""'
    ].join('\n');

    const store = new OverlayStore();
    const res = importCsvLongToStore({ overlayStore: store, model, csvText: csv });
    expect(res.file.format).toBe(OVERLAY_FILE_FORMAT_V1);
    expect(store.listEntries()).toHaveLength(1);
    const entry = store.listEntries()[0];
    expect(entry.tags.owner).toBe('alice');
    expect(res.report.counts.attached + res.report.counts.orphan + res.report.counts.ambiguous).toBe(1);
  });
});
