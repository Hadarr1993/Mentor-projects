#!/usr/bin/env node
/**
 * Renders the app icon from the same sunset motif as the header, so the
 * home-screen icon and the app read as one thing. Run manually when the
 * motif changes; the PNGs are committed.
 *
 *   node scripts/gen-pwa-icons.mjs
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'icons');

const svg = (size) => `<!doctype html>
<html><head><style>html,body{margin:0;padding:0}</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#4A2A55"/>
      <stop offset="30%"  stop-color="#6B3B6E"/>
      <stop offset="56%"  stop-color="#D96A8A"/>
      <stop offset="80%"  stop-color="#F2A65A"/>
      <stop offset="100%" stop-color="#F7C58A"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#FFE9B8" stop-opacity=".95"/>
      <stop offset="45%"  stop-color="#FFC46B" stop-opacity=".4"/>
      <stop offset="100%" stop-color="#F2A65A" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFF0C4"/><stop offset="100%" stop-color="#FFB765"/>
    </linearGradient>
    <linearGradient id="d1" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#C4643C"/><stop offset="100%" stop-color="#A34E30"/>
    </linearGradient>
    <linearGradient id="d2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7A3B2E"/><stop offset="100%" stop-color="#5A2A24"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#sky)"/>
  <g clip-path="inset(0 round 112px)">
    <circle cx="256" cy="268" r="190" fill="url(#glow)"/>
    <circle cx="256" cy="268" r="78"  fill="url(#sun)"/>
    <path d="M0 330 C 90 300, 170 344, 256 330 C 350 314, 430 350, 512 322 L512 512 L0 512 Z" fill="url(#d1)"/>
    <path d="M0 400 C 110 372, 200 412, 300 398 C 400 384, 460 412, 512 396 L512 512 L0 512 Z" fill="url(#d2)"/>
  </g>
</svg></body></html>`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(svg(size));
  await page.locator('svg').screenshot({ path: join(outDir, `icon-${size}.png`), omitBackground: true });
  await page.close();
  console.log(`wrote icon-${size}.png`);
}
await browser.close();
