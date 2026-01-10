const fs = require('fs');
const path = require('path');
import type { ElementType, RelationshipType } from '../../types';
import {
  parseRelationshipTableXml,
  getAllowedRelationshipTypesFromMatrix,
  isRelationshipAllowedByMatrix
} from '../relationshipMatrix';

function readRelationshipTable(): string {
  const p = path.resolve(__dirname, '../data/relationships.xml');
  return fs.readFileSync(p, 'utf-8');
}

describe('relationshipMatrix', () => {
  it('parses the relationship table and yields allowed relationships for known concept pairs', () => {
    const xml = readRelationshipTable();
    const matrix = parseRelationshipTableXml(xml);

    const source: ElementType = 'BusinessProcess';
    const target: ElementType = 'BusinessObject';

    const allowed = getAllowedRelationshipTypesFromMatrix(matrix, source, target, { includeDerived: true });

    // From the relationship tables this pair should allow at least Access and Association.
    expect(allowed).toContain<RelationshipType>('Access');
    expect(allowed).toContain<RelationshipType>('Association');
  });

  it('can validate a relationship type against the matrix', () => {
    const xml = readRelationshipTable();
    const matrix = parseRelationshipTableXml(xml);

    expect(
      isRelationshipAllowedByMatrix(matrix, 'BusinessProcess', 'BusinessObject', 'Access', { includeDerived: true })
    ).toBe(true);

    // Triggering between BusinessProcess and BusinessObject should not be allowed.
    expect(
      isRelationshipAllowedByMatrix(matrix, 'BusinessProcess', 'BusinessObject', 'Triggering', { includeDerived: true })
    ).toBe(false);
  });
});
