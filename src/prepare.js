// Two touches the catalog can't give us, applied once after decoding:
//  1. Breakups start where the broken object was. Every piece of a cloud is put on an orbit that passes through the
//     parent's position at the moment the tour reaches the breakup, with its own catalogued size, shape and tilt.
//     Both satellites in the Iridium–Kosmos collision meet at that point.
//  2. Satellites from one launch leave in a line (a "train") and spread around their orbit over the following weeks.
import {SPREAD_DAYS, indexDays} from './orbits.js';

const TAU = Math.PI * 2;
const FRAG = new Set([3, 4]);
const PAYLOAD = new Set([0, 1]);

// ECI position of object i at simSeconds on a given day (parents have no node or perigee drift, but a launch train
// adds a fixed shift along the orbit once it has spread).
const spreadOf = (data, i, day) => data.o2[i * 4 + 3] * Math.min(Math.max(0, day - data.o1[i * 4 + 3]), SPREAD_DAYS);
const eci = (data, i, sim, day) => {
  const {o0, o1} = data;
  const a = o0[i * 4];
  const e = o0[i * 4 + 1];
  const inc = o0[i * 4 + 2];
  const node = o0[i * 4 + 3];
  const argp = o1[i * 4];
  const M = (((o1[i * 4 + 1] + o1[i * 4 + 2] * sim + spreadOf(data, i, day)) % TAU) + TAU) % TAU;
  let E = M;
  for (let k = 0; k < 10; k += 1) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cO = Math.cos(node);
  const sO = Math.sin(node);
  const cw = Math.cos(argp);
  const sw = Math.sin(argp);
  const ci = Math.cos(inc);
  const si = Math.sin(inc);
  return [
    (cO * cw - sO * sw * ci) * xp + (-cO * sw - sO * cw * ci) * yp,
    (sO * cw + cO * sw * ci) * xp + (-sO * sw + cO * cw * ci) * yp,
    sw * si * xp + cw * si * yp,
  ];
};

// The rest of a cloud, found from one of its pieces: debris or parts on the same plane, released the same day.
export function cloudMembers(data, frag) {
  const {n, o0, o1, o3} = data;
  const node = o0[frag * 4 + 3];
  const t0 = o1[frag * 4 + 3];
  const out = [];
  for (let j = 0; j < n; j += 1) {
    if (FRAG.has(o3[j]) && o0[j * 4 + 3] === node && Math.abs(o1[j * 4 + 3] - t0) < 1) out.push(j);
  }
  return out;
}

const hash01 = (j) => {
  let x = (j + 1) * 2654435761;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 2246822519) >>> 0;
  return ((x ^ (x >>> 13)) >>> 0) / 4294967296;
};

// Put object j on an orbit through the ECI point (r, sinLat, ra) at simB, keeping its size, shape and (nearly) its tilt.
const placeThrough = (data, j, point, simB, isParent = false) => {
  const {o0, o1, o2} = data;
  const {r, sinLat, ra, ascending} = point;
  // stretch the orbit just enough to reach the breakup height (debris orbits in the catalog are often today's,
  // lowered by drag since the breakup)
  const rp = Math.min(o0[j * 4] * (1 - o0[j * 4 + 1]), r);
  const rap = Math.max(o0[j * 4] * (1 + o0[j * 4 + 1]), r);
  const a = (rp + rap) / 2;
  const e = (rap - rp) / (rap + rp);
  o0[j * 4] = a;
  o0[j * 4 + 1] = e;
  let inc = o0[j * 4 + 2];
  const lat = Math.asin(Math.min(0.9999, Math.abs(sinLat)));
  // an orbit can't reach a latitude above its inclination: tilt it just enough
  if (inc <= Math.PI / 2) inc = Math.max(inc, lat + 1e-3);
  else inc = Math.min(inc, Math.PI - lat - 1e-3);
  const si = Math.sin(inc);
  const ci = Math.cos(inc);
  let u = Math.asin(Math.max(-1, Math.min(1, sinLat / si)));
  if (!ascending) u = Math.PI - u;
  const node = ra - Math.atan2(Math.sin(u) * ci, Math.cos(u));
  let nu = 0;
  if (e > 1e-5) {
    const c = Math.max(-1, Math.min(1, ((a * (1 - e * e)) / r - 1) / e));
    nu = Math.acos(c) * (hash01(j) < 0.5 ? 1 : -1);
  }
  const E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2));
  const M = E - e * Math.sin(E);
  o0[j * 4 + 2] = inc;
  o0[j * 4 + 3] = node;
  o1[j * 4] = u - nu;
  o1[j * 4 + 1] = M - o1[j * 4 + 2] * simB;
  if (isParent) o2[j * 4 + 3] = 0;
};

// For the camera: where a cloud's centre is. It rides the first parent's orbit at the cloud's average speed.
const centreTrack = (data, parent, frag, simB, day) => {
  const {o0, o1} = data;
  const nP = o1[parent * 4 + 2];
  const mB = o1[parent * 4 + 1] + nP * simB + spreadOf(data, parent, day);
  return {
    a: o0[parent * 4],
    e: o0[parent * 4 + 1],
    inc: o0[parent * 4 + 2],
    node: o0[parent * 4 + 3],
    argp: o1[parent * 4],
    mB,
    n: o1[frag * 4 + 2],
    simB,
  };
};

export function alignBreakups(data, events, simAtDay) {
  const {o1, o2} = data;
  const tracks = {};
  for (const ev of events) {
    if (ev.kind !== 'breakup' || !ev.parts) continue;
    const simB = simAtDay(ev.t);
    const main = ev.parts[0].parent;
    const p = eci(data, main, simB, ev.t);
    const q = eci(data, main, simB + 1, ev.t);
    const r = Math.hypot(p[0], p[1], p[2]);
    const point = {r, sinLat: p[2] / r, ra: Math.atan2(p[1], p[0]), ascending: q[2] > p[2]};
    const clouds = ev.parts.map((part) => cloudMembers(data, part.frag));
    const parts = [];
    ev.parts.forEach((part, k) => {
      if (k > 0) placeThrough(data, part.parent, point, simB, true);
      o2[part.parent * 4] = ev.t;
      for (const j of clouds[k]) {
        placeThrough(data, j, point, simB);
        o1[j * 4 + 3] = ev.t;
      }
      parts.push({...centreTrack(data, part.parent, part.frag, simB, ev.t), members: clouds[k].length});
    });
    tracks[ev.key] = parts;
  }
  return tracks;
}

// Launch trains: payloads that share a launch time and plane leave in a line, then spread around the orbit.
export function launchTrains(data) {
  const {n, o0, o1, o2, o3} = data;
  let i = 0;
  let trains = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && o1[j * 4 + 3] === o1[i * 4 + 3]) j += 1;
    if (j - i >= 3) {
      const byPlane = new Map();
      for (let k = i; k < j; k += 1) {
        if (!PAYLOAD.has(o3[k])) continue;
        const key = o0[k * 4 + 3];
        if (!byPlane.has(key)) byPlane.set(key, []);
        byPlane.get(key).push(k);
      }
      for (const list of byPlane.values()) {
        const count = list.length;
        if (count < 3) continue;
        trains += 1;
        const m0 = o1[list[0] * 4 + 1];
        const gap = Math.min(0.006, 0.3 / count);
        list.forEach((k, m) => {
          // the leader pulls ahead and the last falls behind, so the line only ever lengthens (it used to run the
          // other way, and the line shrank to a point a day and a half out before it spread)
          const start = m0 - m * gap;
          const end = m0 - (m / count - 0.5) * TAU;
          o1[k * 4 + 1] = start;
          o2[k * 4 + 3] = (end - start) / SPREAD_DAYS;
        });
      }
    }
    i = j;
  }
  return trains;
}

export function prepare(data, events, simAtDay) {
  const trains = launchTrains(data);
  const tracks = alignBreakups(data, events, simAtDay);
  indexDays(data);
  return {tracks, trains};
}
