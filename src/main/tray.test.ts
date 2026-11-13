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

it('uses a static gold gradient for the application while preserving the white tray', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const tray = readFileSync(new URL('../../assets/tray-white.svg', import.meta.url), 'utf8');
  const gold = readFileSync(new URL('../../build/icon.svg', import.meta.url), 'utf8');
  expect(gold).not.toBe(tray);
  expect(gold).toContain('#f5cc64'); expect(gold).toContain('#a86a13');
  expect(gold).not.toMatch(/animation|<animate/);
  expect(readFileSync(new URL('../renderer/logo.svg', import.meta.url), 'utf8')).toBe(gold);
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

it('packages the animated splash and uses gold branding independently of host metadata', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  expect(manifest.build.files).toContain('dist/logo-animated.svg');
  const animated = readFileSync(new URL('../renderer/logo-animated.svg', import.meta.url), 'utf8');
  expect(animated).toContain('@keyframes arara-contour'); expect(animated).toContain('#f5cc64');
  const html = readFileSync(new URL('../renderer/index.html', import.meta.url), 'utf8');
  expect(html).toContain('id="loading-logo" src="logo-animated.svg"');
  expect(html).toContain('id="brand-logo" src="logo.svg"');
});

it('packages the gold gradient icon on all platforms', () => {
  expect(APP_ICON).toBe('icon.png');
  const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  expect(manifest.build.mac.icon).toBe('build/icon.icns');
  expect(manifest.build.win.icon).toBe('build/icon.png');
  expect(manifest.build.linux.icon).toBe('build/icon.png');
  const icns = readFileSync(new URL('../../build/icon.icns', import.meta.url));
  expect(icns.subarray(0, 4).toString()).toBe('icns');
  expect(icns.readUInt32BE(4)).toBe(icns.length);
  expect(icns.readUInt32BE(12)).toBeGreaterThan(8);
  const png = readFileSync(new URL('../../build/icon.png', import.meta.url));
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.readUInt32BE(16)).toBe(1024);
});
