import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { TRAY_ASSETS } from './tray';

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
