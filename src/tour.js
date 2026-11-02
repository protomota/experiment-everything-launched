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
// (open and close are only in the 5-minute cut: its cold open is a line of its own, and so is its last line)
const PLAN = [
  ['open', 'open', 12],
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
  ['close', 'close', 9],
];
// The narrated video build (NARR=... node build.mjs) sets each beat's length to fit its narration, leaves out
// beats that have none (ships added to the page after the narration was recorded), and shortens the gaps.
const FIT = (typeof window !== 'undefined' && window.__TOUR_DUR) || null;
const GAP = (typeof window !== 'undefined' && window.__TOUR_GAP) || 1.5;
// a cut can put the beats in its own order (the 5-minute cut opens with the whole lineup)
const ORDER = (typeof window !== 'undefined' && window.__TOUR_ORDER) || null;
const PLAN_OF = Object.fromEntries(PLAN.map((p) => [p[1], p]));
export const BEATS = [];
{
  let t = 0;
  for (const [kind, key, dur] of ORDER ? ORDER.map((k) => PLAN_OF[k]) : PLAN) {
    if (!FIT && (kind === 'open' || kind === 'close')) continue;
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
const OPEN = BEATS.find((b) => b.kind === 'open');
const CLOSER = BEATS.find((b) => b.kind === 'close');
const SPUTNIK = BEATS.find((b) => b.key === 'sputnik1');
// The 5-minute cut's prelude: its cold open, then the whole lineup (the rockets to scale, then everything they
// carried), and only then the clock rewinds to Sputnik and the stories begin. Its last line has a beat of its own.
const PRELUDE = !!(FIT && OPEN && LINEUP && SPUTNIK && LINEUP.a < SPUTNIK.a);
export const TOUR_DURATION = last.b;

// The narrated video opens cold: "Since 1957, we have put more than sixty-nine thousand objects into orbit" plays
// over all sixty-nine years running by in seconds, the swarm holds on "this is every one of them", then the clock
// rewinds to October 1957 and the camera drops to Baikonur for Sputnik's launch. The page's own tour starts plainly.
// Times are seconds into the tour, set from the pauses in the first line of narration. In the 5-minute cut the cold
// open is its own line and the lineup follows it; the rewind to Sputnik comes after the lineup, as its line starts
// ("It all began on October fourth, 1957").
const INTRO = PRELUDE
  ? {grow: [OPEN.a + 0.6, OPEN.a + 7.2], hold: OPEN.b + GAP, rewind: [SPUTNIK.a - 1.2, SPUTNIK.a + 0.8], launch: SPUTNIK.a + 2.0, plate: SPUTNIK.a + 2.4, room: SPUTNIK.a + 1.0}
  : FIT && BEATS[0].key === 'sputnik1' ? {grow: [0.6, 7.2], hold: 12.0, rewind: [12.0, 14.0], launch: 14.6, plate: 15.0, room: 13.4} : null;

// ------------------------------------------------------------ the date
// how far into the Starlink card its line gets to the train ("Watch them string out", about half way in both cuts)
const STARLINK_TRAIN = 0.5;
const DATE_KEYS = [];
for (const beat of BEATS) {
  const {kind, key, a, b} = beat;
  if (kind === 'ship') {
    const L = dayOf(SHIP[key].when);
    beat.day = L;
    if (key === 'sputnik1') DATE_KEYS.push([a, L - 0.32], [INTRO ? INTRO.launch : a + 3.4, L], [b, L + 0.9]);
    else if (key === 'starlink') {
      // the days run on faster as the line gets to the train, so it strings out along its orbit as the words say so
      const sw = a + STARLINK_TRAIN * (b - a);
      DATE_KEYS.push([a, L - 0.3], [a + 1.1, L], [sw - 1, L + 1.2], [sw + 3, L + 4.5], [b, L + 5.5]);
    }
    else DATE_KEYS.push([a, L - 0.22], [a + 1.1, L], [b, L + 0.8]);
  } else if (kind === 'breakup') {
    const T = BREAKUP_DAY[key];
    beat.day = T;
    DATE_KEYS.push([a, T - 1.5 / 24], [a + 4.5, T + 2.53 / 24], [b - 0.3, T + 3.6]);
  } else if (kind === 'open' || (kind === 'lineup' && PRELUDE)) {
    // the prelude's dates are shownDay's own (the date itself starts at Sputnik)
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
  if (INTRO && key === 'sputnik1') WARP_KEYS.push(...(PRELUDE ? [] : [[0, 600]]), [INTRO.rewind[0], 600], [INTRO.rewind[1], w], [b - 0.2, w]);
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
  if (FINALE && LINEUP && t > LINEUP.a + FINALE.carry && !(PRELUDE && t >= INTRO.rewind[0])) return finaleDay(t - LINEUP.a);
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
  // (in the 5-minute cut the rewind can start while the lineup's clock is still running on to today, so it winds back
  // from wherever that clock has got to)
  const from = PRELUDE ? finaleDay(r0 - LINEUP.a) : END_DAY;
  return from + (back - from) * smooth((t - r0) / (r1 - r0));
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

// Cameras blend in bearing (around Earth's axis) and elevation, never along the straight arc between their
// directions, which can pass over a pole and flip the globe; and the bearing swings whichever way keeps the globe
// turning forward on screen: against its turn, or with it by less than the globe itself turns meanwhile (Brad: the
// globe only ever turns one way, never back and forth). swing is the bearing change, in degrees, chosen once for the
// whole move (forwardSwing), so it can't change sides half way through.
const DEG = 180 / Math.PI;
const bearingOf = (d) => Math.atan2(d.x, d.z) * DEG;
const elevationOf = (d) => Math.asin(Math.max(-1, Math.min(1, d.y / d.length()))) * DEG;
const wrap180 = (x) => ((((x + 180) % 360) + 360) % 360) - 180;
// the swing for a move from one camera to another, given their bearings at its middle and how far (degrees) the globe
// turns over the move: with the turn only if by less than a third of that (the move eases, so it peaks at 1.5 times
// its average), else against it
// (bearings and elevations are the camera's place around Earth, which is what shows the globe turning; for most
// cameras, which look at Earth's centre, that is just their direction)
const placeOf = (cam) => (cam.target.lengthSq() ? cam.dir.clone().multiplyScalar(cam.dist).add(cam.target) : cam.dir);
export const forwardSwing = (from, to, turn) => {
  const x = ((((bearingOf(placeOf(to)) - bearingOf(placeOf(from))) % 360) + 360) % 360);
  return x < turn / 3 ? x : x - 360;
};
const blendCam = (from, to, w, swing) => {
  const [pa, pb] = [placeOf(from), placeOf(to)];
  const a = bearingOf(pa);
  const raw = bearingOf(pb) - a;
  const d = swing === undefined ? wrap180(raw) : swing + wrap180(raw - swing);
  const e = elevationOf(pa);
  const dir = sphericalDir(a + d * w, e + (elevationOf(pb) - e) * w);
  const target = from.target.clone().lerp(to.target, w);
  const ra = from.target.lengthSq() ? pa.length() : from.dist;
  const rb = to.target.lengthSq() ? pb.length() : to.dist;
  const dist = ra + (rb - ra) * w;
  if (!target.lengthSq()) return {dir, dist, target};
  // a camera looking past Earth's centre (a breakup's): put it in its place and look at the target from there
  const off = dir.multiplyScalar(dist).sub(target);
  const len = off.length();
  return {dir: off.divideScalar(len), dist: len, target};
};
// how far (degrees) the globe turns between tour times t0 and t1, its own turn and the slow turn of everything
const globeTurn = (t0, t1, spinAt) => (spinAt(tourSim(t1)) + tourTurn(t1) - spinAt(tourSim(t0)) - tourTurn(t0)) * DEG;

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
  if (CLOSER) {
    // the 5-minute cut's last line: the globe, centred again, draws back slowly to the end
    const l = CLOSER.b - CLOSER.a;
    keys.push([CLOSER.a + 0.4 * l, 6.0, 18, 62], [CLOSER.b, 9.5, 22, 84], [CLOSER.b + 1, 9.5, 22, 84]);
  }
  if (LINEUP && !PRELUDE) {
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
  // (az is the camera's bearing at t, which the plan below keeps turning a little slower than the globe)
  if (move === 0) return {dir: sphericalDir(az, el + lerp(-7, 7)), dist: 2.6 * (3.75 / 2.6) ** k, target: new THREE.Vector3()};
  if (move === 1) return {dir: sphericalDir(az, el + lerp(9, -3)), dist: lerp(3.55, 3.25), target: new THREE.Vector3()};
  return {dir: sphericalDir(az, el + lerp(10, 2)), dist: 3.9 * (2.95 / 3.9) ** k, target: new THREE.Vector3()};
}
// The cold open's camera: out from the globe as the years fill it, then a slow turn around today's swarm.
function introCam(t) {
  const grow = smooth(clamp01((t - INTRO.grow[0]) / (INTRO.grow[1] - INTRO.grow[0])));
  const hold = smooth(clamp01((t - INTRO.grow[1]) / (INTRO.hold - INTRO.grow[1])));
  return {dir: sphericalDir(SHOTS.introAz - t * 1.0, 8 + 18 * grow - 6 * hold), dist: 3.2 * (10 / 3.2) ** grow - 3.4 * hold, target: new THREE.Vector3()};
}

// ------------------------------------------------------------ the globe only ever turns one way
// Brad: the globe should always turn the one way on screen, smoothly, never back and forth. What it shows turning is
// the ground under the camera: L = the camera's bearing less the globe's turn, the longitude (as a bearing on the
// globe) the camera looks down on. As long as L only ever goes down, the globe turns forward on screen. So every
// launch shot lets L slip west slowly (the globe turns r degrees a second on screen) with its site in view, starting
// o degrees from the middle (left of it if negative) and drifting right; and between shots L goes down by as little
// as it can, which is a quick forward turn of the globe to the next site. The starting places are planned together
// (dynamic programming over o for every shot) so that the turns between sites are as short as they can be; a site
// a little east of the last one, say, starts right of the middle instead of a whole turn of the globe away.
const PLAN_O = {min: -40, max: 40, end: 50, pref: -12, rMax: 1.5, step: 1, s: 3};
const PLAN_R = [0.5, 0.75, 1.0, 1.25, 1.5];
// the Starlink shot lets L slip more slowly and ends a few degrees further west (its path, below)
const STARLINK_R = 1.0;
const DEG_ = 180 / Math.PI;
const siteBearing = (key) => {
  const v = siteLocal(SHIP[key].site);
  return Math.atan2(v.x, v.z) * DEG_;
};
const mod360 = (x) => ((x % 360) + 360) % 360;
let SHOTS = null; // {byBeat: Map(beat index -> {L, r, s}), introAz, todayAz}
// A breakup's view: from off to one side of the cloud's orbit plane as the pieces fly apart, looking past the cloud
// toward Earth, and lifting further off the plane as the camera pulls back to show the debris spreading round the
// orbit. The camera no longer chases the cloud (those orbits run nearly over the poles, so chasing it swung the
// camera over a pole and turned the globe backwards); like a launch shot, it lets L slip west through the card, so
// the globe keeps turning forward while the cloud races round its orbit. For each side of the plane (s = 0 or 1):
// the bearing on the globe it looks from (at the moment of the breakup) and its direction for a given lift.
const BREAK_AIM = new Map();
const breakupAim = (beat, centreOf, spinAt) => {
  if (!BREAK_AIM.has(beat.key)) {
    const tc = beat.a + 2.0;
    const sim = tourSim(tc);
    const p = centreOf(beat.key, tourDay(tc), sim, new THREE.Vector3());
    const q = centreOf(beat.key, tourDay(tc), sim + 240, new THREE.Vector3());
    const n = new THREE.Vector3().crossVectors(p, q).normalize();
    BREAK_AIM.set(beat.key, {p, sides: [1, -1].map((side) => {
      const d = (lift) => {
        const v = p.clone().normalize().addScaledVector(n, side * lift).normalize();
        v.y += 0.18;
        return v.normalize();
      };
      // (the cloud's orbit turns with tourTurn but not with the globe's own spin)
      return {d, bearing: bearingOf(d(1.2)) - spinAt(sim) * DEG_};
    })});
  }
  return BREAK_AIM.get(beat.key);
};
// how far into a breakup card the camera pulls back and lifts off the orbit plane (0 to 1)
const breakupPull = (beat, t) => smooth(clamp01((t - (beat.a + 3.8)) / (beat.b - 0.4 - (beat.a + 3.8))));
function planShots(spinAt, centreOf) {
  const G = (t) => (spinAt(tourSim(t)) + tourTurn(t)) * DEG_;
  const byBeat = new Map();
  // runs of launch and breakup shots one after another (anything else starts a new run)
  const runs = [];
  BEATS.forEach((b, i) => {
    if (b.kind !== 'ship' && b.kind !== 'breakup') return;
    const run = runs[runs.length - 1];
    if (run && run[run.length - 1] === i - 1) run.push(i);
    else runs.push([i]);
  });
  // a launch shot's choices: where its site starts (o) and how fast the globe turns on screen (r); slower turns let
  // several launches from one site follow each other without the site running off the right of the frame. A
  // breakup's: which side of the orbit plane it looks from (s), a little to either side of that (o), and r.
  const shipChoices = [];
  for (let o = PLAN_O.min; o <= PLAN_O.max; o += PLAN_O.step) for (const r of PLAN_R) shipChoices.push([o, r, 0]);
  const breakChoices = [];
  for (const s of [0, 1]) for (let o = -20; o <= 20; o += 2) for (const r of [0.5, 0.75, 1.0]) breakChoices.push([o, r, s]);
  const choicesOf = (i) => (BEATS[i].kind === 'breakup' ? breakChoices : shipChoices);
  const bearingOfBeat = (i, s) => (BEATS[i].kind === 'breakup' ? breakupAim(BEATS[i], centreOf, spinAt).sides[s].bearing : siteBearing(BEATS[i].key));
  const shotOf = (i, [o, r0, s]) => {
    const b = BEATS[i];
    const D = b.b - b.a;
    const star = b.key === 'starlink';
    const r = star ? STARLINK_R : r0;
    const L = bearingOfBeat(i, s) - o;
    const over = star || b.kind === 'breakup' ? 0 : Math.max(0, o + r * D - PLAN_O.end);
    return {L, r, s, end: L - r * D + (star ? STARLINK_PATH[STARLINK_PATH.length - 1][1] : 0), over};
  };
  const own = (i, sh, [o, r]) => (BEATS[i].kind === 'breakup' ? 0.05 * o * o + 200 * (r - 0.75) ** 2 : 0.02 * (o - PLAN_O.pref) ** 2 + 300 * (PLAN_O.rMax - r) ** 2 + 400 * sh.over);
  const need = PLAN_O.s + PLAN_O.rMax * GAP; // L goes down at least this much from one shot to the next
  for (const run of runs) {
    // cost[k]: the least cost of the run up to this shot with choice k
    let shots = choicesOf(run[0]).map((c) => shotOf(run[0], c));
    let cost = choicesOf(run[0]).map((c, k) => own(run[0], shots[k], c));
    const back = [];
    for (let j = 1; j < run.length; j += 1) {
      const next = [];
      const from = [];
      const choices = choicesOf(run[j]);
      const now = choices.map((c) => shotOf(run[j], c));
      choices.forEach((c, k) => {
        const sh = now[k];
        let best = Infinity;
        let arg = 0;
        for (let k0 = 0; k0 < shots.length; k0 += 1) {
          if (cost[k0] >= best) continue;
          const nd = PLAN_O.s + Math.max(shots[k0].r, sh.r) * GAP; // L goes down at least this much between shots
          const swing = mod360(shots[k0].end - sh.L - nd) + nd; // how far the globe turns between them
          const cc = cost[k0] + swing * swing;
          if (cc < best) [best, arg] = [cc, k0];
        }
        next.push(best + own(run[j], sh, c));
        from.push(arg);
      });
      cost = next;
      shots = now;
      back.push(from);
    }
    let k = cost.indexOf(Math.min(...cost));
    for (let j = run.length - 1; j >= 0; j -= 1) {
      const sh = shotOf(run[j], choicesOf(run[j])[k]);
      byBeat.set(run[j], {L: sh.L, r: sh.r, s: sh.s});
      if (j > 0) k = back[j - 1][k];
    }
  }
  const Lof = (i, t) => {
    const p = byBeat.get(i);
    const b = BEATS[i];
    return p.L - p.r * (t - b.a) + (b.key === 'starlink' ? starlinkPathAt(b, t)[0] : 0);
  };
  // the cold open's slow turn (and in the 5-minute cut the lineup after it) hands over to Sputnik with L still above
  // Sputnik's all through the move between them
  let introAz = 20;
  const sp = BEATS.findIndex((b) => b.key === 'sputnik1');
  if (INTRO && byBeat.has(sp)) {
    let worst = -Infinity;
    for (let t = INTRO.rewind[0] - GAP; t <= INTRO.launch + 0.6; t += 0.05) worst = Math.max(worst, t + G(t) + Lof(sp, t));
    introAz = need + worst;
  }
  // "Where we are now" and the cards after it carry on from the last launch shot, a little further west
  let todayAz = 395;
  const td = BEATS.findIndex((b) => b.kind === 'today');
  if (td > 0 && byBeat.has(td - 1)) {
    let best = Infinity;
    for (let t = BEATS[td - 1].b; t <= BEATS[td].a; t += 0.05) best = Math.min(best, Lof(td - 1, t) + (t - BEATS[td].a) + G(t));
    todayAz = best - need;
  }
  return {byBeat, introAz, todayAz, Lof, G};
}
// what the plan chose, for checking it: each beat's kind and key, and for launch shots where L starts, how fast it
// slips, the site's starting place (o) and the swing from the beat before
export const shotPlanInfo = () => BEATS.map((b, i) => {
  const p = SHOTS && SHOTS.byBeat.get(i);
  const prev = SHOTS && SHOTS.byBeat.get(i - 1);
  const prevEnd = prev ? SHOTS.Lof(i - 1, BEATS[i - 1].b) : null;
  const sb = b.kind === 'breakup' ? (p ? BREAK_AIM.get(b.key).sides[p.s].bearing : 0) : p ? siteBearing(b.key) : 0;
  return [i, b.kind, b.key, +b.a.toFixed(1), p ? +p.L.toFixed(1) : null, p ? +p.r.toFixed(2) : null,
    p ? +(sb - p.L).toFixed(1) : null, p && prevEnd !== null ? +(prevEnd - p.L).toFixed(1) : null];
});
const ensurePlan = (spinAt, centreOf) => {
  if (!SHOTS) SHOTS = planShots(spinAt, centreOf);
  return SHOTS;
};

// the camera's elevation for a launch site: a little above it
const siteEl = (key) => {
  const v = siteLocal(SHIP[key].site);
  return Math.max(-15, Math.min(42, (Math.asin(v.y) * 180) / Math.PI * 0.75 + 6));
};
// The Starlink card's camera path: [time (the card's start, its end, or seconds from the point its line gets to the
// train, STARLINK_TRAIN above), bearing and elevation from the launch site's aim (degrees), distance]. It pushes in on
// Cape Canaveral as the rocket goes up, lifts a little as the train comes through the middle of the frame, and pulls
// back for the last words.
// when the train's middle crosses the middle of the frame (main.js sets the train's made-up place along its orbit to
// fit), seconds after that point: in the middle of "Watch them string out along their orbit"
const STARLINK_CROSS = 1.5;
export const starlinkCross = () => {
  const beat = BEATS.find((b) => b.key === 'starlink');
  return beat ? beat.a + STARLINK_TRAIN * (beat.b - beat.a) + STARLINK_CROSS : null;
};
// how much the first Starlink train stands out (0 to 1): from its launch to the end of its card
export const trainGlowAt = (t) => {
  const beat = BEATS.find((b) => b.key === 'starlink');
  return beat ? smooth(clamp01((t - (beat.a + 1.1)) / 1.5)) * smooth(clamp01((beat.b + GAP / 2 - t) / 1.2)) : 0;
};
const STARLINK_PATH = [['a', 0, 8, 3.9], [-1.5, 0, 9, 3.1], [1.5, 0, 14, 3.35], [4.5, 0, 12, 4.1], ['b', 0, 8, 4.6]];
const starlinkPathAt = (beat, t) => {
  const sw = beat.a + STARLINK_TRAIN * (beat.b - beat.a);
  const keys = (k) => STARLINK_PATH.map((row) => [row[0] === 'a' ? beat.a : row[0] === 'b' ? beat.b : sw + row[0], row[k]]);
  return [eased(keys(1))(t), eased(keys(2))(t), eased(keys(3))(t)];
};

// One camera per beat, crossfaded through the gaps. centreOf(key, day, sim, out) gives a cloud's centre;
// spinAt(sim) gives the globe's turn angle.
const beatCamera = (beat, t, centreOf, spinAt) => {
  // the 5-minute cut's prelude stays on the cold open's slow turn (the globe is dimmed behind the lineup)
  ensurePlan(spinAt, centreOf);
  if (beat.kind === 'open' || (beat.kind === 'lineup' && PRELUDE)) return introCam(t);
  if (beat.kind === 'ship') {
    const P = ensurePlan(spinAt, centreOf);
    const i = BEATS.indexOf(beat);
    const az = P.G(t) + P.Lof(i, t);
    const el = siteEl(beat.key);
    if (beat.key === 'starlink') {
      // first the launch site, pushing in on Cape Canaveral as the rocket goes up, as the other launches do; then, as
      // the words get to the train ("Watch them string out along their orbit"), the train comes through the middle of
      // the frame (main.js puts it there) with the Cape still in view, and the camera pulls back for the last words
      // (Brad: the site was off screen when the camera went straight to the train, riding along with the train turned
      // the globe backwards, and then the train showed up late at the edge of the frame)
      const [, de, dist] = starlinkPathAt(beat, t);
      return {dir: sphericalDir(az, el + de), dist, target: new THREE.Vector3()};
    }
    const shot = shipShot(beat, t, az, el);
    if (INTRO && beat.key === 'sputnik1') {
      const [t0, t1] = [INTRO.rewind[0], INTRO.launch + 0.6];
      const tm = (t0 + t1) / 2;
      const swing = forwardSwing(introCam(tm), shipShot(beat, tm, P.G(tm) + P.Lof(i, tm), el), globeTurn(t0, t1, spinAt));
      return blendCam(introCam(t), shot, smooth(clamp01((t - t0) / (t1 - t0))), swing);
    }
    return shot;
  }
  if (beat.kind === 'breakup') {
    // (see breakupAim: the view of the cloud's orbit as the pieces fly apart, the globe still turning forward)
    const P = ensurePlan(spinAt, centreOf);
    const i = BEATS.indexOf(beat);
    const aim = breakupAim(beat, centreOf, spinAt);
    const k = breakupPull(beat, t);
    const el = elevationOf(aim.sides[P.byBeat.get(i).s].d(0.75 + 0.85 * k));
    const target = aim.p.clone().multiplyScalar(0.42 - 0.3 * k).applyAxisAngle(Y_AXIS, tourTurn(t));
    // the camera's place follows the plan; it looks from there toward the cloud's side of Earth
    const off = sphericalDir(P.G(t) + P.Lof(i, t), el).multiplyScalar(2.45 + (4.6 - 2.45) * k).sub(target);
    const len = off.length();
    return {dir: off.divideScalar(len), dist: len, target};
  }
  // today opens close in, in the thick of it, and pulls out to show everything around Earth; from there the closing
  // cards and the finale follow CLOSE above, turning slowly all the way to the end
  const u = t - TODAY.a;
  const out = smooth(clamp01((u - 1.6) / (TODAY.b - TODAY.a + GAP - 1.6)));
  // (the camera drifts against the globe's turn, never with it, so the globe is seen to turn)
  const az0 = ensurePlan(spinAt, centreOf).todayAz;
  if (!CLOSE || t <= CLOSE.t0) return {dir: sphericalDir(az0 - u * 1.0, 10 + 11 * out), dist: 2.35 * (WIDE / 2.35) ** out, target: new THREE.Vector3()};
  return {dir: sphericalDir(az0 - u * 1.0 - CLOSE.az(t), CLOSE.el(t)), dist: Math.exp(CLOSE.dist(t)), target: new THREE.Vector3()};
};

// The swing for the crossfade from beat i to beat i + 1 (through the gap between them), chosen at its middle.
const SWINGS = new Map();
const crossSwing = (i, centreOf, spinAt) => {
  if (!SWINGS.has(i)) {
    const [A, B] = [BEATS[i], BEATS[i + 1]];
    const tm = (A.b + B.a) / 2;
    SWINGS.set(i, forwardSwing(beatCamera(A, tm, centreOf, spinAt), beatCamera(B, tm, centreOf, spinAt), globeTurn(A.b, B.a, spinAt)));
  }
  return SWINGS.get(i);
};
// How long the move from beat i to the next takes, as half its length, centred on the gap between them: the gap, or
// longer for a long swing round the globe, so the globe never turns faster than SWING_RATE degrees a second on
// average (Brad: smoothly, the one way). The 5-minute cut's swings all fit their gaps.
const SWING_RATE = 90;
const HALVES = new Map();
const halfOf = (i, centreOf, spinAt) => {
  if (i < 0 || i >= BEATS.length - 1) return GAP / 2;
  if (!HALVES.has(i)) HALVES.set(i, Math.max((BEATS[i + 1].a - BEATS[i].b) / 2, Math.abs(crossSwing(i, centreOf, spinAt)) / SWING_RATE / 2));
  return HALVES.get(i);
};
export function tourCamera(t, centreOf, spinAt) {
  const cams = [];
  const n = BEATS.length;
  BEATS.forEach((beat, i) => {
    // this beat's camera comes in through the move from the beat before and goes out through the move to the next
    const [mIn, hIn] = i > 0 ? [(BEATS[i - 1].b + beat.a) / 2, halfOf(i - 1, centreOf, spinAt)] : [beat.a - GAP / 2, GAP / 2];
    const [mOut, hOut] = i < n - 1 ? [(beat.b + BEATS[i + 1].a) / 2, halfOf(i, centreOf, spinAt)] : [beat.b + GAP / 2, GAP / 2];
    if (t < mIn - hIn || t > mOut + hOut) return;
    const win = Math.min(1, (t - (mIn - hIn)) / (2 * hIn), (mOut + hOut - t) / (2 * hOut));
    const first = beat === BEATS[0] && t < beat.a;
    const w = first ? 1 : smooth(clamp01(win));
    if (w <= 0) return;
    cams.push([beatCamera(beat, t, centreOf, spinAt), w, i]);
  });
  if (!cams.length) return beatCamera(BEATS[0], 0, centreOf, spinAt);
  let [cur, acc] = cams[0];
  for (let k = 1; k < cams.length; k += 1) {
    const [c, w, i] = cams[k];
    // (consecutive beats: the one before is beat i - 1)
    const swing = cams[k - 1][2] === i - 1 ? crossSwing(i - 1, centreOf, spinAt) : undefined;
    cur = blendCam(cur, c, w / (acc + w), swing);
    acc += w;
  }
  return cur;
}

// ------------------------------------------------------------ what's on screen
// The spec plate showing at t: which ship, how visible, and how long it has been up.
const plateIn = (beat) => (beat.key === 'sputnik1' && INTRO ? INTRO.plate : beat.a + (beat.key === 'sputnik1' ? 2.4 : beat.kind === 'breakup' ? 0.8 : 0.35));
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
  const a = beat.key === 'sputnik1' && INTRO ? INTRO.room : beat.a + (beat.key === 'sputnik1' ? 2.0 : beat.kind === 'breakup' ? 0.4 : -GAP / 2);
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
  // (in the 5-minute cut the lineup comes first, and is done with once the globe is back)
  if (PRELUDE && u > BELTPLAN.gone + 2.5) return null;
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
