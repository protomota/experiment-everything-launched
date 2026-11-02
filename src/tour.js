// The guided tour, as pure functions of tour time t (seconds). The page plays it on load and the capture mode renders
// it frame by frame, so both show exactly the same thing.
//
// The tour is a list of beats: a spec plate for each ship as the date reaches its launch, the three debris breakups
// in slow motion, then today and the rockets lined up to scale. Between beats the date runs fast.
import * as THREE from 'three';
import meta from './catalog.json';
import {dayOf} from './orbits.js';
import {SHIPS, SITES} from './ships/ships.js';
import {planBelt} from './belt.js';

const SHIP = Object.fromEntries(SHIPS.map((s) => [s.key, s]));
const BREAKUP_DAY = {
  fengyun: meta.events.find((e) => e.focus === 'S25730').t,
  iridium: meta.events.find((e) => e.focus === 'S24946').t,
  kosmos1408: meta.events.find((e) => e.focus === 'S13552').t,
};
const END_DAY = meta.endDay;

// [kind, key, seconds on screen]
const PLAN = [
  ['ship', 'sputnik1', 15],
  ['ship', 'sputnik2', 12.5],
  ['ship', 'explorer1', 12.5],
  ['ship', 'vanguard1', 12.5],
  ['ship', 'luna2', 12.5],
  ['ship', 'luna3', 12.5],
  ['ship', 'tiros1', 12.5],
  ['ship', 'echo1', 12.5],
  ['ship', 'vostok1', 12.5],
  ['ship', 'freedom7', 12.5],
  ['ship', 'friendship7', 12.5],
  ['ship', 'telstar1', 12.5],
  ['ship', 'mariner2', 12.5],
  ['ship', 'vostok6', 12.5],
  ['ship', 'syncom3', 12.5],
  ['ship', 'voskhod2', 12.5],
  ['ship', 'earlybird', 12.5],
  ['ship', 'luna9', 12.5],
  ['ship', 'gemini8', 12.5],
  ['ship', 'soyuz1', 12.5],
  ['ship', 'apollo11', 13],
  ['ship', 'ohsumi', 12.5],
  ['ship', 'dfh1', 12.5],
  ['ship', 'venera7', 12.5],
  ['ship', 'lunokhod1', 12.5],
  ['ship', 'salyut1', 12.5],
  ['ship', 'mars3', 12.5],
  ['ship', 'pioneer10', 12.5],
  ['ship', 'landsat1', 12.5],
  ['ship', 'skylab', 12.5],
  ['ship', 'aryabhata', 12.5],
  ['ship', 'astp', 12.5],
  ['ship', 'viking1', 12.5],
  ['ship', 'voyager1', 13],
  ['ship', 'navstar1', 12.5],
  ['ship', 'ariane1', 12.5],
  ['ship', 'sts1', 13],
  ['ship', 'tdrs1', 12.5],
  ['ship', 'mir', 12.5],
  ['ship', 'buran', 12.5],
  ['ship', 'magellan', 12.5],
  ['ship', 'galileo', 12.5],
  ['ship', 'hubble', 12.5],
  ['ship', 'ulysses', 12.5],
  ['ship', 'cgro', 12.5],
  ['ship', 'soho', 12.5],
  ['ship', 'cassini', 12.5],
  ['ship', 'iss', 13],
  ['ship', 'stardust', 12.5],
  ['ship', 'chandra', 12.5],
  ['ship', 'opportunity', 12.5],
  ['ship', 'spitzer', 12.5],
  ['ship', 'shenzhou5', 12.5],
  ['ship', 'rosetta', 12.5],
  ['ship', 'messenger', 12.5],
  ['breakup', 'fengyun', 16],
  ['ship', 'dawn', 12.5],
  ['ship', 'falcon1', 12.5],
  ['breakup', 'iridium', 16],
  ['ship', 'kepler', 12.5],
  ['ship', 'falcon9', 13],
  ['ship', 'juno', 12.5],
  ['ship', 'dragonc2', 12.5],
  ['ship', 'mom', 12.5],
  ['ship', 'hayabusa2', 12.5],
  ['ship', 'osirisrex', 12.5],
  ['ship', 'falconheavy', 12.5],
  ['ship', 'insight', 12.5],
  ['ship', 'parker', 12.5],
  ['ship', 'change4', 12.5],
  ['ship', 'starlink', 13],
  ['ship', 'crewdragon', 12.5],
  ['ship', 'tianwen1', 12.5],
  ['ship', 'perseverance', 12.5],
  ['ship', 'tianhe', 12.5],
  ['breakup', 'kosmos1408', 16],
  ['ship', 'dart', 12.5],
  ['ship', 'jwst', 13],
  ['ship', 'starlinkv2', 13],
  ['ship', 'chandrayaan3', 12.5],
  ['ship', 'newglenn', 12.5],
  ['ship', 'kuiper', 12.5],
  ['ship', 'artemis2', 13],
  ['ship', 'starship', 13.5],
  ['today', 'today', 8],
  ['stats', 'junk', 16],
  ['stats', 'who', 16],
  ['lineup', 'lineup', 12],
];
// The narrated video build (NARR=... node build.mjs) sets each beat's length to fit its narration, leaves out
// beats that have none (ships added to the page after the narration was recorded), and shortens the gaps.
const FIT = (typeof window !== 'undefined' && window.__TOUR_DUR) || null;
const GAP = (typeof window !== 'undefined' && window.__TOUR_GAP) || 1.5;
export const BEATS = [];
{
  let t = 0;
  for (const [kind, key, dur] of PLAN) {
    if (FIT && !FIT[key]) continue;
    const d = FIT ? FIT[key] : dur;
    BEATS.push({kind, key, a: t, b: t + d});
    t += d + GAP;
  }
}
const last = BEATS[BEATS.length - 1];
const TODAY = BEATS.find((b) => b.kind === 'today');
const LINEUP = BEATS.find((b) => b.kind === 'lineup');
const STATS = BEATS.filter((b) => b.kind === 'stats');
export const TOUR_DURATION = last.b;

// The narrated video opens cold: "Since 1957, we have put more than sixty-nine thousand objects into orbit" plays
// over all sixty-nine years running by in seconds, the swarm holds on "this is every one of them", then the clock
// rewinds to October 1957 and the camera drops to Baikonur for Sputnik's launch. The page's own tour starts plainly.
// Times are seconds into the tour, set from the pauses in the first line of narration.
const INTRO = FIT && BEATS[0].key === 'sputnik1' ? {grow: [0.6, 7.2], rewind: [12.0, 14.0], launch: 14.6, plate: 15.0, room: 13.4} : null;

// ------------------------------------------------------------ the date
const DATE_KEYS = [];
for (const beat of BEATS) {
  const {kind, key, a, b} = beat;
  if (kind === 'ship') {
    const L = dayOf(SHIP[key].when);
    beat.day = L;
    if (key === 'sputnik1') DATE_KEYS.push([a, L - 0.32], [a + (INTRO ? INTRO.launch : 3.4), L], [b, L + 0.9]);
    else if (key === 'starlink') DATE_KEYS.push([a, L - 0.3], [a + 1.1, L], [a + 3.5, L + 1.5], [b, L + 4]);
    else DATE_KEYS.push([a, L - 0.22], [a + 1.1, L], [b, L + 0.8]);
  } else if (kind === 'breakup') {
    const T = BREAKUP_DAY[key];
    beat.day = T;
    DATE_KEYS.push([a, T - 1.5 / 24], [a + 4.5, T + 2.53 / 24], [b - 0.3, T + 3.6]);
  } else if (kind === 'today') {
    DATE_KEYS.push([a + 2, END_DAY]);
  } else if (kind === 'stats') {
    DATE_KEYS.push([b, END_DAY]);
  } else {
    DATE_KEYS.push([b, END_DAY]);
  }
}

// How fast objects move along their orbits, as a multiple of real time: calm under a spec plate, slow motion for a
// breakup, fast in between.
const WARP_KEYS = [];
for (const {kind, key, a, b} of BEATS) {
  const w = kind === 'breakup' ? 110 : kind === 'ship' ? (key === 'starlink' ? 220 : 40) : 600;
  // the cold open swirls the swarm, then settles to the plate's calm as the clock rewinds
  if (INTRO && key === 'sputnik1') WARP_KEYS.push([0, 600], [INTRO.rewind[0], 600], [INTRO.rewind[1], w], [b - 0.2, w]);
  else WARP_KEYS.push([a + (a ? 0.2 : 0), w], [b - 0.2, w]);
}

const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Fritsch–Carlson monotone cubic through (t, v) keys.
const monotone = (keys) => {
  const n = keys.length;
  const d = [];
  const m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i += 1) d.push((keys[i + 1][1] - keys[i][1]) / (keys[i + 1][0] - keys[i][0]));
  for (let i = 1; i < n - 1; i += 1) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    if (t >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0;
    while (t > keys[i + 1][0]) i += 1;
    const [t0, v0] = keys[i];
    const [t1, v1] = keys[i + 1];
    if (v0 === v1) return v0; // flat (the sum below can land a hair under, which turns the date back a day)
    const h = t1 - t0;
    const s = (t - t0) / h;
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1;
    const h10 = s ** 3 - 2 * s ** 2 + s;
    const h01 = -2 * s ** 3 + 3 * s ** 2;
    const h11 = s ** 3 - s ** 2;
    return h00 * v0 + h10 * h * m[i] + h01 * v1 + h11 * h * m[i + 1];
  };
};
const eased = (keys) => (t) => {
  if (t <= keys[0][0]) return keys[0][1];
  const lst = keys[keys.length - 1];
  if (t >= lst[0]) return lst[1];
  let i = 0;
  while (t > keys[i + 1][0]) i += 1;
  const s = smooth((t - keys[i][0]) / (keys[i + 1][0] - keys[i][0]));
  return keys[i][1] + (keys[i + 1][1] - keys[i][1]) * s;
};

export const tourDay = monotone(DATE_KEYS);

// The date the globe and the counters show. Same as tourDay, except in the narrated cold open, where it runs to
// today and back again (tourDay itself never runs backwards: tourTimeAt depends on that).
export function shownDay(t) {
  if (FINALE && LINEUP && t > LINEUP.a + FINALE.carry) return finaleDay(t - LINEUP.a);
  if (!INTRO || t >= INTRO.rewind[1]) return tourDay(t);
  const [g0, g1] = INTRO.grow;
  const [r0, r1] = INTRO.rewind;
  const start = tourDay(0);
  if (t < g0) return start;
  if (t < g1) {
    const x = (t - g0) / (g1 - g0);
    return start + (END_DAY - start) * smooth(x);
  }
  if (t < r0) return END_DAY;
  const back = tourDay(r1);
  return END_DAY + (back - END_DAY) * smooth((t - r0) / (r1 - r0));
}
export const introAt = (t) => !!INTRO && t < INTRO.rewind[1];
// In the finale the timeline follows the row of ships: it winds back to 1957 as the rockets lift off, steps through
// each ship's launch date as it reaches the middle, and runs on to today once the row has gone and the globe is back.
const BY_DATE = SHIPS.slice().sort((x, y) => (x.when < y.when ? -1 : 1)).map((s) => dayOf(s.when));
const BY_KEY_ORDER = SHIPS.slice().sort((x, y) => (x.when < y.when ? -1 : 1)).map((s) => s.key);
function finaleDay(u) {
  const first = BELTPLAN.stops[0];
  const last = BELTPLAN.stops[BELTPLAN.stops.length - 1];
  if (u <= first[0]) return END_DAY + (BY_DATE[first[2]] - END_DAY) * smooth(clamp01((u - FINALE.carry) / (first[0] - FINALE.carry)));
  if (u >= last[1]) return BY_DATE[last[2]] + (END_DAY - BY_DATE[last[2]]) * smooth(clamp01((u - last[1]) / Math.max(0.5, FINALE.globe[1] - last[1])));
  const row = BELTPLAN.row;
  const c = Math.max(0, Math.min(row.length - 1, beltAt(u)));
  const p = Math.min(row.length - 2, Math.floor(c));
  return BY_DATE[row[p]] + (BY_DATE[row[p + 1]] - BY_DATE[row[p]]) * smooth(clamp01(c - p));
}

// The narrated video's finale, in seconds from the lineup's start, set by tools/narrate.mjs from the words of its
// line (narration/script.json "marks"): rise [[time, rocket]] as each rocket is named, carry when they lift off on
// "this is what they carried", stops [[from, to, ship]] while the words name a ship, and globe [from, to] as the
// globe comes back for "This is everything we've ever launched".
const FIN = typeof window !== 'undefined' && window.__TOUR_FINALE;
export const FINALE = FIT
  ? FIN || {rise: [[0.8, 0], [3.0, 2], [6.0, 10]], carry: 9.0, stops: [[12.0, 12.6, 0, 12.6], [70.0, 70.6, 80, 70.6]], globe: [72.0, 75.0]}
  : null;

// The finale's row of ships, sliding right to left (planned by src/belt.js): it stops on each ship the words name, in
// the middle of the screen from just before its name until its words are done, and moves only in the quiet between,
// always at one steady speed (v ships a second, easing in and out over ramp seconds). The ships launched in between
// ride past in those moves; the ones there isn't time for are left out of the row. Once the last ship's words are
// done the row runs on until it is empty, and only then does the globe come back.
export const BELT = {v: 8, ramp: 0.25, pre: 0.12, trail: 0, hop: 0.22, enter: 4, land: 0.45, exit: 4, hold: 0.55};
// the in-between ships kept first when only some fit
const BELT_PREFER = ['cassini'];
const BELTPLAN = FINALE
  ? planBelt(FINALE.stops, {...BELT, prefer: (i) => (BELT_PREFER.includes(BY_KEY_ORDER[i]) ? 1 : 0)})
  : null;
// slots covered s seconds into a run of n slots: constant acceleration up to speed v, cruise, constant deceleration
const runAt = (n, s) => {
  const T = BELTPLAN.runTime(n);
  if (s <= 0) return 0;
  if (s >= T) return n;
  const acc = BELT.v / BELT.ramp;
  const r = Math.min(BELT.ramp, T / 2);
  if (s <= r) return (acc * s * s) / 2;
  if (s >= T - r) return n - (acc * (T - s) ** 2) / 2;
  return (acc * r * r) / 2 + BELT.v * (s - r);
};
export const finalePlan = BELTPLAN;
// the slot in the middle of the screen u seconds into the lineup beat (fractional while the row moves); the ship in
// slot p is BELTPLAN.row[p]
export function beltAt(u) {
  const R = BELTPLAN.runs;
  let k = R.length - 1;
  while (k > 0 && R[k][0] > u) k -= 1;
  const [t0, a, b, d] = R[k];
  return u <= t0 && k === 0 ? a : a + runAt(b - a, ((u - t0) * BELTPLAN.runTime(b - a)) / d);
}
export const beltRow = () => BELTPLAN.row;
// the named ships being talked about, [[ship, 0..1]]: up as the row slows onto one, down as it pulls away
export const focusAt = (u) =>
  BELTPLAN.stops.map(([a, d, i]) => [i, smooth(clamp01((u - a + 0.2) / 0.25)) * (1 - smooth(clamp01((u - d) / 0.2)))]).filter(([, f]) => f > 0.001);
const warpAt = eased(WARP_KEYS);

// Simulated seconds are the integral of the warp, tabulated once so any frame can be rendered on its own.
const STEP = 1 / 240;
const SIM_TABLE = (() => {
  const n = Math.ceil(TOUR_DURATION / STEP) + 2;
  const table = new Float64Array(n);
  for (let i = 1; i < n; i += 1) table[i] = table[i - 1] + 0.5 * (warpAt((i - 1) * STEP) + warpAt(i * STEP)) * STEP;
  return table;
})();
export const tourSim = (t) => {
  const x = Math.max(0, Math.min(TOUR_DURATION, t)) / STEP;
  const i = Math.floor(x);
  return SIM_TABLE[i] + (SIM_TABLE[i + 1] - SIM_TABLE[i]) * (x - i);
};
export const tourWarp = warpAt;

// The globe never sits still on screen: on top of Earth's own turn with the orbit clock, the globe and everything
// around it turn slowly about Earth's axis the whole time (as if the camera drifted west around it, with the stars
// held still), and the shots of the whole globe no longer turn the camera along with it.
export const TURN_RATE = (2.5 * Math.PI) / 180; // radians per second
export const tourTurn = (t) => TURN_RATE * Math.max(0, t);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
// a camera worked out among the orbits, carried round with the turning globe
const turned = (cam, ang) => ({dir: cam.dir.clone().applyAxisAngle(Y_AXIS, ang), dist: cam.dist, target: cam.target.clone().applyAxisAngle(Y_AXIS, ang)});

// Days per second of tour time at t, for the size of the "just arrived" flash.
export const tourSpeed = (t) => Math.abs(tourDay(t + 0.05) - tourDay(t - 0.05)) / 0.1;

export const sphericalDir = (azDeg, elDeg, out = new THREE.Vector3()) => {
  const az = (azDeg * Math.PI) / 180;
  const el = (elDeg * Math.PI) / 180;
  return out.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
};

// The tour time at which the date reaches day (the date never runs backwards, so a bisection finds it).
export function tourTimeAt(day) {
  let lo = 0;
  let hi = TOUR_DURATION;
  for (let k = 0; k < 60; k += 1) {
    const mid = (lo + hi) / 2;
    if (tourDay(mid) < day) lo = mid;
    else hi = mid;
  }
  return hi;
}
export const tourSimAtDay = (day) => tourSim(tourTimeAt(day));

// ------------------------------------------------------------ the camera
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpN = new THREE.Vector3();

// The camera for a breakup: off to the side of the cloud's orbit plane, looking past the cloud toward Earth.
// p is the cloud's centre now and q a little later, which gives the direction of travel.
export function focusFrom(p, q, dist, lift = 0.75, reach = 0.42) {
  tmpN.crossVectors(p, q).normalize();
  const dir = p.clone().normalize().addScaledVector(tmpN, lift).normalize();
  dir.y += 0.18;
  dir.normalize();
  return {dir, dist, target: p.clone().multiplyScalar(reach)};
}

const slerpDir = (a, b, w) => {
  const dot = Math.min(1, Math.max(-1, a.dot(b)));
  const ang = Math.acos(dot);
  if (ang < 1e-4) return a.clone();
  const s = Math.sin(ang);
  return a.clone().multiplyScalar(Math.sin((1 - w) * ang) / s).addScaledVector(b, Math.sin(w * ang) / s);
};
const blendCam = (from, to, w) => ({
  dir: slerpDir(from.dir, to.dir, w),
  dist: from.dist + (to.dist - from.dist) * w,
  target: from.target.clone().lerp(to.target, w),
});

// where a launch site faces, in the scene, at sim seconds (the globe turns with sim time)
export const siteLocal = (key) => {
  const [lat, lon] = SITES[key].at.map((v) => (v * Math.PI) / 180);
  return new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
};

const WIDE = 12; // far enough out to take in the geostationary ring
// After "Where we are now" pulls out wide, the closing cards keep the camera moving: under the junk card it pushes in
// close to the swarm, rises over the pole where the old rocket bodies and fragments crowd the polar orbits, and eases
// back; under the who card it swings low around the far side and back out; behind the finale it backs off to take in
// everything, and keeps drawing back slowly as the globe returns for the last line. Keys are fractions of each card,
// so they fit whatever the narration's length. Distance eases in log space; az swings the camera against the globe's turn.
const CLOSE = (() => {
  if (!TODAY) return null;
  const t0 = TODAY.b + GAP;
  const J = BEATS.find((b) => b.key === 'junk');
  const H = BEATS.find((b) => b.key === 'who');
  const keys = [[t0 - 1, WIDE, 21, 0], [t0, WIDE, 21, 0]];
  if (J) {
    const l = J.b - J.a;
    keys.push([J.a + 0.3 * l, 3.3, 27, 8], [J.a + 0.62 * l, 2.7, 46, 30], [J.b, 4.6, 16, 44]);
  }
  if (H) {
    const l = H.b - H.a;
    keys.push([H.a + 0.45 * l, 3.4, -6, 85], [H.b, 5.0, 8, 110]);
  }
  if (LINEUP) {
    if (FINALE) {
      // the narrated finale: the globe comes back large once the row of ships has gone, and pulls out slowly to the end
      const g = LINEUP.a + BELTPLAN.gone;
      keys.push([LINEUP.a + 3, 9.5, 12, 125], [g - 0.4, 2.7, 10, 132], [LINEUP.b, 10.5, 22, 160], [LINEUP.b + 1, 10.5, 22, 160]);
    } else keys.push([LINEUP.a + 3, 9.5, 12, 125], [LINEUP.b - 4, 11, 16, 135], [LINEUP.b, 14, 20, 150], [LINEUP.b + 1, 14, 20, 150]);
  }
  const at = (j) => monotone(keys.map((k) => [k[0], j === 1 ? Math.log(k[1]) : k[j]]));
  return {t0, dist: at(1), el: at(2), az: at(3)};
})();
// Each ship's plate gets one slow camera move across its whole length, taking turns: rising away from the launch
// site, a sweep around the globe, a push in toward the site.
const SHIP_ORDER = Object.fromEntries(BEATS.filter((b) => b.kind === 'ship').map((b, i) => [b.key, i]));
function shipShot(beat, t, az, el) {
  const k = smooth(clamp01((t - beat.a) / Math.max(6, beat.b - beat.a)));
  const lerp = (x, y) => x + (y - x) * k;
  const move = SHIP_ORDER[beat.key] % 3;
  // the camera holds its bearing (a touch against the turn) and the turning globe carries the site across the frame
  if (move === 0) return {dir: sphericalDir(az + lerp(3, -3), el + lerp(-7, 7)), dist: 2.6 * (3.75 / 2.6) ** k, target: new THREE.Vector3()};
  if (move === 1) return {dir: sphericalDir(az + lerp(3, -3), el + lerp(9, -3)), dist: lerp(3.55, 3.25), target: new THREE.Vector3()};
  return {dir: sphericalDir(az + lerp(3, -3), el + lerp(10, 2)), dist: 3.9 * (2.95 / 3.9) ** k, target: new THREE.Vector3()};
}
// The cold open's camera: out from the globe as the years fill it, then a slow turn around today's swarm.
function introCam(t) {
  const grow = smooth(clamp01((t - INTRO.grow[0]) / (INTRO.grow[1] - INTRO.grow[0])));
  const hold = smooth(clamp01((t - INTRO.grow[1]) / (INTRO.rewind[0] - INTRO.grow[1])));
  return {dir: sphericalDir(20 - t * 1.0, 8 + 18 * grow - 6 * hold), dist: 3.2 * (10 / 3.2) ** grow - 3.4 * hold, target: new THREE.Vector3()};
}

// One camera per beat, crossfaded through the gaps. centreOf(key, day, sim, out) gives a cloud's centre;
// spinAt(sim) gives the globe's turn angle.
const beatCamera = (beat, t, centreOf, spinAt) => {
  const day = tourDay(t);
  const sim = tourSim(t);
  if (beat.kind === 'ship' && beat.key === 'starlink') {
    const p = centreOf('starlink', day, sim, tmpA);
    const q = centreOf('starlink', day, sim + 240, tmpB);
    if (p) {
      // ride just behind the train as it strings out along its orbit; Earth rolls by underneath
      const k = smooth(clamp01((t - beat.a - 3) / (beat.b - beat.a - 3)));
      return turned(focusFrom(p, q, 2.3 + 0.35 * k, 0.75 + 0.2 * k, 0.8 - 0.1 * k), tourTurn(t));
    }
  }
  if (beat.kind === 'ship') {
    // aim where the launch site will be a little before the middle of its card, so the turning globe carries it
    // across the frame from left to right while the card is up
    const inAt = plateIn(beat);
    const tr = inAt + 0.4 * (beat.b - inAt);
    const site = siteLocal(SHIP[beat.key].site).applyAxisAngle(Y_AXIS, spinAt(tourSim(tr)) + tourTurn(tr));
    const az = (Math.atan2(site.x, site.z) * 180) / Math.PI;
    const el = Math.max(-15, Math.min(42, (Math.asin(site.y) * 180) / Math.PI * 0.75 + 6));
    const shot = shipShot(beat, t, az, el);
    if (INTRO && beat.key === 'sputnik1') return blendCam(introCam(t), shot, smooth(clamp01((t - INTRO.rewind[0]) / (INTRO.launch + 0.6 - INTRO.rewind[0]))));
    return shot;
  }
  if (beat.kind === 'breakup') {
    const p = centreOf(beat.key, day, sim, tmpA);
    const q = centreOf(beat.key, day, sim + 240, tmpB);
    const k = smooth(clamp01((t - (beat.a + 3.8)) / (beat.b - 0.4 - (beat.a + 3.8))));
    return turned(focusFrom(p, q, 2.45 + (4.6 - 2.45) * k, 0.75 + 0.85 * k, 0.42 - 0.3 * k), tourTurn(t));
  }
  // today opens close in, in the thick of it, and pulls out to show everything around Earth; from there the closing
  // cards and the finale follow CLOSE above, turning slowly all the way to the end
  const u = t - TODAY.a;
  const out = smooth(clamp01((u - 1.6) / (TODAY.b - TODAY.a + GAP - 1.6)));
  // (the camera drifts against the globe's turn, never with it, so the globe is seen to turn)
  if (!CLOSE || t <= CLOSE.t0) return {dir: sphericalDir(395 - u * 1.0, 10 + 11 * out), dist: 2.35 * (WIDE / 2.35) ** out, target: new THREE.Vector3()};
  return {dir: sphericalDir(395 - u * 1.0 - CLOSE.az(t), CLOSE.el(t)), dist: Math.exp(CLOSE.dist(t)), target: new THREE.Vector3()};
};

export function tourCamera(t, centreOf, spinAt) {
  const cams = [];
  for (const beat of BEATS) {
    if (t < beat.a - GAP || t > beat.b + GAP) continue;
    const win = Math.min(1, (t - (beat.a - GAP)) / GAP, (beat.b + GAP - t) / GAP);
    const first = beat === BEATS[0] && t < beat.a;
    const w = first ? 1 : smooth(clamp01(win));
    if (w <= 0) continue;
    cams.push([beatCamera(beat, t, centreOf, spinAt), w]);
  }
  if (!cams.length) return beatCamera(BEATS[0], 0, centreOf, spinAt);
  let [cur, acc] = cams[0];
  for (let k = 1; k < cams.length; k += 1) {
    const [c, w] = cams[k];
    cur = blendCam(cur, c, w / (acc + w));
    acc += w;
  }
  return cur;
}

// ------------------------------------------------------------ what's on screen
// The spec plate showing at t: which ship, how visible, and how long it has been up.
const plateIn = (beat) => beat.a + (beat.key === 'sputnik1' ? (INTRO ? INTRO.plate : 2.4) : beat.kind === 'breakup' ? 0.8 : 0.35);
export function plateAt(t) {
  for (const beat of BEATS) {
    if (beat.kind !== 'ship' && beat.kind !== 'breakup' && beat.kind !== 'stats') continue;
    const inAt = plateIn(beat);
    if (t < inAt || t > beat.b + 0.15) continue;
    const opacity = smooth(clamp01(Math.min((t - inAt) / 0.6, (beat.b + 0.15 - t) / 0.6)));
    return {key: beat.key, kind: beat.kind, opacity, local: t - inAt};
  }
  return null;
}

// How far the globe slides left to make room for the plate (0 to 1). Back-to-back cards share one stretch, so the
// globe stays aside while one card slides out and the next slides in.
// "Where we are now" has no card, but the globe stays aside for it too (its legend takes the card's place).
const isCard = (beat) => beat && (beat.kind === 'ship' || beat.kind === 'breakup' || beat.kind === 'stats' || beat.kind === 'today');
const ROOM = [];
BEATS.forEach((beat, i) => {
  if (!isCard(beat)) return;
  const a = beat.a + (beat.key === 'sputnik1' ? (INTRO ? INTRO.room : 2.0) : beat.kind === 'breakup' ? 0.4 : -GAP / 2);
  const b = beat.b + GAP / 2;
  if (isCard(BEATS[i - 1])) ROOM[ROOM.length - 1][1] = b;
  else ROOM.push([a, b]);
});
export function plateRoomAt(t) {
  let w = 0;
  for (const [a, b] of ROOM) w = Math.max(w, smooth(clamp01(Math.min((t - a) / 1.2, (b - t) / 1.2))));
  return w;
}

// The closing cards change what the globe shows: the junk card fades out the satellites (kinds 0 and 1) so only
// the junk is left, and the who card cross-fades every dot to the color of its owner. Both undo themselves after.
const STAT = Object.fromEntries(BEATS.filter((b) => b.kind === 'stats').map((b) => [b.key, b]));
export function lookAt(t) {
  const j = STAT.junk;
  const w = STAT.who;
  const junk = j ? smooth(clamp01(Math.min((t - j.a - 1) / 1.6, (w ? w.a + 0.5 : j.b + 1.6) - t) / 1.6)) : 0;
  const mode = w ? smooth(clamp01(Math.min((t - w.a - 0.6) / 1.8, (LINEUP.a + 2 - t) / 1.5))) : 0;
  const keep = 1 - 0.9 * junk;
  return {keep: [keep, keep, 1, 1, 1], mode};
}

// The legend's counts stand in for a card while "Where we are now" is up (the globe stays aside for it).
export function legendAt(t) {
  if (!TODAY) return 0;
  return smooth(clamp01(Math.min((t - TODAY.a - 0.4) / 0.8, (TODAY.b + 0.2 - t) / 0.6)));
}

export function lineupAt(t) {
  const beat = BEATS.find((b) => b.kind === 'lineup');
  if (t < beat.a - 0.3) return null;
  const u = t - beat.a;
  const show = smooth(clamp01((u + 0.3) / 0.9));
  if (!FINALE) return {opacity: show, dim: show, local: u};
  // the narrated finale: the row of ships runs off the left of the screen, the heading goes with its last ships, and
  // only then does the globe come back (big, then pulling out: see CLOSE)
  const out = smooth(clamp01((u - (BELTPLAN.gone - 0.6)) / 0.6));
  const undim = smooth(clamp01((u - (BELTPLAN.gone - 0.15)) / 2.0));
  // and at the start the globe dims more slowly than the stage comes up, so Juno I rises in front of it
  const dim = smooth(clamp01((u + 0.3) / 2.2));
  return {opacity: show * (1 - out), dim: dim * (1 - undim), local: u};
}

// Caption for today: [from, to, key].
// (the breakups have their own cards now)
export const CAPTIONS = BEATS.filter((b) => b.kind === 'today').map((b) => [b.a + 0.8, b.b + 0.3, 'today']);
export function captionAt(t) {
  for (const [a, b, key] of CAPTIONS) {
    if (t >= a && t <= b) {
      const fade = Math.min(1, (t - a) / 0.5, (b - t) / 0.5);
      return {key, opacity: Math.max(0, fade)};
    }
  }
  return null;
}
