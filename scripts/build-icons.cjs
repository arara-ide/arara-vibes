const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');

if (!process.versions.electron) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = require('node:child_process').spawn(require('electron'), [__filename], { env, stdio: 'inherit' });
  child.on('error', error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow } = require('electron');
  app.whenReady().then(async () => {
    const root = resolve(__dirname, '../build');
    const window = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true } });
    const svg = readFileSync(resolve(root, 'icon.svg'), 'utf8');
    const painted = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Icon rendering timed out')), 10000);
      window.webContents.once('paint', (_event, _rect, image) => { clearTimeout(timer); resolve(image); });
    });
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`)}`);
    const image = await painted;
    if (image.isEmpty()) throw new Error('Application icon is empty');
    writeFileSync(resolve(root, 'icon.png'), image.resize({ width: 1024, height: 1024 }).toPNG());
    mkdirSync(resolve(root, 'icons'), { recursive: true });
    mkdirSync(resolve(root, 'msix'), { recursive: true });
    for (const [asset, size] of [['StoreLogo', 50], ['Square44x44Logo', 44], ['Square150x150Logo', 150]]) {
      writeFileSync(resolve(root, 'msix', `${asset}.png`), image.resize({ width: size, height: size }).toPNG());
    }
    for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
      writeFileSync(resolve(root, 'icons', `${size}x${size}.png`), image.resize({ width: size, height: size }).toPNG());
    }
    const entries = [['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024]].map(([type, size]) => {
      const png = image.resize({ width: size, height: size }).toPNG();
      const header = Buffer.alloc(8); header.write(type); header.writeUInt32BE(png.length + 8, 4);
      return Buffer.concat([header, png]);
    });
    const header = Buffer.alloc(8); header.write('icns'); header.writeUInt32BE(8 + entries.reduce((total, entry) => total + entry.length, 0), 4);
    writeFileSync(resolve(root, 'icon.icns'), Buffer.concat([header, ...entries]));
    window.destroy();
    process.stdout.write('Generated application icons.\n');
    app.quit();
  }).catch(error => { process.stderr.write(`${error.stack}\n`); app.exit(1); });
}
