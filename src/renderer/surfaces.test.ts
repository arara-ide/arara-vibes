import { expect, it } from 'vitest';
import { macSurfaceStyles } from './surfaces';

it('uses the existing dark surface token for Mac cards and input surfaces', () => {
  const css = macSurfaceStyles('MacIntel');
  for (const name of ['editorWidget-background', 'input-background', 'textCodeBlock-background', 'chat-requestBubbleBackground', 'sideBar-background', 'settings-textInputBackground', 'settings-numberInputBackground', 'settings-dropdownBackground']) expect(css).toContain(`--vscode-${name}:var(--vibes-field-background)`);
  expect(css).toContain('.select-panel{background:var(--vibes-menu-background)!important}');
  expect(css).not.toContain('--vscode-button-background:');
  expect(css).not.toContain('--vscode-errorForeground:');
});

it.each(['Win32', 'Linux x86_64', ''])('preserves existing surfaces on %s', platform => {
  expect(macSurfaceStyles(platform)).toBe('');
});
