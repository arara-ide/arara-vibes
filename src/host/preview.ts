import { startShell } from './server';

let pinned = true;
let expanded = true;
const shell = await startShell(import.meta.dirname, { locale: process.env.ARARA_VIBES_LOCALE ?? 'pt-BR', state: () => ({ pinned, expanded }), run: async action => {
  if (action === 'pin') pinned = !pinned;
  else if (action === 'expand') expanded = !expanded;
  else if (action !== 'hide') throw new Error('Use the desktop application for system actions');
} });
process.stdout.write(`Arara Vibes browser: ${shell.url}\n`);
process.on('SIGINT', () => { shell.close(); process.exit(0); });
process.on('SIGTERM', () => { shell.close(); process.exit(0); });
