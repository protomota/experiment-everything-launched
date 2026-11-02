// Finds, for every ship card, the launch in the launch log and the catalog object the card is about, so the card can
// offer "Show its orbit" (the object's card: its orbit, a ring on the globe, the timeline at the day it reached orbit)
// or, for a ship that never stayed in Earth orbit, "Show the launch".
//   node tools/milestone-objects.mjs            prints the matches for review and writes src/ships/objects.json
// objects.json: key -> [[satcat, label?], ...] ("Show its orbit"), or "launch" ("Show the launch").
// Overrides for ships the name match gets wrong go in PICK (satcat number) or NONE (launch only). Re-run it after a
// new ship is added or the catalog is baked again.
import fs from 'node:fs';
import {SHIPS} from '../src/ships/ships.js';
import {EVENT_CARDS} from '../src/ships/events.js';
import {parseIndex, norm} from '../src/find.js';

const L = JSON.parse(fs.readFileSync('src/launches.json', 'utf8'));
const index = parseIndex(fs.readFileSync('src/search.txt', 'utf8'));
const DAY0 = Date.parse('1957-01-01T00:00:00Z');
const dayOf = (iso) => (Date.parse(iso.length <= 10 ? `${iso}T00:00:00Z` : `${iso}Z`) - DAY0) / 864e5;
const day = [];
let m = 0;
for (const d of L.dt) day.push((m += d) / 1440);
const rows = index.obj.map((l) => l.split('\t'));
const byLaunch = new Map();
rows.forEach((r, i) => {
  if (r[9] === '') return;
  const k = Number(r[9]);
  if (!byLaunch.has(k)) byLaunch.set(k, []);
  byLaunch.get(k).push(i);
});
const bySat = new Map(rows.map((r, i) => [r[2], i]));
// checked by hand against the printout: ships whose name match is wrong
const PICK = {falcon1: 33393}; // RatSat stayed on the second stage, so the stage is what reached orbit
// carried into orbit by a Shuttle or an SLS, then left for deep space (or, Compton, not in the baked catalog): the
// best match would be the Shuttle or a cubesat, so these offer the launch instead
const NONE = new Set(['magellan', 'galileo', 'ulysses', 'cgro', 'artemis2']);
// the debris events: the satellites that broke up
const EVENTS = {fengyun: [[25730, 'Fengyun-1C']], iridium: [[24946, 'Iridium 33'], [22675, 'Kosmos-2251']], kosmos1408: [[13552, 'Kosmos-1408']]};

const words = (s) => new Set(norm(s).split(' ').filter((w) => w.length > 1 || /\d/.test(w)));
const score = (title, r) => {
  const t = words(title);
  let best = 0;
  for (const nm of [r[0], ...(r[1] ? r[1].split(/[,;|]/) : [])]) {
    const w = words(nm);
    let s = 0;
    for (const x of t) if (w.has(x)) s += 1;
    best = Math.max(best, s / Math.max(t.size, 1) - 0.01 * Math.abs(w.size - t.size));
  }
  return best;
};

const out = {};
const lines = [];
for (const sh of SHIPS) {
  const d = dayOf(sh.when);
  let k = -1;
  let gap = Infinity;
  for (let j = 0; j < day.length; j += 1) {
    const g = Math.abs(day[j] - d);
    if (g < gap) [gap, k] = [g, j];
  }
  const objs = byLaunch.get(k) || [];
  const pays = objs.filter((i) => rows[i][4].startsWith('P'));
  let pick = -1;
  if (PICK[sh.key]) pick = bySat.get(String(PICK[sh.key])) ?? -1;
  else if (!NONE.has(sh.key) && pays.length) {
    let best = -1;
    for (const i of pays) {
      const s = score(sh.title, rows[i]);
      if (s > best) [best, pick] = [s, i];
    }
    if (best <= 0 && pays.length > 1) pick = pays[0];
  }
  // a ship with no launch in the orbital log (Freedom 7 was suborbital) gets no button
  if (gap > 1 / 24) out[sh.key] = null;
  else out[sh.key] = pick >= 0 ? [[Number(rows[pick][2])]] : 'launch';
  lines.push(`${sh.key.padEnd(14)} ${sh.when}  launch ${k} (${(gap * 1440).toFixed(0)} min off) "${L.p[k]}"  ${pays.length} payloads  -> ${pick >= 0 ? `${rows[pick][2]} ${rows[pick][0]} [${rows[pick][4]}]` : 'LAUNCH ONLY'}`);
}
for (const [key, c] of Object.entries(EVENT_CARDS)) {
  if (!EVENTS[key]) throw new Error(`no objects for the event ${key}`);
  for (const [sc] of EVENTS[key]) if (!bySat.has(String(sc))) throw new Error(`${sc} is not in the catalog`);
  out[key] = EVENTS[key];
  lines.push(`event ${key}: ${c.title} -> ${EVENTS[key].map((x) => x.join(' ')).join(', ')}`);
}
console.log(lines.join('\n'));
const json = `{\n${Object.entries(out).filter(([, v]) => v).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n}\n`;
if (!process.env.DRY) fs.writeFileSync('src/ships/objects.json', json);
