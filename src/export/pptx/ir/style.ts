import type { PptxColorHex } from './types';

export type PptxLineStyle = {
  color?: PptxColorHex;
  width?: number;
  dashed?: boolean;
};

export type PptxFillStyle = {
  color?: PptxColorHex;
};

export type PptxTextStyle = {
  color?: PptxColorHex;
  fontFace?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
};
