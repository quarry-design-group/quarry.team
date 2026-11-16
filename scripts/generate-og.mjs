// Generates the static Open Graph cards (1200×630) for the site backbone —
// concept "The Seam": a stone cross-section of near-black sedimentary strata
// displaced along one ember fault line, headline set in Fraunces. Rendered
// with the site's real fonts via headless Chromium (Playwright, already an
// e2e dependency), so the type matches production exactly.
//
//   node scripts/generate-og.mjs
//
// Outputs apps/web/public/og/{default,work,careers}.png. Pages opt in via the
// existing Base `image` prop; default.png is the site-wide fallback.
import { chromium } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Resolve from apps/web — the fonts are its dependencies (pnpm isolates them).
const require = createRequire(pathToFileURL(resolve(root, 'apps/web/package.json')).href);
const outDir = resolve(root, 'apps/web/public/og');
mkdirSync(outDir, { recursive: true });

// Embed as data: URLs — the page renders from about:blank, where file://
// subresource fetches are unreliable.
const fontData = (pkgPath) =>
  `data:font/woff2;base64,${readFileSync(require.resolve(pkgPath)).toString('base64')}`;
const fraunces = fontData('@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2');
const mono = fontData(
  '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
);

// Palette: design tokens (stone/ember), read from the single source of truth.
const tokens = JSON.parse(readFileSync(resolve(root, 'packages/ui/tokens/tokens.json'), 'utf8'));
const color = (token) => token.$value.toLowerCase();
const INK = color(tokens.color.stone['950']);
const STONE_25 = color(tokens.color.stone['25']);
const STONE_300 = color(tokens.color.stone['300']);
const EMBER = color(tokens.color.ember['500']);

// Fault geometry — ONE line shared by the clip edges and the seam:
// from (820, 0) at the top to (560, 630) at the bottom ("/" lean).
// The right pane's strata shift down inside a fixed clip (a geological
// throw), so the bands visibly misalign across the cut.
const SEAM = { xTop: 820, xBottom: 560, throw: 26 };
const dx = SEAM.xTop - SEAM.xBottom; // 260
const angle = (Math.atan2(dx, 630) * 180) / Math.PI; // ≈ 22.42° clockwise

const BANDS = [
  ['#131311', 140],
  ['#0e0e0c', 110],
  ['#171715', 130],
  ['#100f0e', 120],
  ['#141412', 190],
];
const bands = () => {
  let y = -60; // overdraw above/below so the shifted pane never runs out
  return BANDS.map(([c, h]) => {
    const div = `<div style="position:absolute;left:0;right:0;top:${y}px;height:${h}px;background:${c};border-top:1px solid rgba(250,250,247,0.05)"></div>`;
    y += h;
    return div;
  }).join('');
};

const card = ({ headline, sub, kicker, big }) => `<!doctype html>
<html><head><style>
  @font-face { font-family: Fraunces; src: url('${fraunces}') format('woff2'); font-weight: 100 900; }
  @font-face { font-family: JBMono; src: url('${mono}') format('woff2'); font-weight: 100 800; }
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; background: ${INK}; overflow: hidden; position: relative; }

  .pane { position: absolute; inset: -60px 0; }
  .pane.left  { clip-path: polygon(0 -1000px, ${SEAM.xTop}px 60px, ${SEAM.xBottom}px 690px, 0 2000px); }
  .pane.right { clip-path: polygon(${SEAM.xTop}px 60px, 1200px -1000px, 1200px 2000px, ${SEAM.xBottom}px 690px); }
  .pane.right .bands { transform: translateY(${SEAM.throw}px); }
  .bands { position: absolute; inset: 0; }

  /* The fault — a thin molten seam with a restrained glow, exactly on the cut. */
  .seam { position: absolute; top: -30px; left: ${SEAM.xTop + (30 * dx) / 630 - 2}px;
          width: 3px; height: 740px; transform: rotate(${angle}deg); transform-origin: top center;
          background: linear-gradient(${EMBER}, #ff7a45 50%, ${EMBER});
          box-shadow: 0 0 16px rgba(255, 90, 31, 0.55), 0 0 56px rgba(255, 90, 31, 0.2); }

  .copy { position: absolute; top: ${big ? 128 : 150}px; left: 84px; max-width: 480px; }
  h1 { font-family: Fraunces; font-weight: 560; font-variation-settings: 'opsz' 144;
       font-size: ${big ? 84 : 62}px; line-height: 1.05; letter-spacing: -0.015em; color: ${STONE_25}; }
  .sub { font-family: Fraunces; font-weight: 420; font-variation-settings: 'opsz' 40;
         font-size: ${big ? 40 : 32}px; line-height: 1.25; color: ${STONE_300}; margin-top: 20px; }
  .wordmark { position: absolute; left: 84px; bottom: 60px; font-family: Fraunces;
              font-weight: 640; font-size: 38px; letter-spacing: -0.01em; color: ${STONE_25}; }
  .kicker { position: absolute; right: 84px; bottom: 70px; font-family: JBMono, monospace;
            font-weight: 500; font-size: 16px; letter-spacing: 0.18em; color: ${EMBER}; }
</style></head>
<body>
  <div class="pane left"><div class="bands">${bands()}</div></div>
  <div class="pane right"><div class="bands">${bands()}</div></div>
  <div class="seam"></div>
  <div class="copy"><h1>${headline}</h1><div class="sub">${sub}</div></div>
  <div class="wordmark">Quarry</div>
  <div class="kicker">${kicker}</div>
</body></html>`;

const CARDS = [
  {
    file: 'default.png',
    headline: 'We move the numbers.',
    sub: 'and respect the humans.',
    kicker: 'STRATEGY · DESIGN · ENGINEERING · DATA',
    big: true,
  },
  {
    file: 'work.png',
    headline: 'Outcomes with receipts.',
    sub: 'Selected case studies, 2016–present.',
    kicker: 'QUARRY.TEAM/WORK',
    big: true,
  },
  {
    file: 'careers.png',
    headline: 'We hire people who read the source.',
    sub: '100% remote · senior · global',
    kicker: 'QUARRY.TEAM/CAREERS',
    big: false,
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const c of CARDS) {
  await page.setContent(card(c), { waitUntil: 'networkidle' });
  // Force-load both faces (fonts.ready alone can resolve before lazy loads).
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('560 84px Fraunces'),
      document.fonts.load('500 16px JBMono'),
    ]);
    await document.fonts.ready;
  });
  await page.screenshot({ path: resolve(outDir, c.file) });
  console.log(`og: ${c.file}`);
}
await browser.close();
