type RelationshipLike = { type: string; unknownType?: { name?: string } };

export function relationshipTypeLabel(r: unknown): string {
  const rel = r as RelationshipLike;
  return rel.type === 'Unknown'
    ? rel.unknownType?.name
      ? `Unknown: ${rel.unknownType.name}`
      : 'Unknown'
    : rel.type;
}
