import { lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function sanitizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeJsonValue);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    out[key] = sanitizeJsonValue(item);
  }
  return out;
}

export function readJsonRecordSync(file: string): Record<string, unknown> {
  try {
    const stat = lstatSync(file);
    if (!stat.isFile()) return {};
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return sanitizeJsonValue(parsed) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function writeJsonAtomicSync(file: string, value: unknown, spacing?: number) {
  let existingSymlink = false;
  try {
    existingSymlink = lstatSync(file).isSymbolicLink();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (existingSymlink) throw new Error('Refusing to overwrite symbolic link.');
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  const payload = JSON.stringify(sanitizeJsonValue(value), null, spacing);
  try {
    writeFileSync(temp, payload, { flag: 'wx', mode: 0o600 });
    renameSync(temp, file);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}
