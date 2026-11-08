import { expect, it } from 'vitest';
import { initialSurface, tabLabel } from './tabs';

it('restores the selected tab and labels tabs by platform, never by conversation', () => {
  const entries = [{ id: 'a', label: 'Codex', kind: 'ai' }, { id: 'b', label: 'Claude Code', kind: 'ai', conversationTitle: 'Review the change' }, { id: 'settings', label: 'Settings', kind: 'settings' }];
  expect(initialSurface(entries, 'b')?.id).toBe('b');
  expect(initialSurface(entries, 'missing')?.id).toBe('a');
  expect(initialSurface([], null)).toBeUndefined();
  expect(tabLabel(entries[0])).toBe('Codex');
  expect(tabLabel(entries[1])).toBe('Claude Code');
});
import { describe } from 'vitest';
import { needsSelection } from './tabs';

describe('tab selection fallback', () => {
  const tabs = [{ id: 'settings', label: 'Settings', kind: 'settings' }, { id: 'a', label: 'Codex', kind: 'ai' }];
  it('falls back to the first open tab, whatever its kind', () => {
    expect(initialSurface(tabs, null)?.id).toBe('settings');
    expect(initialSurface(tabs, '')?.id).toBe('settings');
  });
  it('requires a selection after sign-in when tabs exist and none is selected', () => {
    expect(needsSelection(tabs, '', false)).toBe(true);
    expect(needsSelection(tabs, 'gone', false)).toBe(true);
  });
  it('keeps a valid selection and waits while signed out or without tabs', () => {
    expect(needsSelection(tabs, 'a', false)).toBe(false);
    expect(needsSelection(tabs, '', true)).toBe(false);
    expect(needsSelection([], '', false)).toBe(false);
  });
  it('labels tabs with blank conversation titles by platform', () => {
    expect(tabLabel({ id: 'x', label: 'Gemini', conversationTitle: '   ' })).toBe('Gemini');
  });
});
