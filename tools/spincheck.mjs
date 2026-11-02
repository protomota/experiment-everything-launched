// Checks that the globe always turns one way on screen (Brad: never back and forth). The globe's turn on screen is
// its own turn less the camera's swing around Earth's axis; this finds every stretch where that goes backwards.
//   PAGE=dist/narrated-social.html node tools/spincheck.mjs [from s] [to s]
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from './playwright.mjs';
const browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const page = await browser.newPage({viewport: {width: 1920, height: 1080}});
await page.goto(`${pathToFileURL(path.resolve(process.env.PAGE || 'dist/narrated-social.html')).href}?capture`);
await page.waitForFunction(() => window.SIM && window.SIM.spin, null, {timeout: 180000});
const dur = await page.evaluate(() => window.SIM.duration);
const from = Number(process.argv[2] || 0);
const to = Number(process.argv[3] || dur);
const dt = 1 / 30;
const times = [];
for (let t = from; t <= to; t += dt) times.push(t);
const rows = [];
for (let i = 0; i < times.length; i += 2000) rows.push(...(await page.evaluate((ts) => window.SIM.spin(ts), times.slice(i, i + 2000))));
await browser.close();
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const MIN = Number(process.env.MIN || 0); // degrees a second the globe must at least turn on screen
let bad = null;
const out = [];
let worst = Infinity;
for (let i = 1; i < rows.length; i += 1) {
  const [t, az, g] = rows[i];
  const [, az0, g0] = rows[i - 1];
  const rate = (wrap(g - g0) - wrap(az - az0)) / dt; // the globe's turn on screen, degrees a second
  worst = Math.min(worst, rate);
  if (rate < MIN) {
    if (!bad) bad = {a: t, low: rate};
    bad.low = Math.min(bad.low, rate);
    bad.b = t;
  } else if (bad) {
    out.push(bad);
    bad = null;
  }
}
if (bad) out.push(bad);
// DUMP=1 prints every few frames: time, the turn on screen, the camera's distance and elevation
if (process.env.DUMP) for (let i = 1; i < rows.length; i += 3) console.log(rows[i][0].toFixed(2), ((wrap(rows[i][2] - rows[i - 1][2]) - wrap(rows[i][1] - rows[i - 1][1])) / dt).toFixed(1), rows[i][3].toFixed(2), rows[i][4].toFixed(1));
const mmss = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
for (const r of out) console.log(`${mmss(r.a)}-${mmss(r.b)} (${r.a.toFixed(1)}-${r.b.toFixed(1)} s): turns back, at worst ${r.low.toFixed(1)} deg/s`);
console.log(`${out.length} stretches turn the wrong way; slowest on screen ${worst.toFixed(1)} deg/s`);
// and the fast swings (FAST deg/s and over, default 25): a big swing between two shots is forward, but should be rare
const FAST = Number(process.env.FAST || 25);
let fast = null;
for (let i = 1; i < rows.length; i += 1) {
  const rate = (wrap(rows[i][2] - rows[i - 1][2]) - wrap(rows[i][1] - rows[i - 1][1])) / dt;
  if (rate >= FAST) {
    if (!fast) fast = {a: rows[i][0], peak: rate, deg: 0};
    fast.peak = Math.max(fast.peak, rate);
    fast.deg += rate * dt;
    fast.b = rows[i][0];
  } else if (fast) {
    console.log(`  fast ${mmss(fast.a)}-${mmss(fast.b)}: about ${fast.deg.toFixed(0)} deg, peak ${fast.peak.toFixed(0)} deg/s`);
    fast = null;
  }
}
