import { PropertyRow } from './PropertyRow';

export type TextInputRowProps = {
  label: string;
  ariaLabel?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function TextInputRow({ label, ariaLabel, value, onChange, placeholder, disabled }: TextInputRowProps) {
  return (
    <PropertyRow label={label}>
      <input
        className="textInput"
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </PropertyRow>
  );
}
