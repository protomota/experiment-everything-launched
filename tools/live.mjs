// Loads the page as a visitor would and screenshots it: node tools/live.mjs <width> <height> <wait ms> <out.png> [actions]
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from './playwright.mjs';
const [w, h, wait] = process.argv.slice(2, 5).map(Number);
const out = process.argv[5];
const action = process.argv[6] || '';
const browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const page = await browser.newPage({viewport: {width: w, height: h}, deviceScaleFactor: 1, isMobile: w < 600, hasTouch: w < 600});
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
await page.waitForTimeout(wait);
if (action === 'skip') { await page.click('#tour'); await page.waitForTimeout(2500); }
if (action === 'tick') { await page.click('.tick.breakup'); await page.waitForTimeout(4000); }
if (action === 'drag') { await page.mouse.move(w / 2, h / 2); await page.mouse.down(); await page.mouse.move(w / 2 + 200, h / 2 + 40, {steps: 8}); await page.mouse.up(); await page.waitForTimeout(800); }
await page.screenshot({path: out});
const state = await page.evaluate(() => ({date: document.getElementById('date').textContent, total: document.getElementById('total').textContent, tour: document.getElementById('tour').textContent, play: document.getElementById('play').getAttribute('aria-label')}));
console.log(JSON.stringify(state), errors.length ? 'ERRORS: ' + errors.join(' | ') : 'no errors');
await browser.close();
