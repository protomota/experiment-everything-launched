// node tools/mv/build-shoot.mjs <outdir> name[?query] ...
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import {chromium} from '../playwright.mjs';
const [out, ...names] = process.argv.slice(2);
fs.mkdirSync(out, {recursive: true});
const js = (await esbuild.build({entryPoints: ['tools/mv/build-view.js'], bundle: true, write: false, format: 'esm'})).outputFiles[0].text;
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (u === '/') { res.setHeader('content-type', 'text/html'); return res.end('<!doctype html><body><script type="module" src="/v.js"></script>'); }
  if (u === '/v.js') { res.setHeader('content-type', 'text/javascript'); return res.end(js); }
  const f = path.resolve('models/web' + u);
  if (!fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
  fs.createReadStream(f).pipe(res);
}).listen(0);
const port = srv.address().port;
const browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
for (const spec of names) {
  const [n, qs = ''] = spec.split('?');
  const page = await browser.newPage({viewport: {width: 1200, height: 900}});
  page.on('pageerror', (e) => console.log(n, 'pageerror', e.message));
  await page.goto(`http://127.0.0.1:${port}/?b=${n}&${qs}`);
  await page.waitForFunction(() => window.DONE, null, {timeout: 60000});
  const st = await page.evaluate(() => window.STATS);
  const file = `${out}/${n}${qs ? '-' + qs.replace(/[^a-z0-9]+/gi, '_') : ''}.png`;
  await page.screenshot({path: file});
  console.log(n, JSON.stringify(st), file);
  await page.close();
}
await browser.close();
srv.close();
