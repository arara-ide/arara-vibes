import { describe, expect, it } from 'vitest';
import { compactWindowBounds, expandedWindowBounds, fitWindowBounds, normalizeWindowPlacement, rememberWindowBounds } from './windowPlacement';

const area = { x: 0, y: 25, width: 1440, height: 875 };
const opened = { x: 180, y: 140, width: 400, height: 560 };

describe('window placement', () => {
  it('starts compact at the top right and restores the previous expanded position without a drag', () => {
    const compact = compactWindowBounds(opened, {}, area);
    expect(compact).toEqual({ x: 1028, y: 37, width: 400, height: 44 });
    const state = rememberWindowBounds(rememberWindowBounds({}, opened, true), compact, false);
    expect(expandedWindowBounds(compact, state)).toEqual(opened);
    expect(compactWindowBounds({ ...opened, x: 500, y: 250 }, state, area)).toEqual(compact);
  });

  it.each([{ x: 280, y: 230 }, { x: 1028, y: 230 }, { x: 280, y: 37 }])('opens at a dragged compact position and remembers it for later collapses: %o', point => {
    const compact = compactWindowBounds(opened, {}, area);
    const state = rememberWindowBounds(rememberWindowBounds({}, opened, true), compact, false);
    const moved = { ...compact, ...point };
    expect(expandedWindowBounds(moved, state)).toEqual({ ...opened, ...point });
    const remembered = rememberWindowBounds(state, moved, false);
    const nextOpen = { ...opened, x: 600, y: 300 };
    expect(compactWindowBounds(nextOpen, remembered, area)).toEqual(moved);
    expect(expandedWindowBounds(moved, rememberWindowBounds(remembered, nextOpen, true))).toEqual(nextOpen);
  });

  it('keeps compact resizing while restoring the expanded location and height', () => {
    const compact = compactWindowBounds(opened, {}, area);
    const state = { expanded: opened, compact };
    expect(expandedWindowBounds({ ...compact, width: 460 }, state)).toEqual({ ...opened, width: 460 });
  });

  it('fits stale positions and large windows to the available display, including negative coordinates', () => {
    const left = { x: -1920, y: -100, width: 1920, height: 1080 };
    expect(fitWindowBounds({ ...opened, x: -3000, y: 800 }, left)).toEqual({ ...opened, x: -1920, y: 420 });
    expect(fitWindowBounds({ ...opened, width: 1600, height: 1200 }, area)).toEqual(area);
    expect(compactWindowBounds(opened, { compact: { x: 5000, y: 5000 } }, area)).toEqual({ ...opened, x: 1040, y: 856, height: 44 });
  });

  it('uses a fresh state and rejects invalid persisted coordinates and sizes independently', () => {
    expect(expandedWindowBounds({ ...opened, height: 44 }, {})).toEqual({ ...opened, height: 480 });
    for (const input of [null, false, 'invalid', {}, { compact: { x: NaN, y: 10 } }, { expanded: { ...opened, height: -1 } }, { expanded: { ...opened, width: 999 } }, { compact: { x: 1.5, y: 4 } }, { compact: { x: 2147483648, y: 4 } }]) expect(normalizeWindowPlacement(input)).toEqual({});
    expect(normalizeWindowPlacement({ expanded: opened, compact: { x: Infinity, y: 0 } })).toEqual({ expanded: opened });
    expect(normalizeWindowPlacement({ expanded: { ...opened, height: 44 }, compact: { x: -500, y: 0 } })).toEqual({ compact: { x: -500, y: 0 } });
  });
});
