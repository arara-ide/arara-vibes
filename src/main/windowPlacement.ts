export interface WindowPosition { x: number; y: number }
export interface WindowBounds extends WindowPosition { width: number; height: number }
export interface WindowPlacement { expanded?: WindowBounds; compact?: WindowPosition }
export const WINDOW_SIZE = { minWidth: 360, maxWidth: 520, minHeight: 360, compactHeight: 44, initialHeight: 480 };

export function fitWindowBounds(bounds: WindowBounds, area: WindowBounds): WindowBounds {
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  return {
    x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
    width, height,
  };
}

export function compactWindowBounds(bounds: WindowBounds, placement: WindowPlacement, area: WindowBounds): WindowBounds {
  return fitWindowBounds({ ...bounds, ...(placement.compact ?? { x: area.x + area.width - bounds.width - 12, y: area.y + 12 }), height: WINDOW_SIZE.compactHeight }, area);
}

export function expandedWindowBounds(bounds: WindowBounds, placement: WindowPlacement): WindowBounds {
  const moved = bounds.x !== placement.compact?.x || bounds.y !== placement.compact?.y;
  const position = !moved && placement.expanded ? placement.expanded : bounds;
  return { ...bounds, x: position.x, y: position.y, height: placement.expanded?.height ?? WINDOW_SIZE.initialHeight };
}

export function rememberWindowBounds(placement: WindowPlacement, bounds: WindowBounds, expanded: boolean): WindowPlacement {
  return expanded ? { ...placement, expanded: { ...bounds } } : { ...placement, compact: { x: bounds.x, y: bounds.y } };
}

const coordinate = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
const position = (value: unknown): value is WindowPosition => !!value && typeof value === 'object' && coordinate((value as WindowPosition).x) && coordinate((value as WindowPosition).y);

export function normalizeWindowPlacement(input: unknown): WindowPlacement {
  if (!input || typeof input !== 'object') return {};
  const { expanded, compact } = input as WindowPlacement;
  const result: WindowPlacement = {};
  if (position(compact)) result.compact = { x: compact.x, y: compact.y };
  if (position(expanded) && coordinate(expanded.width) && coordinate(expanded.height) && expanded.width >= WINDOW_SIZE.minWidth && expanded.width <= WINDOW_SIZE.maxWidth && expanded.height >= WINDOW_SIZE.minHeight) {
    result.expanded = { x: expanded.x, y: expanded.y, width: expanded.width, height: expanded.height };
  }
  return result;
}
