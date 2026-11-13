import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { normalizeWindowPlacement, type WindowPlacement } from './windowPlacement';

export function loadWindowPlacement(file: string): WindowPlacement {
  try { return normalizeWindowPlacement(JSON.parse(readFileSync(file, 'utf8'))); } catch { return {}; }
}

export function saveWindowPlacement(file: string, placement: WindowPlacement) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify(placement), { mode: 0o600 });
}
