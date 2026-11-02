// Screenshots of the capture mode at given tour times:  node tools/shot.mjs 0 5 45 ...   -> out/shot-<t>.png
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from './playwright.mjs';
const times = process.argv.slice(2).map(Number);
const scale = Number(process.env.SCALE || 1);
const browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const page = await browser.newPage({viewport: {width: 1920, height: 1080}, deviceScaleFactor: scale});
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${pathToFileURL(path.resolve(process.env.PAGE || 'dist/index.html')).href}?capture`);
await page.waitForFunction(() => window.SIM && window.SIM.ready, null, {timeout: 120000});
await page.evaluate(() => document.fonts.ready);
for (const t of times) {
  const t0 = Date.now();
  await page.evaluate((x) => window.SIM.render(x), t);
  await page.screenshot({path: `out/shot-${String(t).padStart(5, '0')}.png`});
  console.log('t', t, Date.now() - t0, 'ms');
}
if (errors.length) console.log('console:', errors.slice(0, 10).join('\n'));
await browser.close();
