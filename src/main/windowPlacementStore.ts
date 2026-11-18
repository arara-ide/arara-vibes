import { normalizeWindowPlacement, type WindowPlacement } from './windowPlacement';
import { readJsonRecordSync, writeJsonAtomicSync } from '../atomicJson';

export function loadWindowPlacement(file: string): WindowPlacement {
  return normalizeWindowPlacement(readJsonRecordSync(file));
}

export function saveWindowPlacement(file: string, placement: WindowPlacement) {
  writeJsonAtomicSync(file, placement);
}
