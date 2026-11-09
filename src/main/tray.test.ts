import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { APP_ICON, TRAY_ASSETS } from './tray';

it('uses the same monochrome gradient in normal and high resolution on every operating system', () => {
  expect(TRAY_ASSETS).toEqual({ image: 'tray-white.png', retina: 'tray-white@2x.png' });
});

it('ships the white gradient without replacing the application logo', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  for (const [name, size] of [['tray-white.png', 18], ['tray-white@2x.png', 36]] as const) {
    const png = readFileSync(new URL(`../../assets/${name}`, import.meta.url));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(size); expect(png.readUInt32BE(20)).toBe(size);
    expect(manifest.build.files).toContain(`dist/${name}`);
  }
  expect(manifest.build.files).not.toContain('dist/tray.png');
  const svg = readFileSync(new URL('../../assets/tray-white.svg', import.meta.url), 'utf8');
  expect(svg).toContain('linearGradient'); expect(svg).toContain('#ffffff'); expect(svg).toContain('#b8b8b8');
});

it('uses the white Arara Code gradient as the application icon on every platform', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const tray = readFileSync(new URL('../../assets/tray-white.svg', import.meta.url), 'utf8');
  expect(readFileSync(new URL('../../build/icon.svg', import.meta.url), 'utf8')).toBe(tray);
  const png = readFileSync(new URL('../../build/icon.png', import.meta.url));
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.readUInt32BE(16)).toBe(1024); expect(png.readUInt32BE(20)).toBe(1024);
  expect(readFileSync(new URL('../../build/icon.icns', import.meta.url)).subarray(0, 4).toString()).toBe('icns');
  expect(manifest.build.icon).toBe('build/icon.png');
  expect(manifest.build.mac.icon).toBe('build/icon.icns');
  expect(manifest.build.win.icon).toBe('build/icon.png');
  expect(manifest.build.linux.icon).toBe('build/icon.png');
  expect(manifest.build.files).toContain(`dist/${APP_ICON}`);
});
