import { ChangeSetRecorder } from '../changeSetRecorder';

describe('ChangeSetRecorder', () => {
  test('flush produces deterministic sorted arrays and de-duplicates ids', () => {
    const r = new ChangeSetRecorder();

    // Insert out of order and with duplicates.
    r.upsertElement('b');
    r.upsertElement('a');
    r.upsertElement('b');
    r.upsertRelationship('r2');
    r.upsertRelationship('r1');
    r.upsertRelationship('r2');

    const cs = r.flush();
    expect(cs).not.toBeNull();
    expect(cs?.elementUpserts).toEqual(['a', 'b']);
    expect(cs?.relationshipUpserts).toEqual(['r1', 'r2']);
  });

  test('delete then upsert (and vice versa) resolves to the last intent', () => {
    const r = new ChangeSetRecorder();

    // upsert -> delete => delete wins
    r.upsertElement('e1');
    r.deleteElement('e1');

    // delete -> upsert => upsert wins
    r.deleteRelationship('rel1');
    r.upsertRelationship('rel1');

    const cs = r.flush();
    expect(cs?.elementUpserts).toEqual([]);
    expect(cs?.elementDeletes).toEqual(['e1']);
    expect(cs?.relationshipDeletes).toEqual([]);
    expect(cs?.relationshipUpserts).toEqual(['rel1']);
  });
});
