import { readJsonRecordSync, writeJsonAtomicSync } from '../atomicJson';

export type JsonStore = {
  read(): Record<string, unknown>;
  write(values: Record<string, unknown>): void;
};

export function jsonStore(file: string): JsonStore {
  return {
    read(): Record<string, unknown> {
      return readJsonRecordSync(file);
    },
    write(values: Record<string, unknown>) {
      writeJsonAtomicSync(file, values);
    },
  };
}
