// One-shot: retrim heritage logo SVG viewBoxes to their measured ink bounding
// boxes (+1.5% bleed) and set width/height attributes to match, so every logo
// renders edge-to-edge with a truthful intrinsic ratio. Ink bboxes were
// measured by rasterizing each file at 800px and scanning alpha > 16.
// meta/adobe/vox-media are already tight crops and are left untouched.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(import.meta.dirname, '../apps/web/public/logos/heritage');

// name → ink bbox [x, y, w, h] in that file's viewBox coordinate space.
const ink = {
  microsoft: [7.5, 18.75, 105, 22.5],
  google: [5.85, 13.95, 107.55, 35.25],
  amazon: [9.9, 17.1, 100.2, 30.3],
  upwork: [5.4, 13.35, 109.05, 33.3],
  ibm: [20.7, 14.25, 78.6, 31.5],
  oracle: [4.05, 22.65, 111.9, 14.7],
  magento: [1.71, 2.31, 120.63, 36.41],
  ebay: [18.45, 12.9, 83.7, 33.6],
  deloitte: [17.09, 28.23, 885.83, 143.53],
  accenture: [8.02, 17.52, 100.2, 26.4],
  quora: [1.57, 3.2, 21.66, 6.02],
};

const r2 = (n) => Math.round(n * 100) / 100;

for (const [name, [x, y, w, h]] of Object.entries(ink)) {
  const file = resolve(dir, `${name}.svg`);
  let svg = readFileSync(file, 'utf8');
  const pad = 0.015 * Math.max(w, h);
  const vb = [r2(x - pad), r2(y - pad), r2(w + 2 * pad), r2(h + 2 * pad)];
  const vbAttr = `viewBox="${vb.join(' ')}"`;

  const openTag = svg.match(/<svg\b[^>]*>/);
  if (!openTag) throw new Error(`${name}: no <svg> tag`);
  let tag = openTag[0];

  tag = /viewBox\s*=\s*"[^"]*"/.test(tag)
    ? tag.replace(/viewBox\s*=\s*"[^"]*"/, vbAttr)
    : tag.replace('<svg', `<svg ${vbAttr}`);

  for (const [attr, val] of [
    ['width', vb[2]],
    ['height', vb[3]],
  ]) {
    const re = new RegExp(`${attr}\\s*=\\s*"[^"]*"`);
    tag = re.test(tag)
      ? tag.replace(re, `${attr}="${val}"`)
      : tag.replace('<svg', `<svg ${attr}="${val}"`);
  }

  svg = svg.replace(openTag[0], tag);
  writeFileSync(file, svg);
  console.log(`${name}: ${vbAttr}`);
}
