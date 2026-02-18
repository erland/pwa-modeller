import * as React from 'react';

export type FrameStyle = React.CSSProperties;
export type Renderer = (type: string, frameStyle: FrameStyle) => React.ReactNode;
