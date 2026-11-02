// Renders the 1200 x 630 share card from the page itself: dist/card.png
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from './playwright.mjs';
const browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const page = await browser.newPage({viewport: {width: 1200, height: 630}, deviceScaleFactor: 1});
await page.goto(`${pathToFileURL(path.resolve('dist/index.html')).href}?card`);
await page.waitForFunction(() => window.CARD_READY, null, {timeout: 120000});
await page.evaluate(() => document.fonts.ready);
await page.screenshot({path: 'dist/card.png'});
await browser.close();
