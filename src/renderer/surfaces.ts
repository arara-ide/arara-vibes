const fields = ['editorWidget-background', 'input-background', 'textCodeBlock-background', 'chat-requestBubbleBackground', 'sideBar-background', 'settings-textInputBackground', 'settings-numberInputBackground', 'settings-dropdownBackground'];

export function macSurfaceStyles(platform: string) {
  if (!/Mac/.test(platform)) return '';
  const declarations = fields.map(name => `--vscode-${name}:var(--vibes-field-background)`).join(';');
  return `:root{${declarations};--vscode-dropdown-background:var(--vibes-menu-background)}html,body{background:transparent!important}#message-queue,#composer-offer{background:var(--vibes-field-background)!important}.select-panel{background:var(--vibes-menu-background)!important}`;
}
