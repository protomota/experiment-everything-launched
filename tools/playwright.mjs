// Playwright for the tools: the project's own (npm i -D playwright, or playwright-core with an installed Chrome), else a
// global copy. Every tool that drives a browser imports {chromium} from here.
import {createRequire} from 'node:module';
import path from 'node:path';

const here = createRequire(path.resolve('package.json'));
const tries = [[here, 'playwright'], [here, 'playwright-core']];
if (process.env.PLAYWRIGHT_DIR) tries.push([createRequire(path.join(process.env.PLAYWRIGHT_DIR, 'x.js')), 'playwright']);
tries.push([createRequire('/opt/node-tools/'), 'playwright']);
let pw = null;
for (const [req, name] of tries) {
  try {
    pw = req(name);
    break;
  } catch {}
}
if (!pw) throw new Error('Playwright not found: run `npm i -D playwright && npx playwright install chromium`');
export const {chromium} = pw;
