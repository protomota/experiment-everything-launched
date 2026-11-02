// Orbit data: decoding the baked catalog, and the same orbit math the shader runs, for aiming the camera.
// Units: kilometres in the data, Earth radii in the scene. Dates are days since 1957 Jan 1 UTC.
export const RE = 6371;
export const MU = 398600.4418;
export const EARTH_SPIN = 7.2921159e-5; // rad per second
export const DAY0 = Date.UTC(1957, 0, 1);
export const NO_END = 1e9;
const TAU = Math.PI * 2;

export const CATS = [
  {key: 'sat', name: 'Satellites', color: [0.61, 0.78, 1.0], size: 4.2},
  {key: 'starlink', name: 'Starlink', color: [0.96, 0.5, 0.15], size: 3.3},
  {key: 'stage', name: 'Rocket stages', color: [1.0, 0.82, 0.4], size: 4.6},
  {key: 'debris', name: 'Debris', color: [1.0, 0.33, 0.44], size: 2.9},
  {key: 'parts', name: 'Discarded parts', color: [0.86, 0.4, 0.62], size: 2.9},
];

// The country view: who each object belongs to (from GCAT's owner and state codes, see bake/who.py). Colors are the
// dataviz reference palette's eight dark-surface categorical steps in their validated order, and a grey for the rest.
const hex = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16) / 255);
export const WHO = [
  {name: 'NASA', short: 'NASA', color: hex('#3987e5')},
  {name: 'SpaceX', short: 'SpaceX', color: hex('#d95926')},
  {name: 'Other US', short: 'Other US', color: hex('#199e70')},
  {name: 'Russia & USSR', short: 'Russia', color: hex('#c98500')},
  {name: 'China', short: 'China', color: hex('#d55181')},
  {name: 'India', short: 'India', color: hex('#008300')},
  {name: 'Japan', short: 'Japan', color: hex('#9085e9')},
  {name: 'Europe', short: 'Europe', color: hex('#e66767')},
  {name: 'Everyone else', short: 'Others', color: hex('#8c8b86')},
];

export const dayOf = (iso) => (Date.parse(iso.length <= 10 ? `${iso}T00:00:00Z` : `${iso}Z`) - DAY0) / 864e5;
export const dateOf = (day) => new Date(DAY0 + day * 864e5);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const formatDay = (day) => {
  const d = dateOf(day);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
};

// The baked file is structure-of-arrays: one typed array per field, offsets in catalog.json.
export function decode(bytes, meta) {
  const n = meta.count;
  const view = (key) => {
    const [offset, fmt] = meta.layout[key];
    const Type = fmt === '<i2' ? Int16Array : fmt === '<u1' ? Uint8Array : Uint16Array;
    return new Type(bytes.buffer, bytes.byteOffset + offset, n);
  };
  const f = Object.fromEntries(Object.keys(meta.layout).map((k) => [k, view(k)]));
  const o0 = new Float32Array(n * 4); // a (Earth radii), e, inclination, node
  const o1 = new Float32Array(n * 4); // argument of perigee, mean anomaly at start, visual mean motion (rad/s), start day
  const o2 = new Float32Array(n * 4); // end day, node drift, perigee drift (rad/day), along-track drift (rad/day)
  const o3 = new Float32Array(n); // category
  const o4 = new Float32Array(n); // who: index into WHO
  for (let i = 0; i < n; i += 1) {
    const per = f.per[i] * 4;
    const apo = f.apo[i] * 4;
    const a = RE + (per + apo) / 2;
    const aVis = RE + f.avis[i] * 4;
    o0[i * 4] = a / RE;
    o0[i * 4 + 1] = (apo - per) / (2 * a);
    o0[i * 4 + 2] = (f.inc[i] / 100) * (Math.PI / 180);
    o0[i * 4 + 3] = (f.raan[i] / 65535) * TAU;
    o1[i * 4] = (f.argp[i] / 65535) * TAU;
    o1[i * 4 + 1] = (f.m0[i] / 65535) * TAU;
    o1[i * 4 + 2] = Math.sqrt(MU / (aVis * aVis * aVis));
    o1[i * 4 + 3] = f.t0[i] + f.t0f[i] / 255;
    o2[i * 4] = f.t1[i] === 65535 ? NO_END : f.t1[i];
    o2[i * 4 + 1] = f.dr[i] / 1e5;
    o2[i * 4 + 2] = f.dw[i] / 1e5;
    o2[i * 4 + 3] = f.dm[i] / 1000;
    o3[i] = f.cat[i];
    o4[i] = f.who ? f.who[i] : WHO.length - 1;
  }
  return {n, o0, o1, o2, o3, o4};
}

// Sorted start and end days per category, for counting what is up on any date. Run again after changing dates.
export function indexDays(data) {
  const {n, o1, o2, o3, o4} = data;
  const starts = CATS.map(() => []);
  const ends = CATS.map(() => []);
  const wStarts = WHO.map(() => []);
  const wEnds = WHO.map(() => []);
  for (let i = 0; i < n; i += 1) {
    starts[o3[i]].push(o1[i * 4 + 3]);
    ends[o3[i]].push(o2[i * 4]);
    wStarts[o4[i]].push(o1[i * 4 + 3]);
    wEnds[o4[i]].push(o2[i * 4]);
  }
  const sorted = (lists) => lists.map((l) => Float64Array.from(l).sort());
  data.starts = sorted(starts);
  data.ends = sorted(ends);
  data.wStarts = sorted(wStarts);
  data.wEnds = sorted(wEnds);
  return data;
}

const upper = (arr, x) => {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};
export const countsOn = (data, day) => data.starts.map((s, c) => upper(s, day) - upper(data.ends[c], day));
export const countsOnWho = (data, day) => data.wStarts.map((s, c) => upper(s, day) - upper(data.wEnds[c], day));
export const launchedBy = (data, day) => data.starts.reduce((sum, s) => sum + upper(s, day), 0);

// The spread along the orbit after a breakup is capped, so a fast timeline doesn't scramble the cloud every frame.
export const SPREAD_DAYS = 30;

// A point on an orbit, in scene axes (y up). ECI x, y, z map to scene x, z, -y.
export function positionAt(a, e, inc, node, argp, M, out) {
  M %= TAU;
  let E = M;
  for (let k = 0; k < 8; k += 1) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cO = Math.cos(node);
  const sO = Math.sin(node);
  const cw = Math.cos(argp);
  const sw = Math.sin(argp);
  const ci = Math.cos(inc);
  const si = Math.sin(inc);
  const x = (cO * cw - sO * sw * ci) * xp + (-cO * sw - sO * cw * ci) * yp;
  const y = (sO * cw + cO * sw * ci) * xp + (-sO * sw + cO * cw * ci) * yp;
  const z = sw * si * xp + cw * si * yp;
  out.set(x, z, -y);
  return out;
}

// Position of object i. simSeconds drives the motion along the orbit; day drives drift and spread.
export function positionOf(data, i, day, simSeconds, out, {spread = true} = {}) {
  const {o0, o1, o2} = data;
  const age = Math.max(0, day - o1[i * 4 + 3]);
  const node = o0[i * 4 + 3] + o2[i * 4 + 1] * age;
  const argp = o1[i * 4] + o2[i * 4 + 2] * age;
  const M = o1[i * 4 + 1] + o1[i * 4 + 2] * simSeconds + (spread ? o2[i * 4 + 3] * Math.min(age, SPREAD_DAYS) : 0);
  return positionAt(o0[i * 4], o0[i * 4 + 1], o0[i * 4 + 2], node, argp, M, out);
}

export const ORBIT_GLSL = /* glsl */ `
attribute vec4 aO0;
attribute vec4 aO1;
attribute vec4 aO2;
attribute float aCat;
attribute float aWho;
uniform float uMode;
uniform float uWOn[${WHO.length}];
uniform vec3 uWColor[${WHO.length}];
uniform float uDayI;
uniform float uDayF;
uniform float uSim;
// (the tour's slower clock for the breakaway pieces' orbits turning apart: the days it runs between, and how far
// between; uDriftS < 0: the date's own)
uniform float uDriftA;
uniform float uDriftB;
uniform float uDriftS;
uniform float uFlashDays;
uniform float uPx;
uniform float uBoost;
uniform float uHi;
uniform float uHiT0;
uniform float uOn[5];
uniform float uKeep[5];
uniform float uSize[5];
uniform vec3 uColor[5];
varying vec3 vColor;
varying float vAlpha;
const float TAU = 6.28318530718;
// an angle as the shorter turn, between -half a turn and half a turn
float shorter(float x) { return mod(x + 0.5 * TAU, TAU) - 0.5 * TAU; }
void main() {
  int c = int(aCat + 0.5);
  int w = int(aWho + 0.5);
  // the kind view filters and colors by kind, the country view by who it belongs to
  bool shown = uMode < 0.5 ? uOn[c] > 0.5 : uWOn[w] > 0.5;
  // colors cross-fade between the two views as uMode goes from 0 to 1; uKeep fades whole kinds out
  vec3 base = mix(uColor[c], uWColor[w], clamp(uMode, 0.0, 1.0));
  float t0 = aO1.w;
  float t1 = aO2.x;
  // the date comes in as whole days plus a fraction, so slow motion stays smooth in 32-bit floats
  float age = (uDayI - t0) + uDayF;
  float left = (t1 - uDayI) - uDayF;
  if (age < 0.0 || left <= 0.0 || !shown || uKeep[c] < 0.004) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vAlpha = 0.0;
    return;
  }
  float a = aO0.x;
  float e = aO0.y;
  float inc = aO0.z;
  float node;
  float argp;
  if (uDriftS < 0.0) {
    node = aO0.w + aO2.y * age;
    argp = aO1.x + aO2.z * age;
  } else {
    float ageA = max(uDriftA - t0, 0.0);
    float ageB = max(uDriftB - t0, 0.0);
    node = aO0.w + aO2.y * ageA + shorter(aO2.y * (ageB - ageA)) * uDriftS;
    argp = aO1.x + aO2.z * ageA + shorter(aO2.z * (ageB - ageA)) * uDriftS;
  }
  float M = mod(aO1.y + aO1.z * uSim + aO2.w * min(age, ${SPREAD_DAYS.toFixed(1)}), TAU);
  float E = M;
  for (int k = 0; k < 8; k++) E -= (E - e * sin(E) - M) / (1.0 - e * cos(E));
  float xp = a * (cos(E) - e);
  float yp = a * sqrt(1.0 - e * e) * sin(E);
  float cO = cos(node), sO = sin(node), cw = cos(argp), sw = sin(argp), ci = cos(inc), si = sin(inc);
  vec3 p = vec3(
    (cO * cw - sO * sw * ci) * xp + (-cO * sw - sO * cw * ci) * yp,
    sw * si * xp + cw * si * yp,
    -((sO * cw + cO * sw * ci) * xp + (-sO * sw + cO * cw * ci) * yp)
  );
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float flash = exp(-age / uFlashDays);
  float fade = clamp(left / uFlashDays, 0.0, 1.0);
  float near = clamp(7.0 / -mv.z, 1.0, 2.0);
  // distant orbits (geostationary is 6.6 Earth radii out) get slightly larger dots so they stay visible
  float high = 1.0 + 0.09 * clamp(a - 1.5, 0.0, 6.0);
  // the satellites of the launch the tour is following (uHiT0 is its launch time) stand out, larger and brighter
  float hi = c == 1 && abs(t0 - uHiT0) < 0.0005 ? uHi : 0.0;
  gl_PointSize = max(1.5, uSize[c] * uPx * near * high * uBoost * (1.0 + 1.4 * flash) * (1.0 + 0.9 * hi));
  vColor = mix(mix(base, vec3(1.0), flash * 0.7) * (1.0 + 1.6 * flash), vec3(1.0, 0.5, 0.16) * 1.3, 0.8 * hi);
  vAlpha = fade * uKeep[c];
}
`;
