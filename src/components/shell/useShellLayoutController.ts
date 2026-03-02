import { useEffect, useRef, useState } from 'react';

type ResizeSide = null | 'left' | 'right';

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();

    // NOTE: TypeScript's DOM lib assumes `addEventListener` exists on MediaQueryList,
    // which makes feature checks like `'addEventListener' in mql` narrow the else.
    // Compatibility: older Safari/iOS versions only support addListener/removeListener.
    type MqlCompat = MediaQueryList & {
      addEventListener?: (type: 'change', listener: (ev: MediaQueryListEvent) => void) => void;
      removeEventListener?: (type: 'change', listener: (ev: MediaQueryListEvent) => void) => void;
      addListener?: (listener: (ev: MediaQueryListEvent) => void) => void;
      removeListener?: (listener: (ev: MediaQueryListEvent) => void) => void;
    };

    const mqlCompat = mql as MqlCompat;
    if (typeof mqlCompat.addEventListener === 'function') {
      mqlCompat.addEventListener('change', onChange);
      return () => mqlCompat.removeEventListener?.('change', onChange);
    }

    // Safari < 14
    if (typeof mqlCompat.addListener === 'function') {
      mqlCompat.addListener(onChange);
      return () => mqlCompat.removeListener?.(onChange);
    }

    return;
  }, [query]);

  return matches;
}

export function useShellLayoutController(args: { hasLeft: boolean; hasRight: boolean }) {
  const { hasLeft, hasRight } = args;

  const isSmall = useMediaQuery('(max-width: 720px)');
  const isMedium = useMediaQuery('(max-width: 1100px)');
  const rightOverlay = !isSmall && isMedium;

  // Sidebar widths are driven by CSS variables in shell.css. We override them here so the user
  // can resize the docked sidebars. Values are persisted in localStorage.
  const DEFAULT_LEFT_WIDTH = 260;
  const DEFAULT_RIGHT_WIDTH = 320;
  const MIN_LEFT_WIDTH = 200;
  const MIN_RIGHT_WIDTH = 240;
  const MIN_MAIN_WIDTH = 360;

  const [leftWidth, setLeftWidth] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_LEFT_WIDTH;
    const n = Number(window.localStorage.getItem('shellLeftWidthPx'));
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_LEFT_WIDTH;
  });

  const [rightWidth, setRightWidth] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_RIGHT_WIDTH;
    const n = Number(window.localStorage.getItem('shellRightWidthPx'));
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_RIGHT_WIDTH;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('shellLeftWidthPx', String(Math.round(leftWidth)));
  }, [leftWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('shellRightWidthPx', String(Math.round(rightWidth)));
  }, [rightWidth]);

  const shellBodyRef = useRef<HTMLDivElement | null>(null);
  const [isResizing, setIsResizing] = useState<ResizeSide>(null);
  const [isNavigatorDragging, setIsNavigatorDragging] = useState(false);

  const [leftOpen, setLeftOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth > 720;
  });
  const [rightOpen, setRightOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    const w = window.innerWidth;
    return w > 1100;
  });

  const leftDocked = hasLeft && leftOpen && !isSmall;
  const rightDocked = hasRight && rightOpen && !isSmall && !isMedium;

  useEffect(() => {
    if (!isResizing) return;

    const onMove = (ev: PointerEvent) => {
      const el = shellBodyRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();

      const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

      if (isResizing === 'left') {
        const rightW = rightDocked ? rightWidth : 0;
        const maxLeft = Math.max(MIN_LEFT_WIDTH, rect.width - rightW - MIN_MAIN_WIDTH);
        const next = clamp(ev.clientX - rect.left, MIN_LEFT_WIDTH, maxLeft);
        setLeftWidth(next);
      } else {
        const leftW = leftDocked ? leftWidth : 0;
        const maxRight = Math.max(MIN_RIGHT_WIDTH, rect.width - leftW - MIN_MAIN_WIDTH);
        const next = clamp(rect.right - ev.clientX, MIN_RIGHT_WIDTH, maxRight);
        setRightWidth(next);
      }
    };

    const onUp = () => setIsResizing(null);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [isResizing, leftDocked, rightDocked, leftWidth, rightWidth]);

  // When entering small screens, close overlays by default.
  useEffect(() => {
    if (isSmall) {
      setLeftOpen(false);
      setRightOpen(false);
    }
  }, [isSmall]);

  // While dragging from the navigator on touch devices, temporarily relax overlay hit-testing
  // so the canvas can receive drop/pointer events.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onStart: EventListener = () => setIsNavigatorDragging(true);
    const onEnd: EventListener = () => setIsNavigatorDragging(false);

    window.addEventListener('modelNavigator:dragstart', onStart);
    window.addEventListener('modelNavigator:dragend', onEnd);

    // Safety: ensure we always clear the dragging flag.
    window.addEventListener('dragend', onEnd, true);
    window.addEventListener('drop', onEnd, true);

    return () => {
      window.removeEventListener('modelNavigator:dragstart', onStart);
      window.removeEventListener('modelNavigator:dragend', onEnd);
      window.removeEventListener('dragend', onEnd, true);
      window.removeEventListener('drop', onEnd, true);
    };
  }, []);

  // On medium screens, prefer hiding the properties panel by default.
  useEffect(() => {
    if (!isSmall && isMedium) {
      setRightOpen(false);
    }
  }, [isSmall, isMedium]);

  const showBackdrop = (isSmall && (leftOpen || rightOpen)) || (rightOverlay && rightOpen);

  return {
    isSmall,
    isMedium,
    rightOverlay,

    shellBodyRef,
    isResizing,
    setIsResizing,
    isNavigatorDragging,

    leftOpen,
    setLeftOpen,
    rightOpen,
    setRightOpen,

    leftDocked,
    rightDocked,

    leftWidth,
    setLeftWidth,
    rightWidth,
    setRightWidth,

    showBackdrop,

    DEFAULT_LEFT_WIDTH,
    DEFAULT_RIGHT_WIDTH
  };
}
