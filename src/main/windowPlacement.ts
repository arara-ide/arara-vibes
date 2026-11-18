export interface WindowPosition { x: number; y: number }
export interface WindowBounds extends WindowPosition { width: number; height: number }
export interface WindowPlacement { expanded?: WindowBounds; compact?: WindowPosition }
export const RESIZE_SETTLE_MS = 50;
export const WINDOW_SIZE = { minWidth: 360, maxWidth: 520, minHeight: 360, compactHeight: 44, initialHeight: 480 };

export function fitWindowBounds(bounds: WindowBounds, area: WindowBounds): WindowBounds {
  const areaX = Number.isFinite(area.x) ? area.x : 0;
  const areaY = Number.isFinite(area.y) ? area.y : 0;
  const areaWidth = Math.max(1, Number.isFinite(area.width) ? area.width : 1);
  const areaHeight = Math.max(1, Number.isFinite(area.height) ? area.height : 1);
  const width = Math.min(Math.max(1, Number.isFinite(bounds.width) ? bounds.width : areaWidth), areaWidth);
  const height = Math.min(Math.max(1, Number.isFinite(bounds.height) ? bounds.height : areaHeight), areaHeight);
  const bx = Number.isFinite(bounds.x) ? bounds.x : areaX;
  const by = Number.isFinite(bounds.y) ? bounds.y : areaY;
  return {
    x: Math.max(areaX, Math.min(bx, areaX + areaWidth - width)),
    y: Math.max(areaY, Math.min(by, areaY + areaHeight - height)),
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
