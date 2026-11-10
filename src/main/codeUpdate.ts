import { isCurrentVersion } from './update';

interface CodeUpdateActions {
  pause(): Promise<boolean>;
  install(): Promise<void>;
  currentVersion(): string | undefined;
  resume(): Promise<void>;
  signal: AbortSignal;
  wait(): Promise<void>;
  now(): number;
}

export async function updateCode(version: string, actions: CodeUpdateActions) {
  const resume = await actions.pause();
  let installed = false;
  try {
    if (actions.signal.aborted) throw new Error('Update cancelled');
    await actions.install();
    const deadline = actions.now() + 15 * 60_000;
    while (!actions.signal.aborted) {
      if (isCurrentVersion(version, actions.currentVersion())) { installed = true; return; }
      if (actions.now() >= deadline) throw new Error('Installation confirmation timed out');
      await actions.wait();
    }
    throw new Error('Update cancelled');
  } finally { if ((resume || installed) && !actions.signal.aborted) await actions.resume(); }
}
