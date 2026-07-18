import {
  useFloating,
  autoUpdate,
  offset as offsetMiddleware,
  flip,
  shift,
  size,
  type Placement,
  type Middleware,
  type UseFloatingReturn,
  type ReferenceType,
} from '@floating-ui/react';

// ─── Constants ─────────────────────────────────────────────

const DEFAULT_STYLES: React.CSSProperties = {
  position: 'fixed',
  zIndex: 9999,
  maxHeight: '80vh',
  overflowY: 'auto',
};

// ─── Types ─────────────────────────────────────────────────

export interface UseFloatingMenuOptions {
  /** Preferred placement. Default: 'bottom-end' */
  placement?: Placement;
  /** Gap between anchor and floating element. Default: 4 */
  offset?: number;
  /** Whether to flip to opposite side when not enough space. Default: true */
  flip?: boolean;
  /** Whether to shift into viewport. Default: true */
  shift?: boolean;
  /** Whether to constrain floating height to viewport. Default: true */
  constrainHeight?: boolean;
  /** Padding from viewport edges. Default: 8 */
  viewportPadding?: number;
  /** Additional middleware to append */
  middleware?: Middleware[];
  /** Whether to auto-update position on scroll/resize. Default: true */
  autoUpdate?: boolean;
}

export interface FloatingMenuReturn<T extends ReferenceType = HTMLElement> {
  /** Refs: reference (anchor) and floating */
  refs: UseFloatingReturn<T>['refs'];
  /** CSS styles to apply to the floating element */
  floatingStyles: React.CSSProperties;
  /** Whether the floating element has been positioned */
  isPositioned: boolean;
  /** Actual resolved placement */
  placement: Placement;
  /** Middleware data for arrow positioning (or other usage) */
  middlewareData: UseFloatingReturn<T>['middlewareData'];
}

// ─── Hook ──────────────────────────────────────────────────

export function useFloatingMenu<T extends ReferenceType = HTMLElement>(
  open: boolean,
  options: UseFloatingMenuOptions = {},
  referenceEl?: T | null,
): FloatingMenuReturn<T> {
  const {
    placement = 'bottom-end',
    offset = 4,
    flip: doFlip = true,
    shift: doShift = true,
    constrainHeight = true,
    viewportPadding = 8,
    middleware: extraMiddleware,
    autoUpdate: doAutoUpdate = true,
  } = options;

  const middleware: Middleware[] = [];

  // Offset: gap between anchor and floating element
  middleware.push(offsetMiddleware(offset));

  // Flip: when not enough space on preferred side, flip to opposite
  if (doFlip) {
    middleware.push(
      flip({
        fallbackAxisSideDirection: 'end',
        padding: viewportPadding,
      }),
    );
  }

  // Shift: move into viewport if overflowing
  if (doShift) {
    middleware.push(
      shift({
        padding: viewportPadding,
      }),
    );
  }

  // Size: constrain to viewport height for overflow scrolling
  // Note: We rely on the maxHeight from DEFAULT_STYLES (80vh) rather than
  // using size()'s apply callback, because the apply callback directly
  // mutates the DOM element's style, which conflicts with React's inline
  // style management on re-renders. The size middleware without apply
  // still influences the floating element's positioning constraints.
  if (constrainHeight) {
    middleware.push(
      size({
        padding: viewportPadding,
      }),
    );
  }

  // Append extra middleware
  if (extraMiddleware) {
    middleware.push(...extraMiddleware);
  }

  const {
    refs,
    floatingStyles,
    isPositioned,
    placement: resolvedPlacement,
    middlewareData,
  } = useFloating<T>({
    placement,
    middleware,
    whileElementsMounted: doAutoUpdate ? autoUpdate : undefined,
    open,
    strategy: 'fixed',
    elements: {
      reference: referenceEl as Element | null | undefined,
    },
  });

  return {
    refs,
    floatingStyles: { ...DEFAULT_STYLES, ...floatingStyles },
    isPositioned,
    placement: resolvedPlacement,
    middlewareData,
  };
}

// ─── Safe parse placement for CSS ──────────────────────────

/**
 * Extract the side from a Floating UI placement string.
 * 'bottom-end' → 'bottom', 'top-start' → 'top', etc.
 */
export function getSideFromPlacement(placement: Placement): string {
  return placement.split('-')[0];
}

/**
 * Get the origin transform for an animation from a placement.
 * E.g. 'bottom' → 'translateY(-6px)', 'top' → 'translateY(6px)'
 */
export function getAnimationOrigin(placement: Placement): string {
  const side = getSideFromPlacement(placement);
  switch (side) {
    case 'top':    return 'translateY(6px)';
    case 'bottom': return 'translateY(-6px)';
    case 'left':   return 'translateX(6px)';
    case 'right':  return 'translateX(-6px)';
    default:       return 'translateY(-6px)';
  }
}
