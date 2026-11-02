// Records the tour from the page's capture mode, frame by frame, into an mp4.
//   node tools/record.mjs <from s> <to s> <out.mp4> [scale=1]     scale 1 = 1920x1080, 2 = 3840x2160
//   PAGE=dist/narrated.html node tools/record.mjs ...             the narrated video's timing
//   FPS=30 node tools/record.mjs <from> <to> <out.mp4> 0.6667     a quick 1280x720, 30 fps review copy
// Frames are deterministic (window.SIM.render(t)), so any range can be recorded on its own and joined later.
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
// Playwright from this folder's node_modules if it has one (a Mac with `npm i playwright-core`), else the container's
const local = createRequire(path.resolve('package.json'));
const pick = () => {
  for (const [req, name] of [[local, 'playwright'], [local, 'playwright-core'], [createRequire('/opt/node-tools/'), 'playwright']]) {
    try {
      return req(name);
    } catch {}
  }
  throw new Error('no playwright: npm i playwright-core');
};
const {chromium} = pick();

const [from, to] = process.argv.slice(2, 4).map(Number);
const out = process.argv[4];
const scale = Number(process.argv[5] || 1);
const FPS = Number(process.env.FPS || 60); // FPS=30 for a quick review copy
// CHANNEL=chrome renders with the installed Google Chrome and its GPU (on a Mac); the default is software GL
const browser = process.env.CHANNEL
  ? await chromium.launch({channel: process.env.CHANNEL, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-background-timer-throttling']})
  : await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const page = await browser.newPage({viewport: {width: 1920, height: 1080}, deviceScaleFactor: scale});
page.on('pageerror', (e) => console.error('page error', e));
await page.goto(`${pathToFileURL(path.resolve(process.env.PAGE || 'dist/index.html')).href}?capture`);
await page.waitForFunction(() => window.SIM && window.SIM.ready, null, {timeout: 180000});
await page.evaluate(() => document.fonts.ready);

const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-f', 'image2pipe', '-c:v', 'png', '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', scale > 1 ? '15' : '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', out],
  {stdio: ['pipe', 'inherit', 'inherit']});
const first = Math.round(from * FPS);
const last = Math.round(to * FPS);
const t0 = Date.now();
for (let f = first; f < last; f += 1) {
  await page.evaluate((x) => window.SIM.render(x), f / FPS);
  const png = await page.screenshot({type: 'png'});
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
  if ((f - first) % 120 === 0) {
    const done = f - first + 1;
    const per = (Date.now() - t0) / done;
    console.log(`${out}: frame ${done}/${last - first}, ${(per / 1000).toFixed(2)} s/frame, ~${((per * (last - f)) / 60000).toFixed(1)} min left`);
  }
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
console.log('done', out, ((Date.now() - t0) / 60000).toFixed(1), 'min');
