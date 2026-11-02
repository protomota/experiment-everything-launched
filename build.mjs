// Bundles three.js, the page, its fonts and the baked catalog into one offline HTML file.
//   node build.mjs                                         dist/index.html
//   SITE=1 node build.mjs                                  the copy for a web server (dist/site/), models as files
//   GA_ID=G-XXXX SITE=1 node build.mjs                     ... with Google Analytics (GA_SCRIPT=/x.js to configure it
//                                                          from your own script, as protomota.com does with /analytics.js)
// Ship models: the site copy loads them from models/ next to the page (dist/site/models/); the offline copy inlines them.
// The share card's address is SITE_URL + card.png; the page's own address is SITE_URL without the trailing slash.
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as esbuild from 'esbuild';

const SITE_URL = process.env.SITE_URL || 'https://protomota.com/experiments/everything-launched/';
const PAGE_URL = SITE_URL.replace(/\/$/, '');
// Google Analytics, only in a site build with GA_ID set. GA_SCRIPT names a script of your own that configures it
// (protomota.com serves /analytics.js); without one the page configures GA_ID itself.
const GA_ID = process.env.GA_ID || '';
const ANALYTICS =
  process.env.SITE && GA_ID
    ? `<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
${process.env.GA_SCRIPT ? `<script src="${process.env.GA_SCRIPT}"></script>` : `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA_ID}');</script>`}`
    : '';
const meta = JSON.parse(fs.readFileSync('src/catalog.json', 'utf8'));

const inline = (file) => fs.readFileSync(file).toString('base64');
const fontFace = (family, weight, file) => `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;font-display:swap;src:url(data:font/woff2;base64,${inline(file)}) format('woff2');}`;
const FONTS = [
  fontFace('Space Grotesk', '300 700', 'node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2'),
  ...[400, 600].map((w) => fontFace('JetBrains Mono', w, `node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-${w}-normal.woff2`)),
].join('\n');

const bundle = await esbuild.build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  legalComments: 'none',
});
// NARR=narration/timing.json: the video build with each beat fitted to its narration, written to dist/narrated.html
const NARR = process.env.NARR ? JSON.parse(fs.readFileSync(process.env.NARR, 'utf8')) : null;
const script = (NARR ? `window.__TOUR_DUR=${JSON.stringify(NARR.dur)};window.__TOUR_GAP=${NARR.gap || 1.5};window.__TOUR_FINALE=${JSON.stringify(NARR.finale || null)};window.__TOUR_ORDER=${JSON.stringify(NARR.order || null)};\n` : '') + bundle.outputFiles[0].text.replaceAll('</script', '<\\/script');
// the NASA models the ships use (the rest are drawn in code), plus those the code-built Shuttle and Freedom 7 load
const shipsSrc = fs.readFileSync('src/ships/ships.js', 'utf8');
const MODEL_NAMES = [...new Set([...shipsSrc.matchAll(/src: 'nasa:([a-z0-9-]+)'/g)].map((m) => m[1]).concat(['space-shuttle-d', 'space-shuttle-d-door-prt', 'space-shuttle-d-door-stb', 'redstone-3-freedom-7']))];
const SHIP_COUNT = (shipsSrc.match(/^    key: '/gm) || []).length;
const MODEL_BASE = new URL(SITE_URL).pathname + 'models/';
// the search index loads from next to the page; the offline copy has no search
const MODELS = process.env.SITE
  ? JSON.stringify({base: MODEL_BASE, search: new URL(SITE_URL).pathname + 'search.txt'})
  : JSON.stringify({inline: Object.fromEntries(MODEL_NAMES.map((n) => [n, inline(`models/web/${n}.glb`)]))});
const catalog = zlib.gzipSync(fs.readFileSync('src/catalog.bin'), {level: 9}).toString('base64');

// the Sources list at the bottom of the page, from src/sources.js and the ship titles in src/ships/ships.js
const SOURCES = await (async () => {
  const data = await esbuild.build({
    stdin: {contents: "export {SHIPS} from './src/ships/ships.js'; export * as SRC from './src/sources.js';", resolveDir: '.', loader: 'js'},
    bundle: true, write: false, format: 'esm', platform: 'node',
  });
  const {SHIPS, SRC} = await import('data:text/javascript;base64,' + Buffer.from(data.outputFiles[0].text).toString('base64'));
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const a = ([label, url]) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`;
  const named = (name, links) => `<li><b>${esc(name)}</b> ${links.map(a).join(' · ')}</li>`;
  const missing = SHIPS.filter((s) => !SRC.SHIPS[s.key]).map((s) => s.key);
  if (missing.length) throw new Error(`no sources for ships: ${missing.join(', ')}`);
  return `<section class="sources" id="sources" aria-labelledby="sources-h">
  <h2 id="sources-h">Sources</h2>
  <p class="sources-lede">Everything on this page comes from these. The counts, dates and orbits are from GCAT; the facts on each card are from the pages listed for it.</p>
  <div class="src-groups">
    <div><h3>Data</h3><ul>${SRC.DATA.map((l) => `<li>${a(l)}</li>`).join('')}</ul></div>
    <div><h3>3D models</h3><p>From ${a(SRC.MODELS_HOME)}, public domain. The other ships were built for this page from the dimensions and photographs in their sources.</p><ul>${SRC.MODELS.map((l) => `<li>${a(l)}</li>`).join('')}</ul></div>
    <div><h3>Debris and space junk</h3><ul>${SRC.DEBRIS.map(([n, l]) => named(n, l)).join('')}</ul></div>
  </div>
  <h3>Spacecraft and rockets</h3>
  <ul class="src-ships">${SHIPS.map((s) => named(s.title, SRC.SHIPS[s.key])).join('')}</ul>
</section>`;
})();

const updated = (() => {
  const [, y, mon, d] = meta.updated.match(/(\d{4}) (\w{3})\s+(\d+)/);
  return `${mon} ${Number(d)}, ${y}`;
})();
const page = fs.readFileSync('src/index.html', 'utf8')
  .replace('/*FONTS*/', () => FONTS)
  .replace('/*STYLE*/', () => fs.readFileSync('src/style.css', 'utf8'))
  .replace('/*SCRIPT*/', () => script)
  .replace('%CATALOG%', () => catalog)
  .replace('%MODELS%', () => MODELS)
  .replace('%SOURCES%', () => SOURCES)
  .replaceAll('%LOGO%', `data:image/png;base64,${inline('src/protomota-logo.png')}`)
  .replace('%ANALYTICS%', () => ANALYTICS)
  .replaceAll('%PAGE_URL%', PAGE_URL)
  .replaceAll('%SITE_URL%', SITE_URL)
  .replaceAll('%EVER%', meta.count.toLocaleString('en-US'))
  .replaceAll('%LAUNCHES%', JSON.parse(fs.readFileSync('src/launches.json', 'utf8')).dt.length.toLocaleString('en-US'))
  .replaceAll('%SHIPS%', String(SHIP_COUNT))
  .replaceAll('%NOW%', meta.inOrbitNow.toLocaleString('en-US'))
  .replaceAll('%UPDATED%', updated);

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
fs.mkdirSync('dist', {recursive: true});
// NARR=narration/timing-social.json writes dist/narrated-social.html
const OUT = process.env.SITE ? 'dist/site/index.html' : NARR ? `dist/narrated${(process.env.NARR.match(/timing(-\w+)\.json$/) || [, ''])[1]}.html` : 'dist/index.html';
fs.mkdirSync('dist/site', {recursive: true});
fs.writeFileSync(OUT, page);
if (process.env.SITE) {
  fs.mkdirSync('dist/site/models', {recursive: true});
  for (const n of MODEL_NAMES) fs.copyFileSync(`models/web/${n}.glb`, `dist/site/models/${n}.glb`);
  fs.copyFileSync('src/search.txt', 'dist/site/search.txt');
  console.log(`dist/site/search.txt  ${kb(fs.statSync('src/search.txt').size)} (gzip ${kb(zlib.gzipSync(fs.readFileSync('src/search.txt')).length)})`);
  const total = MODEL_NAMES.reduce((a, n) => a + fs.statSync(`models/web/${n}.glb`).size, 0);
  console.log(`dist/site/models  ${MODEL_NAMES.length} models, ${(total / 1024).toFixed(0)} KB`);
}
console.log(`${OUT}  ${kb(Buffer.byteLength(page))} (gzip ${kb(zlib.gzipSync(page).length)}); script ${kb(script.length)}, catalog ${kb(catalog.length)}`);
