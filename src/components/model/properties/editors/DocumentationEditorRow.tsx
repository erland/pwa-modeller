import { TextAreaRow } from './TextAreaRow';
import { normalizeOptionalText } from './normalizeText';

export type DocumentationEditorRowProps = {
  label?: string;
  ariaLabel: string;
  value?: string;
  onChange: (next: string | undefined) => void;
  disabled?: boolean;
};

export function DocumentationEditorRow({ label = 'Documentation', ariaLabel, value, onChange, disabled }: DocumentationEditorRowProps) {
  return (
    <TextAreaRow
      label={label}
      ariaLabel={ariaLabel}
      value={value ?? ''}
      disabled={disabled}
      onChange={(next) => onChange(normalizeOptionalText(next))}
    />
  );
}
