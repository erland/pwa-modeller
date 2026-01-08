import { TextInputRow } from './TextInputRow';
import { normalizeOptionalText } from './normalizeText';

export type NameEditorRowProps = {
  ariaLabel: string;
  value?: string;
  onChange: (next: string | undefined) => void;
  required?: boolean;
  disabled?: boolean;
};

export function NameEditorRow({ ariaLabel, value, onChange, required = false, disabled }: NameEditorRowProps) {
  return (
    <TextInputRow
      label="Name"
      ariaLabel={ariaLabel}
      value={value ?? ''}
      disabled={disabled}
      onChange={(next) => onChange(required ? next : normalizeOptionalText(next))}
    />
  );
}
