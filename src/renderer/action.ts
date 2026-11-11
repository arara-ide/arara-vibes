import { t } from '../i18n';
import type { ShellBridge } from '../transport';

export async function requestAction(input: Record<string, unknown>, bridge?: ShellBridge, request: typeof fetch = fetch): Promise<unknown> {
  try {
    if (bridge) {
      const reply = await bridge.action(input);
      if (reply.status !== 200) throw new Error();
      return reply.result;
    }
    const response = await request('action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    if (!response.ok) throw new Error();
    return await response.json();
  } catch { throw new Error(t('Could not complete the action. Try again.')); }
}
