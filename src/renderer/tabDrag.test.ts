import { expect, it } from 'vitest';
import { tabDropDestination, tabDragVelocity, tabDragScroll, TAB_DRAG_SCROLL_SPEED } from './tabDrag';

const viewport = { left: 0, right: 280, top: 0, bottom: 30 };
const tabs = ['a', 'b', 'c'].map((id, index) => ({ id, left: index * 90, right: index * 90 + 80, top: 0, bottom: 30 }));
const point = (x: number, y = 15) => ({ x, y });

it('does not show a destination on either side of the tab in its original position', () => {
  for (const [source, positions] of [['a', [10, 70, 85]], ['b', [100, 150, 175]], ['c', [190, 250, 270]]] as const) {
    for (const x of positions) expect(tabDropDestination(tabs, source, point(x), viewport)).toBeUndefined();
  }
});

it('indicates only reorder destinations within the visible tab viewport', () => {
  expect(tabDropDestination(tabs, 'c', point(10), viewport)).toMatchObject({ before: 'a', left: 0, top: 0, bottom: 30 });
  expect(tabDropDestination(tabs, 'a', point(190), viewport)).toMatchObject({ before: 'c', left: 180 });
  expect(tabDropDestination(tabs, 'a', point(260), viewport)).toMatchObject({ before: undefined, left: 260 });
  for (const target of [point(-1), point(281), point(100, -1), point(100, 31)]) expect(tabDropDestination(tabs, 'c', target, viewport)).toBeUndefined();
  expect(tabDropDestination(tabs, 'c', point(30), { ...viewport, left: 20 })).toBeUndefined();
  expect(tabDropDestination(tabs, 'a', point(190), { ...viewport, right: 170 })).toBeUndefined();
  expect(tabDropDestination(tabs.slice(0, 1), 'a', point(10), viewport)).toBeUndefined();
  expect(tabDropDestination(tabs, 'missing', point(10), viewport)).toBeUndefined();
});

it('scrolls at a constant speed only inside each outer 20 percent and stops at the ends', () => {
  expect(tabDragVelocity(point(10), viewport, 100, 500)).toBe(-TAB_DRAG_SCROLL_SPEED);
  expect(tabDragVelocity(point(55), viewport, 100, 500)).toBe(-TAB_DRAG_SCROLL_SPEED);
  expect(tabDragVelocity(point(225), viewport, 100, 500)).toBe(TAB_DRAG_SCROLL_SPEED);
  expect(tabDragVelocity(point(275), viewport, 100, 500)).toBe(TAB_DRAG_SCROLL_SPEED);
  for (const target of [point(56), point(140), point(224), point(-1), point(281), point(10, -1), point(270, 31)]) expect(tabDragVelocity(target, viewport, 100, 500)).toBe(0);
  expect(tabDragVelocity(point(10), viewport, 0, 500)).toBe(0);
  expect(tabDragVelocity(point(270), viewport, 500, 500)).toBe(0);
  expect(tabDragVelocity(point(270), viewport, 0, 0)).toBe(0);
});

it('uses elapsed time for continuous scrolling and clamps stalls and viewport limits', () => {
  expect(tabDragScroll(100, 240, 25, 500)).toBe(106);
  expect(tabDragScroll(100, -240, 25, 500)).toBe(94);
  expect(tabDragScroll(100, 240, 5000, 500)).toBe(112);
  expect(tabDragScroll(2, -240, 50, 500)).toBe(0);
  expect(tabDragScroll(498, 240, 50, 500)).toBe(500);
  expect(tabDragScroll(100, 240, -1, 500)).toBe(100);
});
