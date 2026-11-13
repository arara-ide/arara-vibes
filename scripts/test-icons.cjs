const assert = require('node:assert/strict');
const { readFileSync, mkdtempSync, rmSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { tmpdir } = require('node:os');

if (!process.versions.electron) {
  const scratch = mkdtempSync(join(tmpdir(), 'arara-vibes-icons-'));
  const env = { ...process.env, ARARA_VIBES_ICON_PROFILE: scratch };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = require('node:child_process').spawn(require('electron'), [__filename], { env, stdio: 'inherit' });
  const timer = setTimeout(() => child.kill(), 30000);
  child.on('error', error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
  child.on('exit', code => { clearTimeout(timer); rmSync(scratch, { recursive: true, force: true, maxRetries: 3 }); process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow, nativeImage } = require('electron');
  app.commandLine.appendSwitch('force-device-scale-factor', '1');
  const root = resolve(__dirname, '..');
  app.setPath('userData', process.env.ARARA_VIBES_ICON_PROFILE);
  app.on('window-all-closed', () => {});
  const render = async file => {
    const window = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true } });
    const svg = readFileSync(resolve(root, file), 'utf8');
    const painted = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Rendering timed out: ${file}`)), 10000);
      window.webContents.once('paint', (_event, _rect, image) => { clearTimeout(timer); resolve(image); });
    });
    try {
      await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<html><head><style>.arara-part{animation:none!important}</style></head><body style="margin:0;background:transparent">${svg}</body></html>`)}`);
      return await painted;
    } finally {
      window.destroy();
    }
  };
  const verifyImage = (actual, expected, label) => {
    assert.equal(actual.isEmpty(), false, label);
    assert.deepEqual(actual.getSize(), expected.getSize(), label);
    assert.ok(actual.toBitmap().equals(expected.toBitmap()), `${label}: pixels differ from the source`);
  };
  app.whenReady().then(async () => {
    const expected = await render('build/icon.svg');
    const bitmap = expected.resize({ width: 1024, height: 1024 }).toBitmap();
    const pixel = (x, y) => bitmap.subarray((y * 1024 + x) * 4, (y * 1024 + x) * 4 + 4);
    const top = pixel(350, 180);
    const bottom = pixel(350, 850);
    assert.equal(top[3], 255); assert.equal(bottom[3], 255);
    assert.ok(top[0] + top[1] + top[2] > bottom[0] + bottom[1] + bottom[2] + 100, 'Head must be lighter than the base');
    assert.equal(pixel(1023, 0)[3], 0, 'Background must remain transparent');
    for (const file of ['src/renderer/logo.svg', 'src/renderer/logo-animated.svg', 'dist/logo.svg', 'dist/logo-animated.svg']) {
      verifyImage(await render(file), expected, file);
    }
    const assets = [
      ['build/icon.png', 1024], ['dist/icon.png', 1024],
      ...[16, 24, 32, 48, 64, 128, 256, 512, 1024].map(size => [`build/icons/${size}x${size}.png`, size]),
      ['build/msix/StoreLogo.png', 50], ['build/msix/Square44x44Logo.png', 44], ['build/msix/Square150x150Logo.png', 150],
      ['build/store/300x300.png', 300],
    ];
    for (const [file, size] of assets) {
      verifyImage(nativeImage.createFromPath(resolve(root, file)), expected.resize({ width: size, height: size }), file);
    }
    const icns = readFileSync(resolve(root, 'build/icon.icns'));
    assert.equal(icns.subarray(0, 4).toString(), 'icns');
    assert.equal(icns.readUInt32BE(4), icns.length);
    let offset = 8;
    for (const [type, size] of [['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024]]) {
      assert.equal(icns.subarray(offset, offset + 4).toString(), type);
      const length = icns.readUInt32BE(offset + 4);
      verifyImage(nativeImage.createFromBuffer(icns.subarray(offset + 8, offset + length)), expected.resize({ width: size, height: size }), `ICNS ${type}`);
      offset += length;
    }
    assert.equal(offset, icns.length);
    const ico = readFileSync(resolve(root, 'build/icon.ico'));
    assert.equal(ico.readUInt16LE(0), 0); assert.equal(ico.readUInt16LE(2), 1); assert.equal(ico.readUInt16LE(4), 7);
    for (const [index, size] of [16, 24, 32, 48, 64, 128, 256].entries()) {
      const entry = 6 + index * 16;
      assert.equal(ico[entry] || 256, size); assert.equal(ico[entry + 1] || 256, size);
      assert.equal(ico.readUInt16LE(entry + 4), 1); assert.equal(ico.readUInt16LE(entry + 6), 32);
      const start = ico.readUInt32LE(entry + 12);
      verifyImage(nativeImage.createFromBuffer(ico.subarray(start, start + ico.readUInt32LE(entry + 8))), expected.resize({ width: size, height: size }), `ICO ${size}`);
    }
    process.stdout.write(`PASS: light-to-dark gold in 5 rendered SVGs, ${assets.length} PNGs, 7 ICNS and 7 ICO representations\n`);
    app.quit();
  }).catch(error => { process.stderr.write(`${error.stack}\n`); app.exit(1); });
}
