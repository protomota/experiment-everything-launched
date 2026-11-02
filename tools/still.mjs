// A clean still (no text) from the tour: node tools/still.mjs <t> <width> <height> <out.png>
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from './playwright.mjs';
const [t, w, h] = process.argv.slice(2, 5).map(Number);
const browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const page = await browser.newPage({viewport: {width: w, height: h}, deviceScaleFactor: 1});
await page.goto(`${pathToFileURL(path.resolve('dist/index.html')).href}?capture&clean`);
await page.waitForFunction(() => window.SIM && window.SIM.ready, null, {timeout: 180000});
await page.evaluate((x) => window.SIM.render(x), t);
await page.screenshot({path: process.argv[5]});
await browser.close();
