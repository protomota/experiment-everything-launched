// Every launch since 1957 from GCAT's launch log: when, where, on what, carrying what, and whether it reached orbit.
// On the globe each launch is a brief orange pulse at its launch site (red when it failed).
import * as THREE from 'three';
import raw from './launches.json';

export function decodeLaunches() {
  const n = raw.dt.length;
  const day = new Float64Array(n);
  let m = 0;
  for (let k = 0; k < n; k += 1) {
    m += raw.dt[k];
    day[k] = m / 1440;
  }
  const ok = Uint8Array.from(raw.ok, (c) => (c === '1' ? 1 : 0));
  // cumulative successes, for the counter
  const okBefore = new Uint32Array(n + 1);
  for (let k = 0; k < n; k += 1) okBefore[k + 1] = okBefore[k] + ok[k];
  // who launched it (index into WHO in orbits.js), and cumulative successes for each
  const who = Uint8Array.from(raw.w || '', (c) => Number(c));
  const okBeforeWho = Array.from({length: 9}, () => new Uint32Array(n + 1));
  for (let k = 0; k < n; k += 1) {
    for (let g = 0; g < 9; g += 1) okBeforeWho[g][k + 1] = okBeforeWho[g][k] + (who[k] === g ? ok[k] : 0);
  }
  return {n, day, ok, okBefore, who, okBeforeWho, site: raw.s, lv: raw.v, count: raw.n, name: raw.p, sites: raw.sites, lvs: raw.lv, source: raw.source};
}

// index of the last launch at or before day (or -1)
export function lastLaunch(L, day) {
  let lo = 0;
  let hi = L.n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (L.day[mid] <= day) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

// launches that reached orbit or beyond, up to day
export const launchesBy = (L, day) => L.okBefore[lastLaunch(L, day) + 1];
export const launchesByWho = (L, day) => {
  const k = lastLaunch(L, day) + 1;
  return L.okBeforeWho.map((a) => a[k]);
};

// launches per calendar year, from 1957
export function perYear(L, dateOf) {
  const out = new Map();
  for (let k = 0; k < L.n; k += 1) {
    if (!L.ok[k]) continue;
    const y = dateOf(L.day[k]).getUTCFullYear();
    out.set(y, (out.get(y) || 0) + 1);
  }
  return out;
}

export const siteDir = (lat, lon) => {
  const p = (lat * Math.PI) / 180;
  const l = (lon * Math.PI) / 180;
  return new THREE.Vector3(Math.cos(p) * Math.cos(l), Math.sin(p), -Math.cos(p) * Math.sin(l));
};

// Pulses at the launch sites, as points on the turning globe. update(day, flashDays): a launch glows for a few
// flashDays after it happens, so at any playback speed it shows for about the same real time.
export function createLaunchPulses(L, whoColors) {
  const pos = new Float32Array(L.n * 3);
  const aDay = new Float32Array(L.n);
  const aOk = new Float32Array(L.n);
  const aWho = new Float32Array(L.n);
  for (let k = 0; k < L.n; k += 1) {
    const [, lat, lon] = L.sites[L.site[k]];
    const v = siteDir(lat, lon).multiplyScalar(1.006);
    pos.set([v.x, v.y, v.z], k * 3);
    aDay[k] = L.day[k];
    aOk[k] = L.ok[k];
    aWho[k] = L.who.length ? L.who[k] : 8;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aDay', new THREE.BufferAttribute(aDay, 1));
  geo.setAttribute('aOk', new THREE.BufferAttribute(aOk, 1));
  geo.setAttribute('aWho', new THREE.BufferAttribute(aWho, 1));
  const uniforms = {uDay: {value: 0}, uFlash: {value: 1}, uPx: {value: 1}, uMode: {value: 0},
    uWColor: {value: whoColors.map((c) => new THREE.Vector3(...c))}, uWOn: {value: whoColors.map(() => 1)}};
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending,
    vertexShader: /* glsl */ `
      attribute float aDay;
      attribute float aOk;
      attribute float aWho;
      uniform float uDay;
      uniform float uFlash;
      uniform float uPx;
      uniform float uMode;
      uniform vec3 uWColor[${whoColors.length}];
      uniform float uWOn[${whoColors.length}];
      varying float vLife;
      varying float vOk;
      varying float vFace;
      varying vec3 vC;
      void main() {
        int w = int(aWho + 0.5);
        // kind view: orange, or red for a failure; country view: the launcher's color, failures fainter
        vC = mix(aOk > 0.5 ? vec3(1.0, 0.5, 0.15) : vec3(1.0, 0.22, 0.3), uWColor[w] * 1.25, clamp(uMode, 0.0, 1.0));
        float age = uDay - aDay;
        if (uMode > 0.5 && uWOn[w] < 0.5) age = -1.0;
        vLife = age >= 0.0 ? 1.0 - age / (3.0 * uFlash) : -1.0;
        vOk = aOk;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        // hide pulses on the far side of the globe (the globe doesn't occlude them, so they aren't cut in half)
        vec3 c = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float facing = dot(normalize(mv.xyz - c), normalize(-mv.xyz));
        vFace = smoothstep(-0.02, 0.12, facing);
        gl_PointSize = vLife > 0.0 && vFace > 0.0 ? uPx * 120.0 * (0.35 + 0.65 * (1.0 - vLife)) / -mv.z : 0.0;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uMode;
      varying float vLife;
      varying float vOk;
      varying float vFace;
      varying vec3 vC;
      void main() {
        if (vLife <= 0.0 || vFace <= 0.0) discard;
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.0) discard;
        // a bright core that fades, and a ring that spreads out
        float ring = smoothstep(0.16, 0.0, abs(r - (0.25 + 0.65 * (1.0 - vLife)))) * vLife;
        float core = smoothstep(0.3, 0.0, r) * vLife * vLife;
        // normal blending, so a busy pad stays orange instead of adding up to white
        float a = clamp(ring * 0.9 + core * 1.2, 0.0, 1.0) * vFace * (uMode > 0.5 && vOk < 0.5 ? 0.45 : 1.0);
        gl_FragColor = vec4(mix(vC, vec3(1.0, 0.92, 0.8), core * 0.6), a);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 2;
  return {
    points,
    uniforms,
    update(day, flashDays, px) {
      uniforms.uDay.value = day;
      uniforms.uFlash.value = Math.max(0.02, flashDays);
      uniforms.uPx.value = px;
    },
  };
}
