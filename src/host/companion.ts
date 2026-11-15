import { createRequire } from 'node:module';
import { join } from 'node:path';

export interface CompanionOptions { signal?: AbortSignal; root?: string; version?: string; format?: string; arch?: string }
export interface CompanionModule {
  storeUri(product: string): string;
  installAppImage(file: string, destination: string, pid: number): Promise<void>;
  latestCompanion(product: string, options?: CompanionOptions): Promise<string>;
  installMacDmg(file: string, product: string, options?: { appRoot?: string; waitPid?: number; open?: boolean }): Promise<string>;
  installedCompanion(product: string): string | undefined;
  macAppPids(bundle: string): Promise<number[]>;
  MAC_GATEKEEPER_REJECTED: string;
  prepareCompanion(product: string, options?: CompanionOptions): Promise<string>;
}
export const companion = (directory: string): CompanionModule => createRequire(join(directory, 'main.cjs'))('./companion.cjs') as CompanionModule;
