import { PropertyRow } from './PropertyRow';

export type TextAreaRowProps = {
  label: string;
  ariaLabel?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function TextAreaRow({ label, ariaLabel, value, onChange, placeholder, disabled }: TextAreaRowProps) {
  return (
    <PropertyRow label={label}>
      <textarea
        className="textArea"
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </PropertyRow>
  );
}
