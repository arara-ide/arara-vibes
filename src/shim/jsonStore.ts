import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type JsonStore = {
  read(): Record<string, unknown>;
  write(values: Record<string, unknown>): void;
};

export function jsonStore(file: string): JsonStore {
  return {
    read(): Record<string, unknown> {
      try {
        const value = JSON.parse(readFileSync(file, 'utf8'));
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      } catch {
        return {};
      }
    },
    write(values: Record<string, unknown>) {
      mkdirSync(dirname(file), { recursive: true });
      const temp = `${file}.tmp`;
      writeFileSync(temp, JSON.stringify(values), { mode: 0o600 });
      renameSync(temp, file);
    },
  };
}
