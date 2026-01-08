import type { TaggedValue } from '../../../../domain';
import { TaggedValuesSummary } from '../TaggedValuesSummary';

export type TaggedValuesSectionProps = {
  taggedValues?: TaggedValue[];
  onChange: (next: TaggedValue[] | undefined) => void;
  title?: string;
  dialogTitle?: string;
  allowNamespaces?: boolean;
  maxInline?: number;
};

export function TaggedValuesSection(props: TaggedValuesSectionProps) {
  return <TaggedValuesSummary {...props} />;
}
