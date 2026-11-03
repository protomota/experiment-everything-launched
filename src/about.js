// The narrated video's intro (the "about" beat, video only): what the page is and what's in it, over the live globe
// before the tour. tools/about.mjs times it to the words of its line and build.mjs passes it in as window.__ABOUT:
// {cues: {title, proto, gcat, kept, launch, debris, who, film} in tour seconds, rows: [[year, satcat, cospar, name,
// type, state], ...] real catalog rows in launch order}. The type decodes out of catalog characters, the catalog's
// rows stream by as the sky fills, and each part of the page gets a line of its own while the globe shows it.
import {WHO} from './orbits.js';

const ABOUT = (typeof window !== 'undefined' && window.__ABOUT) || null;
export const ABOUT_CUES = ABOUT ? ABOUT.cues : null;

const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ramp = (t, a, b) => smooth(clamp01((t - a) / (b - a)));
const fmt = (n) => Math.round(n).toLocaleString('en-US');

// ---------------------------------------------------------------- what the globe does
// The date: empty sky under the title, the catalog's years filling it as the words get to GCAT, and the last few
// years run on with their launches flashing for "Every launch".
const LAUNCH_YEARS = 3.2 * 365.25;
export function aboutDay(t, start, end) {
  const C = ABOUT_CUES;
  const mid = end - LAUNCH_YEARS;
  if (t < C.gcat + 0.2) return start;
  if (t < C.launch - 0.3) return start + (mid - start) * smooth(clamp01((t - C.gcat - 0.2) / (C.launch - 0.3 - C.gcat - 0.2)));
  return mid + (end - mid) * smooth(clamp01((t - C.launch + 0.3) / (C.debris - 0.2 - C.launch + 0.3)));
}
// launch flashes only while the words are on the launches
export const aboutPulses = (t) => !!ABOUT_CUES && t > ABOUT_CUES.launch - 0.4 && t < ABOUT_CUES.debris + 0.2;
// the debris on its own (satellites and Starlink dimmed), then everything colored by who owns it
export function aboutLook(t) {
  const C = ABOUT_CUES;
  if (!C || t > C.film + 2) return null;
  const junk = ramp(t, C.debris - 0.1, C.debris + 0.6) * (1 - ramp(t, C.who - 0.1, C.who + 0.5));
  const mode = ramp(t, C.who - 0.1, C.who + 0.7) * (1 - ramp(t, C.film + 0.2, C.film + 1.4));
  const keep = 1 - 0.92 * junk;
  return {keep: [keep, keep, 1, 1, 1], mode};
}
// the page's own title, date and counts come up as the tour is about to begin
export const aboutHud = (t) => (ABOUT_CUES ? ramp(t, ABOUT_CUES.film + 0.3, ABOUT_CUES.film + 1.6) : 1);

// ---------------------------------------------------------------- the type
const GLYPHS = '0123456789ABCDEFGHJKLMNPRSTUVWXYZ-';
const hash = (a, b) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
// a line of type whose letters decode out of catalog characters, one after another, and scramble away again
function decoder(el, text, seed) {
  el.textContent = '';
  const spans = [...text].map((ch) => {
    const s = document.createElement('span');
    s.className = 'ab-ch';
    s.textContent = ch;
    el.append(s);
    return {s, ch};
  });
  let sized = false;
  return (t, t0, stagger, dur, out0 = Infinity, outStagger = 0.02) => {
    if (!sized) {
      // each letter keeps its own width, so the scrambled glyphs don't shake the line
      for (const sp of spans) sp.s.style.width = `${sp.s.getBoundingClientRect().width}px`;
      sized = true;
    }
    const n = spans.length;
    const frame = Math.floor(t * 24);
    spans.forEach(({s, ch}, i) => {
      const lock = t0 + i * stagger + dur;
      const gone = out0 + (n - 1 - i) * outStagger;
      if (ch === ' ' || t < t0 + i * stagger || t > gone + dur * 0.6) {
        s.textContent = ch === ' ' ? ' ' : '';
        s.style.opacity = '0';
        return;
      }
      const scrambling = t < lock || t > gone;
      s.textContent = scrambling ? GLYPHS[Math.floor(hash(seed * 131 + i, frame) * GLYPHS.length)] : ch;
      s.classList.toggle('scr', scrambling);
      s.style.opacity = '1';
    });
  };
}
// a line typed out character by character, with a block cursor while it types
function typer(el, text) {
  return (t, t0, rate = 32, hold = 0.6) => {
    const n = Math.max(0, Math.min(text.length, Math.floor((t - t0) * rate)));
    const typing = t >= t0 && t < t0 + text.length / rate + hold;
    el.innerHTML = '';
    el.append(document.createTextNode(text.slice(0, n)));
    if (typing && Math.floor(t * 2.4) % 2 === 0) {
      const c = document.createElement('i');
      c.className = 'ab-cursor';
      el.append(c);
    }
  };
}
// words that rise into place out of a mask, one after another
// (*word* is set in the accent color, !word! in the debris red)
function riser(el, text) {
  const word = (w) => w.replace(/^\*(.+)\*$/, '<em>$1</em>').replace(/^!(.+)!$/, '<em class="red">$1</em>');
  el.innerHTML = text.split(' ').map((w) => `<span class="ab-w"><span>${word(w)}</span></span>`).join(' ');
  const words = [...el.querySelectorAll('.ab-w > span')];
  return (t, t0, stagger = 0.07, dur = 0.55, out0 = Infinity) => {
    words.forEach((w, i) => {
      const k = ramp(t, t0 + i * stagger, t0 + i * stagger + dur);
      const o = ramp(t, out0 + i * 0.04, out0 + i * 0.04 + 0.45);
      w.style.transform = `translateY(${((1 - k) * 105 - o * 105).toFixed(1)}%)`;
    });
  };
}

let root = null;
let R = null;
function build() {
  root = document.createElement('div');
  root.className = 'about';
  root.innerHTML = `
    <div class="ab-title"><div class="ab-kick"></div><div class="ab-l"></div><div class="ab-l"></div><div class="ab-l"></div><div class="ab-rule"></div></div>
    <div class="ab-data">
      <div class="ab-kick"></div><div class="ab-gcat"></div><div class="ab-full"></div>
      <div class="ab-who"></div><div class="ab-src">planet4589.org/space/gcat · CC BY 4.0</div>
      <div class="ab-count"><div><b class="ab-n"></b><span>objects tracked</span></div><div><b class="ab-y"></b><span>year</span></div></div>
    </div>
    <div class="ab-table"><div class="ab-head"><span>SATCAT</span><span>COSPAR</span><span>NAME</span><span>TYPE</span><span>OWNER</span></div><div class="ab-rows"></div></div>
    <div class="ab-list">
      <div class="ab-item"><div class="ab-big"></div><div class="ab-stat">7,433 launches since 1957, each at its launch site</div></div>
      <div class="ab-item"><div class="ab-big"></div><div class="ab-stat">14,166 dead rocket stages, fragments and parts still in orbit</div></div>
      <div class="ab-item"><div class="ab-big"></div><div class="ab-chips"></div></div>
    </div>`;
  document.body.append(root);
  const q = (s) => root.querySelector(s);
  const qa = (s) => [...root.querySelectorAll(s)];
  const lines = qa('.ab-title .ab-l');
  const bigs = qa('.ab-list .ab-big');
  q('.ab-chips').innerHTML = WHO.map((w) => `<span class="ab-chip"><i style="background:rgb(${w.color.map((c) => Math.round(c * 255)).join(',')})"></i>${w.short}</span>`).join('');
  const rows = ABOUT.rows;
  q('.ab-rows').innerHTML = rows.map((r) => `<div class="ab-row"><span>${r[1]}</span><span>${r[2]}</span><span>${r[3]}</span><span>${r[4]}</span><span>${r[5]}</span></div>`).join('');
  R = {
    title: q('.ab-title'), rule: q('.ab-rule'),
    kick: typer(q('.ab-title .ab-kick'), 'A Protomota experiment'),
    lines: ['Everything', 'we’ve ever', 'launched'].map((s, i) => decoder(lines[i], s, i + 1)),
    data: q('.ab-data'), table: q('.ab-table'), rows: q('.ab-rows'), rowEls: qa('.ab-row'),
    dkick: typer(q('.ab-data .ab-kick'), 'The data'),
    gcat: decoder(q('.ab-gcat'), 'GCAT', 7),
    full: riser(q('.ab-full'), 'The General Catalog of Artificial Space Objects'),
    who: riser(q('.ab-who'), 'Kept by the astronomer Jonathan C. McDowell'),
    src: q('.ab-src'), count: q('.ab-count'), n: q('.ab-n'), y: q('.ab-y'),
    list: q('.ab-list'), items: qa('.ab-item'), stats: qa('.ab-stat'), chips: qa('.ab-chip'),
    bigs: [
      riser(bigs[0], 'Every *launch.*'),
      riser(bigs[1], 'Every piece of !debris.!'),
      riser(bigs[2], 'And *who* put it all up there.'),
    ],
  };
}

// t is tour time; day the date on the globe; ever the number of objects launched by then (the page's own count)
export function showAbout(t, day, ever, yearOf) {
  if (!ABOUT) return;
  if (!root) build();
  const C = ABOUT.cues;
  const on = t < C.film + 2.2;
  root.style.visibility = on ? 'visible' : 'hidden';
  if (!on) return;

  // the title: the kicker types out, the three lines decode one after another, and they scramble away for GCAT
  const tIn = C.title - 0.15;
  const tOut = C.gcat - 0.55;
  R.kick(t, C.proto - 0.1, 30, 0.8);
  R.lines.forEach((f, i) => f(t, tIn + i * 0.3, 0.032, 0.32, tOut + (2 - i) * 0.1, 0.014));
  R.rule.style.transform = `scaleX(${(ramp(t, tIn + 0.7, tIn + 1.6) * (1 - ramp(t, tOut, tOut + 0.4))).toFixed(4)})`;
  R.title.style.opacity = t > tOut + 1.2 ? '0' : '1';
  R.title.querySelector('.ab-kick').style.opacity = (1 - ramp(t, tOut, tOut + 0.3)).toFixed(3);

  // the data: GCAT decodes in, its name and its keeper rise under it, and its rows stream by as the years fill the sky
  const dOut = C.launch - 0.55;
  const dOp = ramp(t, C.gcat - 0.2, C.gcat + 0.2) * (1 - ramp(t, dOut, dOut + 0.45));
  R.data.style.opacity = dOp.toFixed(3);
  R.data.style.visibility = dOp > 0.001 ? 'visible' : 'hidden';
  R.dkick(t, C.gcat - 0.15, 30, 0.6);
  R.gcat(t, C.gcat, 0.06, 0.34);
  R.full(t, C.gcat + 0.55, 0.05);
  R.who(t, C.kept - 0.05, 0.06);
  R.src.style.opacity = ramp(t, C.kept + 0.6, C.kept + 1.1).toFixed(3);
  R.count.style.opacity = ramp(t, C.gcat + 0.3, C.gcat + 0.8).toFixed(3);
  R.n.textContent = fmt(ever);
  R.y.textContent = String(Math.floor(yearOf(day)));
  const tOp = ramp(t, C.gcat + 0.1, C.gcat + 0.6) * (1 - ramp(t, dOut - 0.1, dOut + 0.35));
  R.table.style.opacity = tOp.toFixed(3);
  R.table.style.visibility = tOp > 0.001 ? 'visible' : 'hidden';
  R.table.style.transform = `translateX(${((1 - ramp(t, C.gcat + 0.1, C.gcat + 0.7)) * 60).toFixed(1)}px)`;
  if (tOp > 0.001) {
    // rows up to the date on the globe, newest at the bottom (the rows are in launch order; a row's place in its year
    // stands in for its date)
    const yf = yearOf(day);
    const rows = ABOUT.rows;
    let lo = 0;
    let hi = rows.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (rows[m][0] <= yf) lo = m + 1;
      else hi = m;
    }
    const prev = lo > 0 ? rows[lo - 1][0] : rows[0][0] - 1;
    const next = lo < rows.length ? rows[lo][0] : prev + 1;
    const idx = lo + clamp01((yf - prev) / Math.max(1e-6, next - prev)) - 1;
    const ROW = 44;
    const VIS = 17;
    R.rows.style.transform = `translateY(${(-(idx - VIS + 1) * ROW).toFixed(1)}px)`;
    const newest = Math.floor(idx);
    for (let i = Math.max(0, newest - VIS - 1); i <= Math.min(rows.length - 1, newest + 1); i += 1) R.rowEls[i].classList.toggle('new', i === newest);
  }

  // the list: a line for each part, the one being talked about bright, the ones before it dimmed
  const keys = [C.launch, C.debris, C.who];
  const lOut = C.film - 0.1;
  R.list.style.visibility = t > keys[0] - 0.5 && t < lOut + 1.5 ? 'visible' : 'hidden';
  keys.forEach((k, i) => {
    R.bigs[i](t, k - 0.12, 0.07, 0.5, lOut + i * 0.08);
    const next = keys[i + 1];
    const dim = next ? ramp(t, next - 0.2, next + 0.3) : 0;
    R.items[i].style.opacity = ((1 - 0.68 * dim) * (1 - ramp(t, lOut + 0.2, lOut + 0.7))).toFixed(3);
    if (R.stats[i]) R.stats[i].style.opacity = (ramp(t, k + 0.45, k + 0.9) * (1 - dim)).toFixed(3);
  });
  R.chips.forEach((c, i) => {
    const k = ramp(t, C.who + 0.5 + i * 0.06, C.who + 0.85 + i * 0.06);
    c.style.opacity = k.toFixed(3);
    c.style.transform = `translateY(${((1 - k) * 12).toFixed(1)}px)`;
  });
}
