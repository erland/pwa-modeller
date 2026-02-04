import type { ReactNode } from 'react';
import { useRef } from 'react';

type HiddenFilePickerProps = {
  accept: string;
  onFile: (file: File | null) => void | Promise<void>;
  children: (open: () => void) => ReactNode;
};

/**
 * A reusable hidden <input type="file"> wrapper.
 *
 * Usage:
 *  <HiddenFilePicker accept=".json" onFile={handleFile}>{(open) => <button onClick={open} />}</HiddenFilePicker>
 */
export function HiddenFilePicker(props: HiddenFilePickerProps) {
  const { accept, onFile, children } = props;
  const ref = useRef<HTMLInputElement | null>(null);

  const open = () => {
    const el = ref.current;
    if (!el) return;
    el.value = '';
    el.click();
  };

  return (
    <>
      {children(open)}
      <input
        ref={ref}
        type="file"
        accept={accept}
        style={{ position: 'fixed', left: -10000, top: -10000, width: 1, height: 1, opacity: 0 }}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0] ?? null;
          e.currentTarget.value = '';
          void onFile(f);
        }}
      />
    </>
  );
}
