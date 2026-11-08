import { createRequire } from 'node:module';
import { join } from 'node:path';

export interface CompanionModule {
  installedCompanion(product: string): string | undefined;
  prepareCompanion(product: string, options?: { signal?: AbortSignal; root?: string }): Promise<string>;
}
export const companion = (directory: string): CompanionModule => createRequire(join(directory, 'main.cjs'))('./companion.cjs') as CompanionModule;
