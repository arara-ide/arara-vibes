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

it('restores the sharing tab without losing conversation tabs', () => {
  const tabs = [{ id: 'chat', label: 'Codex', kind: 'ai' }, { id: 'sharing', label: 'Share limits', kind: 'settings' }];
  expect(initialSurface(tabs, 'sharing')).toBe(tabs[1]);
  expect(needsSelection(tabs, 'sharing', false)).toBe(false);
  expect(initialSurface(tabs.slice(0, 1), 'sharing')).toBe(tabs[0]);
});

import { moveTab } from './tabs';

it('moves a tab between its neighbors or to the end without mutating the original order', () => {
  const tabs = [{ id: 'a' }, { id: 'b' }, { id: 'settings' }];
  expect(moveTab(tabs, 'settings', 'b').map(tab => tab.id)).toEqual(['a', 'settings', 'b']);
  expect(moveTab(tabs, 'a').map(tab => tab.id)).toEqual(['b', 'settings', 'a']);
  expect(moveTab(tabs, 'b', 'a').map(tab => tab.id)).toEqual(['b', 'a', 'settings']);
  expect(tabs.map(tab => tab.id)).toEqual(['a', 'b', 'settings']);
});

it('keeps one tab, missing targets, self drops and unknown tabs unchanged', () => {
  const tabs = [{ id: 'a' }, { id: 'b' }];
  expect(moveTab(tabs.slice(0, 1), 'a')).toEqual([{ id: 'a' }]);
  expect(moveTab(tabs, 'a', 'a')).toBe(tabs);
  expect(moveTab(tabs, 'missing', 'a')).toBe(tabs);
  expect(moveTab(tabs, 'a', 'missing')).toBe(tabs);
});
