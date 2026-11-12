import { expect, it, vi } from 'vitest';
import { Updates, UpdateFailure, type UpdateProduct } from './updates';

function harness(code = '1.135.07400', vibes = '0.1.0') {
  const versions: Record<UpdateProduct, string | undefined> = { 'arara-code': code, 'arara-vibes': vibes };
  const latest = { 'arara-code': '1.135.07430', 'arara-vibes': 'v0.2.0' };
  const order: string[] = [];
  const deps = {
    current: vi.fn(async (product: UpdateProduct) => ({ version: versions[product] })),
    latest: vi.fn(async (product: UpdateProduct) => latest[product]),
    download: vi.fn(async (product: UpdateProduct, version: string) => { order.push(`download:${product}`); return `${product}/${version}`; }),
    install: vi.fn(async (product: UpdateProduct) => { order.push(`install:${product}`); versions[product] = latest[product]; }),
    changed: vi.fn(),
  };
  return { updates: new Updates(deps), versions, latest, order, deps };
}

it('checks both versions independently and marks only outdated applications', async () => {
  const h = harness('1.135.07430'); await h.updates.check();
  expect(h.updates.state().products.map(item => item.status)).toEqual(['current', 'available']);
  expect(h.deps.current).toHaveBeenCalledTimes(2);
});

it('downloads both pinned versions before installing Code, then restarting Vibes', async () => {
  const h = harness(); await h.updates.update();
  expect(h.order).toEqual(['download:arara-code', 'download:arara-vibes', 'install:arara-code', 'install:arara-vibes']);
  expect(h.updates.state().products.map(item => item.status)).toEqual(['current', 'restarting']);
  expect(h.updates.state().busy).toBe(false);
  expect(h.deps.download).toHaveBeenCalledWith('arara-code', '1.135.07430');
});

it('also updates outdated Code before an individual Vibes update', async () => {
  const h = harness(); await h.updates.update('arara-vibes');
  expect(h.order.at(-2)).toBe('install:arara-code'); expect(h.order.at(-1)).toBe('install:arara-vibes');
});

it('can update only Code without closing Vibes', async () => {
  const h = harness(); await h.updates.update('arara-code');
  expect(h.order).toEqual(['download:arara-code', 'install:arara-code']);
  expect(h.updates.state().products[1].status).toBe('available');
});

it('does not install either app if the Vibes download fails', async () => {
  const h = harness(); h.deps.download.mockImplementation(async product => { if (product === 'arara-vibes') throw Error('Checksum mismatch'); return 'file'; });
  await h.updates.update();
  expect(h.deps.install).not.toHaveBeenCalled();
  expect(h.updates.state().products.map(item => item.status)).toEqual(['available', 'error']);
});

it('does not quit Vibes if Code installation fails, and permits a later retry', async () => {
  const h = harness(); h.deps.install.mockRejectedValueOnce(Error('Permission denied'));
  await h.updates.update(); expect(h.deps.install).toHaveBeenCalledTimes(1);
  expect(h.updates.state().products.map(item => item.status)).toEqual(['error', 'available']);
  await h.updates.update(); expect(h.updates.state().products.map(item => item.status)).toEqual(['current', 'restarting']);
});

it('does not claim success or restart Vibes until the installed Code version changes', async () => {
  const h = harness(); h.deps.install.mockResolvedValue(undefined);
  await h.updates.update(); expect(h.deps.install).toHaveBeenCalledTimes(1);
  expect(h.updates.state().products[0].status).toBe('error');
});

it('reports network failures instead of claiming that applications are current', async () => {
  const h = harness(); h.deps.latest.mockRejectedValue(Error('Offline'));
  await h.updates.check(); expect(h.updates.state().products.every(item => item.status === 'error')).toBe(true);
  await h.updates.update(); expect(h.deps.install).not.toHaveBeenCalled();
});

it('serializes concurrent requests and preserves development installations', async () => {
  const h = harness(); h.deps.current.mockResolvedValue({ version: 'dev', development: true } as { version: string });
  await Promise.all([h.updates.check(), h.updates.update()]);
  expect(h.deps.current).toHaveBeenCalledTimes(2); expect(h.deps.latest).not.toHaveBeenCalled();
  expect(h.updates.state().products.every(item => item.status === 'development')).toBe(true);
});

it('installs a missing application and rejects malformed version metadata', async () => {
  const h = harness(); h.versions['arara-code'] = undefined;
  await h.updates.check(); expect(h.updates.state().products[0].status).toBe('available');
  h.latest['arara-code'] = '../../invalid'; await h.updates.update();
  expect(h.updates.state().products[0].status).toBe('error'); expect(h.deps.install).not.toHaveBeenCalled();
});

it('preserves the required Windows UserSetup migration before a system installation', async () => {
  const h = harness(); h.deps.install.mockRejectedValueOnce(new UpdateFailure('migration'));
  await h.updates.update();
  expect(h.updates.state().products[0]).toMatchObject({ status: 'error', error: 'migration' });
  expect(h.deps.install).toHaveBeenCalledTimes(1);
});

it('keeps ready status with command when Linux .deb returns a manual install command', async () => {
  const h = harness('1.135.07430', '0.1.0');
  h.deps.install.mockImplementationOnce(async () => "sudo apt install '/cache/vibes.deb'");
  await h.updates.update('arara-vibes');
  expect(h.updates.state().products[1]).toMatchObject({ status: 'ready', command: "sudo apt install '/cache/vibes.deb'" });
});
