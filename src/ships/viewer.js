// The spec plate's 3D view: one ship at a time, slowly turning, lit like a studio photograph, in metres. Also lines
// the rockets up side by side to scale for the ending.
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {BUILDERS, materials} from './build.js';

const DEG = Math.PI / 180;
const FOV = 22;
const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Small corrections to NASA's models: colours their files leave out, and a stray texture.
const PAINTS = {
  // Mercury capsules were covered in dark shingles
  mercury: (root) => {
    root.traverse((o) => {
      if (o.isMesh) o.material = new THREE.MeshStandardMaterial({color: 0x2a2c30, roughness: 0.42, metalness: 0.65});
    });
  },
  // the band between the first and second stages is white in photographs; the file maps a blue texture there
  saturn: (root) => {
    root.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.map && m.map.image && looksBlue(m.map.image)) {
          m.map = null;
          m.color.set(0xf2f2ee);
          m.needsUpdate = true;
        }
      }
    });
  },
  mir: (root) => {
    root.traverse((o) => {
      if (o.isMesh) o.material = new THREE.MeshStandardMaterial({color: 0xd9d6cc, roughness: 0.55, metalness: 0.15});
    });
  },
  // the arrays are dark blue cells, not wood-coloured
  hubble: (root) => {
    root.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        m.roughness = Math.min(m.roughness ?? 0.6, 0.55);
        m.metalness = Math.max(m.metalness ?? 0, 0.35);
      });
    });
  },
  // solar arrays the files colour purple: dark blue cells
  cells: (root) => {
    root.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (/Solar.*Face|^shiny_panel$|^SolarArrays$/i.test(m.name)) o.material = materials().cells;
    });
  },
  // the file colours Galileo's black blankets blue; its foil and antenna ribs gold
  galileo: (root) => {
    root.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (/black/i.test(m.name)) o.material = new THREE.MeshStandardMaterial({color: 0x1d1e21, roughness: 0.6, metalness: 0.2});
      else if (/gold/i.test(m.name)) o.material = new THREE.MeshStandardMaterial({color: 0xc9963a, roughness: 0.35, metalness: 0.85, transparent: m.transparent, opacity: m.opacity});
      else o.material = new THREE.MeshStandardMaterial({color: 0xc8ccd0, roughness: 0.35, metalness: 0.8});
    });
  },
  iss: (root) => {
    root.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (/Solar/i.test(m.name)) {
        o.material = materials().cells;
      } else if (/Brown/i.test(m.name)) {
        m.color.set(0xb8913f);
        m.metalness = 0.8;
        m.roughness = 0.35;
      } else {
        m.roughness = 0.5;
        m.metalness = 0.3;
      }
    });
  },
};
function looksBlue(img) {
  try {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 8;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, 8, 8);
    const d = g.getImageData(0, 0, 8, 8).data;
    let r = 0;
    let b = 0;
    for (let k = 0; k < d.length; k += 4) {
      r += d[k];
      b += d[k + 2];
    }
    return b > r * 1.6;
  } catch (e) {
    return false;
  }
}

export function createShipStage(canvas, {modelUrl, preserve = false}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true, preserveDrawingBuffer: preserve});
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  const key = new THREE.DirectionalLight(0xfff2e2, 2.6);
  const rim = new THREE.DirectionalLight(0x9db8ff, 1.7);
  scene.add(key, rim, new THREE.HemisphereLight(0x8090a8, 0x101010, 0.35));
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 10000);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const loadNasa = (name) =>
    new Promise((resolve, reject) => loader.load(modelUrl(name), (g) => resolve(g.scene), undefined, reject));

  const cache = new Map();
  const prepare = async (ship) => {
    materials();
    const [kind, name] = ship.model.src.split(':');
    const obj = kind === 'nasa' ? await loadNasa(name) : await BUILDERS[name](loadNasa);
    const inner = new THREE.Group();
    inner.add(obj);
    if (kind === 'nasa') {
      const [axis, metres] = ship.model.size;
      const b = new THREE.Box3().setFromObject(obj);
      const s = b.getSize(new THREE.Vector3());
      obj.scale.multiplyScalar(metres / s[axis]);
      if (ship.model.paint) PAINTS[ship.model.paint](obj);
    }
    if (ship.model.rot) inner.rotation.set(...ship.model.rot.map((v) => v * DEG));
    inner.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inner);
    // frame: only this many metres around the model's own origin count for the framing (Ulysses' 72 m antenna runs
    // off the card)
    if (ship.model.frame) {
      const c0 = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
      const half = new THREE.Vector3().setScalar(ship.model.frame / 2);
      box.intersect(new THREE.Box3(c0.clone().sub(half), c0.clone().add(half)));
    }
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const pivot = new THREE.Group();
    inner.position.sub(centre);
    pivot.add(inner);
    // the widest the model gets as it turns about its vertical axis
    let rxz = 0;
    for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) rxz = Math.max(rxz, Math.hypot(x - centre.x, z - centre.z));
    pivot.visible = false;
    scene.add(pivot);
    return {pivot, size, rxz};
  };
  const load = (ship) => {
    if (!cache.has(ship.key)) cache.set(ship.key, prepare(ship).then((p) => (cache.get(ship.key).ready = p)));
    return cache.get(ship.key);
  };
  const ready = (ship) => cache.get(ship.key)?.ready || null;

  let W = 0;
  let H = 0;
  const size = (w, h, dpr) => {
    if (w !== W || h !== H || renderer.getPixelRatio() !== dpr) {
      W = w;
      H = h;
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
    }
  };
  const hideAll = () => {
    for (const v of cache.values()) {
      if (!v.ready) continue;
      v.ready.pivot.visible = false;
      v.ready.pivot.scale.setScalar(1);
    }
  };
  const lightFrom = (camDir) => {
    // key light from the upper right of the camera, rim light from behind on the left
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), camDir).normalize();
    key.position.copy(camDir).multiplyScalar(6).addScaledVector(right, -5).add(new THREE.Vector3(0, 7, 0));
    rim.position.copy(camDir).multiplyScalar(-7).addScaledVector(right, 6).add(new THREE.Vector3(0, 2, 0));
  };
  const project = (v) => {
    const p = v.clone().project(camera);
    return [((p.x + 1) / 2) * W, ((1 - p.y) / 2) * H];
  };

  // One ship, turned to spinDeg. Returns where its top and bottom land on screen and pixels per metre, for the
  // dimension lines, or null while its model is still loading.
  function render(ship, spinDeg, w, h, dpr, tiltDeg = 0) {
    size(w, h, dpr);
    hideAll();
    const p = ready(ship);
    if (!p) {
      renderer.clear();
      return null;
    }
    const [az, el0, fill] = ship.model.view;
    const el = Math.max(-60, Math.min(75, el0 + tiltDeg));
    p.pivot.visible = true;
    p.pivot.position.set(0, 0, 0);
    p.pivot.rotation.set(0, (az + spinDeg) * DEG, 0);
    camera.aspect = w / h;
    camera.fov = FOV;
    camera.updateProjectionMatrix();
    const tv = Math.tan((FOV * DEG) / 2);
    const th = tv * camera.aspect;
    const dist = Math.max(p.size.y / 2 / tv, p.rxz / th) / fill + p.rxz;
    const dir = new THREE.Vector3(0, Math.sin(el * DEG), Math.cos(el * DEG));
    camera.position.copy(dir).multiplyScalar(dist);
    camera.lookAt(0, 0, 0);
    camera.near = dist / 50;
    camera.far = dist * 10;
    camera.updateProjectionMatrix();
    lightFrom(dir);
    renderer.render(scene, camera);
    const top = project(new THREE.Vector3(0, p.size.y / 2, 0));
    const bottom = project(new THREE.Vector3(0, -p.size.y / 2, 0));
    const edge = project(new THREE.Vector3(1, 0, 0));
    const mid = project(new THREE.Vector3(0, 0, 0));
    return {top, bottom, ppm: Math.hypot(edge[0] - mid[0], edge[1] - mid[1]), rxzPx: p.rxz * Math.hypot(edge[0] - mid[0], edge[1] - mid[1]), height: p.size.y};
  }

  // Several ships side by side on one ground line, to scale. Returns each one's screen position and height.
  function renderLineup(ships, spinDeg, w, h, dpr) {
    size(w, h, dpr);
    hideAll();
    const ps = ships.map(ready);
    if (ps.some((p) => !p)) {
      renderer.clear();
      return null;
    }
    const gap = 24;
    let x = 0;
    const xs = ps.map((p) => {
      const at = x + p.rxz;
      x += p.rxz * 2 + gap;
      return at;
    });
    const width = x - gap;
    const tall = Math.max(...ps.map((p) => p.size.y));
    ps.forEach((p, k) => {
      p.pivot.visible = true;
      p.pivot.position.set(xs[k] - width / 2, p.size.y / 2 - tall / 2, 0);
      p.pivot.rotation.set(0, (ships[k].model.view[0] + spinDeg) * DEG, 0);
    });
    camera.aspect = w / h;
    camera.fov = FOV;
    camera.updateProjectionMatrix();
    const tv = Math.tan((FOV * DEG) / 2);
    const dist = Math.max(tall / 2 / tv / 0.8, width / 2 / (tv * camera.aspect) / 0.9);
    const dir = new THREE.Vector3(0, Math.sin(4 * DEG), Math.cos(4 * DEG));
    camera.position.copy(dir).multiplyScalar(dist);
    camera.lookAt(0, 0, 0);
    camera.near = dist / 50;
    camera.far = dist * 10;
    camera.updateProjectionMatrix();
    lightFrom(dir);
    renderer.render(scene, camera);
    return ps.map((p, k) => ({
      top: project(new THREE.Vector3(xs[k] - width / 2, p.size.y - tall / 2, 0)),
      bottom: project(new THREE.Vector3(xs[k] - width / 2, -tall / 2, 0)),
      height: p.size.y,
    }));
  }

  // The narrated video's finale, u seconds in (times in F, from src/tour.js, set from the words of its line). The
  // rockets rise into place to scale as they are named, the camera backing off as each taller one comes up so none is
  // cut off; on "this is what they carried" they lift off and the camera drops to the ground, where every ship on the
  // page flies across the screen one at a time, in launch order, slowing in the middle as its era is named. Returns
  // where to put the labels and the ground line, or null while the models load.
  const backOut = (x) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2;
  // the time each index reaches its key, interpolated between the keys ([[time, index], ...], increasing)
  const timeOf = (keys, i) => {
    if (i <= keys[0][1]) return keys[0][0] - (keys[0][1] - i) * (keys.length > 1 ? (keys[1][0] - keys[0][0]) / Math.max(1, keys[1][1] - keys[0][1]) : 1);
    for (let k = 1; k < keys.length; k += 1) {
      const [t0, i0] = keys[k - 1];
      const [t1, i1] = keys[k];
      if (i <= i1) return t0 + ((t1 - t0) * (i - i0)) / Math.max(1e-6, i1 - i0);
    }
    const [tA, iA] = keys[keys.length - 2] || keys[0];
    const [tB, iB] = keys[keys.length - 1];
    return tB + (i - iB) * ((tB - tA) / Math.max(1, iB - iA));
  };
  const S = 20; // metres per ship in the second part, which shares the rockets' ground
  const SLOT = 1.36 * S; // one ship per slot along the row; the biggest ship, stopped on and enlarged, still clears its neighbours
  const FOCUS = 0.45; // how much bigger a ship grows while the words name it
  // the finale: rockets is LINEUP, all is every ship in launch order, belt the slot in the middle of the screen
  // (src/tour.js beltAt) and focus [[ship, 0..1]] the ships being talked about (focusAt)
  function renderFinale(rockets, all, u, w, h, dpr, F, belt, focus, row) {
    size(w, h, dpr);
    hideAll();
    const rs = rockets.map(ready);
    const ps = all.map(ready);
    if (rs.some((p) => !p) || ps.some((p) => !p)) {
      renderer.clear();
      return null;
    }
    camera.aspect = w / h;
    camera.fov = FOV;
    const tv = Math.tan((FOV * DEG) / 2);
    const th = tv * camera.aspect;
    const spin = u * 14;
    const labels = [];
    // the rockets, to scale, side by side on one ground line
    const gap = 24;
    let x = 0;
    const xs = rs.map((p) => {
      const at = x + p.rxz;
      x += p.rxz * 2 + gap;
      return at;
    });
    const width = x - gap;
    const tall = Math.max(...rs.map((p) => p.size.y));
    const groundY = -tall / 2;
    const riseT = rs.map((_, k) => timeOf(F.rise, k));
    rs.forEach((p, k) => {
      const g = backOut(clamp01((u - riseT[k]) / 0.75));
      if (g <= 0.001) return;
      // lift-off, left to right: up and away with a rocket's acceleration
      const lt = Math.max(0, u - F.carry - 0.12 * k);
      const lift = 0.4 * tall * lt * lt;
      if (lift > tall * 4) return;
      p.pivot.visible = true;
      p.pivot.scale.setScalar(Math.max(0.001, g));
      p.pivot.position.set(xs[k] - width / 2, (p.size.y / 2) * g + groundY + lift, 0);
      p.pivot.rotation.set(0, (rockets[k].model.view[0] + spin * 0.25) * DEG, 0);
      const o = Math.min(1, g) * (1 - smooth(clamp01(lt / 0.5)));
      if (o > 0.01) labels.push({kind: 'rocket', k, at: new THREE.Vector3(xs[k] - width / 2, p.size.y * g + groundY + lift, 0), o});
    });
    // camera on the rockets: starts on Juno I, always far enough back for the tallest one standing so far (it starts
    // backing off just before a taller one rises, so Saturn V and Starship are never cut off); heights and span grow
    // in eased steps so it never jerks
    let need = rs[0].size.y;
    let right = xs[0] + rs[0].rxz;
    let tallSoFar = need;
    rs.forEach((p, k) => {
      if (!k) return;
      const e = smooth(clamp01((u - riseT[k] + 0.6) / 1.0));
      const hk = Math.max(tallSoFar, p.size.y);
      need += (hk - tallSoFar) * e;
      tallSoFar = hk;
      right += (xs[k] + p.rxz - (xs[k - 1] + rs[k - 1].rxz)) * e;
    });
    const left = xs[0] - rs[0].rxz;
    const span = right - left;
    const distA = Math.max(need / 2 / tv / 0.78, span / 2 / th / 0.88);
    const lookA = new THREE.Vector3(left + span / 2 - width / 2, groundY + need * 0.56, 0);
    const dirA = new THREE.Vector3(0, Math.sin(4 * DEG), Math.cos(4 * DEG));
    // camera on the ships: a little above the row, far enough back for about four slots, drifting a little
    const hc = 0.55 * S;
    const lookB = new THREE.Vector3(Math.sin(u * 0.11) * 0.12 * S, groundY + hc, 0);
    const dirB = new THREE.Vector3(Math.sin(u * 0.08) * 0.04, 0.1, 1).normalize();
    const distB = (2.15 * SLOT) / th;
    const k = smooth(clamp01((u - F.carry - 0.8) / 2.6));
    const look = lookA.clone().lerp(lookB, k);
    const dir = dirA.clone().lerp(dirB, k).normalize();
    const dist = distA ** (1 - k) * distB ** k;
    const pos = look.clone().addScaledVector(dir, dist);
    // the ships: a row sliding right to left, one slot each (row[slot] is the ship in it), standing on the ground line and curving a little away at
    // the ends; each turns slowly the whole time, and the one the words name grows while the row stops on it
    if (u > F.carry && belt != null) {
      const grow = new Map(focus || []);
      for (let slot = Math.ceil(belt - 3.6); slot <= belt + 3.6; slot += 1) {
        const i = row[slot];
        if (i == null) continue;
        const p = ps[i];
        const d = slot - belt;
        const f = grow.get(i) || 0;
        const sc = (S * (1 + FOCUS * smooth(f))) / Math.max(p.size.y, 2 * p.rxz);
        const px = d * SLOT;
        const pz = -0.22 * S * d * d;
        p.pivot.visible = true;
        p.pivot.scale.setScalar(sc);
        p.pivot.position.set(px, groundY + 0.12 * S + (p.size.y * sc) / 2, pz);
        p.pivot.rotation.set(0, (all[i].model.view[0] + u * 24 + i * 37) * DEG, 0);
        if (f > 0.01) labels.push({kind: 'ship', i, at: new THREE.Vector3(px, groundY, pz), o: f});
      }
    }
    camera.position.copy(pos);
    camera.lookAt(look);
    const d = pos.distanceTo(look);
    camera.near = d / 60;
    camera.far = d * 40;
    camera.updateProjectionMatrix();
    lightFrom(pos.clone().sub(look).normalize());
    renderer.render(scene, camera);
    return {labels: labels.map((l) => ({...l, xy: project(l.at)})), ground: project(new THREE.Vector3(look.x, groundY, 0))};
  }

  // The large view: one ship seen from a free camera (cam, moved by OrbitControls in main.js). frameFree(ship, cam, w,
  // h) puts cam where the whole ship fills about three quarters of the view, from the card's angle, and returns its
  // distance and the ship's largest size (for the zoom limits); renderFree draws the ship turned to spinDeg.
  const BIG_FOV = 30;
  function frameFree(ship, cam, w, h) {
    const p = ready(ship);
    if (!p) return null;
    cam.fov = BIG_FOV;
    cam.aspect = w / h;
    const tv = Math.tan((BIG_FOV * DEG) / 2);
    const dist = Math.max(p.size.y / 2 / tv, p.rxz / (tv * cam.aspect)) / 0.74 + p.rxz;
    const el = Math.max(-60, Math.min(75, ship.model.view[1]));
    cam.position.set(0, Math.sin(el * DEG), Math.cos(el * DEG)).multiplyScalar(dist);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    return {dist, size: Math.max(p.size.y, 2 * p.rxz)};
  }
  function renderFree(ship, cam, target, spinDeg, w, h, dpr) {
    size(w, h, dpr);
    hideAll();
    const p = ready(ship);
    if (!p) {
      renderer.clear();
      return false;
    }
    p.pivot.visible = true;
    p.pivot.position.set(0, 0, 0);
    p.pivot.rotation.set(0, (ship.model.view[0] + spinDeg) * DEG, 0);
    const d = cam.position.distanceTo(target);
    cam.fov = BIG_FOV;
    cam.aspect = w / h;
    cam.near = d / 200;
    cam.far = d * 200;
    cam.updateProjectionMatrix();
    lightFrom(cam.position.clone().sub(target).normalize());
    renderer.render(scene, cam);
    return true;
  }

  const clear = () => {
    hideAll();
    renderer.clear();
  };
  return {load, ready, render, renderLineup, renderFinale, frameFree, renderFree, clear, renderer};
}
