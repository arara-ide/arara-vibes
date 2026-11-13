import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { loadWindowPlacement, saveWindowPlacement } from './windowPlacementStore';

it('persists expanded and compact locations separately across restarts', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'vibes-placement-')), 'profile', 'window-placement.json');
  expect(loadWindowPlacement(file)).toEqual({});
  const placement = { expanded: { x: 100, y: 90, width: 420, height: 600 }, compact: { x: -200, y: 80 } };
  saveWindowPlacement(file, placement);
  expect(loadWindowPlacement(file)).toEqual(placement);
  writeFileSync(file, '{');
  expect(loadWindowPlacement(file)).toEqual({});
  writeFileSync(file, JSON.stringify({ expanded: { x: 0, y: 0, width: 'bad', height: 500 }, compact: placement.compact }));
  expect(loadWindowPlacement(file)).toEqual({ compact: placement.compact });
});
