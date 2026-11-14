const fields = ['editorWidget-background', 'input-background', 'textCodeBlock-background', 'chat-requestBubbleBackground', 'sideBar-background', 'settings-textInputBackground', 'settings-numberInputBackground', 'settings-dropdownBackground'];

export function macSurfaceStyles(platform: string) {
  if (!/Mac/.test(platform)) return '';
  const declarations = fields.map(name => `--vscode-${name}:var(--vibes-field-background)`).join(';');
  return `:root{${declarations};--vscode-dropdown-background:var(--vibes-menu-background);--vscode-menu-background:var(--vibes-menu-background)}html,body{background:transparent!important}#message-queue,#composer-offer{background:var(--vibes-field-background)!important}.select-panel{background:var(--vibes-menu-background)!important}.arara-dialog,.arara-chat .question-panel:not(.cli-setup),.composer-context-menu,.task-list-items{background:var(--vibes-menu-background)!important;-webkit-backdrop-filter:blur(24px) saturate(1.6);backdrop-filter:blur(24px) saturate(1.6)}`;
}
