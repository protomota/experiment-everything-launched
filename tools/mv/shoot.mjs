// node tools/mv/shoot.mjs <dir-with-glbs> <outdir> [names...]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import {chromium} from '../playwright.mjs';
const [dir, out, ...names] = process.argv.slice(2);
fs.mkdirSync(out, {recursive: true});
const js = (await esbuild.build({entryPoints: ['tools/mv/viewer.js'], bundle: true, write: false, format: 'esm'})).outputFiles[0].text;
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (u === '/') { res.setHeader('content-type', 'text/html'); return res.end('<!doctype html><body><script type="module" src="/v.js"></script>'); }
  if (u === '/v.js') { res.setHeader('content-type', 'text/javascript'); return res.end(js); }
  const f = u.startsWith('/__draco/') ? path.resolve('node_modules/three/examples/jsm/libs/draco/gltf/' + u.slice(9)) : path.join(path.resolve(dir), u);
  if (!fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', f.endsWith('.glb') ? 'model/gltf-binary' : 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
}).listen(0);
const port = srv.address().port;
const browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const list = names.length ? names : fs.readdirSync(dir).filter((f) => f.endsWith('.glb')).map((f) => f.replace(/\.glb$/, ''));
const all = {};
for (const n of list) {
  const page = await browser.newPage({viewport: {width: 1200, height: 900}});
  page.on('pageerror', (e) => console.log(n, 'pageerror', e.message, e.stack));
  page.on('console', (m) => console.log(n, 'console', m.text()));
  page.on('requestfailed', (r) => console.log(n, 'reqfail', r.url()));
  await page.goto(`http://127.0.0.1:${port}/?m=/${encodeURIComponent(n)}.glb${process.env.Q || ''}`);
  await page.waitForFunction(() => window.DONE, null, {timeout: 40000});
  all[n] = await page.evaluate(() => window.STATS);
  await page.screenshot({path: `${out}/${n}.png`});
  console.log(n, JSON.stringify(all[n]));
  await page.close();
}
await browser.close();
srv.close();
