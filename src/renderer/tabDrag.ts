import { moveTab } from './tabs';

export interface DragRect { left: number; right: number; top: number; bottom: number }
export interface DragPoint { x: number; y: number }
export interface DragTab extends DragRect { id: string }
export const TAB_DRAG_EDGE_FRACTION = .2;
export const TAB_DRAG_SCROLL_SPEED = 240;

export function insideDragViewport(point: DragPoint, viewport: DragRect) {
  return viewport.right > viewport.left && viewport.bottom > viewport.top
    && point.x >= viewport.left && point.x <= viewport.right && point.y >= viewport.top && point.y <= viewport.bottom;
}

export function tabDropDestination(tabs: DragTab[], source: string, point: DragPoint, viewport: DragRect) {
  if (tabs.length < 2 || !insideDragViewport(point, viewport) || !tabs.some(tab => tab.id === source)) return undefined;
  const target = tabs.find(tab => point.x < (tab.left + tab.right) / 2);
  const before = target?.id;
  if (moveTab(tabs, source, before).every((tab, index) => tab.id === tabs[index].id)) return undefined;
  const left = target?.left ?? tabs[tabs.length - 1].right;
  if (left < viewport.left || left > viewport.right) return undefined;
  return { before, left, top: Math.max(tabs[0].top, viewport.top), bottom: Math.min(tabs[0].bottom, viewport.bottom) };
}

export function tabDragVelocity(point: DragPoint, viewport: DragRect, scrollLeft: number, maxScroll: number) {
  if (!insideDragViewport(point, viewport) || maxScroll <= 0) return 0;
  const edge = (viewport.right - viewport.left) * TAB_DRAG_EDGE_FRACTION;
  if (point.x < viewport.left + edge && scrollLeft > 0) return -TAB_DRAG_SCROLL_SPEED;
  if (point.x > viewport.right - edge && scrollLeft < maxScroll) return TAB_DRAG_SCROLL_SPEED;
  return 0;
}

export function tabDragScroll(scrollLeft: number, velocity: number, elapsed: number, maxScroll: number) {
  return Math.max(0, Math.min(maxScroll, scrollLeft + velocity * Math.max(0, Math.min(elapsed, 50)) / 1000));
}
