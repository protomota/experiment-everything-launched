// Everything we've ever launched: every object catalogued in Earth orbit since 1957, on its orbit around a dark Earth.
// The page plays a guided tour on load: a spec plate for each of 81 milestone ships as the date reaches its launch, the debris
// breakups in slow motion, then the rockets to scale. Drag the globe or the timeline to explore. ?capture renders the tour frame by
// frame for video (window.SIM), ?card draws the share image.
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import meta from './catalog.json';
import {CATS, EARTH_SPIN, MU, NO_END, ORBIT_GLSL, RE, WHO, countsOn, countsOnWho, dayOf, dateOf, decode, formatDay, launchedBy, positionAt, positionOf} from './orbits.js';
import {createEarth, createStars} from './earth.js';
import {prepare} from './prepare.js';
import * as T from './tour.js';
import {LINEUP, SHIPS, SITES} from './ships/ships.js';
import {createShipStage} from './ships/viewer.js';
import {EVENT_CARDS} from './ships/events.js';
import {createLaunchPulses, decodeLaunches, lastLaunch, launchesBy, launchesByWho, perYear, siteDir} from './launches.js';
import {buildSearch, norm, parseIndex} from './find.js';
import LINKS from './ships/objects.json';

const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture') || window.__CAPTURE === true;
const CARD = params.has('card');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('en-US');

const START_DAY = dayOf('1957-10-01');
const END_DAY = meta.endDay;
const SPEEDS = [
  {key: 'day', label: '1 day per second', short: '1 day/s', days: 1, warp: 110},
  {key: 'month', label: '1 month per second', short: '1 month/s', days: 30.4, warp: 300},
  {key: 'year', label: '1 year per second', short: '1 year/s', days: 365.25, warp: 600},
];
const KEYS = {S00002: 'sputnik', S00005: 'vanguard', S00858: 'syncom', S25730: 'fengyun', S24946: 'iridium', S13552: 'kosmos1408'};
const events = meta.events.map((ev) => ({...ev, key: ev.kind === 'starlink' ? 'starlink' : KEYS[ev.focus]}));
const byKey = Object.fromEntries(events.map((ev) => [ev.key, ev]));
const SHIP = Object.fromEntries(SHIPS.map((sh, k) => [sh.key, {...sh, index: k, day: dayOf(sh.when)}]));
// the debris events' cards, with their counts from the catalog
const EVENT = Object.fromEntries(Object.values(EVENT_CARDS).map((c, k) => {
  const ev = byKey[c.key];
  const left = ev.alive[ev.alive.length - 1][1];
  const fill = (v) => v.replace('%CATALOGED%', fmt(ev.cataloged)).replace('%LEFT%', `${fmt(left)} today`);
  return [c.key, {...c, index: k, day: ev.t, alive: ev.alive, cataloged: ev.cataloged, left, specs: c.specs.map(([a, b]) => [a, fill(b)])}];
}));
// the two closing cards (space junk, who put it there) are filled in once the catalog is decoded
const STATS = {};
// cards for search results, made when one is opened: 'o:<object index>' and 'l:<launch index>'
const FOUND = {};
const CARD_OF = (key) => SHIP[key] || EVENT[key] || STATS[key] || FOUND[key];
const LINEUP_NAMES = {explorer1: 'Juno I', freedom7: 'Redstone', falcon1: 'Falcon 1', apollo11: 'Saturn V', sts1: 'Space Shuttle', falcon9: 'Falcon 9', falconheavy: 'Falcon Heavy', artemis2: 'SLS', starship: 'Starship', ariane1: 'Ariane 1', newglenn: 'New Glenn'};
const MODELS = JSON.parse(document.getElementById('models').textContent);
const modelUrl = (name) => (MODELS.inline ? `data:model/gltf-binary;base64,${MODELS.inline[name]}` : `${MODELS.base}${name}.glb`);

// ------------------------------------------------------------ data
const loadCatalog = async () => {
  const b64 = $('catalog').textContent.trim();
  const res = await fetch(`data:application/gzip;base64,${b64}`);
  const stream = res.body.pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

// ------------------------------------------------------------ the scene
const makeRenderer = (canvas) => {
  try {
    const r = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE || CARD});
    r.setClearColor(0x000000, 1);
    return r;
  } catch (err) {
    return null;
  }
};

const makePoints = (data) => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.n * 3), 3));
  geo.setAttribute('aO0', new THREE.BufferAttribute(data.o0, 4));
  geo.setAttribute('aO1', new THREE.BufferAttribute(data.o1, 4));
  geo.setAttribute('aO2', new THREE.BufferAttribute(data.o2, 4));
  geo.setAttribute('aCat', new THREE.BufferAttribute(data.o3, 1));
  geo.setAttribute('aWho', new THREE.BufferAttribute(data.o4, 1));
  const uniforms = {
    uDayI: {value: 0},
    uDayF: {value: 0},
    uSim: {value: 0},
    uFlashDays: {value: 1},
    uPx: {value: 1},
    uBoost: {value: 1},
    uOn: {value: CATS.map(() => 1)},
    uKeep: {value: CATS.map(() => 1)},
    uSize: {value: CATS.map((c) => c.size)},
    uColor: {value: CATS.map((c) => new THREE.Vector3(...c.color))},
    uMode: {value: 0},
    uWOn: {value: WHO.map(() => 1)},
    uWColor: {value: WHO.map((w) => new THREE.Vector3(...w.color))},
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: ORBIT_GLSL,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float core = smoothstep(0.62, 0.12, d);
        float glow = (1.0 - d) * (1.0 - d) * 0.3;
        gl_FragColor = vec4(vColor, (core + glow) * vAlpha);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {points, uniforms};
};

// ------------------------------------------------------------ page text
const STRINGS = {};
const setText = (el, text) => {
  if (STRINGS[el.id] !== text) {
    el.textContent = text;
    STRINGS[el.id] = text;
  }
};

const timeOfDay = (day) => {
  const d = dateOf(day);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
};

function main(data, tracks) {
  const stage = $('stage');
  const canvas = $('view');
  const renderer = makeRenderer(canvas);
  if (!renderer) {
    $('no-webgl').hidden = false;
    document.body.classList.add('no-gl');
    return;
  }
  const maxTex = renderer.capabilities.maxTextureSize;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.01, 2000);
  const earth = createEarth(Math.min(maxTex, CAPTURE || CARD ? 8192 : 4096));
  const stars = createStars();
  const {points, uniforms} = makePoints(data);
  // the globe and everything in orbit turn together about Earth's axis (T.tourTurn), in front of still stars
  const world = new THREE.Group();
  world.add(earth.group, points);
  scene.add(stars, world);
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  const GMST0 = 1.2;
  const spinAt = (sim) => GMST0 + EARTH_SPIN * sim;

  // the launch-site marker: an orange ring with a pulse, on the globe's surface
  const marker = new THREE.Group();
  const markMat = new THREE.MeshBasicMaterial({color: 0xf58025, transparent: true, depthWrite: false, side: THREE.DoubleSide});
  const pulseMat = markMat.clone();
  const ringGeo = new THREE.RingGeometry(0.014, 0.019, 64);
  const pulse = new THREE.Mesh(ringGeo, pulseMat);
  marker.add(new THREE.Mesh(ringGeo, markMat), new THREE.Mesh(new THREE.CircleGeometry(0.0055, 24), markMat), pulse);
  marker.visible = false;
  earth.globe.add(marker);
  // every launch: a pulse at its launch site
  const L = decodeLaunches();
  const pulses = createLaunchPulses(L, WHO.map((w) => w.color));
  earth.globe.add(pulses.points);
  // a search result: a ring on the object and its whole orbit, while its card is up
  const foundMat = new THREE.MeshBasicMaterial({color: 0xf58025, transparent: true, depthWrite: false, side: THREE.DoubleSide});
  const foundRing = new THREE.Mesh(new THREE.RingGeometry(0.78, 1, 48), foundMat);
  const ORBIT_N = 256;
  const orbitGeo = new THREE.BufferGeometry();
  orbitGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ORBIT_N * 3), 3));
  const orbitMat = new THREE.LineBasicMaterial({color: 0xf58025, transparent: true, opacity: 0.5, depthWrite: false});
  const foundMark = new THREE.Group();
  foundMark.add(foundRing, new THREE.LineLoop(orbitGeo, orbitMat));
  foundMark.visible = false;
  world.add(foundMark);
  const foundAt = new THREE.Vector3();
  const placeFound = (i, day, sim, opacity) => {
    foundMark.visible = i != null && opacity > 0.01 && day >= data.o1[i * 4 + 3] && day < data.o2[i * 4];
    if (!foundMark.visible) return;
    const period = (2 * Math.PI) / data.o1[i * 4 + 2];
    const pos = orbitGeo.attributes.position.array;
    for (let k = 0; k < ORBIT_N; k += 1) {
      positionOf(data, i, day, sim + (k / ORBIT_N) * period, foundAt);
      pos[k * 3] = foundAt.x;
      pos[k * 3 + 1] = foundAt.y;
      pos[k * 3 + 2] = foundAt.z;
    }
    orbitGeo.attributes.position.needsUpdate = true;
    orbitGeo.computeBoundingSphere();
    positionOf(data, i, day, sim, foundAt);
    foundRing.position.copy(foundAt);
    // face the camera from inside the turning world
    foundRing.quaternion.copy(world.quaternion).invert().multiply(camera.quaternion);
    foundRing.scale.setScalar(camera.position.distanceTo(foundAt.clone().applyAxisAngle(Y_AXIS, world.rotation.y)) * 0.02);
    foundMat.opacity = opacity;
    orbitMat.opacity = 0.55 * opacity;
  };
  const showMarker = (siteKey, opacity, local) => {
    marker.visible = !!siteKey && opacity > 0.01;
    if (!marker.visible) return;
    const dir = typeof siteKey === 'string' ? T.siteLocal(siteKey) : siteKey;
    marker.position.copy(dir).multiplyScalar(1.004);
    marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    markMat.opacity = opacity;
    const f = (local * 0.7) % 1;
    pulse.scale.setScalar(1 + 2.2 * f);
    pulseMat.opacity = opacity * (1 - f) * 0.8;
  };
  // the globe keeps turning on the live page too, except for visitors who ask for less motion
  const turnRate = () => (reducedMotion ? 0 : T.TURN_RATE);
  const live = {
    mode: 'tour',
    tourT: 0,
    tourPlaying: true,
    day: END_DAY,
    sim: 0,
    playing: false,
    speed: 2,
    rate: 0,
    capUntil: 0,
    capKey: null,
    plateKey: null,
    card: null,
    spin: 0,
    spinV: 0,
    tilt: 0,
    turn: 0,
    dragging: false,
    room: 0,
    fly: null,
    dirty: true,
    last: performance.now(),
    scrubbing: false,
  };

  // the centre of a breakup cloud, for the camera
  const centreOf = (key, day, sim, out) => {
    const parts = tracks[key];
    if (!parts) {
      const i = byKey[key] && byKey[key].focusIndex;
      return i == null ? null : positionOf(data, i, day, sim, out);
    }
    if (parts.index != null) return positionOf(data, parts.index, day, sim, out);
    out.set(0, 0, 0);
    const tmp = new THREE.Vector3();
    for (const c of parts) {
      positionAt(c.a, c.e, c.inc, c.node, c.argp, c.mB + c.n * (sim - c.simB), tmp);
      out.add(tmp);
    }
    return out.multiplyScalar(1 / parts.length);
  };

  // ---------------------------------------------------------- HUD
  // The legend: by kind (what each object is) or by country (who it belongs to). Each row hides or shows its dots.
  const legend = $('legend');
  const legendCounts = [];
  const whoCounts = [];
  const whoLaunches = [];
  const rgb = (c) => `rgb(${c.map((v) => Math.round(v * 255)).join(' ')})`;
  const modeLi = document.createElement('li');
  modeLi.className = 'legend-mode';
  modeLi.innerHTML = '<span class="seg" role="group" aria-label="Color the dots by"><button type="button" data-mode="0" aria-pressed="true">Kind</button><button type="button" data-mode="1" aria-pressed="false">Country</button></span><span class="legend-cols" aria-hidden="true"><span>In orbit</span><span>Launches</span></span>';
  legend.append(modeLi);
  const row = (id, name, color, onToggle) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cat';
    btn.setAttribute('aria-pressed', 'true');
    btn.style.setProperty('--dot', rgb(color));
    btn.innerHTML = `<span class="dot" aria-hidden="true"></span><span class="name">${name}</span><span class="n" id="n-${id}">0</span><span class="l" id="l-${id}"></span>`;
    btn.addEventListener('click', () => {
      const on = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', String(on));
      onToggle(on);
      live.dirty = true;
    });
    li.append(btn);
    legend.append(li);
    return li;
  };
  const kindRows = [];
  for (const c of [1, 0, 2, 3, 4]) {
    const li = row(CATS[c].key, CATS[c].name, CATS[c].color, (on) => {
      uniforms.uOn.value[c] = on ? 1 : 0;
    });
    li.classList.add('by-kind');
    kindRows.push(li);
    legendCounts[c] = li.querySelector('.n');
  }
  const whoRows = WHO.map((w, g) => {
    const li = row(`who-${g}`, w.name, w.color, (on) => {
      uniforms.uWOn.value[g] = on ? 1 : 0;
      pulses.uniforms.uWOn.value[g] = on ? 1 : 0;
    });
    li.classList.add('by-who');
    li.querySelector('.name').dataset.short = w.short;
    li.hidden = true;
    whoCounts[g] = li.querySelector('.n');
    whoLaunches[g] = li.querySelector('.l');
    return li;
  });
  let legendMode = 0;
  const setLegendMode = (m) => {
    legendMode = m;
    uniforms.uMode.value = m;
    pulses.uniforms.uMode.value = m;
    legend.classList.toggle('who', m === 1);
    for (const b of modeLi.querySelectorAll('button')) b.setAttribute('aria-pressed', String(Number(b.dataset.mode) === m));
    for (const li of kindRows) li.hidden = m !== 0;
    for (const li of whoRows) li.hidden = m !== 1;
    live.dirty = true;
  };
  for (const b of modeLi.querySelectorAll('button')) b.addEventListener('click', () => setLegendMode(Number(b.dataset.mode)));

  const now = countsOn(data, END_DAY);
  const nowTotal = now.reduce((a, b) => a + b, 0);
  {
    const junk = now[2] + now[3] + now[4];
    const pct = (n) => Math.round((100 * n) / nowTotal);
    const fy = EVENT.fengyun;
    STATS.junk = {
      key: 'junk', stats: 'kind', fig: 'Today', day: END_DAY,
      title: 'Space junk',
      kind: 'What is in orbit today, by kind',
      place: `${fmt(nowTotal)} tracked objects in orbit`,
      specs: [
        ['Junk', `${fmt(junk)}, ${pct(junk)}% of everything in orbit`],
        ['Rocket stages', fmt(now[2])],
        ['Debris', fmt(now[3])],
        ['Discarded parts', fmt(now[4])],
        ['Biggest debris cloud', `Fengyun-1C, ${fmt(fy.left)} pieces still up`],
        ['Too small to track', 'about 1.5 million pieces of 1–10 cm (ESA estimate)'],
      ],
      body: `About ${pct(junk)}% of the objects in orbit are junk: spent rocket stages, parts thrown off during launches, and debris from explosions and collisions, and many of the satellites are dead too. Low pieces fall back within a few years, but above about 800 km they can stay up for decades or centuries, and at these speeds even a 1 cm fragment can disable a satellite.`,
    };
    const inOrbit = countsOnWho(data, END_DAY);
    const launched = launchesByWho(L, END_DAY);
    const yearOf = (d) => dateOf(d).getUTCFullYear();
    const lastYear = yearOf(END_DAY) - 1;
    const yearCount = WHO.map(() => 0);
    for (let k = 0; k < L.n; k += 1) if (L.ok[k] && yearOf(L.day[k]) === lastYear) yearCount[L.who[k]] += 1;
    const yearTotal = yearCount.reduce((a, b) => a + b, 0);
    const G = Object.fromEntries(WHO.map((w, g) => [w.name, g]));
    const sx = G.SpaceX;
    const ru = G['Russia & USSR'];
    const cn = G.China;
    const ind = G.India;
    STATS.who = {
      key: 'who', stats: 'who', fig: 'Today', day: END_DAY,
      title: 'Who put it there',
      kind: 'In orbit today, and launches since 1957',
      place: `${fmt(launched.reduce((a, b) => a + b, 0))} launches reached orbit or beyond`,
      inOrbit, launched,
      specs: [
        ['Most in orbit', `SpaceX, ${fmt(inOrbit[sx])} (${pct(inOrbit[sx])}%)`],
        ['Most launches', `Russia and the USSR, ${fmt(launched[ru])}`],
        [`Launches in ${lastYear}`, `SpaceX ${yearCount[sx]}, China ${yearCount[cn]}, everyone else ${yearTotal - yearCount[sx] - yearCount[cn]}`],
        ['India', `${fmt(inOrbit[ind])} in orbit, ${fmt(launched[ind])} launches`],
      ],
      body: `For decades the Soviet Union and Russia launched more rockets than anyone. Now SpaceX launches more than the rest of the world put together and owns a third of everything in orbit, almost all of it Starlink. China is second and climbing, and India, Japan and Europe fly rockets of their own.`,
    };
  }
  const captionText = {
    ...Object.fromEntries(events.map((ev) => [ev.key, {date: formatDay(ev.t), title: ev.title, body: ev.body}])),
    today: {
      date: formatDay(END_DAY),
      title: 'Where we are now',
      body: `${fmt(nowTotal)} objects are in orbit. ${fmt(now[1])} of them are Starlink satellites, and ${fmt(now[3] + now[4])} are debris or discarded parts.`,
    },
  };
  const cap = $('caption');
  let captionKey = null;
  const showCaption = (key, opacity) => {
    if (key !== captionKey) {
      captionKey = key;
      if (key) {
        const c = captionText[key];
        cap.querySelector('.cap-date').textContent = c.date;
        cap.querySelector('.cap-title').textContent = c.title;
        cap.querySelector('.cap-body').textContent = c.body;
      }
    }
    cap.style.opacity = key ? opacity.toFixed(3) : '0';
  };

  const range = $('timeline');
  range.min = START_DAY;
  range.max = END_DAY;
  range.step = 'any';
  const ticks = $('ticks');
  const pct = (day) => ((day - START_DAY) / (END_DAY - START_DAY)) * 100;
  for (const ev of events.filter((e) => e.kind === 'breakup')) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `tick ${ev.kind}`;
    b.style.left = `${pct(ev.t)}%`;
    b.title = `${ev.title}, ${formatDay(ev.t)}`;
    b.setAttribute('aria-label', `Jump to ${ev.title}, ${formatDay(ev.t)}`);
    b.dataset.key = ev.key;
    ticks.append(b);
  }
  for (const sh of Object.values(SHIP)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tick ship';
    b.style.left = `${pct(sh.day)}%`;
    b.title = `${sh.title}, ${formatDay(sh.day)}`;
    b.setAttribute('aria-label', `Jump to ${sh.title}, ${formatDay(sh.day)}`);
    b.dataset.key = sh.key;
    ticks.append(b);
  }
  // a click on the marks opens the nearest one, since on a phone they sit a few pixels apart
  ticks.addEventListener('click', (e) => {
    let b = e.target.closest('.tick');
    if (e.detail !== 0) {
      let best = 1e9;
      for (const t of ticks.children) {
        const r = t.getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - e.clientX);
        if (d < best) [best, b] = [d, t];
      }
      if (best > 16) b = null;
    }
    if (b) openMilestone(b.dataset.key);
  });
  const years = $('years');
  for (const y of [1960, 1970, 1980, 1990, 2000, 2010, 2020]) {
    const s = document.createElement('span');
    s.textContent = y;
    s.style.left = `${pct(dayOf(`${y}-01-01`))}%`;
    years.append(s);
  }

  // launches per year, as bars along the timeline: grey ahead of the date, orange behind it
  {
    const byYear = perYear(L, dateOf);
    const peak = Math.max(...byYear.values());
    const peakYear = [...byYear.entries()].find(([, v]) => v === peak)[0];
    $('cadence-k').textContent = `Launches per year · peak ${peak} in ${peakYear}`;
    const SVGNS = 'http://www.w3.org/2000/svg';
    for (const cls of ['base', 'past']) {
      const el = document.createElementNS(SVGNS, 'svg');
      el.setAttribute('class', cls);
      el.setAttribute('viewBox', '0 0 1000 26');
      el.setAttribute('preserveAspectRatio', 'none');
      for (const [y, v] of byYear) {
        const x0 = pct(dayOf(`${y}-01-01`)) * 10;
        const x1 = pct(dayOf(`${y + 1}-01-01`)) * 10;
        const r = document.createElementNS(SVGNS, 'rect');
        const hgt = Math.max(0.6, (v / peak) * 24);
        r.setAttribute('x', Math.max(0, x0 + 0.6).toFixed(2));
        r.setAttribute('width', Math.max(0.5, Math.min(1000, x1) - Math.max(0, x0) - 1.2).toFixed(2));
        r.setAttribute('y', (26 - hgt).toFixed(2));
        r.setAttribute('height', hgt.toFixed(2));
        el.append(r);
      }
      $('cadence').append(el);
    }
  }
  const latestEl = $('latest');
  const latestT = $('latest-t');
  let latestK = -2;
  // live numbers on the Starlink cards: all Starlinks, or V2 Minis, in orbit on the timeline's date
  const liveSpecs = [];
  let hudDay = END_DAY;
  const v2Days = Float64Array.from(meta.starlinkV2Steps || [], (x) => x[0]);
  const v2Cum = Int32Array.from(meta.starlinkV2Steps || [], (x) => x[1]);
  for (let k = 1; k < v2Cum.length; k += 1) v2Cum[k] += v2Cum[k - 1];
  const v2On = (day) => {
    let lo = 0;
    let hi = v2Days.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (v2Days[mid] <= day) lo = mid + 1;
      else hi = mid;
    }
    return lo ? v2Cum[lo - 1] : 0;
  };
  // a card holds the date at liftoff, but satellites separate about an hour later: count from 3 h after the launch
  let liveFloor = 0;
  const updateLiveSpecs = (counts) => {
    if (!liveSpecs.length) return;
    const day = Math.max(hudDay, liveFloor);
    const c = counts && day === hudDay ? counts : countsOn(data, day);
    for (const dd of liveSpecs) {
      const t = fmt(dd.dataset.live === 'sl' ? c[1] : v2On(day));
      if (dd.textContent !== t) dd.textContent = t;
    }
  };
  const showLatest = (day) => {
    const k = lastLaunch(L, day);
    if (k === latestK) return;
    latestK = k;
    latestEl.classList.toggle('none', k < 0);
    if (k < 0) return;
    // date · rocket · payload · site (· failed): only the payload and site shorten when there isn't room
    const seg = (text, cls) => {
      const el = document.createElement('span');
      el.className = cls;
      el.textContent = text;
      return el;
    };
    latestT.replaceChildren(seg(formatDay(L.day[k]), 'l-date'), seg(L.lvs[L.lv[k]], 'l-lv'), seg(L.name[k], 'l-name'),
      seg(L.sites[L.site[k]][0], 'l-site'));
    if (!L.ok[k]) latestT.append(seg('failed', 'failed'));
  };

  const hud = (day, {showTime}) => {
    const counts = countsOn(data, day);
    hudDay = day;
    updateLiveSpecs(counts);
    [1, 0, 2, 3, 4].forEach((c) => setText(legendCounts[c], fmt(counts[c])));
    if (legendMode === 1) {
      const wc = countsOnWho(data, day);
      const wl = launchesByWho(L, day);
      WHO.forEach((w, g) => {
        setText(whoCounts[g], fmt(wc[g]));
        setText(whoLaunches[g], fmt(wl[g]));
      });
    }
    setText($('total'), fmt(counts.reduce((a, b) => a + b, 0)));
    setText($('ever'), fmt(launchedBy(data, day)));
    setText($('launches'), fmt(launchesBy(L, day)));
    showLatest(day);
    setText($('date'), formatDay(day));
    setText($('time'), showTime ? timeOfDay(day) : '');
    const p = Math.max(0, Math.min(100, pct(day)));
    $('track').style.setProperty('--p', `${p}%`);
    if (!live.scrubbing) range.value = String(day);
  };

  // ---------------------------------------------------------- spec plates and the lineup
  const stageShips = createShipStage($('ship'), {modelUrl, preserve: CAPTURE});
  // models load when a plate first needs them; the page redraws once they arrive
  const asked = new Set();
  const wantShips = (ships) => {
    for (const sh of ships) {
      if (asked.has(sh.key)) continue;
      asked.add(sh.key);
      stageShips.load(sh).then(() => {
        live.dirty = true;
      }, (err) => console.error('model load failed', sh.key, err));
    }
  };
  const plate = $('plate');
  const plateView = $('plate-view');
  const dims = $('plate-dims');
  const lineupEl = $('lineup');
  const lineupView = $('lineup-view');
  const lineupMarks = $('lineup-marks');
  const shipCanvas = $('ship');
  const clock = (day) => timeOfDay(day);
  let plateKey = null;
  // the buttons under a card's title: for a milestone, its satellite in the catalog (its orbit on the globe) or, for
  // one that left Earth orbit, its launch (tools/milestone-objects.mjs matches them); on those cards, the way back
  const actsEl = $('plate-acts');
  const ORBIT_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><ellipse cx="8" cy="8" rx="7" ry="3.2" transform="rotate(-24 8 8)"/><circle cx="8" cy="8" r="2.1" fill="currentColor" stroke="none"/></svg>';
  const LAUNCH_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5c2 1.6 3 4 3 6.6V11H5V8.1c0-2.6 1-5 3-6.6zM5 11l-1.6 2.6M11 11l1.6 2.6M8 11v3.2"/></svg>';
  const BACK_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>';
  // cards about a rocket, or a whole batch of satellites: say what the orbit is of
  const ACT_LABEL = {
    falcon1: 'Show the orbit it reached', falcon9: 'Show the orbit it reached', ariane1: 'Show the orbit it reached',
    starlink: 'Show one satellite’s orbit', starlinkv2: 'Show one satellite’s orbit', kuiper: 'Show one satellite’s orbit',
  };
  const addAct = (label, icon, data, cls = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `plate-act ${cls}`.trim();
    Object.assign(b.dataset, data);
    b.innerHTML = icon;
    b.append(label);
    actsEl.append(b);
  };
  const fillActs = (sh) => {
    actsEl.textContent = '';
    if (!CAPTURE && MODELS.search) {
      if (sh.found && sh.from) addAct(`Back to ${CARD_OF(sh.from).title}`, BACK_ICON, {act: 'back', key: sh.from}, 'back');
      else if (!sh.found && !sh.stats) {
        const link = LINKS[sh.key];
        const event = !SHIP[sh.key];
        if (Array.isArray(link)) {
          for (const [sc, name] of link) addAct(event ? `Show ${name}’s orbit` : ACT_LABEL[sh.key] || 'Show its orbit', ORBIT_ICON, {act: 'orbit', sc, key: sh.key});
        } else if (link === 'launch') addAct('Show the launch', LAUNCH_ICON, {act: 'launch', key: sh.key});
      }
    }
    actsEl.hidden = !actsEl.children.length;
  };
  const fillPlate = (sh) => {
    const isEvent = !SHIP[sh.key];
    const found = !!sh.found;
    plate.classList.toggle('event', isEvent && !sh.stats && !found);
    plate.classList.toggle('stats', !!sh.stats);
    plate.classList.toggle('found', found);
    plate.classList.toggle('noview', found && sh.found === 'launch' && !sh.ship);
    plate.classList.toggle('turn', !isEvent || !!sh.ship);
    $('plate-fig').textContent = found || sh.stats ? sh.fig : isEvent ? `Debris event ${sh.index + 1} of 3` : `Fig. ${String(sh.index + 1).padStart(2, '0')}`;
    $('plate-when').textContent = found ? sh.when : sh.stats ? formatDay(sh.day) : `${formatDay(sh.day)} · ${clock(sh.day)}`;
    $('plate-title').textContent = sh.title;
    $('plate-kind').textContent = sh.kind;
    $('plate-site').textContent = isEvent ? sh.place : `Launched from ${SITES[sh.site].name}`;
    $('plate-body').textContent = sh.body;
    document.querySelector('.plate-scroll').scrollTop = 0;
    $('plate-main').scrollTop = 0;
    fillActs(sh);
    const dl = $('plate-specs');
    dl.textContent = '';
    liveSpecs.length = 0;
    liveFloor = sh.day + 0.125;
    for (const [k, v] of sh.specs) {
      const d = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = k;
      // counts that follow the timeline's date, and today's
      if (v === '%STARLINK_ON%' || v === '%STARLINKV2_ON%') {
        dd.dataset.live = v === '%STARLINK_ON%' ? 'sl' : 'v2';
        liveSpecs.push(dd);
      }
      dd.textContent = v.replace('%STARLINKV2%', fmt(meta.starlinkV2Now)).replace('%STARLINK%', fmt(now[1])).replace('%KUIPER%', fmt(meta.kuiperNow));
      d.append(dt, dd);
      dl.append(d);
    }
    updateLiveSpecs();
  };
  const svg = (tag, attrs, text) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text != null) el.textContent = text;
    return el;
  };
  const NICE = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
  const metres = (m) => (m < 1 ? `${Math.round(m * 100)} cm` : `${m} m`);
  // dimension line for tall ships, scale bar for the rest
  const drawDims = (sh, info, w, h) => {
    dims.textContent = '';
    if (!info) return;
    const big = CAPTURE ? 1.35 : 1;
    if (sh.model.dim === 'height') {
      const x = Math.max(70 * big, info.top[0] - info.rxzPx - 34 * big);
      const [, y0] = info.top;
      const [, y1] = info.bottom;
      const t = 7 * big;
      dims.append(
        svg('line', {x1: x, y1: y0, x2: x, y2: y1}),
        svg('line', {x1: x - t, y1: y0, x2: x + t, y2: y0}),
        svg('line', {x1: x - t, y1: y1, x2: x + t, y2: y1}),
        svg('line', {x1: x + t, y1: y0, x2: info.top[0], y2: y0, 'stroke-dasharray': '3 4', opacity: 0.5}),
        svg('line', {x1: x + t, y1: y1, x2: info.top[0], y2: y1, 'stroke-dasharray': '3 4', opacity: 0.5}),
      );
      const label = svg('text', {x: x - 10 * big, y: (y0 + y1) / 2, 'text-anchor': 'end', 'dominant-baseline': 'middle'}, metres(sh.model.size[1]));
      dims.append(label);
      dims.append(svg('text', {x: x - 10 * big, y: (y0 + y1) / 2 + 17 * big, 'text-anchor': 'end', 'dominant-baseline': 'middle', class: 'sub'}, 'height'));
    } else {
      const want = Math.min(w * 0.28, 220 * big);
      let L = NICE[0];
      for (const n of NICE) if (n * info.ppm <= want) L = n;
      const len = L * info.ppm;
      const x1 = w - 24 * big;
      const x0 = x1 - len;
      const y = h - 26 * big;
      const t = 6 * big;
      dims.append(
        svg('line', {x1: x0, y1: y, x2: x1, y2: y}),
        svg('line', {x1: x0, y1: y - t, x2: x0, y2: y + t}),
        svg('line', {x1: x1, y1: y - t, x2: x1, y2: y + t}),
        svg('line', {x1: (x0 + x1) / 2, y1: y - t / 2, x2: (x0 + x1) / 2, y2: y + t / 2}),
        svg('text', {x: x0, y: y - 12 * big, 'text-anchor': 'start'}, '0'),
        svg('text', {x: x1, y: y - 12 * big, 'text-anchor': 'end'}, metres(L)),
      );
    }
  };
  // a debris event's card: how many of its tracked pieces were still in orbit, from the breakup to today. The line
  // draws itself over the first seconds the card is up.
  const drawChart = (ev, w, h, local) => {
    dims.textContent = '';
    const big = CAPTURE ? 1.35 : 1;
    const L0 = 58 * big;
    const R0 = 24 * big;
    const T0 = 46 * big;
    const B0 = 34 * big;
    const pw = w - L0 - R0;
    const ph = h - T0 - B0;
    if (pw < 40 || ph < 30) return;
    const s = ev.alive;
    const d0 = s[0][0];
    const d1 = s[s.length - 1][0];
    const step = [250, 500, 1000, 2000].find((v) => ev.cataloged / v <= 4) || 1000;
    const top = Math.ceil(ev.cataloged / step) * step;
    const X = (d) => L0 + ((d - d0) / (d1 - d0)) * pw;
    const Y = (v) => T0 + ph - (v / top) * ph;
    for (let v = 0; v <= top; v += step) {
      dims.append(svg('line', {x1: L0, y1: Y(v), x2: L0 + pw, y2: Y(v), class: 'chart-grid'}));
      dims.append(svg('text', {x: L0 - 8 * big, y: Y(v), 'text-anchor': 'end', 'dominant-baseline': 'middle', class: 'sub'}, fmt(v)));
    }
    const y0 = dateOf(d0).getUTCFullYear();
    const y1 = dateOf(d1).getUTCFullYear();
    const every = y1 - y0 > 12 ? 5 : y1 - y0 > 6 ? 2 : 1;
    for (let y = Math.ceil(y0 / every) * every; y <= y1; y += every) {
      const x = X(dayOf(`${y}-01-01`));
      if (x < L0 + 16 * big) continue;
      dims.append(svg('text', {x, y: T0 + ph + 18 * big, 'text-anchor': 'middle', class: 'sub'}, String(y)));
    }
    dims.append(svg('text', {x: L0, y: T0 - 20 * big, 'text-anchor': 'start'}, 'Tracked pieces still in orbit'));
    // reveal: the line grows from the breakup to today
    const f = Math.max(0, Math.min(1, (local - 0.3) / 2.6));
    const dEnd = d0 + (d1 - d0) * (1 - (1 - f) ** 2);
    const pts = [];
    for (let k = 0; k < s.length; k += 1) {
      if (s[k][0] <= dEnd) pts.push([s[k][0], s[k][1]]);
      else {
        const [a, va] = s[k - 1];
        const [b, vb] = s[k];
        pts.push([dEnd, va + ((vb - va) * (dEnd - a)) / (b - a)]);
        break;
      }
    }
    if (pts.length < 2) return;
    const line = pts.map(([d, v], k) => `${k ? 'L' : 'M'}${X(d).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    dims.append(svg('path', {d: `${line}L${X(dEnd).toFixed(1)},${Y(0).toFixed(1)}L${X(d0).toFixed(1)},${Y(0).toFixed(1)}Z`, class: 'chart-area'}));
    dims.append(svg('path', {d: line, class: 'chart-line'}));
    const [ld, lv] = pts[pts.length - 1];
    dims.append(svg('circle', {cx: X(ld), cy: Y(lv), r: 3.5 * big, class: 'chart-dot'}));
    if (f >= 1) {
      dims.append(svg('text', {x: X(ld) - 8 * big, y: Y(lv) - 12 * big, 'text-anchor': 'end'}, `${fmt(lv)} today`));
      dims.append(svg('text', {x: X(d0) + 8 * big, y: Y(s[0][1]) - 10 * big, 'text-anchor': 'start', class: 'sub'}, `${fmt(s[0][1])} at first`));
    }
  };
  // the closing cards' charts: horizontal bars that grow over the first seconds. The junk card shows what is in
  // orbit by kind, with the three kinds of junk bracketed; the who card shows, for each owner, what is in orbit
  // and how many launches it has made, as two charts side by side (each with its own scale).
  const drawBars = (sh, w, h, local) => {
    dims.textContent = '';
    const big = CAPTURE ? 1.35 : 1;
    const grow = 1 - (1 - Math.max(0, Math.min(1, (local - 0.3) / 2.2))) ** 3;
    const bar = (x, y, len, bh, color) => dims.append(svg('rect', {x, y: y - bh / 2, width: Math.max(0, len), height: bh, rx: Math.min(2 * big, bh / 2), fill: color}));
    const T0 = 40 * big;
    const B0 = 14 * big;
    if (sh.stats === 'kind') {
      const rows = [1, 0, 2, 3, 4];
      const L0 = 150 * big;
      const R0 = 70 * big;
      const pw = w - L0 - R0;
      const rh = Math.min(34 * big, (h - T0 - B0) / rows.length);
      const top = Math.max(...rows.map((c) => now[c]));
      dims.append(svg('text', {x: 16 * big, y: T0 - 20 * big, 'text-anchor': 'start'}, 'In orbit today'));
      rows.forEach((c, k) => {
        const y = T0 + rh * (k + 0.5);
        dims.append(svg('text', {x: L0 - 10 * big, y, 'text-anchor': 'end', 'dominant-baseline': 'middle', class: k < 2 ? 'sub' : ''}, CATS[c].name));
        const len = (now[c] / top) * pw * grow;
        bar(L0, y, len, Math.min(12 * big, rh * 0.42), rgb(CATS[c].color));
        dims.append(svg('text', {x: L0 + len + 8 * big, y, 'dominant-baseline': 'middle', class: 'sub'}, fmt(Math.round(now[c] * grow))));
      });
      // bracket the junk, labelled up its side
      const ya = T0 + rh * 2.15;
      const yb = T0 + rh * 4.85;
      const xb = 26 * big;
      dims.append(
        svg('line', {x1: xb + 6 * big, y1: ya, x2: xb, y2: ya}),
        svg('line', {x1: xb, y1: ya, x2: xb, y2: yb}),
        svg('line', {x1: xb, y1: yb, x2: xb + 6 * big, y2: yb}),
      );
      const ym = (ya + yb) / 2;
      const xt = xb - 10 * big;
      dims.append(svg('text', {x: xt, y: ym, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'sub', transform: `rotate(-90 ${xt} ${ym})`}, 'junk'));
      return;
    }
    // who: sorted by what is in orbit today; the same rows in both charts
    const order = WHO.map((_, g) => g).sort((a, b) => sh.inOrbit[b] - sh.inOrbit[a]);
    const L0 = 104 * big;
    const gap = 18 * big;
    const cw = (w - L0 - gap - 14 * big) / 2;
    const rh = Math.min(30 * big, (h - T0 - B0) / order.length);
    const cols = [[sh.inOrbit, 'In orbit today'], [sh.launched, 'Launches since 1957']];
    cols.forEach(([vals, label], j) => {
      const x0 = L0 + j * (cw + gap);
      const top = Math.max(...vals);
      const room = cw - 48 * big;
      dims.append(svg('text', {x: x0, y: T0 - 20 * big, 'text-anchor': 'start'}, label));
      order.forEach((g, k) => {
        const y = T0 + rh * (k + 0.5);
        const len = (vals[g] / top) * room * grow;
        bar(x0, y, len, Math.min(10 * big, rh * 0.42), rgb(WHO[g].color));
        dims.append(svg('text', {x: x0 + len + 6 * big, y, 'dominant-baseline': 'middle', class: 'sub'}, fmt(Math.round(vals[g] * grow))));
      });
    });
    order.forEach((g, k) => {
      dims.append(svg('text', {x: L0 - 10 * big, y: T0 + rh * (k + 0.5), 'text-anchor': 'end', 'dominant-baseline': 'middle'}, WHO[g].short));
    });
  };
  // a search result's orbit, seen face on and to scale with Earth: Earth at one focus, and the object going round
  // once every 8 seconds, fastest at perigee
  const drawOrbit = (sh, w, h, local) => {
    dims.textContent = '';
    const big = CAPTURE ? 1.35 : 1;
    const {a, e, per, apo} = sh.orbit;
    const b = a * Math.sqrt(1 - e * e);
    const pad = 22 * big;
    const s = Math.min((w / 2 - pad) / (a * (1 + e)), (h / 2 - pad - 12 * big) / Math.max(b, 1));
    const ex = w / 2;
    const ey = h / 2 - 6 * big;
    const cx = ex - a * e * s;
    dims.append(
      svg('circle', {cx: ex, cy: ey, r: s, class: 'orbit-earth'}),
      svg('ellipse', {cx, cy: ey, rx: a * s, ry: b * s, class: 'orbit-path'}),
    );
    const M = ((local / 8) % 1) * Math.PI * 2;
    let E = M;
    for (let k = 0; k < 8; k += 1) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    dims.append(svg('circle', {cx: cx + a * s * Math.cos(E), cy: ey - b * s * Math.sin(E), r: 4 * big, class: 'orbit-dot'}));
    const ly = h - 12 * big;
    if (apo - per < 60) {
      dims.append(svg('text', {x: 16 * big, y: ly, class: 'sub'}, `${fmt(per)} to ${fmt(apo)} km up · Earth to scale`));
    } else {
      // the near and far points, marked on the orbit
      const xp = cx + a * s;
      const xa = cx - a * s;
      dims.append(
        svg('line', {x1: xp, y1: ey - 5 * big, x2: xp, y2: ey + 5 * big}),
        svg('line', {x1: xa, y1: ey - 5 * big, x2: xa, y2: ey + 5 * big}),
        svg('text', {x: 16 * big, y: ly, class: 'sub'}, `Earth to scale · lowest ${fmt(per)} km · highest ${fmt(apo)} km`),
      );
    }
  };
  let viewW = 0;
  let viewH = 0;
  // the card for a ship or a debris event: spin and tilt turn the ship's model, local is seconds since it opened
  const phoneQ = window.matchMedia('(max-width: 860px)');
  const readoutEl = document.querySelector('.hud .readout');
  const showPlate = (key, opacity, spinDeg, {tilt = 0, local = 99, slide = 0} = {}) => {
    const on = !!key && opacity > 0.002;
    plate.classList.toggle('on', on);
    plate.style.opacity = on ? opacity.toFixed(3) : '0';
    // on a phone the card covers the title and the date, so they fade out under it
    const under = phoneQ.matches && !CAPTURE && on ? (1 - opacity).toFixed(3) : '';
    readoutEl.style.opacity = under;
    document.querySelector('.hud .title').style.opacity = under;
    if (!on) return;
    const sh = CARD_OF(key);
    // the ship whose model the card shows: its own, or for a launch found by search, its rocket's
    const mdl = SHIP[key] || (sh.ship ? SHIP[sh.ship] : null);
    if (key !== plateKey) {
      plateKey = key;
      fillPlate(sh);
      const tall = !!mdl && mdl.model.dim === 'height' && mdl.model.size[1] > 15;
      plate.classList.toggle('tall', tall && plate.clientWidth >= 560);
    }
    if (shipCanvas.parentNode !== plateView) plateView.prepend(shipCanvas);
    const dpr = CAPTURE ? window.devicePixelRatio || 1 : Math.min(window.devicePixelRatio || 1, 2);
    viewW = plateView.clientWidth;
    viewH = plateView.clientHeight;
    if (!mdl) {
      stageShips.clear();
      if (sh.stats) drawBars(sh, viewW, viewH, local);
      else if (sh.found === 'object') drawOrbit(sh, viewW, viewH, local);
      else if (sh.found) dims.textContent = '';
      else drawChart(sh, viewW, viewH, local);
    } else {
      if (!stageShips.ready(mdl)) wantShips([mdl]);
      const info = stageShips.render(mdl, spinDeg, viewW, viewH, dpr, tilt);
      drawDims(mdl, info, viewW, viewH);
    }
    // in the tour the card slides in from the right and back out as it fades (not on a phone, where it fills the
    // width); elsewhere it eases in a little way
    const far = slide > 0.001 && !(phoneQ.matches && !CAPTURE);
    plate.style.transform = `translateX(${(far ? slide * 0.55 * plate.offsetWidth : (1 - opacity) * 24).toFixed(1)}px)`;
  };
  const lineupShips = LINEUP.map((k) => SHIP[k]);
  const titleEl = document.querySelector('.hud .title');
  const showLineup = (opacity, spinDeg) => {
    const on = opacity > 0.002;
    lineupEl.classList.toggle('on', on);
    lineupEl.style.opacity = on ? opacity.toFixed(3) : '0';
    if (!on) return;
    if (shipCanvas.parentNode !== lineupView) lineupView.prepend(shipCanvas);
    const dpr = CAPTURE ? window.devicePixelRatio || 1 : Math.min(window.devicePixelRatio || 1, 2);
    const w = lineupView.clientWidth;
    const h = lineupView.clientHeight;
    if (lineupShips.some((sh) => !stageShips.ready(sh))) wantShips(lineupShips);
    const out = stageShips.renderLineup(lineupShips, spinDeg, w, h, dpr);
    lineupMarks.textContent = '';
    if (!out) return;
    const big = CAPTURE ? 1.35 : 1;
    const ground = out[0].bottom[1];
    lineupMarks.append(svg('line', {x1: 0, y1: ground, x2: w, y2: ground, opacity: 0.45}));
    out.forEach((o, k) => {
      const sh = lineupShips[k];
      const x = o.top[0];
      lineupMarks.append(
        svg('text', {x, y: o.top[1] - 30 * big, 'text-anchor': 'middle'}, LINEUP_NAMES[sh.key]),
        svg('text', {x, y: o.top[1] - 12 * big, 'text-anchor': 'middle', class: 'sub'}, metres(sh.model.size[1])),
      );
    });
  };

  // the narrated video's finale (T.FINALE): the rockets to scale, then the row of every ship, then back to the globe
  const allShips = SHIPS.slice().sort((x, y) => (x.when < y.when ? -1 : 1));
  const lineupKicker = lineupEl.querySelector('.kicker');
  const lineupH2 = lineupEl.querySelector('h2');
  const year = (sh) => sh.when.slice(0, 4);
  const showFinale = (opacity, u) => {
    const on = opacity > 0.002;
    lineupEl.classList.toggle('on', on);
    lineupEl.style.opacity = on ? opacity.toFixed(3) : '0';
    if (!on) return;
    const F = T.FINALE;
    const turn = F.carry + 1.4;
    const late = u >= turn;
    lineupKicker.textContent = late ? `In the order they flew · ${year(allShips[0])} to ${year(allShips[allShips.length - 1])}` : 'To scale';
    lineupH2.textContent = late ? 'What they carried' : 'From Juno I to Starship';
    // the heading dips out and back in as the rockets lift off
    const dip = Math.min(1, Math.abs(u - turn) / 0.45);
    lineupKicker.style.opacity = lineupH2.style.opacity = dip.toFixed(3);
    if (shipCanvas.parentNode !== lineupView) lineupView.prepend(shipCanvas);
    const dpr = CAPTURE ? window.devicePixelRatio || 1 : Math.min(window.devicePixelRatio || 1, 2);
    const w = lineupView.clientWidth;
    const h = lineupView.clientHeight;
    const out = stageShips.renderFinale(lineupShips, allShips, u, w, h, dpr, F, T.beltAt(u), T.focusAt(u), T.beltRow());
    lineupMarks.textContent = '';
    if (!out) return;
    const big = CAPTURE ? 1.35 : 1;
    if (out.ground) lineupMarks.append(svg('line', {x1: 0, y1: out.ground[1], x2: w, y2: out.ground[1], opacity: 0.45}));
    for (const l of out.labels) {
      const [x, y] = l.xy;
      if (x < -80 || x > w + 80) continue;
      if (l.kind === 'rocket') {
        const sh = lineupShips[l.k];
        lineupMarks.append(
          svg('text', {x, y: y - 30 * big, 'text-anchor': 'middle', opacity: l.o.toFixed(3)}, LINEUP_NAMES[sh.key]),
          svg('text', {x, y: y - 12 * big, 'text-anchor': 'middle', class: 'sub', opacity: l.o.toFixed(3)}, metres(sh.model.size[1])),
        );
      } else {
        const sh = allShips[l.i];
        lineupMarks.append(
          svg('text', {x, y: y + 24 * big, 'text-anchor': 'middle', class: 'sub', style: `font-size:${(15 * big).toFixed(1)}px`, opacity: l.o.toFixed(3)}, year(sh)),
          svg('text', {x, y: y + 50 * big, 'text-anchor': 'middle', style: `font-size:${(22 * big).toFixed(1)}px;font-family:var(--sans, inherit)`, opacity: l.o.toFixed(3)}, sh.title),
        );
      }
    }
  };

  // ---------------------------------------------------------- layout and drawing
  let width = 0;
  let height = 0;
  const layout = () => {
    const r = stage.getBoundingClientRect();
    width = Math.max(1, Math.round(r.width));
    height = Math.max(1, Math.round(r.height));
    const dpr = CAPTURE || CARD ? window.devicePixelRatio || 1 : Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // keep the globe the same size on tall screens by widening the vertical field of view
    camera.fov = camera.aspect < 1 ? 2 * Math.atan(Math.tan((38 * Math.PI) / 360) / camera.aspect ** 0.75) * (180 / Math.PI) : 38;
    camera.updateProjectionMatrix();
    const px = (height * dpr) / 1080;
    uniforms.uPx.value = px * (camera.aspect < 1 ? 1.25 : 1);
    stars.material.uniforms.uPx.value = px;
    live.dirty = true;
  };

  let room = 0;
  const setRoom = (w) => {
    room = w;
    // measured without the card's slide, so the globe doesn't follow it
    const slid = plate.style.transform;
    plate.style.transform = '';
    const r = plate.getBoundingClientRect();
    plate.style.transform = slid;
    const st = stage.getBoundingClientRect();
    const side = r.width < st.width * 0.7;
    const dx = side ? (st.right - r.left) / 2 : 0;
    const dy = side ? 0 : (st.bottom - r.top) / 2 - 40;
    if (w > 0.001) camera.setViewOffset(width, height, dx * w, dy * w * 0.8, width, height);
    else camera.clearViewOffset();
  };
  const draw = (day, sim, flashDays, cam) => {
    // while there are only a few objects, draw them larger so the first ones can be seen
    const total = countsOn(data, day).reduce((a, b) => a + b, 0);
    uniforms.uBoost.value = 1 + 1.6 * Math.exp(-total / 150);
    const di = Math.floor(day);
    uniforms.uDayI.value = di;
    uniforms.uDayF.value = day - di;
    uniforms.uSim.value = sim;
    uniforms.uFlashDays.value = flashDays;
    pulses.update(day, flashDays * 1.4, uniforms.uPx.value);
    earth.globe.rotation.y = spinAt(sim);
    if (cam) {
      camera.position.copy(cam.target).addScaledVector(cam.dir, cam.dist);
      camera.up.set(0, 1, 0);
      camera.lookAt(cam.target);
    }
    renderer.render(scene, camera);
  };

  let blackEl = null;
  const tourFrame = (t, {spin = 0, tilt = 0} = {}) => {
    foundMark.visible = false;
    const day = T.shownDay(t);
    const sim = T.tourSim(t);
    const speed = Math.abs(T.shownDay(t + 0.05) - T.shownDay(t - 0.05)) / 0.1;
    const cam = T.tourCamera(t, centreOf, spinAt);
    const p = T.plateAt(t);
    const lu = T.lineupAt(t);
    setRoom(T.plateRoomAt(t));
    showMarker(p && p.kind === 'ship' ? SHIP[p.key].site : null, p ? p.opacity : 0, p ? p.local : 0);
    const look = T.lookAt(t);
    uniforms.uKeep.value = look.keep;
    uniforms.uMode.value = Math.max(legendMode, look.mode);
    pulses.uniforms.uMode.value = uniforms.uMode.value;
    // the narrated video shows no launch flashes: they lit up launch sites all over the globe whenever the clock ran
    // fast between ships, and in the cold open. The only launch site it shows is the current ship's marker.
    pulses.points.visible = !T.FINALE;
    world.rotation.y = T.tourTurn(t);
    draw(day, sim, Math.max(0.03, speed * 0.3), cam);
    hud(day, {showTime: speed < 3 && speed > 0.01});
    const c = T.captionAt(t);
    showCaption(c ? c.key : null, c ? c.opacity : 0);
    showPlate(p ? p.key : null, p ? p.opacity : 0, p ? p.local * 9 + spin : 0, {tilt, local: p ? p.local : 0, slide: p ? 1 - p.opacity : 0});
    if (T.FINALE) showFinale(lu ? lu.opacity : 0, lu ? lu.local : 0);
    else showLineup(lu ? lu.opacity : 0, lu ? lu.local * 3 : 0);
    // the narrated video never shows the legend (the page's own tour does)
    legend.style.opacity = T.FINALE ? '0' : Math.max(1 - Math.max(room, lu ? lu.opacity : 0), T.legendAt(t)).toFixed(3);
    const under = phoneQ.matches && p ? 1 - p.opacity : 1;
    const luOp = lu ? lu.opacity : 0;
    titleEl.style.opacity = Math.min(under, 1 - luOp).toFixed(3);
    // the date and counts step aside for the lineup, which needs the bottom of the frame
    readoutEl.style.opacity = luOp > 0.001 ? Math.min(under, 1 - luOp).toFixed(3) : (under < 1 ? under.toFixed(3) : '');
    canvas.style.opacity = lu && lu.dim > 0.001 ? (1 - (T.FINALE ? 1 : 0.86) * lu.dim).toFixed(3) : '';
    // the narrated video fades up from black and back down at the end
    if (T.FINALE && CAPTURE) {
      if (!blackEl) {
        blackEl = document.createElement('div');
        blackEl.style.cssText = 'position:fixed;inset:0;background:#000;pointer-events:none;z-index:99';
        document.body.append(blackEl);
      }
      blackEl.style.opacity = Math.max(0, 1 - t / 0.8, (t - (T.TOUR_DURATION - 1.8)) / 1.6).toFixed(3);
    }
    return {day, cam};
  };

  // ---------------------------------------------------------- capture and share card
  if (CAPTURE) {
    document.body.classList.add('capture');
    if (params.has('clean')) document.body.classList.add('clean');
    layout();
    window.SIM = {
      ready: false,
      duration: T.TOUR_DURATION,
      fps: 60,
      info: () => renderer.info.render,
      render(time) {
        tourFrame(time);
        return {};
      },
    };
    Promise.all(SHIPS.map((sh) => stageShips.load(sh))).then(() => {
      window.SIM.ready = true;
    }, (err) => {
      console.error('model load failed', err);
    });
    return;
  }
  if (CARD) {
    document.body.classList.add('card');
    layout();
    const sim = 61000;
    // Earth to the right of the title, with the geostationary ring sweeping across
    const dir = T.sphericalDir(38, 15);
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
    pulses.points.visible = true;
    draw(END_DAY, sim, 0.03, {dir, dist: 7.4, target: right.multiplyScalar(-1.55).add(new THREE.Vector3(0, -0.25, 0))});
    hud(END_DAY, {showTime: false});
    window.CARD_READY = true;
    return;
  }

  // ---------------------------------------------------------- the live page
  // fetch the ship models in launch order, one at a time, so plates are ready when the tour reaches them
  setTimeout(() => {
    SHIPS.reduce((p, sh) => p.then(() => (asked.has(sh.key) ? null : (asked.add(sh.key), stageShips.load(sh).then(() => { live.dirty = true; })))).catch(() => {}), Promise.resolve());
  }, 1500);
  const controls = new OrbitControls(camera);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 0.7;
  controls.minDistance = 1.35;
  controls.maxDistance = 30;
  controls.enablePan = false;
  controls.autoRotateSpeed = 0.25;

  const playBtn = $('play');
  const speedBtn = $('speed');
  const tourBtn = $('tour');
  const setPlayLabel = () => {
    const on = live.mode === 'tour' ? live.tourPlaying : live.playing;
    playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play');
    playBtn.dataset.state = on ? 'pause' : 'play';
    tourBtn.textContent = live.mode === 'tour' ? 'Skip the tour' : 'Watch the tour';
    speedBtn.textContent = SPEEDS[live.speed].short;
    speedBtn.setAttribute('aria-label', `Speed: ${SPEEDS[live.speed].label}`);
    speedBtn.hidden = live.mode === 'tour';
  };

  const camNow = () => {
    const target = controls.target.clone();
    const off = camera.position.clone().sub(target);
    return {dir: off.clone().normalize(), dist: off.length(), target};
  };

  // leaving the tour hands the camera over where the tour left it
  const explore = ({day = live.day, playing = false} = {}) => {
    if (live.mode === 'tour') {
      const cam = T.tourCamera(live.tourT, centreOf, spinAt);
      live.sim = T.tourSim(live.tourT);
      live.turn = T.tourTurn(live.tourT);
      controls.target.copy(cam.target);
      camera.position.copy(cam.target).addScaledVector(cam.dir, cam.dist);
      controls.update();
    }
    live.mode = 'explore';
    live.day = day;
    live.playing = playing;
    live.fly = null;
    controls.autoRotate = false;
    // keep showing the card that was up when the visitor took over
    const p = T.plateAt(live.tourT);
    if (p && p.opacity > 0.5 && p.kind !== 'stats') openCard(p.key, {hold: false, resume: false});
    uniforms.uKeep.value = CATS.map(() => 1);
    uniforms.uMode.value = legendMode;
    pulses.uniforms.uMode.value = legendMode;
    showLineup(0, 0);
    setPlayLabel();
  };

  const startTour = () => {
    live.mode = 'tour';
    live.tourT = 0;
    live.tourPlaying = true;
    live.fly = null;
    live.capKey = null;
    controls.autoRotate = false;
    setPlayLabel();
  };

  const simAt = (ev) => T.tourSimAtDay(ev.t);
  // Cards: one for each ship and each debris event. While the timeline plays it stops at each one for a set time
  // (a countdown runs along the bottom of the card), then carries on. A card opened from the timeline stays open.
  const HOLD = {ship: 14000, event: 16000};
  const EVENT_RATE = 0.3; // days per second while a breakup's card is up, so the cloud bursts and spreads
  function openCard(key, {hold = true, resume = live.playing} = {}) {
    const kind = SHIP[key] ? 'ship' : FOUND[key] ? 'found' : 'event';
    const now = performance.now();
    if (!live.card || live.card.key !== key) {
      live.spin = 0;
      live.tilt = 0;
      live.spinV = 0;
    }
    live.card = {key, kind, t0: now, total: HOLD[kind], until: hold ? now + HOLD[kind] : 0, resume};
    live.plateKey = key;
    live.capKey = null;
  }
  const closeCard = () => {
    live.card = null;
    setPlayLabel();
  };
  const flyToSite = (sh) => flyToDir(T.siteLocal(sh.site));
  const flyToDir = (local) => {
    // where the site will be a few seconds after the camera gets there (the globe keeps turning)
    const site = local.clone().applyAxisAngle(Y_AXIS, spinAt(live.sim + 2 * 40) + live.turn + turnRate() * 6);
    const az = (Math.atan2(site.x, site.z) * 180) / Math.PI;
    const el = Math.max(-15, Math.min(42, ((Math.asin(site.y) * 180) / Math.PI) * 0.75 + 6));
    live.fly = {from: camNow(), to: {dir: T.sphericalDir(az - 14, el), dist: 3.4, target: new THREE.Vector3()}, t: 0};
  };
  const flyToCloud = (ev) => {
    const ang = live.turn + turnRate() * 1.6;
    const p = centreOf(ev.key, ev.t, simAt(ev) + 120, new THREE.Vector3()).applyAxisAngle(Y_AXIS, ang);
    const q = centreOf(ev.key, ev.t, simAt(ev) + 360, new THREE.Vector3()).applyAxisAngle(Y_AXIS, ang);
    live.fly = {from: camNow(), to: T.focusFrom(p, q, 2.9), t: 0};
  };
  // reach a ship's launch: the date stops there while its card is up
  function atShip(sh, {resume}) {
    live.day = sh.day + 1e-4;
    openCard(sh.key, {hold: resume, resume});
    flyToSite(sh);
  }
  // reach a breakup: back up a few hours and run the orbit clock so the cloud bursts where the broken object is
  function atBreakup(ev, {resume}) {
    live.day = ev.t - 0.3;
    live.sim = simAt(ev) - (0.3 / EVENT_RATE) * SPEEDS[0].warp;
    openCard(ev.key, {hold: true, resume});
    flyToCloud(ev);
  }
  function jumpTo(ev) {
    takeOver();
    controls.autoRotate = false;
    const resume = live.playing;
    atBreakup(ev, {resume});
    setPlayLabel();
  }
  function jumpToShip(sh) {
    takeOver();
    controls.autoRotate = false;
    atShip(sh, {resume: live.playing});
    if (!live.card.resume) live.playing = false;
    setPlayLabel();
  }
  // every milestone in date order, for the arrows on the card
  const MILESTONES = [
    ...Object.values(SHIP).map((sh) => ({key: sh.key, day: sh.day})),
    ...events.filter((e) => e.kind === 'breakup').map((ev) => ({key: ev.key, day: ev.t, ev})),
  ].sort((a, b) => a.day - b.day);
  function openMilestone(key) {
    const m = MILESTONES.find((x) => x.key === key);
    if (!m) return;
    if (m.ev) jumpTo(m.ev);
    else jumpToShip(SHIP[key]);
  }
  const stepCard = (d) => {
    if (!live.card) return;
    const m = MILESTONES[MILESTONES.findIndex((x) => x.key === live.card.key) + d];
    if (!m) return;
    live.playing = false;
    openMilestone(m.key);
  };
  $('plate-close').addEventListener('click', closeCard);
  $('plate-next').addEventListener('click', closeCard);
  $('plate-prev').addEventListener('click', () => stepCard(-1));
  $('plate-after').addEventListener('click', () => stepCard(1));

  // ---------------------------------------------------------- search: any object, launch or milestone
  // The index (search.txt) loads the first time the box is used. A result opens a card: for an object, its orbit and
  // what the catalog says about it, with the date moved to when it reached orbit and a ring on it; for a launch, the
  // rocket (with its model when the page has one), the site and what it carried, with the date at the launch.
  const findForm = $('find');
  const findQ = $('find-q');
  const findList = $('find-list');
  let index = null;
  let search = null;
  let loading = null;
  let byLaunch = null;
  const objT0 = (i) => data.o1[i * 4 + 3];
  const objT1 = (i) => data.o2[i * 4];
  const objUp = (i) => objT1(i) >= NO_END;
  const objCat = (i) => data.o3[i];
  const lvName = (k) => L.lvs[L.lv[k]];
  const siteOf = (k) => L.sites[L.site[k]];
  const launchText = (k, nameOnly) => (nameOnly ? L.name[k] : `${L.name[k]} ${lvName(k)} ${siteOf(k)[0]}`);
  const MILESTONE_TEXT = MILESTONES.map((m) => {
    const c = CARD_OF(m.key);
    return {key: m.key, title: c.title, text: `${c.title} ${c.kind || ''} ${LINEUP_NAMES[m.key] || ''}`};
  });
  const KIND1 = ['Satellite', 'Starlink satellite', 'Rocket stage', 'Debris', 'Discarded part'];
  const yearOf = (day) => dateOf(day).getUTCFullYear();
  const endWord = (status) => (status === 'L' ? 'Landed' : status === 'D' ? 'Deorbited' : 'Reentered');
  const countryOf = (code) => (code && index ? index.head.states[code] || code : '');
  const rowOf = (i) => index.obj[i].split('\t');
  // rockets the page has a model of
  const LV_SHIP = [[/^Falcon 9/, 'falcon9'], [/^Falcon Heavy/, 'falconheavy'], [/^Saturn V$/, 'apollo11'], [/^Space Shuttle/, 'sts1'],
    [/^Starship/, 'starship'], [/^SLS/, 'artemis2'], [/^Ariane 1$/, 'ariane1'], [/^New Glenn/, 'newglenn'], [/^Jupiter C$/, 'explorer1']];
  const shipForLv = (lv) => (LV_SHIP.find(([re]) => re.test(lv)) || [])[1] || null;
  const listOf = (names) => (names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
  const minutes = (sec) => {
    const m = sec / 60;
    if (m < 120) return `${Math.round(m)} min`;
    const h = m / 60;
    return h < 48 ? `${h.toFixed(1).replace(/\.0$/, '')} hours` : `${(h / 24).toFixed(1).replace(/\.0$/, '')} days`;
  };
  const sizeText = (sz) => {
    const [l, d, sp] = sz.split('/').map((v) => (v ? Number(v) : 0));
    const parts = [];
    if (l) parts.push(`${l} m long`);
    if (d && d !== l) parts.push(`${d} m wide`);
    if (sp && sp > Math.max(l, d) * 1.05) parts.push(`${sp} m across`);
    return parts.join(', ');
  };

  function objectCard(i, atNote) {
    const [name, alt, sc, pc, , state, mass, size, , li, pi, status, catCode, , note] = rowOf(i);
    const c = objCat(i);
    const t0 = objT0(i);
    const t1 = objT1(i);
    const up = t1 >= NO_END;
    const a = data.o0[i * 4];
    const e = data.o0[i * 4 + 1];
    const inc = (data.o0[i * 4 + 2] * 180) / Math.PI;
    const per = Math.round((a * (1 - e) - 1) * RE);
    const apo = Math.round((a * (1 + e) - 1) * RE);
    const period = 2 * Math.PI * Math.sqrt((a * RE) ** 3 / MU);
    const k = li === '' ? -1 : Number(li);
    const parent = pi === '' || c < 2 ? '' : rowOf(Number(pi))[0];
    const country = countryOf(state);
    const category = catCode ? index.head.categories[catCode] : '';
    const years = (END_DAY - t0) / 365.25;
    const specs = [
      [c >= 3 ? 'Broke off' : 'Reached orbit', formatDay(t0)],
      ...(k >= 0 ? [['Rocket', lvName(k)]] : []),
      ['Orbit', `${fmt(per)} × ${fmt(apo)} km, ${inc.toFixed(1)}°`],
      ['Goes round every', minutes(period)],
      ['Status', up ? `In orbit, ${years < 1 ? `${Math.max(1, Math.round(years * 12))} months` : `${Math.round(years)} years`}` : `${endWord(status)} ${formatDay(t1)}`],
      ...(mass ? [['Mass', `${fmt(Number(mass))} kg`]] : []),
      ...(size && sizeText(size) ? [['Size', sizeText(size)]] : []),
      ...(pc ? [['International ID', pc]] : []),
    ];
    const lines = [];
    if (note) lines.push(`${note[0].toUpperCase()}${note.slice(1)}${/[.!?]$/.test(note) ? '' : '.'}`);
    if (alt) lines.push(`Also known as ${alt}.`);
    if (c >= 3 && parent) lines.push(`${c === 3 ? 'A piece of debris' : 'A part thrown off'} from ${parent}.`);
    else if (c === 2 && k >= 0) lines.push(`Part of the ${lvName(k)} that launched ${L.name[k]}.`);
    else if (k >= 0) lines.push(`Launched on a ${lvName(k)} from ${siteOf(k)[0]}${L.count[k] > 1 ? `, one of ${fmt(L.count[k])} payloads` : ''}.`);
    lines.push(`${atNote || 'The timeline is at the day it reached orbit'}; press play to follow it. Its orbit is real, its place along it illustrative.`);
    return {
      key: `o:${i}`, found: 'object', obj: i, day: t0,
      fig: sc ? `Catalog no. ${sc}` : 'Catalog',
      when: `${formatDay(t0)} · ${clock(t0)}`,
      title: name,
      kind: [KIND1[c], category, country].filter(Boolean).join(' · '),
      place: c >= 3 && parent ? `From ${parent}` : k >= 0 ? `Launched from ${siteOf(k)[0]}` : '',
      specs,
      body: lines.filter(Boolean).join(' '),
      orbit: {a, e, per, apo},
      footer: 'From the GCAT catalog',
    };
  }

  function launchCard(k) {
    const [tag, flight, pad, payloads, deep] = index.lau[k].split('\t');
    const pay = payloadShip(k);
    const names = payloads ? payloads.split('|') : [];
    const n = L.count[k];
    if (!byLaunch) {
      byLaunch = new Map();
      for (let i = 0; i < index.obj.length; i += 1) {
        const t = index.obj[i].split('\t', 10)[9];
        if (t === '') continue;
        const kk = Number(t);
        if (!byLaunch.has(kk)) byLaunch.set(kk, []);
        byLaunch.get(kk).push(i);
      }
    }
    const objs = byLaunch.get(k) || [];
    const upNow = objs.filter(objUp).length;
    const [siteName, lat, lon] = siteOf(k);
    const ok = !!L.ok[k];
    const specs = [
      ['Rocket', lvName(k)],
      ['Site', pad ? `${siteName}, pad ${pad}` : siteName],
      ['Outcome', !ok ? 'Failed' : deep ? 'Left Earth orbit' : 'Reached orbit'],
      ['Payloads', fmt(n)],
      ['Launched by', WHO[L.who[k]].name],
      ...(flight ? [['Flight', flight.replace(/\s+/g, ' ')]] : []),
      ['In the catalog', objs.length ? `${fmt(objs.length)} objects, ${fmt(upNow)} still up` : 'none in Earth orbit'],
      ['Launch ID', tag],
    ];
    const shown = names.length < n ? `${names.join(', ')} and ${fmt(n - names.length)} more` : listOf(names);
    const body = [
      names.length ? `${ok ? 'Carried' : 'Was carrying'} ${shown}.` : '',
      !ok ? 'It failed to reach orbit.' : deep ? `${deep === '1' && n === 1 ? 'It' : `${deep} of its payloads`} left Earth orbit for deep space, so ${deep === '1' && n === 1 ? 'it isn’t' : 'they aren’t'} on the globe.` : '',
      objs.length ? `The catalog tracks ${fmt(objs.length)} objects from this launch, counting rocket stages and debris; ${fmt(upNow)} are in orbit today.` : '',
      pay ? pay.note : '',
      'The timeline is at the launch; the marker is the launch site.',
    ].filter(Boolean).join(' ');
    return {
      key: `l:${k}`, found: 'launch', day: L.day[k], ship: pay ? pay.key : shipForLv(lvName(k)),
      fig: ok ? 'Launch' : 'Failed launch',
      when: `${formatDay(L.day[k])} · ${clock(L.day[k])}`,
      title: L.name[k],
      kind: `${lvName(k)} · ${WHO[L.who[k]].name}`,
      place: `Launched from ${siteName}`,
      site: siteDir(lat, lon),
      specs, body,
      footer: 'From the GCAT launch log',
    };
  }

  // from: the milestone card it was opened from (for the way back); day: where to put the timeline instead of just
  // after it reached orbit, and atNote to say so
  function openObject(i, {from = null, day = null, atNote = null} = {}) {
    const key = `o:${i}`;
    FOUND[key] = {...objectCard(i, atNote), from};
    takeOver();
    controls.autoRotate = false;
    live.playing = false;
    live.capKey = null;
    const t0 = objT0(i);
    const t1 = objT1(i);
    // an hour after it reached orbit (or broke off), so it is on the globe
    live.day = day != null ? day : Math.min(END_DAY, t1 < NO_END ? Math.min(t0 + 1 / 24, (t0 + t1) / 2) : t0 + 1 / 24);
    plateKey = null;
    openCard(key, {hold: false, resume: false});
    // look at where it will be once the camera is there, from a little to one side and above
    const p = positionOf(data, i, live.day, live.sim + 1.6 * 40, new THREE.Vector3()).applyAxisAngle(Y_AXIS, live.turn + turnRate() * 1.6);
    const r = p.length();
    const dir = p.normalize();
    const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
    const look = dir.clone().addScaledVector(side, -0.4).add(new THREE.Vector3(0, 0.3, 0)).normalize();
    live.fly = {from: camNow(), to: {dir: look, dist: Math.min(28, Math.max(3.6, r * 2.3)), target: new THREE.Vector3()}, t: 0};
    setPlayLabel();
  }

  function openLaunch(k, {from = null} = {}) {
    const key = `l:${k}`;
    FOUND[key] = {...launchCard(k), from};
    takeOver();
    controls.autoRotate = false;
    live.playing = false;
    live.capKey = null;
    live.day = Math.min(END_DAY, L.day[k] + 0.002);
    plateKey = null;
    openCard(key, {hold: false, resume: false});
    flyToDir(FOUND[key].site);
    setPlayLabel();
  }

  // the list
  let shown = [];
  let active = -1;
  const describe = (h) => {
    if (h.type === 'm') {
      const c = CARD_OF(h.key);
      const m = MILESTONES.find((x) => x.key === h.key);
      return {name: c.title, sub: `Milestone card · ${formatDay(m.day)}`, color: 'var(--accent)', mark: 'm'};
    }
    if (h.type === 'o') {
      const t = rowOf(h.i);
      const c = objCat(h.i);
      const end = objUp(h.i) ? 'in orbit' : `${endWord(t[11]).toLowerCase()} ${yearOf(objT1(h.i))}`;
      return {name: t[0], sub: [KIND1[c], countryOf(t[5]), yearOf(objT0(h.i)), end].filter(Boolean).join(' · '), color: rgb(CATS[c].color), mark: 'o'};
    }
    const k = h.k;
    return {name: L.name[k], sub: `Launch · ${formatDay(L.day[k])} · ${lvName(k)}${L.ok[k] ? '' : ' · failed'}`, color: L.ok[k] ? 'var(--accent)' : 'var(--breakup)', mark: 'l'};
  };
  const setActive = (k) => {
    active = k;
    for (const li of findList.querySelectorAll('.find-item')) li.setAttribute('aria-selected', String(Number(li.dataset.k) === k));
    const el = findList.querySelector(`[data-k="${k}"]`);
    if (el) {
      findQ.setAttribute('aria-activedescendant', el.id);
      el.scrollIntoView({block: 'nearest'});
    } else findQ.removeAttribute('aria-activedescendant');
  };
  const renderFind = (hits, note) => {
    findList.textContent = '';
    shown = hits;
    if (note) {
      const li = document.createElement('li');
      li.className = 'find-note';
      li.textContent = note;
      findList.append(li);
    }
    hits.forEach((h, k) => {
      const d = describe(h);
      const li = document.createElement('li');
      li.className = `find-item ${d.mark}`;
      li.id = `find-${k}`;
      li.dataset.k = k;
      li.setAttribute('role', 'option');
      const dot = document.createElement('span');
      dot.className = 'fi-dot';
      dot.style.background = d.color;
      const main = document.createElement('span');
      main.className = 'fi-main';
      const nm = document.createElement('span');
      nm.className = 'fi-name';
      nm.textContent = d.name;
      const sb = document.createElement('span');
      sb.className = 'fi-sub';
      sb.textContent = d.sub;
      main.append(nm, sb);
      li.append(dot, main);
      findList.append(li);
    });
    findList.hidden = !findList.children.length;
    findQ.setAttribute('aria-expanded', String(!findList.hidden));
    titleEl.classList.toggle('finding', !findList.hidden);
    setActive(hits.length ? 0 : -1);
  };
  const runFind = () => {
    const q = norm(findQ.value);
    if (!q) {
      renderFind([], '');
      return;
    }
    if (!search) {
      const hits = MILESTONE_TEXT.filter((m) => norm(m.text).includes(q)).map((m) => ({type: 'm', key: m.key}));
      renderFind(hits, loading ? 'Loading the whole catalog…' : 'The catalog could not load. Try again in a moment.');
      return;
    }
    const res = search(findQ.value);
    const note = !res.total
      ? 'No matches. Try a name, a catalog number like 25544 or an ID like 1998-067A.'
      : res.total > res.hits.length
        ? `${fmt(res.total)} matches · the top ${res.hits.length}; type more to narrow it down`
        : `${fmt(res.total)} ${res.total === 1 ? 'match' : 'matches'}`;
    renderFind(res.hits, note);
  };
  // resolves true once the index is in, false if it can't load (never rejects)
  const loadSearch = () => {
    if (search) return Promise.resolve(true);
    if (loading) return loading;
    if (!MODELS.search) return Promise.resolve(false);
    loading = fetch(MODELS.search)
      .then((r) => {
        if (!r.ok) throw new Error(`search index ${r.status}`);
        return r.text();
      })
      .then((text) => {
        index = parseIndex(text);
        search = buildSearch(index, {objCat, objUp, launchText, milestones: MILESTONE_TEXT, famous: [25544, 20580, 48274, 16609]});
        loading = null;
        if (document.activeElement === findQ) runFind();
        return true;
      })
      .catch((err) => {
        console.error(err);
        loading = null;
        if (document.activeElement === findQ) runFind();
        return false;
      });
    return loading;
  };

  // the milestone cards' buttons: open the satellite's card (its orbit, a ring on the globe, the timeline when it
  // reached orbit, or for a debris event just before the breakup) or the launch's, and back to the milestone
  let satRow = null;
  const rowOfSat = (sc) => {
    if (!satRow) satRow = new Map(index.obj.map((line, i) => [line.split('\t', 3)[2], i]));
    return satRow.has(String(sc)) ? satRow.get(String(sc)) : -1;
  };
  const launchOfShip = (key) => {
    const sh = SHIP[key];
    let best = -1;
    for (let k = Math.max(0, lastLaunch(L, sh.day + 0.05) - 3); k < L.n && L.day[k] <= sh.day + 0.05; k += 1) {
      if (Math.abs(L.day[k] - sh.day) < 0.05 && (best < 0 || Math.abs(L.day[k] - sh.day) < Math.abs(L.day[best] - sh.day))) best = k;
    }
    return best;
  };
  // A launch that carried one of the milestone ships shows that ship's model instead of its rocket's (the rockets
  // in the lineup keep theirs). Spirit, which has no card of its own, shows its identical twin Opportunity.
  const TWIN = {'2003-027': ['opportunity', 'Spirit was a Mars rover, the identical twin of Opportunity, shown here. It landed in Gusev Crater in January 2004 and drove on Mars until it got stuck in soft sand in 2009; it last called home in March 2010.']};
  let shipOfLaunch = null;
  function payloadShip(k) {
    if (!shipOfLaunch) {
      shipOfLaunch = new Map();
      for (const sh of SHIPS) {
        const link = LINKS[sh.key];
        let kk = -1;
        if (Array.isArray(link)) {
          const i = rowOfSat(link[0][0]);
          const t = i >= 0 ? index.obj[i].split('\t', 10)[9] : '';
          if (t !== '') kk = Number(t);
        } else if (link === 'launch') kk = launchOfShip(sh.key);
        if (kk < 0 || shipOfLaunch.has(kk)) continue;
        const noun = sh.kind.split(' · ')[0].replace(/^(Lunar|Crewed|Communications|Weather|Space|Solar|Comet|Asteroid|Earth|Satellite|Telescope|Relay|Cargo|Internet|Heavy|Reusable|Joint|Fully|Rocket)\b/, (w) => w.toLowerCase());
        const note = sh.key in LINEUP_NAMES ? '' : `The model is ${sh.title}, ${/^[aeiouAEIOU]/.test(noun) ? 'an' : 'a'} ${noun}.`;
        shipOfLaunch.set(kk, {key: sh.key, note});
      }
      for (const [tag, [key, note]] of Object.entries(TWIN)) {
        const kk = index.lau.findIndex((line) => line.startsWith(`${tag}\t`));
        if (kk >= 0) shipOfLaunch.set(kk, {key, note});
      }
    }
    return shipOfLaunch.get(k) || null;
  }
  actsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.plate-act');
    if (!b || b.disabled) return;
    const {act, key} = b.dataset;
    if (act === 'back') {
      openMilestone(key);
      return;
    }
    b.disabled = true;
    loadSearch().then((ok) => {
      b.disabled = false;
      if (!ok) return;
      if (act === 'orbit') {
        const i = rowOfSat(b.dataset.sc);
        if (i < 0) return;
        const m = MILESTONES.find((x) => x.key === key);
        // a debris event: the satellite just before it broke up, so the timeline stays at the milestone
        if (m && m.ev) openObject(i, {from: key, day: Math.max(objT0(i) + 1 / 24, m.ev.t - 0.02), atNote: 'The timeline is just before it broke up'});
        else openObject(i, {from: key});
      } else if (act === 'launch') {
        const k = launchOfShip(key);
        if (k >= 0) openLaunch(k, {from: key});
      }
    });
  });
  const closeFind = () => {
    findList.hidden = true;
    findQ.setAttribute('aria-expanded', 'false');
    titleEl.classList.remove('finding');
  };
  const pick = (h) => {
    if (!h) return;
    closeFind();
    findQ.setAttribute('aria-expanded', 'false');
    findQ.blur();
    if (h.type === 'm') openMilestone(h.key);
    else if (h.type === 'o') openObject(h.i);
    else openLaunch(h.k);
  };
  if (!MODELS.search) findForm.hidden = $('find-open').hidden = true;
  // the phone's Search button: leave the tour, close the card that covers the box, and open the box
  $('find-open').addEventListener('click', () => {
    takeOver();
    live.card = null;
    setPlayLabel();
    findQ.focus();
  });
  let findTimer = 0;
  findQ.addEventListener('focus', () => {
    loadSearch();
    if (norm(findQ.value)) runFind();
  });
  findQ.addEventListener('input', () => {
    loadSearch();
    clearTimeout(findTimer);
    findTimer = setTimeout(runFind, search ? 60 : 0);
  });
  findQ.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (shown.length) setActive((active + (e.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(findTimer);
      if (findList.hidden) runFind();
      else pick(shown[active]);
    } else if (e.key === 'Escape') closeFind();
  });
  findForm.addEventListener('submit', (e) => e.preventDefault());
  findList.addEventListener('pointerdown', (e) => e.preventDefault());
  findList.addEventListener('click', (e) => {
    const li = e.target.closest('.find-item');
    if (li) pick(shown[Number(li.dataset.k)]);
  });
  document.addEventListener('pointerdown', (e) => {
    if (!findForm.contains(e.target)) closeFind();
  });

  // drag a ship's model to turn it; it keeps spinning a little after you let go
  {
    let drag = null;
    plateView.addEventListener('pointerdown', (e) => {
      if (!live.card && live.mode !== 'tour') return;
      // the large-view button is a button, not a place to start turning the model
      if (e.target.closest('.plate-big')) return;
      drag = {x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId};
      live.dragging = true;
      live.spinV = 0;
      plateView.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    plateView.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const now = performance.now();
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      live.spin += dx * 0.6;
      live.tilt = Math.max(-45, Math.min(55, live.tilt + dy * 0.35));
      live.spinV = (dx * 0.6) / Math.max(0.008, (now - drag.t) / 1000);
      Object.assign(drag, {x: e.clientX, y: e.clientY, t: now});
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (performance.now() - drag.t > 80) live.spinV = 0;
      drag = null;
      live.dragging = false;
    };
    plateView.addEventListener('pointerup', end);
    plateView.addEventListener('pointercancel', end);
  }

  // any drag or wheel on the globe during the tour hands the camera over
  const takeOver = () => {
    if (live.mode === 'tour') explore({day: T.tourDay(live.tourT)});
    live.fly = null;
  };
  canvas.addEventListener('pointerdown', takeOver, {capture: true});
  canvas.addEventListener('wheel', takeOver, {capture: true, passive: true});
  controls.connect(canvas);

  // ---------------------------------------------------------- the large view: the card's model, full screen, with its details
  // Drag to turn, scroll or pinch to zoom, right-drag or two fingers to move, double-click (or double-tap) to start
  // again; it turns slowly on its own until touched. While it's open the timeline, the tour and the card wait.
  const bigEl = $('big');
  const bigView = $('big-view');
  const bigCam = new THREE.PerspectiveCamera(30, 1, 0.01, 1e5);
  const bigControls = new OrbitControls(bigCam, bigView);
  Object.assign(bigControls, {enableDamping: true, dampingFactor: 0.08, rotateSpeed: 0.75, zoomSpeed: 0.9, screenSpacePanning: true, autoRotate: true, autoRotateSpeed: 0.9});
  bigControls.addEventListener('start', () => {
    bigControls.autoRotate = false;
  });
  let big = null;
  const coarse = window.matchMedia('(pointer: coarse)');
  const frameBig = () => {
    const w = bigView.clientWidth;
    const h = bigView.clientHeight;
    const f = stageShips.frameFree(big.ship, bigCam, w, h);
    if (!f) return;
    bigControls.target.set(0, 0, 0);
    bigControls.minDistance = f.size * 0.06;
    bigControls.maxDistance = f.dist * 3.5;
    bigControls.autoRotate = true;
    bigControls.update();
    big.framed = true;
  };
  const openBig = () => {
    // the card on screen (in the tour too, where it isn't live.plateKey)
    const sh = plateKey && CARD_OF(plateKey);
    const mdl = sh && (SHIP[plateKey] || (sh.ship ? SHIP[sh.ship] : null));
    if (!mdl || CAPTURE) return;
    // the timeline waits: a playing timeline stops, and the card loses its countdown so it's still there afterwards
    if (live.mode !== 'tour') {
      live.playing = false;
      if (live.card) Object.assign(live.card, {until: 0, resume: false});
      setPlayLabel();
    }
    big = {ship: mdl, spin: live.spin, framed: false};
    $('big-fig').textContent = $('plate-fig').textContent;
    $('big-when').textContent = $('plate-when').textContent;
    $('big-title').textContent = sh.title;
    $('big-kind').textContent = sh.kind || '';
    // the card's details beside the model: where it launched from, its specs and what it did
    $('big-site').textContent = $('plate-site').textContent;
    $('big-site').hidden = $('plate-site').hidden || !$('plate-site').textContent;
    $('big-specs').replaceChildren(...[...$('plate-specs').children].map((n) => n.cloneNode(true)));
    $('big-body').textContent = $('plate-body').textContent;
    $('big-info').scrollTop = 0;
    $('big-hint').textContent = coarse.matches
      ? 'Drag to turn · pinch to zoom · two fingers to move · double-tap to start again'
      : 'Drag to turn · scroll to zoom · right-drag to move · double-click to start again';
    bigEl.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    bigView.prepend(shipCanvas);
    if (!stageShips.ready(mdl)) wantShips([mdl]);
    $('big-close').focus();
  };
  const closeBig = () => {
    if (!big) return;
    big = null;
    bigEl.hidden = true;
    document.documentElement.style.overflow = '';
    plateView.prepend(shipCanvas);
    $('plate-big').focus();
  };
  const renderBig = (dt) => {
    if (!big.framed) frameBig();
    bigControls.update(dt);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    stageShips.renderFree(big.ship, bigCam, bigControls.target, big.spin, bigView.clientWidth, bigView.clientHeight, dpr);
  };
  $('plate-big').addEventListener('click', openBig);
  $('big-close').addEventListener('click', closeBig);
  bigView.addEventListener('dblclick', () => {
    if (big) big.framed = false;
  });
  // a double-tap, for touch screens that don't send dblclick
  let lastTap = 0;
  bigView.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch') return;
    const now = performance.now();
    if (now - lastTap < 320 && big) big.framed = false;
    lastTap = now;
  });
  bigEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeBig();
    // keep the keyboard in the dialog: the close button and the details (which scroll with the arrow keys)
    if (e.key === 'Tab') {
      e.preventDefault();
      (document.activeElement === $('big-close') ? $('big-info') : $('big-close')).focus();
    }
  });

  playBtn.addEventListener('click', () => {
    if (live.mode === 'tour') live.tourPlaying = !live.tourPlaying;
    else if (live.playing) {
      // pausing keeps any card open, without its countdown
      live.playing = false;
      if (live.card) Object.assign(live.card, {until: 0, resume: false});
    } else {
      if (live.day >= END_DAY - 0.5) live.day = START_DAY;
      live.playing = true;
      // playing on from a card: close it and carry on
      if (live.card && !(live.card.until > performance.now())) live.card = null;
      else if (live.card) live.card.resume = true;
    }
    setPlayLabel();
  });
  speedBtn.addEventListener('click', () => {
    live.speed = (live.speed + 1) % SPEEDS.length;
    setPlayLabel();
  });
  tourBtn.addEventListener('click', () => {
    if (live.mode === 'tour') {
      explore({day: END_DAY});
      live.card = null;
      live.fly = {from: camNow(), to: {dir: T.sphericalDir(40, 18), dist: 11, target: new THREE.Vector3()}, t: 0};
      live.capKey = 'today';
      live.capUntil = performance.now() + 9000;
    } else startTour();
    setPlayLabel();
  });
  range.addEventListener('pointerdown', () => {
    live.scrubbing = true;
  });
  window.addEventListener('pointerup', () => {
    live.scrubbing = false;
  });
  range.addEventListener('input', () => {
    takeOver();
    live.day = Number(range.value);
    live.playing = false;
    live.capKey = null;
    live.card = null;
    setPlayLabel();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' && (e.target === document.body || e.target === canvas)) {
      e.preventDefault();
      playBtn.click();
    }
  });

  new ResizeObserver(layout).observe(stage);
  layout();

  // start: the tour, unless the visitor prefers less motion
  if (reducedMotion) {
    live.mode = 'explore';
    live.day = END_DAY;
    live.sim = 61000;
    const cam = {dir: T.sphericalDir(40, 18), dist: 11, target: new THREE.Vector3()};
    camera.position.copy(cam.dir).multiplyScalar(cam.dist);
    controls.update();
  }
  setPlayLabel();

  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
  let visible = true;
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
  }).observe(stage);

  const frame = (nowMs) => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (nowMs - live.last) / 1000);
    live.last = nowMs;
    if (!visible || document.hidden) return;
    if (big) {
      renderBig(dt);
      return;
    }
    if (live.mode === 'tour') {
      if (live.tourPlaying) live.tourT += dt;
      if (live.tourT >= T.TOUR_DURATION) {
        live.tourT = T.TOUR_DURATION;
        explore({day: END_DAY});
        controls.autoRotate = true;
        setPlayLabel();
      } else {
        const tp = T.plateAt(live.tourT);
        if ((tp && tp.key) !== live.tourCard) {
          live.tourCard = tp && tp.key;
          Object.assign(live, {spin: 0, tilt: 0, spinV: 0});
        }
        if (!live.dragging) live.spin += dt * live.spinV;
        live.spinV *= Math.exp(-dt * 2.5);
        tourFrame(live.tourT, {spin: live.spin, tilt: live.tilt});
        live.turn = T.tourTurn(live.tourT);
        $('plate-hold').hidden = true;
        return;
      }
    }
    // explore
    const sp = SPEEDS[live.speed];
    const before = live.day;
    const card = live.card;
    // a card's countdown waits while the visitor turns the model
    if (card && card.until && live.dragging) card.until += dt * 1000;
    const holding = !!card && card.until > nowMs;
    if (card && card.until && !holding) {
      // countdown over: carry on playing, or leave the card open if the timeline is paused
      card.until = 0;
      if (card.resume && live.playing) live.card = null;
      setPlayLabel();
    }
    let warp = sp.warp;
    if (holding && card.kind === 'event') {
      live.day = Math.min(END_DAY, live.day + EVENT_RATE * dt);
      warp = SPEEDS[0].warp;
    } else if (holding || (card && card.kind === 'found' && !live.playing)) {
      warp = 40;
    } else if (live.playing) {
      live.day = Math.min(END_DAY, live.day + sp.days * dt);
      if (live.day >= END_DAY) {
        live.playing = false;
        setPlayLabel();
      }
      // stop at the first milestone passed this frame
      let next = null;
      for (const sh of SHIPS) {
        const d = SHIP[sh.key].day;
        if (before < d && live.day >= d && (!next || d < next.d)) next = {d, sh};
      }
      for (const ev of events) {
        if (ev.kind === 'breakup' && before < ev.t && live.day >= ev.t && (!next || ev.t < next.d)) next = {d: ev.t, ev};
      }
      if (next && next.sh) atShip(SHIP[next.sh.key], {resume: true});
      else if (next) atBreakup(next.ev, {resume: true});
    }
    if (!reducedMotion || live.playing || holding) live.sim += dt * warp;
    live.turn += dt * turnRate();
    world.rotation.y = live.turn;
    const moved = Math.abs(live.day - before) / Math.max(dt, 1e-3);
    live.rate += (moved - live.rate) * Math.min(1, dt * 6);
    const cardOn = !!live.card;
    live.room += ((cardOn ? 1 : 0) - live.room) * Math.min(1, dt * 5);
    if (!cardOn && live.room < 0.003) {
      live.room = 0;
      live.plateKey = null;
    }
    setRoom(live.room);
    // the model turns slowly on its own, and by hand
    live.spinV *= Math.exp(-dt * 2.5);
    if (!live.dragging) live.spin += dt * (9 + live.spinV);
    const local = live.card ? (nowMs - live.card.t0) / 1000 : 99;
    const shownShip = live.plateKey && SHIP[live.plateKey];
    const shownFound = live.plateKey && FOUND[live.plateKey];
    showMarker(shownShip ? shownShip.site : shownFound && shownFound.site ? shownFound.site : null, live.room, local);
    placeFound(shownFound && shownFound.obj != null ? shownFound.obj : null, live.day, live.sim, live.room);
    legend.style.opacity = (1 - live.room).toFixed(3);
    if (live.fly) {
      live.fly.t = Math.min(1, live.fly.t + dt / 1.6);
      const w = ease(live.fly.t);
      const {from, to} = live.fly;
      const dir = from.dir.clone().lerp(to.dir, w).normalize();
      const dist = from.dist + (to.dist - from.dist) * w;
      controls.target.copy(from.target).lerp(to.target, w);
      camera.position.copy(controls.target).addScaledVector(dir, dist);
      if (live.fly.t >= 1) live.fly = null;
    } else if (live.mode === 'explore' && !live.capKey && !(live.card && live.card.kind === 'event')) {
      controls.target.multiplyScalar(1 - Math.min(1, dt * 0.6));
    }
    controls.update();
    pulses.points.visible = true;
    draw(live.day, live.sim, Math.max(0.03, live.rate * 0.3), null);
    hud(live.day, {showTime: holding || (live.playing ? sp.days < 3 : live.rate < 3 && live.rate > 0.01)});
    showPlate(live.room > 0.003 ? live.plateKey : null, live.room, live.spin, {tilt: live.tilt, local});
    // the card's footer: arrows to the milestones either side, and the countdown while the timeline waits on it
    const holdEl = $('plate-hold');
    holdEl.hidden = !live.card;
    if (live.card) {
      const showHold = live.card.until > nowMs;
      const i = MILESTONES.findIndex((x) => x.key === live.card.key);
      const foundCard = FOUND[live.card.key];
      $('plate-prev').hidden = !!foundCard;
      $('plate-after').hidden = !!foundCard;
      $('plate-prev').disabled = i <= 0;
      $('plate-after').disabled = i >= MILESTONES.length - 1;
      $('plate-count').hidden = showHold;
      $('plate-barwrap').hidden = !showHold;
      $('plate-next').hidden = !(showHold && live.card.resume);
      if (showHold) $('plate-bar').style.width = `${(100 * (1 - (live.card.until - nowMs) / live.card.total)).toFixed(1)}%`;
      else $('plate-count').textContent = foundCard ? foundCard.footer : `${i + 1} of ${MILESTONES.length}`;
    }
    if (live.capKey && nowMs < live.capUntil) {
      const left = (live.capUntil - nowMs) / 1000;
      showCaption(live.capKey, Math.min(1, left / 0.6));
    } else {
      live.capKey = null;
      showCaption(null, 0);
    }
  };
  requestAnimationFrame(frame);
}

const boot = async () => {
  try {
    const bytes = await loadCatalog();
    const data = decode(bytes, meta);
    const events2 = events.map((ev) => ({...ev}));
    const {tracks} = prepare(data, events2, T.tourSimAtDay);
    // the first Starlink launch: follow the middle of its train
    const first = data.o3.indexOf(1);
    if (first >= 0) {
      const train = [];
      for (let j = first; j < data.n && data.o1[j * 4 + 3] === data.o1[first * 4 + 3]; j += 1) {
        if (data.o3[j] === 1 && data.o0[j * 4 + 3] === data.o0[first * 4 + 3]) train.push(j);
      }
      tracks.starlink = {index: train[Math.floor(train.length / 2)]};
    }
    window.__DATA = CAPTURE || CARD ? data : undefined;
    main(data, tracks);
  } catch (err) {
    console.error(err);
    $('no-webgl').hidden = false;
    $('no-webgl').textContent = 'This page could not load its data. Reload to try again.';
  }
};
boot();
