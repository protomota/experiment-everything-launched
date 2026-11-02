// Ships drawn in code, in metres with +y up (nose up for rockets), from published dimensions and photos.
// Used where no free model exists: Sputnik 1, Vostok, Shenzhou, Falcon 9, Falcon Heavy, Crew Dragon, Starlink and
// Starship, plus the Shuttle's external tank and boosters (the orbiter is NASA's model).
import * as THREE from 'three';
import {ConvexGeometry} from 'three/examples/jsm/geometries/ConvexGeometry.js';

const TAU = Math.PI * 2;
const V2 = (x, y) => new THREE.Vector2(x, y);

// ------------------------------------------------------------ materials
let MATS = null;
const canvasTex = (w, h, draw, repeat = [1, 1]) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
// solar cells: deep blue cells with thin silver gaps and faint busbars, each cell a slightly different shade
const cellsTex = (cols, rows) =>
  canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#7d8590';
    g.fillRect(0, 0, w, h);
    const cw = w / 8;
    const ch = h / 8;
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 8; i += 1) {
      for (let j = 0; j < 8; j += 1) {
        const k = 0.8 + 0.25 * rnd();
        const x = i * cw + 2;
        const y = j * ch + 2;
        const grd = g.createLinearGradient(x, y, x + cw, y + ch);
        grd.addColorStop(0, `rgb(${Math.round(20 * k)},${Math.round(34 * k)},${Math.round(78 * k)})`);
        grd.addColorStop(1, `rgb(${Math.round(12 * k)},${Math.round(22 * k)},${Math.round(56 * k)})`);
        g.fillStyle = grd;
        g.fillRect(x, y, cw - 4, ch - 4);
        g.fillStyle = 'rgba(150,160,175,0.28)';
        g.fillRect(x + (cw - 4) / 3, y, 1, ch - 4);
        g.fillRect(x + (2 * (cw - 4)) / 3, y, 1, ch - 4);
      }
    }
  }, [cols / 8, rows / 8]);
// a height field (0..1, computed in plain JS so it looks the same in every browser), turned into a tiling normal map
const normalTex = (w, h, height, strength, repeat = [1, 1]) => {
  const H = height(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const out = g.createImageData(w, h);
  const d = out.data;
  for (let y = 0; y < h; y += 1) {
    const up = ((y + h - 1) % h) * w;
    const dn = ((y + 1) % h) * w;
    const row = y * w;
    for (let x = 0; x < w; x += 1) {
      const l = x ? x - 1 : w - 1;
      const r = x < w - 1 ? x + 1 : 0;
      const dx = (H[row + r] - H[row + l]) * strength;
      const dy = (H[dn + x] - H[up + x]) * strength;
      const inv = 127.5 / Math.sqrt(dx * dx + dy * dy + 1);
      const o = (row + x) * 4;
      d[o] = 127.5 - dx * inv;
      d[o + 1] = 127.5 + dy * inv;
      d[o + 2] = 127.5 + inv;
      d[o + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 4;
  t.colorSpace = THREE.NoColorSpace;
  return t;
};
// crinkled foil: folds of three sizes running every which way, each a soft ridge or groove that fades out at its ends
const foilHeight = (seed0) => (w, h) => {
  const H = new Float32Array(w * h).fill(0.5);
  let seed = seed0;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const [n, len, sigma, amp] of [[26, 0.6, 4.5, 0.22], [70, 0.3, 2, 0.12], [90, 0.12, 1, 0.06]]) {
    for (let k = 0; k < n; k += 1) {
      const cx = rnd() * w;
      const cy = rnd() * h;
      const a = rnd() * Math.PI;
      const half = (len * w * (0.5 + rnd())) / 2;
      const A = amp * (0.6 + 0.8 * rnd()) * (rnd() > 0.5 ? 1 : -1);
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const reach = sigma * 3;
      const x0 = Math.floor(cx - Math.abs(ux) * half - reach);
      const x1 = Math.ceil(cx + Math.abs(ux) * half + reach);
      const y0 = Math.floor(cy - Math.abs(uy) * half - reach);
      const y1 = Math.ceil(cy + Math.abs(uy) * half + reach);
      for (let y = y0; y <= y1; y += 1) {
        const row = (((y % h) + h) % h) * w;
        for (let x = x0; x <= x1; x += 1) {
          const px = x - cx;
          const py = y - cy;
          const t = (px * ux + py * uy) / half;
          if (t <= -1 || t >= 1) continue;
          const dist = (px * -uy + py * ux) / sigma;
          if (dist > 3 || dist < -3) continue;
          H[row + (((x % w) + w) % w)] += A * (1 - t * t) * Math.exp(-dist * dist);
        }
      }
    }
  }
  return H;
};
// quilted thermal blanket: stitched seams in a grid, the cloth puffing up a little between them
const quiltHeight = (w, h) => {
  const n = 4;
  const H = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const u = ((x / w) * n) % 1;
      const v = ((y / h) * n) % 1;
      H[y * w + x] = 0.27 + 0.47 * Math.pow(Math.sin(u * Math.PI) * Math.sin(v * Math.PI), 0.6);
    }
  }
  return H;
};
// hexagonal heat-shield tiles
const hexTex = () =>
  canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#3a3c3f';
    g.fillRect(0, 0, w, h);
    const r = w / 16;
    const dx = r * Math.sqrt(3);
    for (let row = -1; row < h / (r * 1.5) + 1; row += 1) {
      for (let col = -1; col < w / dx + 1; col += 1) {
        const cx = col * dx + (row % 2 ? dx / 2 : 0);
        const cy = row * r * 1.5;
        const v = 14 + ((col * 31 + row * 17) % 7);
        g.fillStyle = `rgb(${v},${v},${v + 2})`;
        g.beginPath();
        for (let k = 0; k < 6; k += 1) {
          const a = Math.PI / 6 + (k * Math.PI) / 3;
          const px = cx + (r - 1.6) * Math.cos(a);
          const py = cy + (r - 1.6) * Math.sin(a);
          if (k) g.lineTo(px, py);
          else g.moveTo(px, py);
        }
        g.closePath();
        g.fill();
      }
    }
  }, [1, 1]);
// grid fins: a lattice, transparent between the bars
const latticeTex = () => {
  const t = canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#fff';
    g.lineWidth = 7;
    g.strokeRect(4, 4, w - 8, h - 8);
    g.lineWidth = 4;
    for (let k = -8; k <= 16; k += 1) {
      g.beginPath();
      g.moveTo(k * 32, 0);
      g.lineTo(k * 32 + h, h);
      g.stroke();
      g.beginPath();
      g.moveTo(k * 32 + h, 0);
      g.lineTo(k * 32, h);
      g.stroke();
    }
  });
  t.colorSpace = THREE.NoColorSpace;
  return t;
};
// stainless steel, with faint ring seams every so often
const steelTex = () =>
  canvasTex(64, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, '#d9dcdf');
    grd.addColorStop(0.5, '#cfd2d6');
    grd.addColorStop(1, '#d9dcdf');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(60,64,70,0.55)';
    for (let k = 0; k < 8; k += 1) g.fillRect(0, k * 64, w, 2);
  });

export const materials = () => {
  if (MATS) return MATS;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  MATS = {
    white: std({color: 0xf1f0ec, roughness: 0.42}),
    paint: std({color: 0xe6e6e2, roughness: 0.5}),
    grey: std({color: 0x8d939a, roughness: 0.55, metalness: 0.3}),
    lightgrey: std({color: 0xb9b6ad, roughness: 0.65}),
    shield: std({color: 0xffffff, roughness: 0.7, map: canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = '#a9aaa6';
      g.fillRect(0, 0, w, h);
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let k = 0; k < 2400; k += 1) {
        const v = 150 + Math.floor(rnd() * 30);
        g.fillStyle = `rgba(${v},${v},${v - 4},0.25)`;
        g.fillRect(rnd() * w, rnd() * h, 3, 3);
      }
      g.strokeStyle = 'rgba(70,72,74,0.45)';
      g.lineWidth = 1.5;
      for (let k = 1; k < 12; k += 1) { g.beginPath(); g.moveTo((k * w) / 12, 0); g.lineTo((k * w) / 12, h); g.stroke(); }
      for (let k = 1; k < 6; k += 1) { g.beginPath(); g.moveTo(0, (k * h) / 6); g.lineTo(w, (k * h) / 6); g.stroke(); }
    })}),
    black: std({color: 0x18191b, roughness: 0.55}),
    carbon: std({color: 0x222427, roughness: 0.45, metalness: 0.25}),
    soot: std({color: 0x2d2b29, roughness: 0.8}),
    alu: std({color: 0xe3e6ea, roughness: 0.08, metalness: 1}),
    metal: std({color: 0xa7adb3, roughness: 0.32, metalness: 1}),
    darkmetal: std({color: 0x55595e, roughness: 0.4, metalness: 0.9}),
    engine: std({color: 0x3a3b3e, roughness: 0.38, metalness: 0.85, side: THREE.DoubleSide}),
    copper: std({color: 0x9b6a45, roughness: 0.4, metalness: 1, side: THREE.DoubleSide}),
    gold: std({color: 0xd2a447, roughness: 0.3, metalness: 1}),
    foam: std({color: 0xb35f2c, roughness: 0.9}),
    foamDark: std({color: 0x9a4f24, roughness: 0.9}),
    steel: std({color: 0xffffff, map: steelTex(), roughness: 0.27, metalness: 1}),
    tiles: std({color: 0xffffff, map: hexTex(), roughness: 0.75, metalness: 0.05}),
    // solar arrays keep their deep blue edge-on: a weaker glint than plain plastic (specularIntensity)
    cells: new THREE.MeshPhysicalMaterial({color: 0xffffff, map: cellsTex(8, 24), roughness: 0.34, metalness: 0.05, specularIntensity: 0.3, side: THREE.DoubleSide}),
    cellsWide: new THREE.MeshPhysicalMaterial({color: 0xffffff, map: cellsTex(36, 8), roughness: 0.34, metalness: 0.05, specularIntensity: 0.3, side: THREE.DoubleSide}),
    lattice: std({color: 0x6f7378, alphaMap: latticeTex(), alphaTest: 0.5, transparent: false, roughness: 0.35, metalness: 0.9, side: THREE.DoubleSide}),
    latticeSteel: std({color: 0xc9ccd0, alphaMap: latticeTex(), alphaTest: 0.5, roughness: 0.3, metalness: 1, side: THREE.DoubleSide}),
    glass: std({color: 0x0b0d10, roughness: 0.05, metalness: 0.6}),
    // thermal blankets: the grey-green of early Soviet spacecraft, and crinkled gold foil
    drab: std({color: 0x8c9480, roughness: 0.82, normalMap: normalTex(128, 128, quiltHeight, 1.1, [3, 3]), normalScale: new THREE.Vector2(0.8, 0.8)}),
    mli: std({
      color: 0xffffff, roughness: 0.32, metalness: 0.78,
      normalMap: normalTex(512, 512, foilHeight(11), 3.2, [1, 1]),
      normalScale: new THREE.Vector2(1, 1),
      map: canvasTex(512, 512, (g, w, h) => {
        // warm gold, a little lighter and darker in broad patches, with the blanket's taped edges
        g.fillStyle = '#dcae50';
        g.fillRect(0, 0, w, h);
        let seed = 23;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        for (let k = 0; k < 14; k += 1) {
          const x = rnd() * w;
          const y = rnd() * h;
          const r = 80 + rnd() * 160;
          const grd = g.createRadialGradient(x, y, 0, x, y, r);
          const c = rnd() > 0.5 ? '238,196,104' : '176,128,44';
          grd.addColorStop(0, `rgba(${c},0.32)`);
          grd.addColorStop(1, `rgba(${c},0)`);
          g.fillStyle = grd;
          g.fillRect(0, 0, w, h);
        }
        g.strokeStyle = 'rgba(150,108,40,0.55)';
        g.lineWidth = 5;
        g.strokeRect(2.5, 2.5, w - 5, h - 5);
      }),
    }),
    navy: std({color: 0x1b2a4a, roughness: 0.5}),
  };
  return MATS;
};

// ------------------------------------------------------------ shape helpers
const mesh = (geo, mat, parent, pos, rot) => {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (parent) parent.add(m);
  return m;
};
// a solid of revolution from [radius, height] points, bottom to top
const lathe = (pts, mat, parent, seg = 64, phiStart = 0, phiLength = TAU) =>
  mesh(new THREE.LatheGeometry(pts.map(([r, y]) => V2(Math.max(r, 1e-4), y)), seg, phiStart, phiLength), mat, parent);
const cyl = (r, y0, y1, mat, parent, seg = 64, r1 = r) => mesh(new THREE.CylinderGeometry(r1, r, y1 - y0, seg, 1, false), mat, parent, [0, (y0 + y1) / 2, 0]);
const box = (w, h, d, mat, parent, pos, rot) => mesh(new THREE.BoxGeometry(w, h, d), mat, parent, pos, rot);
const sphere = (r, mat, parent, pos, seg = 48) => mesh(new THREE.SphereGeometry(r, seg, seg / 2), mat, parent, pos);
const ogive = (r, len, y0, n = 24, tip = 0.04) => {
  // tangent ogive from radius r at y0 up to a point len above
  const rho = (r * r + len * len) / (2 * r);
  const pts = [];
  for (let k = 0; k <= n; k += 1) {
    const y = (len * k) / n;
    const rr = Math.sqrt(Math.max(0, rho * rho - y * y)) + r - rho;
    pts.push([Math.max(rr, k === n ? 0 : tip * r), y0 + y]);
  }
  return pts;
};
// an engine bell: open, dark outside, copper inside
const bell = (rThroat, rExit, len, parent, x, y, z, seg = 28) => {
  const g = new THREE.Group();
  const pts = [];
  for (let k = 0; k <= 10; k += 1) {
    const s = k / 10;
    pts.push([rThroat + (rExit - rThroat) * Math.sqrt(s) * (0.35 + 0.65 * s), -len * s]);
  }
  lathe(pts, MATS.engine, g, seg);
  const inner = lathe(pts.map(([r, yy]) => [r * 0.97, yy]), MATS.copper, g, seg);
  inner.material = MATS.copper;
  cyl(rThroat * 1.3, 0, len * 0.18, MATS.darkmetal, g, 16, rThroat * 1.1);
  g.position.set(x, y, z);
  parent.add(g);
  return g;
};
const ring = (r, tube, y, mat, parent) => mesh(new THREE.TorusGeometry(r, tube, 6, 96), mat, parent, [0, y, 0], [Math.PI / 2, 0, 0]);
// a flat panel facing +z
const panel = (w, h, mat, parent, pos, rot) => mesh(new THREE.PlaneGeometry(w, h), mat, parent, pos, rot);
// a rod between two points
const rod = (a, b, r, mat, parent) => {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const m = mesh(new THREE.CylinderGeometry(r, r, len, 8), mat, parent);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return m;
};

// ------------------------------------------------------------ Sputnik 1
function sputnik() {
  const M = materials();
  const g = new THREE.Group();
  const R = 0.29;
  sphere(R, M.alu, g, [0, 0, 0], 64);
  ring(R * 1.003, 0.006, 0, M.metal, g).rotation.set(0, 0, Math.PI / 2);
  // the seam between the two halves, with its bolts
  for (let k = 0; k < 36; k += 1) {
    const a = (k / 36) * TAU;
    sphere(0.008, M.metal, g, [0, Math.cos(a) * R * 1.01, Math.sin(a) * R * 1.01], 8);
  }
  // four whip antennas from the front hemisphere, swept back (two 2.4 m, two 2.9 m)
  const lens = [2.4, 2.9, 2.4, 2.9];
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * TAU + Math.PI / 4;
    const base = new THREE.Vector3(R * 0.55, Math.cos(a) * R * 0.83, Math.sin(a) * R * 0.83);
    const dir = new THREE.Vector3(-Math.cos((35 * Math.PI) / 180), Math.cos(a) * Math.sin((35 * Math.PI) / 180), Math.sin(a) * Math.sin((35 * Math.PI) / 180)).normalize();
    const tip = base.clone().addScaledVector(dir, lens[k]);
    rod(base.toArray(), tip.toArray(), 0.0045, M.metal, g);
    // the mount where the antenna meets the sphere
    const m = mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.07, 12), M.metal, g);
    m.position.copy(base).addScaledVector(dir, 0.02);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  }
  return g;
}

// ------------------------------------------------------------ Vostok
function vostok() {
  const M = materials();
  const g = new THREE.Group();
  // instrument module: two cones joined at their widest point, with the retro-rocket underneath
  lathe([[0.3, 0.1], [0.52, 0.12], [1.215, 1.55], [1.12, 1.85], [0.92, 2.25], [0.78, 2.3]], M.metal, g);
  // thermal-control shutters around the lower cone
  const slope = Math.atan2(1.215 - 0.52, 1.55 - 0.12);
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * TAU + Math.PI / 8;
    const r = 0.52 + (1.215 - 0.52) * ((0.85 - 0.12) / (1.55 - 0.12)) + 0.02;
    const p = box(0.46, 0.6, 0.03, M.darkmetal, g, [Math.sin(a) * r, 0.85, Math.cos(a) * r]);
    p.rotation.order = 'YXZ';
    p.rotation.set(-slope, a, 0);
  }
  // ring of gas bottles under the capsule
  for (let k = 0; k < 16; k += 1) {
    const a = (k / 16) * TAU;
    sphere(0.16, M.alu, g, [Math.sin(a) * 1.0, 2.0, Math.cos(a) * 1.0], 20);
  }
  bell(0.12, 0.26, 0.42, g, 0, 0.12, 0);
  // descent module: the 2.3 m ball
  const C = 3.3;
  const R = 1.15;
  sphere(R, M.shield, g, [0, C, 0], 64);
  // hatch outlines, one small porthole and the Vzor sight underneath
  const onBall = (lat, lon) => new THREE.Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
  const hatch = (r, lat, lon) => {
    const n = onBall(lat, lon);
    const t = mesh(new THREE.TorusGeometry(r, 0.018, 6, 48), M.darkmetal, g);
    t.position.set(0, C, 0).addScaledVector(n, R * Math.cos(r / R) + 0.004);
    t.lookAt(t.position.clone().add(n));
  };
  hatch(0.45, 0.25, -0.6);
  hatch(0.32, 0.35, 2.3);
  const port = (r, lat, lon) => {
    const n = onBall(lat, lon);
    const d = mesh(new THREE.CircleGeometry(r, 32), M.glass, g);
    d.position.set(0, C, 0).addScaledVector(n, R + 0.006);
    d.lookAt(d.position.clone().add(n));
    const t = mesh(new THREE.TorusGeometry(r, 0.02, 6, 32), M.metal, g);
    t.position.copy(d.position);
    t.lookAt(t.position.clone().add(n));
  };
  port(0.1, 0.05, 1.2);
  port(0.14, -0.75, -0.2);
  // whip antennas on top
  rod([0.25, C + R * 0.95, 0.1], [0.55, C + R + 1.4, 0.2], 0.012, M.metal, g);
  rod([-0.25, C + R * 0.95, -0.1], [-0.55, C + R + 1.4, -0.2], 0.012, M.metal, g);
  // the steel straps that held the ball to the instrument module
  for (let k = 0; k < 4; k += 1) {
    const t = mesh(new THREE.TorusGeometry(R * 1.01, 0.022, 6, 48, Math.PI * 0.42), M.metal, g, [0, C, 0]);
    t.rotation.set(0, (k / 4) * TAU + Math.PI / 4, -Math.PI / 2 - Math.PI * 0.08);
  }
  return g;
}

// ------------------------------------------------------------ Shenzhou
function shenzhou() {
  const M = materials();
  const g = new THREE.Group();
  // service module with its skirt and four main engines
  lathe([[1.0, 0.15], [1.4, 0.2], [1.4, 0.55], [1.25, 0.8], [1.25, 2.94]], M.white, g);
  ring(1.255, 0.02, 1.6, M.gold, g);
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * TAU + Math.PI / 4;
    bell(0.09, 0.2, 0.42, g, Math.sin(a) * 0.55, 0.2, Math.cos(a) * 0.55, 20);
  }
  // service-module wings: two panels each side, 17 m tip to tip
  for (const s of [-1, 1]) {
    rod([s * 1.25, 1.9, 0], [s * 1.9, 1.9, 0], 0.05, M.metal, g);
    panel(3.2, 2.0, M.cells, g, [s * (1.9 + 1.6), 1.9, 0], [Math.PI / 2 - 0.2, 0, 0]);
    panel(3.2, 2.0, M.cells, g, [s * (1.9 + 3.2 + 0.1 + 1.6), 1.9, 0], [Math.PI / 2 - 0.2, 0, 0]);
  }
  // descent module: the "headlight" shape, 2.5 m wide
  lathe([[1.1, 2.94], [1.26, 3.02], [1.22, 3.3], [1.02, 4.35], [0.78, 5.15], [0.62, 5.42]], M.lightgrey, g);
  mesh(new THREE.CircleGeometry(0.16, 24), M.glass, g, [0, 4.25, 1.06], [-0.22, 0, 0]);
  // orbital module, with its own pair of small wings and the docking ring on top
  lathe([[0.62, 5.42], [1.0, 5.52], [1.125, 5.75], [1.125, 7.85], [0.95, 8.25], [0.5, 8.35]], M.white, g);
  ring(1.13, 0.02, 6.2, M.gold, g);
  ring(1.13, 0.02, 7.4, M.gold, g);
  for (const s of [-1, 1]) {
    rod([s * 1.12, 7.0, 0], [s * 1.5, 7.0, 0], 0.04, M.metal, g);
    panel(2.0, 1.2, M.cells, g, [s * 2.5, 7.0, 0], [Math.PI / 2 - 0.2, 0, 0]);
  }
  cyl(0.45, 8.3, 8.75, M.metal, g, 32, 0.38);
  rod([0.2, 8.75, 0], [0.25, 9.25, 0], 0.015, M.metal, g);
  return g;
}

// ------------------------------------------------------------ Falcon 9 parts (all radii in metres, 3.66 m core)
const F9R = 1.83;
function falconFirstStage(g, {sideBooster = false} = {}) {
  const M = materials();
  // nine Merlins: eight in a ring, one in the middle (the "octaweb")
  bell(0.16, 0.46, 1.05, g, 0, 1.15, 0, 24);
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * TAU;
    bell(0.16, 0.46, 1.05, g, Math.sin(a) * 1.18, 1.15, Math.cos(a) * 1.18, 24);
  }
  lathe([[0.5, 1.12], [F9R, 1.18], [F9R, 1.75]], M.soot, g);
  // the tank, with a cable raceway along one side
  cyl(F9R, 1.75, 42.0, M.white, g);
  box(0.2, 39.5, 0.14, M.paint, g, [0, 21.9, F9R + 0.05]);
  // landing legs folded flat against the body
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * TAU + Math.PI / 4;
    const leg = new THREE.Group();
    box(0.62, 9.6, 0.22, M.carbon, leg, [0, 4.8, 0]);
    box(0.36, 2.2, 0.26, M.black, leg, [0, 9.0, 0.02]);
    box(1.0, 0.25, 0.4, M.carbon, leg, [0, 0.12, 0]);
    leg.position.set(Math.sin(a) * (F9R + 0.12), 1.4, Math.cos(a) * (F9R + 0.12));
    leg.rotation.y = a;
    g.add(leg);
  }
  // four grid fins, stowed, near the top of the stage
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * TAU;
    const fin = panel(1.25, 1.5, M.lattice, g, [Math.sin(a) * (F9R + 0.18), 40.6, Math.cos(a) * (F9R + 0.18)]);
    fin.rotation.set(0, a, 0);
    box(0.08, 1.5, 0.3, M.darkmetal, g, [Math.sin(a) * (F9R + 0.06), 40.6, Math.cos(a) * (F9R + 0.06)]).rotation.y = a;
  }
  if (sideBooster) {
    // a nose cone instead of the interstage
    lathe([[F9R, 42.0], ...ogive(F9R, 6.0, 42.0, 24, 0.06).slice(1)], M.white, g);
  } else {
    // black carbon interstage
    cyl(F9R, 42.0, 48.4, M.carbon, g);
  }
}
function falconUpper(g) {
  const M = materials();
  cyl(F9R, 48.4, 56.9, M.white, g);
  ring(F9R + 0.005, 0.02, 48.45, M.grey, g);
  // fairing: 5.2 m wide, 13.1 m tall
  const FR = 2.6;
  lathe([[F9R, 56.9], [FR, 58.1], [FR, 63.3], ...ogive(FR, 6.7, 63.3, 28, 0.03).slice(1)], M.white, g);
  box(0.03, 12.8, 0.03, M.lightgrey, g, [0, 63.4, FR - 0.01]).visible = false;
}
function falcon9() {
  const g = new THREE.Group();
  falconFirstStage(g);
  falconUpper(g);
  return g;
}
function falconHeavy() {
  const M = materials();
  const g = new THREE.Group();
  falconFirstStage(g);
  falconUpper(g);
  for (const s of [-1, 1]) {
    const side = new THREE.Group();
    falconFirstStage(side, {sideBooster: true});
    side.position.x = s * 4.1;
    side.rotation.y = s * 0.2;
    g.add(side);
    // the struts that tie the side boosters to the core
    box(0.45, 0.5, 0.7, M.darkmetal, g, [s * 2.05, 3.0, 0]);
    box(0.45, 0.8, 0.9, M.darkmetal, g, [s * 2.05, 38.5, 0]);
  }
  return g;
}

// ------------------------------------------------------------ Crew Dragon
function dragon() {
  const M = materials();
  const g = new THREE.Group();
  const TR = 1.85;
  // trunk: half of it covered in solar cells, with four small fins
  cyl(TR, 0, 3.55, M.white, g);
  lathe([[TR * 1.004, 0.25], [TR * 1.004, 3.3]], M.cellsWide, g, 64, -Math.PI / 2, Math.PI);
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * TAU + Math.PI / 4;
    const shape = new THREE.Shape([V2(0, 0), V2(0.9, 0), V2(0.9, 0.35), V2(0, 1.6)]);
    const fin = mesh(new THREE.ExtrudeGeometry(shape, {depth: 0.08, bevelEnabled: false}), M.white, g);
    fin.position.set(Math.sin(a) * TR, 0.05, Math.cos(a) * TR);
    fin.rotation.y = a - Math.PI / 2;
  }
  ring(TR, 0.03, 3.55, M.black, g);
  // capsule: heat shield, then the sidewall up to the hinged nose cone
  lathe([[1.6, 3.58], [2.0, 3.66], [2.02, 3.78], [1.94, 3.95], [1.08, 6.95], [1.02, 7.15]], M.white, g, 96);
  lathe([[0.05, 3.58], [1.6, 3.58], [2.0, 3.66]], M.black, g, 64);
  lathe([[1.06, 7.12], [1.04, 7.3], [0.88, 7.62], [0.55, 7.92], [0.05, 8.1]], M.white, g, 64);
  ring(1.06, 0.018, 7.14, M.lightgrey, g);
  // SuperDraco pods (four pairs) and the windows, on the sidewall
  const onWall = (y, a, w, h, mat, inset = 0.012) => {
    const t = (y - 3.95) / (6.95 - 3.95);
    const r = 1.94 + (1.08 - 1.94) * t + inset;
    const slope = Math.atan2(1.94 - 1.08, 6.95 - 3.95);
    const p = panel(w, h, mat, g, [Math.sin(a) * r, y, Math.cos(a) * r]);
    p.rotation.set(-slope, a, 0, 'YXZ');
    return p;
  };
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * TAU + Math.PI / 4;
    onWall(4.3, a - 0.09, 0.2, 0.34, M.carbon, 0.02);
    onWall(4.3, a + 0.09, 0.2, 0.34, M.carbon, 0.02);
  }
  const win = new THREE.CircleGeometry(0.15, 24);
  for (const a of [-0.42, 0.42, Math.PI - 0.4, Math.PI + 0.4]) {
    const w = onWall(5.6, a, 0.1, 0.1, M.glass, 0.02);
    w.geometry = win;
  }
  onWall(5.4, 0, 0.9, 1.1, M.paint, 0.008);
  onWall(5.55, 0, 0.26, 0.26, M.glass, 0.02).geometry = win;
  // Draco thrusters near the top
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * TAU + 0.2;
    onWall(6.6, a, 0.12, 0.12, M.black, 0.02);
  }
  return g;
}

// ------------------------------------------------------------ Starlink (first-generation, deployed)
function starlink() {
  const M = materials();
  const g = new THREE.Group();
  // flat bus, Earth-facing side down, with four phased-array antennas and the krypton thruster
  box(2.8, 0.22, 1.4, M.metal, g, [0, 0, 0]);
  box(2.82, 0.02, 1.42, M.darkmetal, g, [0, 0.12, 0]);
  for (let k = 0; k < 4; k += 1) box(0.62, 0.03, 0.62, M.paint, g, [-1.0 + k * 0.68, -0.125, -0.3 + (k % 2) * 0.6]);
  box(0.2, 0.2, 0.2, M.darkmetal, g, [1.45, 0, 0.45]);
  // one long solar array on a short boom
  rod([1.4, 0.05, 0], [2.1, 0.05, 0], 0.04, M.metal, g);
  const arr = new THREE.Group();
  panel(8.1, 2.7, M.cellsWide, arr, [4.05, 0, 0]);
  box(8.1, 0.04, 0.05, M.metal, arr, [4.05, 1.36, 0]);
  box(8.1, 0.04, 0.05, M.metal, arr, [4.05, -1.36, 0]);
  arr.position.set(2.1, 0.05, 0);
  arr.rotation.x = -0.55;
  g.add(arr);
  return g;
}

// ------------------------------------------------------------ Starlink V2 Mini: a 4.1 x 2.7 m bus between two solar
// arrays, 29 m tip to tip (GCAT span), with phased arrays and laser terminals on the Earth-facing side
function starlinkV2() {
  const M = materials();
  const g = new THREE.Group();
  box(2.7, 0.3, 4.1, M.metal, g, [0, 0, 0]);
  box(2.72, 0.02, 4.12, M.darkmetal, g, [0, 0.16, 0]);
  // phased-array antennas underneath, and three laser terminals
  for (let k = 0; k < 6; k += 1) box(0.95, 0.04, 0.95, M.paint, g, [-0.62 + (k % 2) * 1.24, -0.17, -1.35 + Math.floor(k / 2) * 1.35]);
  for (const [x, z] of [[1.15, 1.85], [-1.15, 1.85], [0, -1.85]]) cyl(0.14, -0.32, -0.16, M.darkmetal, g).position.set(x, -0.24, z);
  box(0.24, 0.24, 0.24, M.darkmetal, g, [0, 0, 2.15]);
  // the two arrays on short booms, each 12.85 m x 4.1 m, tilted toward the Sun
  for (const s of [1, -1]) {
    rod([s * 1.35, 0.05, 0], [s * 1.65, 0.05, 0], 0.06, M.metal, g);
    const arr = new THREE.Group();
    panel(12.85, 4.0, M.cellsWide, arr, [s * 6.425, 0, 0]);
    box(12.85, 0.05, 0.06, M.metal, arr, [s * 6.425, 2.0, 0]);
    box(12.85, 0.05, 0.06, M.metal, arr, [s * 6.425, -2.0, 0]);
    arr.position.set(s * 1.65, 0.05, 0);
    arr.rotation.x = -0.5;
    g.add(arr);
  }
  return g;
}

// ------------------------------------------------------------ SLS Block 1 with Orion, as flown on Artemis II: an 8.4 m
// orange core stage 64.6 m tall with four RS-25 engines, two five-segment boosters 3.7 m wide and 54 m tall, the stage
// adapter, Orion under its panels, and the launch abort tower on top, 98 m in all (NASA's published dimensions)
function sls() {
  const M = materials();
  const g = new THREE.Group();
  const R = 4.2;
  for (const [x, z] of [[1.35, 1.35], [-1.35, 1.35], [1.35, -1.35], [-1.35, -1.35]]) bell(0.32, 1.12, 3.0, g, x, 0.2, z, 24);
  lathe([[1.0, 0.0], [R * 0.96, 0.2], [R, 1.2]], M.foamDark, g, 64);
  cyl(R, 1.2, 44, M.foam, g, 72);
  cyl(R * 1.004, 44, 48.5, M.foamDark, g, 72);
  cyl(R, 48.5, 62.8, M.foam, g, 72);
  cyl(R * 1.004, 62.8, 64.6, M.foamDark, g, 72);
  // the stage adapter, the Orion stage adapter, Orion under its panels, the abort tower
  lathe([[R, 64.6], [R, 65.4], [2.75, 73.0]], M.white, g, 72);
  cyl(2.75, 73.0, 74.2, M.lightgrey, g, 64);
  cyl(2.75, 74.2, 80.4, M.white, g, 64);
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * TAU;
    box(0.06, 6.2, 0.06, M.lightgrey, g, [Math.sin(a) * 2.76, 77.3, Math.cos(a) * 2.76]);
  }
  lathe([[2.75, 80.4], [2.5, 81.6], [1.0, 85.4], [0.78, 85.8]], M.paint, g, 64);
  cyl(0.78, 85.8, 92.4, M.white, g, 40);
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * TAU + Math.PI / 4;
    const n = cyl(0.22, 0, 0.9, M.darkmetal, g, 16, 0.32);
    n.position.set(Math.sin(a) * 0.82, 89.2, Math.cos(a) * 0.82);
    n.rotation.set(Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.6);
  }
  lathe(ogive(0.78, 5.7, 92.4), M.white, g, 40);
  // the boosters, with the joints between their five segments and the struts that hold them to the core
  for (const sx of [-1, 1]) {
    const b = new THREE.Group();
    const r = 1.855;
    bell(0.55, 1.45, 2.6, b, 0, -0.6, 0, 28);
    lathe([[2.35, -0.6], [r, 2.6]], M.white, b, 48);
    cyl(r, 2.6, 49.5, M.white, b, 48);
    for (const y of [11.6, 20.6, 29.6, 38.6]) cyl(r * 1.012, y - 0.25, y + 0.25, M.lightgrey, b, 48);
    cyl(r * 1.01, 47.6, 49.5, M.black, b, 48);
    lathe(ogive(r, 4.7, 49.5), M.white, b, 48);
    b.position.x = sx * 6.4;
    g.add(b);
    box(0.5, 0.6, 0.9, M.darkmetal, g, [sx * 4.95, 4.0, 0]);
    box(0.5, 0.9, 1.2, M.darkmetal, g, [sx * 4.95, 46.0, 0]);
  }
  return g;
}

// ------------------------------------------------------------ Starship (Block 3: 72.3 m booster, 52.1 m ship, 9 m wide)
function starship() {
  const M = materials();
  const g = new THREE.Group();
  const R = 4.5;
  // booster: 33 Raptors under a sooted heat shield
  const rings = [[3, 0.85], [10, 2.35], [20, 3.75]];
  for (const [n, rr] of rings) {
    for (let k = 0; k < n; k += 1) {
      const a = (k / n) * TAU + (n === 10 ? 0.15 : 0);
      bell(0.2, 0.62, 1.45, g, Math.sin(a) * rr, 1.45, Math.cos(a) * rr, 20);
    }
  }
  lathe([[0.4, 1.4], [R * 0.98, 1.45], [R, 2.2]], M.soot, g);
  lathe([[R, 2.2], [R, 70.5]], M.steel, g, 96).material.map.repeat.set(1, 37);
  // conduits along the side
  for (const a of [Math.PI / 2, -Math.PI / 2]) box(0.5, 62, 0.35, M.steel, g, [Math.sin(a) * (R + 0.15), 37, Math.cos(a) * (R + 0.15)]).rotation.y = a;
  // the vented hot-staging ring
  cyl(R, 70.5, 72.3, M.soot, g);
  for (let k = 0; k < 24; k += 1) {
    const a = (k / 24) * TAU;
    box(0.28, 1.5, 0.12, M.steel, g, [Math.sin(a) * (R + 0.02), 71.4, Math.cos(a) * (R + 0.02)]).rotation.y = a;
  }
  // three large grid fins near the top of the booster, and the catch pins. Super Heavy's fins stick straight out with
  // the lattice facing up the rocket, so from the side you see their thick frames.
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * TAU + Math.PI / 6;
    const fin = new THREE.Group();
    for (const y of [-0.32, 0.32]) panel(3.6, 3.0, M.latticeSteel, fin, [0, y, 0]).rotation.x = -Math.PI / 2;
    box(3.7, 0.9, 0.16, M.steel, fin, [0, 0, 1.5]);
    box(3.7, 0.9, 0.16, M.steel, fin, [0, 0, -1.5]);
    box(0.16, 0.9, 3.0, M.steel, fin, [1.85, 0, 0]);
    box(0.16, 0.9, 3.0, M.steel, fin, [-1.85, 0, 0]);
    box(0.9, 0.7, 0.9, M.soot, fin, [0, 0, -1.9]);
    fin.position.set(Math.sin(a) * (R + 2.05), 69.4, Math.cos(a) * (R + 2.05));
    fin.rotation.set(0, a, 0);
    g.add(fin);
  }
  for (const a of [0.9, -0.9]) box(0.5, 0.5, 1.1, M.steel, g, [Math.sin(a) * (R + 0.5), 68.6, Math.cos(a) * (R + 0.5)]).rotation.y = a;
  // ship: steel on the lee side, black hexagonal tiles on the windward side
  const shipTop = 124.4;
  const noseStart = 104.2;
  const body = [[R, 72.3], [R, noseStart]];
  const nose = [];
  for (let k = 0; k <= 32; k += 1) {
    const u = k / 32;
    nose.push([R * Math.pow(Math.max(0, 1 - u ** 1.9), 0.62) + (k === 32 ? 0 : 0.02), noseStart + (shipTop - noseStart) * u]);
  }
  lathe([...body, ...nose.slice(1)], M.steel, g, 96).material = M.steel;
  const tiles = M.tiles.clone();
  tiles.map = M.tiles.map.clone();
  tiles.map.repeat.set(16, 30);
  lathe([...body, ...nose.slice(1)].map(([r, y]) => [r * 1.006 + 0.01, y]), tiles, g, 96, Math.PI / 2, Math.PI);
  // flaps: two large aft flaps and two small forward flaps, on the edge between tiles and steel
  const flap = (w0, w1, h, mat) => {
    const s = new THREE.Shape([V2(0, 0), V2(w0, 0), V2(w1, h), V2(0, h)]);
    return new THREE.ExtrudeGeometry(s, {depth: 0.3, bevelEnabled: false});
  };
  for (const side of [-1, 1]) {
    const aft = mesh(flap(4.3, 2.4, 9.6), M.black, g, [side * (R - 0.1), 74.6, 0]);
    aft.rotation.y = side > 0 ? 0 : Math.PI;
    aft.position.z = side > 0 ? -0.15 : 0.15;
    const fwd = mesh(flap(2.2, 1.0, 6.2), M.black, g, [side * (R * 0.72), 108.2, 0]);
    fwd.rotation.y = side > 0 ? 0 : Math.PI;
    fwd.rotation.z = side * -0.22;
    fwd.position.z = side > 0 ? -0.15 : 0.15;
  }
  return g;
}

// ------------------------------------------------------------ Space Shuttle: NASA's orbiter on a drawn tank and boosters
async function shuttle(loadNasa) {
  const M = materials();
  const g = new THREE.Group();
  // external tank, 8.4 m wide and 46.9 m long, from 9.2 m up to the top of the stack at 56.1 m
  const ET0 = 9.2;
  const ER = 4.2;
  lathe([[0.4, ET0], [2.4, ET0 + 0.3], [3.7, ET0 + 0.9], [ER, ET0 + 1.8], [ER, ET0 + 26.5]], M.foam, g, 72);
  lathe([[ER, ET0 + 26.5], [ER, ET0 + 33.2]], M.foamDark, g, 72);
  lathe([[ER, ET0 + 33.2], ...ogive(ER, 13.3, ET0 + 33.2, 28, 0.03).slice(1)], M.foam, g, 72);
  rod([0, 55.4, 0], [0, 56.1, 0], 0.08, M.metal, g);
  // the oxygen feed line down the side
  rod([1.6, ET0 + 2, ER + 0.25], [1.6, ET0 + 34, ER + 0.25], 0.22, M.foam, g);
  // solid rocket boosters, 3.71 m wide and 45.5 m long
  for (const s of [-1, 1]) {
    const b = new THREE.Group();
    const BR = 1.855;
    lathe([[1.15, 0.0], [1.9, 0.02], [1.6, 1.2], [1.0, 2.1]], M.engine, b, 40);
    lathe([[2.55, 1.6], [2.55, 2.2], [BR, 5.9], [BR, 40.2], [1.4, 42.2], ...ogive(1.4, 3.26, 42.2, 16, 0.03).slice(1)], M.white, b, 64);
    ring(BR + 0.01, 0.06, 13.8, M.lightgrey, b);
    ring(BR + 0.01, 0.06, 24.0, M.lightgrey, b);
    ring(BR + 0.01, 0.06, 33.4, M.lightgrey, b);
    b.position.set(s * 6.35, 0, 0);
    g.add(b);
    box(0.4, 0.4, 1.5, M.darkmetal, g, [s * 4.6, 12.2, 0]).rotation.y = Math.PI / 2;
    box(0.4, 0.4, 1.5, M.darkmetal, g, [s * 4.6, 40.0, 0]).rotation.y = Math.PI / 2;
  }
  // the orbiter: NASA's model is z-up with its nose along +x and its payload bay doors in two separate files (without
  // them the open bay shows the tank through it). Stand it nose up, tail and engines down, belly to the tank.
  const [orb, doorP, doorS] = await Promise.all(['space-shuttle-d', 'space-shuttle-d-door-prt', 'space-shuttle-d-door-stb'].map(loadNasa));
  const box3 = new THREE.Box3().setFromObject(orb);
  const size = box3.getSize(new THREE.Vector3());
  const s = 37.24 / size.x;
  const parts = new THREE.Group();
  parts.add(orb, doorP, doorS);
  // the doors' texture isn't in NASA's files: paint their outside the orbiter's white
  for (const d of [doorP, doorS]) {
    d.traverse((o) => {
      if (!o.isMesh) return;
      const inside = /inside/i.test(o.material.name || '');
      o.material = o.material.clone();
      o.material.color.set(inside ? 0x5a666d : 0xe9e9e4);
    });
  }
  parts.scale.setScalar(s);
  const c = box3.getCenter(new THREE.Vector3()).multiplyScalar(s);
  parts.position.set(-c.x, -c.y, -c.z);
  const holder = new THREE.Group();
  holder.add(parts);
  // turning about z by +90 degrees takes the nose (+x) to +y; the belly (-z) stays facing the tank
  holder.rotation.set(0, 0, Math.PI / 2);
  const wrap = new THREE.Group();
  wrap.add(holder);
  // engines about 5.3 m above the boosters' base, so the nose comes up to the top of the intertank; the belly about
  // 0.9 m off the tank's foam
  const half = size.z * s / 2;
  wrap.position.set(0, 5.3 + 37.24 / 2, ER + 0.9 + half);
  g.add(wrap);
  return g;
}


// ------------------------------------------------------------ Vanguard 1: a 16.5 cm sphere, six antennas, six solar cells
function vanguard() {
  const M = materials();
  const g = new THREE.Group();
  const R = 0.0825;
  sphere(R, M.alu, g, [0, 0, 0], 48);
  ring(R * 1.004, 0.0016, 0, M.metal, g).rotation.set(Math.PI / 2, 0, 0);
  // six aerials, about 30 cm long, three on each half
  for (let k = 0; k < 6; k += 1) {
    const up = k < 3 ? 1 : -1;
    const a = (k / 3) * TAU + (up < 0 ? Math.PI / 3 : 0);
    const el = (up * 32 * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.cos(el) * Math.cos(a), Math.sin(el), Math.cos(el) * Math.sin(a));
    const base = dir.clone().multiplyScalar(R * 0.98);
    rod(base.toArray(), base.clone().addScaledVector(dir, 0.3).toArray(), 0.0018, M.metal, g);
  }
  // the six small solar cells on the shell
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * TAU + Math.PI / 6;
    const el = (k % 2 ? 1 : -1) * 0.5;
    const dir = new THREE.Vector3(Math.cos(el) * Math.cos(a), Math.sin(el), Math.cos(el) * Math.sin(a));
    const c = box(0.034, 0.034, 0.006, M.glass, g);
    c.position.copy(dir).multiplyScalar(R * 0.99);
    c.lookAt(dir.clone().multiplyScalar(2));
  }
  return g;
}

// ------------------------------------------------------------ Syncom 3: a spinning drum covered in solar cells
function syncom() {
  const M = materials();
  const g = new THREE.Group();
  const R = 0.355;
  const H = 0.39;
  const cells = M.cells.clone();
  cells.map = M.cells.map.clone();
  cells.map.repeat.set(10, 1);
  cells.map.wrapS = THREE.RepeatWrapping;
  mesh(new THREE.CylinderGeometry(R, R, H * 0.84, 64, 1, true), cells, g);
  cyl(R * 1.005, H * 0.42, H * 0.5, M.alu, g);
  cyl(R * 1.005, -H * 0.5, -H * 0.42, M.alu, g);
  // the apogee motor's nozzle underneath and the antenna mast on top
  lathe([[0.03, -H * 0.5], [0.07, -H * 0.5 - 0.09]], M.engine, g, 24);
  cyl(0.012, H * 0.5, H * 0.5 + 0.33, M.metal, g, 16);
  for (let k = 0; k < 6; k += 1) cyl(0.022, H * 0.5 + 0.05 + k * 0.05, H * 0.5 + 0.07 + k * 0.05, M.darkmetal, g, 16);
  // four whip antennas around the top rim
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * TAU + Math.PI / 4;
    const base = [Math.cos(a) * R * 0.92, H * 0.5, Math.sin(a) * R * 0.92];
    rod(base, [Math.cos(a) * (R + 0.12), H * 0.5 + 0.42, Math.sin(a) * (R + 0.12)], 0.004, M.metal, g);
  }
  return g;
}

// ------------------------------------------------------------ flat-faced polyhedra (Telstar, DFH-1, Aryabhata)
// Splits a convex hull into faces that get solar cells and faces that don't, with planar UVs so each facet shows a
// grid of cells.
const facets = (points, cellsMat, bareMat, parent, bare = () => false, cellSize = 0.06) => {
  const hull = new ConvexGeometry(points).toNonIndexed();
  const pos = hull.getAttribute('position');
  const parts = [[], []];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let k = 0; k < pos.count; k += 3) {
    a.fromBufferAttribute(pos, k);
    b.fromBufferAttribute(pos, k + 1);
    c.fromBufferAttribute(pos, k + 2);
    n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    parts[bare(n) ? 1 : 0].push(a.clone(), b.clone(), c.clone(), n.clone());
  }
  parts.forEach((list, which) => {
    if (!list.length) return;
    const P = [];
    const N = [];
    const UV = [];
    for (let k = 0; k < list.length; k += 4) {
      const nn = list[k + 3];
      const u = Math.abs(nn.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0).cross(nn).normalize();
      const v = nn.clone().cross(u);
      for (let j = 0; j < 3; j += 1) {
        const p = list[k + j];
        P.push(p.x, p.y, p.z);
        N.push(nn.x, nn.y, nn.z);
        UV.push(p.dot(u) / (cellSize * 8), p.dot(v) / (cellSize * 8));
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    mesh(geo, which ? bareMat : cellsMat, parent);
  });
};
const cellsFlat = () => {
  const m = MATS.cells.clone();
  m.map = MATS.cells.map.clone();
  m.map.repeat.set(1, 1);
  m.side = THREE.FrontSide;
  return m;
};
// points on a sphere, spread evenly (golden spiral), for a many-sided ball
const ballPoints = (n, r) => {
  const out = [];
  for (let k = 0; k < n; k += 1) {
    const y = 1 - (2 * (k + 0.5)) / n;
    const rr = Math.sqrt(1 - y * y);
    const a = k * Math.PI * (3 - Math.sqrt(5));
    out.push(new THREE.Vector3(Math.cos(a) * rr * r, y * r, Math.sin(a) * rr * r));
  }
  return out;
};
const helix = (r, len, turns, wire, mat, parent, pos) => {
  const pts = [];
  for (let k = 0; k <= turns * 24; k += 1) {
    const t = k / (turns * 24);
    pts.push(new THREE.Vector3(Math.cos(t * turns * TAU) * r, t * len, Math.sin(t * turns * TAU) * r));
  }
  return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 24, wire, 6), mat, parent, pos);
};

// ------------------------------------------------------------ Telstar 1: an 88 cm ball of solar cells
function telstar() {
  const M = materials();
  const g = new THREE.Group();
  const R = 0.44;
  // 72 flat faces of cells, with a bare band round the middle for the microwave antennas
  facets(ballPoints(72, R), cellsFlat(), M.alu, g, (n) => Math.abs(n.y) < 0.12, 0.035);
  // the two rings of small receive and transmit apertures
  for (const y of [-0.035, 0.035]) {
    for (let k = 0; k < 36; k += 1) {
      const a = (k / 36) * TAU + (y > 0 ? 0.087 : 0);
      box(0.03, 0.03, 0.012, M.darkmetal, g, [Math.cos(a) * R * 0.995, y, Math.sin(a) * R * 0.995], [0, -a + Math.PI / 2, 0]);
    }
  }
  // the helical command antenna on top
  cyl(0.03, R * 0.96, R + 0.03, M.metal, g, 16);
  helix(0.022, 0.22, 7, 0.0035, M.metal, g, [0, R + 0.03, 0]);
  return g;
}

// ------------------------------------------------------------ Dong Fang Hong 1: a 1 m, 72-faced ball
function dfh1() {
  const M = materials();
  const g = new THREE.Group();
  const R = 0.5;
  facets(ballPoints(72, R), cellsFlat(), M.alu, g, (n) => Math.abs(n.y) < 0.14 || n.y > 0.93, 0.04);
  // the band round its waist, and four long whip antennas hanging from it
  cyl(R * 0.99, -0.06, 0.06, M.metal, g, 72);
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * TAU + Math.PI / 4;
    const base = [Math.cos(a) * R, 0, Math.sin(a) * R];
    rod(base, [Math.cos(a) * (R + 1.1), -2.5, Math.sin(a) * (R + 1.1)], 0.006, M.metal, g);
    sphere(0.02, M.metal, g, base, 12);
  }
  cyl(0.06, R * 0.95, R + 0.08, M.metal, g, 24);
  cyl(0.008, R + 0.08, R + 0.45, M.metal, g, 8);
  return g;
}

// ------------------------------------------------------------ Aryabhata: a 26-sided polyhedron, 1.4 m across
function aryabhata() {
  const M = materials();
  const g = new THREE.Group();
  // a rhombicuboctahedron (18 squares and 8 triangles), squashed to 1.1 m tall
  const q = 1 + Math.SQRT2;
  const pts = [];
  for (const [x, y, z] of [[1, 1, q], [1, q, 1], [q, 1, 1]]) {
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) pts.push(new THREE.Vector3(x * sx, y * sy, z * sz));
  }
  const k = 0.7 / Math.sqrt(1 + q * q);
  pts.forEach((p) => p.set(p.x * k, p.y * k * (1.1 / 1.4), p.z * k));
  facets(pts, cellsFlat(), M.alu, g, (n) => Math.abs(n.y) > 0.95, 0.045);
  // antennas: four whips from the top deck, and the radio mast underneath
  for (let j = 0; j < 4; j += 1) {
    const a = (j / 4) * TAU + Math.PI / 4;
    rod([Math.cos(a) * 0.2, 0.55, Math.sin(a) * 0.2], [Math.cos(a) * 0.75, 1.05, Math.sin(a) * 0.75], 0.006, M.metal, g);
  }
  cyl(0.05, -0.62, -0.55, M.darkmetal, g, 16);
  cyl(0.01, -0.95, -0.62, M.metal, g, 8);
  return g;
}

// ------------------------------------------------------------ Ohsumi: the instrumented fourth stage of a Lambda 4S
function ohsumi() {
  const M = materials();
  const g = new THREE.Group();
  // the spent spherical motor with its nozzle, and the 26-sided instrument section, 48 cm wide, 1 m in all
  lathe([[0.05, 0], [0.11, 0.1], [0.23, 0.26], [0.24, 0.36], [0.2, 0.48], [0.16, 0.52]], M.metal, g, 48);
  bell(0.045, 0.1, 0.16, g, 0, 0.02, 0, 24);
  const prism = mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.36, 26, 1), cellsFlat(), g, [0, 0.7, 0]);
  prism.material.map.repeat.set(26, 3);
  prism.material.flatShading = true;
  cyl(0.2, 0.88, 0.92, M.alu, g, 26, 0.16);
  lathe([[0.16, 0.92], [0.1, 0.98], [0.02, 1.0]], M.alu, g, 26);
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * TAU;
    rod([Math.cos(a) * 0.21, 0.86, Math.sin(a) * 0.21], [Math.cos(a) * 0.62, 1.15, Math.sin(a) * 0.62], 0.004, M.metal, g);
  }
  return g;
}

// ------------------------------------------------------------ Voskhod 2: Vostok's ball with an inflatable airlock
function voskhod2() {
  const M = materials();
  const g = vostok();
  const C = 3.3;
  const R = 1.15;
  // the backup solid-fuel braking rocket strapped on top
  cyl(0.32, C + R - 0.08, C + R + 0.42, M.metal, g, 32);
  lathe([[0.32, C + R + 0.42], [0.2, C + R + 0.62], [0.08, C + R + 0.68]], M.metal, g, 32);
  // the Volga airlock: 1.2 m wide, 2.5 m long when inflated, on the hatch
  const lock = new THREE.Group();
  const fabric = M.white;
  cyl(0.6, 0, 2.5, fabric, lock, 48);
  for (let k = 0; k <= 8; k += 1) ring(0.605, 0.018, (k * 2.5) / 8, M.lightgrey, lock);
  cyl(0.62, 2.5, 2.62, M.metal, lock, 48, 0.5);
  ring(0.42, 0.03, 2.62, M.darkmetal, lock);
  const n = new THREE.Vector3(0.62, 0.4, 0.68).normalize();
  lock.position.set(0, C, 0).addScaledVector(n, R * 0.92);
  lock.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  g.add(lock);
  return g;
}

// ------------------------------------------------------------ Soyuz (7K-OK, 1967): three modules, two wings
function soyuz() {
  const M = materials();
  const g = new THREE.Group();
  // service module: 2.72 m wide at the skirt, with its main engine
  lathe([[0.7, 0], [1.36, 0.06], [1.36, 0.62], [1.12, 0.78], [1.12, 2.3]], M.paint, g);
  ring(1.13, 0.025, 1.5, M.darkmetal, g);
  bell(0.12, 0.3, 0.45, g, 0, 0.02, 0, 24);
  for (const s of [-1, 1]) {
    rod([s * 1.12, 1.5, 0], [s * 1.55, 1.5, 0], 0.04, M.metal, g);
    const w = new THREE.Group();
    panel(3.3, 1.9, M.cells, w, [s * 1.65, 0, 0]);
    box(3.3, 0.04, 0.05, M.metal, w, [s * 1.65, 0.95, 0]);
    box(3.3, 0.04, 0.05, M.metal, w, [s * 1.65, -0.95, 0]);
    w.position.set(s * 1.55, 1.5, 0);
    w.rotation.x = -0.35;
    g.add(w);
  }
  // descent module: the headlight-shaped capsule, 2.2 m wide
  lathe([[1.1, 2.3], [1.08, 2.45], [0.98, 3.3], [0.72, 4.1], [0.4, 4.45]], M.drab, g);
  mesh(new THREE.CircleGeometry(0.12, 24), M.glass, g, [0, 3.35, 0.97], [-0.32, 0, 0]);
  // orbital module: a ball 2.2 m wide, with the docking probe and the rendezvous antennas
  lathe([[0.4, 4.45], [0.85, 4.65], [1.08, 5.2], [1.1, 5.7], [0.98, 6.25], [0.6, 6.68], [0.32, 6.78]], M.drab, g);
  cyl(0.3, 6.75, 6.95, M.metal, g, 32, 0.26);
  lathe([[0.26, 6.95], [0.08, 7.3], [0.03, 7.48]], M.metal, g, 24);
  for (const s of [-1, 1]) {
    rod([s * 0.8, 6.3, 0.4], [s * 1.5, 7.1, 0.7], 0.02, M.metal, g);
    mesh(new THREE.CircleGeometry(0.22, 24), M.alu, g, [s * 1.5, 7.1, 0.7], [0, s * 0.6, 0]);
  }
  return g;
}

// ------------------------------------------------------------ Salyut 1: the first space station, 15.8 m long
function salyut1() {
  const M = materials();
  const g = new THREE.Group();
  // aft: the propulsion module, borrowed from Soyuz, with its engine and pair of wings
  lathe([[0.7, 0], [1.1, 0.05], [1.1, 2.2]], M.paint, g);
  bell(0.12, 0.3, 0.45, g, 0, 0.02, 0, 24);
  // the big working compartment (4.15 m), the smaller one (2.9 m), and the transfer tunnel (2 m) to the docking port
  lathe([[1.1, 2.2], [2.075, 2.75], [2.075, 6.9], [1.45, 7.6], [1.45, 11.2], [1.0, 11.7], [1.0, 14.8], [0.55, 15.4], [0.4, 15.8]], M.drab, g);
  for (const y of [3.4, 4.6, 5.8]) ring(2.08, 0.02, y, M.lightgrey, g);
  for (const y of [8.4, 9.6, 10.8]) ring(1.455, 0.02, y, M.lightgrey, g);
  // four wings: a pair on the propulsion module, a pair on the transfer tunnel
  for (const [y, r] of [[1.3, 1.1], [13.4, 1.0]]) {
    for (const s of [-1, 1]) {
      rod([s * r, y, 0], [s * (r + 0.5), y, 0], 0.05, M.metal, g);
      const w = new THREE.Group();
      panel(3.6, 2.0, M.cells, w, [s * 1.8, 0, 0]);
      box(3.6, 0.05, 0.05, M.metal, w, [s * 1.8, 1.0, 0]);
      box(3.6, 0.05, 0.05, M.metal, w, [s * 1.8, -1.0, 0]);
      w.position.set(s * (r + 0.5), y, 0);
      w.rotation.x = -0.3;
      g.add(w);
    }
  }
  return g;
}

// ------------------------------------------------------------ Navstar 1: the first GPS satellite
function navstar() {
  const M = materials();
  const g = new THREE.Group();
  // gold-wrapped bus, the Earth-facing deck down (-y) with its ring of twelve helical navigation antennas
  box(1.5, 1.7, 1.4, M.mli, g, [0, 0, 0]);
  box(1.52, 0.04, 1.42, M.alu, g, [0, -0.87, 0]);
  for (let k = 0; k < 12; k += 1) {
    const a = (k / (k < 8 ? 8 : 4)) * TAU;
    const r = k < 8 ? 0.5 : 0.2;
    helix(0.05, 0.32, 5, 0.008, M.alu, g, [Math.cos(a) * r, -1.21, Math.sin(a) * r]);
  }
  // two arrays on booms, 5.3 m tip to tip
  for (const s of [-1, 1]) {
    rod([s * 0.75, 0.1, 0], [s * 1.05, 0.1, 0], 0.04, M.metal, g);
    const w = new THREE.Group();
    panel(1.6, 1.6, M.cells, w, [s * 0.8, 0, 0]);
    box(1.6, 0.03, 0.04, M.metal, w, [s * 0.8, 0.8, 0]);
    box(1.6, 0.03, 0.04, M.metal, w, [s * 0.8, -0.8, 0]);
    w.position.set(s * 1.05, 0.1, 0);
    w.rotation.x = -0.4;
    g.add(w);
  }
  return g;
}

// ------------------------------------------------------------ Ariane 1: 50 m tall, 3.8 m wide
function ariane1() {
  const M = materials();
  const g = new THREE.Group();
  // first stage, with four Viking engines and four small fins
  cyl(1.9, 0.6, 18.4, M.white, g);
  cyl(1.92, 0.6, 2.2, M.lightgrey, g);
  for (const y of [9.0, 9.5]) cyl(1.915, y, y + 0.15, M.black, g);
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * TAU + Math.PI / 4;
    bell(0.22, 0.5, 1.4, g, Math.cos(a) * 0.95, 1.0, Math.sin(a) * 0.95, 24);
    const f = new THREE.Shape([V2(0, 0), V2(1.3, 0), V2(1.3, 1.2), V2(0, 3.6)]);
    const fin = mesh(new THREE.ExtrudeGeometry(f, {depth: 0.08, bevelEnabled: false}), M.white, g);
    fin.position.set(Math.cos(a + Math.PI / 4) * 1.88, 0.6, Math.sin(a + Math.PI / 4) * 1.88);
    fin.rotation.y = -(a + Math.PI / 4);
  }
  // interstage, second stage, third stage
  lathe([[1.9, 18.4], [1.3, 20.6]], M.lightgrey, g);
  cyl(1.3, 20.6, 31.0, M.white, g);
  cyl(1.31, 30.4, 31.0, M.black, g);
  cyl(1.3, 31.0, 40.4, M.white, g);
  cyl(1.31, 40.4, 41.1, M.lightgrey, g);
  // the 3.2 m fairing, wider than the stage below it
  lathe([[1.3, 41.1], [1.6, 41.7], [1.6, 45.6], ...ogive(1.6, 4.4, 45.6, 20, 0.03)], M.white, g);
  return g;
}

// ------------------------------------------------------------ New Glenn: 98 m tall, 7 m wide
function newGlenn() {
  const M = materials();
  const g = new THREE.Group();
  const R = 3.5;
  // first stage: seven BE-4 engines, four aft fins, and the two big strakes near the top that steer it home
  cyl(R, 0.8, 57.5, M.white, g);
  cyl(R * 1.01, 0.8, 4.0, M.carbon, g);
  bell(0.35, 0.8, 2.4, g, 0, 1.0, 0, 28);
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * TAU;
    bell(0.35, 0.8, 2.4, g, Math.cos(a) * 2.2, 1.0, Math.sin(a) * 2.2, 28);
  }
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * TAU + Math.PI / 4;
    const f = new THREE.Shape([V2(0, 0), V2(2.6, 0.6), V2(2.6, 3.4), V2(0, 6.5)]);
    const fin = mesh(new THREE.ExtrudeGeometry(f, {depth: 0.25, bevelEnabled: false}), M.carbon, g);
    fin.position.set(Math.cos(a) * (R - 0.05), 1.6, Math.sin(a) * (R - 0.05));
    fin.rotation.y = -a;
  }
  for (const s of [-1, 1]) {
    const f = new THREE.Shape([V2(0, 0), V2(2.2, 2.0), V2(2.2, 8.0), V2(0, 10.0)]);
    const st = mesh(new THREE.ExtrudeGeometry(f, {depth: 0.3, bevelEnabled: false}), M.white, g);
    st.position.set(s * (R - 0.05), 45.5, -0.15);
    st.rotation.y = s > 0 ? 0 : Math.PI;
  }
  for (const y of [20, 38]) cyl(R * 1.005, y, y + 0.2, M.lightgrey, g);
  // interstage, second stage and the 7 m fairing
  cyl(R * 1.005, 57.5, 60.5, M.carbon, g);
  cyl(R, 60.5, 77.5, M.white, g);
  lathe([[R, 77.5], [R, 87.0], ...ogive(R, 11.0, 87.0, 24, 0.03)], M.white, g);
  ring(R * 1.003, 0.05, 77.5, M.lightgrey, g);
  return g;
}

// ------------------------------------------------------------ Tianhe: the core of China's Tiangong station
function tianhe() {
  const M = materials();
  const g = new THREE.Group();
  // aft: engines, then the big 4.2 m section (resources and living space), the 2.8 m section, and the docking hub
  lathe([[1.4, 0], [2.0, 0.4], [2.1, 0.8], [2.1, 9.6], [1.4, 10.4], [1.4, 13.6]], M.white, g);
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * TAU + Math.PI / 4;
    bell(0.1, 0.24, 0.4, g, Math.cos(a) * 0.7, 0.05, Math.sin(a) * 0.7, 20);
  }
  for (const y of [3.0, 6.2]) ring(2.105, 0.03, y, M.gold, g);
  sphere(1.42, M.white, g, [0, 14.9, 0], 48);
  for (const [x, y, z] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
    const port = new THREE.Group();
    cyl(0.62, 0, 0.5, M.white, port, 32);
    ring(0.55, 0.05, 0.5, M.metal, port);
    port.position.set(x * 1.25, 14.9 + y * 1.25, z * 1.25);
    port.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, y, z));
    g.add(port);
  }
  // two flexible solar wings, 30 m tip to tip
  for (const s of [-1, 1]) {
    rod([s * 2.1, 2.2, 0], [s * 3.0, 2.2, 0], 0.08, M.metal, g);
    const w = new THREE.Group();
    panel(12.0, 3.0, M.cellsWide, w, [s * 6.0, 0, 0]);
    box(12.0, 0.06, 0.08, M.metal, w, [s * 6.0, 1.5, 0]);
    box(12.0, 0.06, 0.08, M.metal, w, [s * 6.0, -1.5, 0]);
    w.position.set(s * 3.0, 2.2, 0);
    w.rotation.x = -0.45;
    g.add(w);
  }
  // the robotic arm folded along the small section
  rod([0.9, 10.6, 1.15], [0.9, 13.4, 1.15], 0.12, M.lightgrey, g);
  rod([0.9, 13.4, 1.15], [1.6, 13.4, 0.6], 0.1, M.lightgrey, g);
  return g;
}

// ------------------------------------------------------------ Chandrayaan-3: the Vikram lander, with Pragyan inside
function vikram() {
  const M = materials();
  const g = new THREE.Group();
  const H = 1.17;
  box(2.0, H, 2.0, M.mli, g, [0, 0.95 + H / 2, 0]);
  box(2.02, 0.05, 2.02, M.alu, g, [0, 0.95 + H, 0]);
  // four throttleable engines underneath and four legs with footpads
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * TAU + Math.PI / 4;
    bell(0.06, 0.15, 0.3, g, Math.cos(a) * 0.55, 0.95, Math.sin(a) * 0.55, 20);
    const top = [Math.cos(a) * 1.05, 1.55, Math.sin(a) * 1.05];
    const foot = [Math.cos(a) * 1.75, 0.08, Math.sin(a) * 1.75];
    rod(top, foot, 0.05, M.metal, g);
    rod([Math.cos(a) * 0.95, 0.98, Math.sin(a) * 0.95], foot, 0.035, M.metal, g);
    cyl(0.22, 0.02, 0.1, M.metal, g, 24).position.set(foot[0], 0.06, foot[2]);
  }
  // the solar panel on one side, the ramp Pragyan rolled down on another, antennas on top
  panel(1.7, 1.1, M.cells, g, [1.02, 1.55, 0], [0, Math.PI / 2, 0]);
  const ramp = box(0.7, 0.03, 1.9, M.alu, g, [0, 0.62, -1.75], [-0.42, 0, 0]);
  ramp.rotation.order = 'XYZ';
  box(0.9, 0.35, 0.75, M.alu, g, [0, 2.3, -0.4]);
  panel(0.9, 0.5, M.cells, g, [0, 2.48, -0.4], [-Math.PI / 2, 0, 0]);
  cyl(0.02, 2.12, 2.6, M.metal, g, 8).position.x = 0.6;
  mesh(new THREE.CircleGeometry(0.2, 24), M.alu, g, [0.6, 2.62, 0.5], [-1.2, 0, 0]);
  return g;
}

// ------------------------------------------------------------ Kuiper (Amazon Leo): a box with two wings, 5 m across
function kuiper() {
  const M = materials();
  const g = new THREE.Group();
  box(0.7, 0.7, 1.8, M.metal, g, [0, 0, 0]);
  box(0.72, 0.03, 1.82, M.darkmetal, g, [0, 0.36, 0]);
  // phased-array antennas on the Earth-facing side, and an optical link terminal
  for (let k = 0; k < 3; k += 1) box(0.55, 0.03, 0.5, M.paint, g, [0, -0.37, -0.6 + k * 0.6]);
  cyl(0.08, -0.5, -0.36, M.darkmetal, g, 16).position.z = 0.82;
  for (const s of [-1, 1]) {
    rod([s * 0.35, 0.1, 0], [s * 0.5, 0.1, 0], 0.03, M.metal, g);
    const w = new THREE.Group();
    panel(2.0, 1.5, M.cells, w, [s * 1.0, 0, 0]);
    box(2.0, 0.03, 0.04, M.metal, w, [s * 1.0, 0.75, 0]);
    box(2.0, 0.03, 0.04, M.metal, w, [s * 1.0, -0.75, 0]);
    w.position.set(s * 0.5, 0.1, 0);
    w.rotation.x = -0.4;
    g.add(w);
  }
  return g;
}


// ------------------------------------------------------------ Sputnik 2: Laika's cabin, the radio sphere and the
// instruments, stacked in a 4 m cone frame (the shroud came off in orbit)
function sputnik2() {
  const M = materials();
  const g = new THREE.Group();
  // the base frame that stayed bolted to the rocket's core stage, and three struts up to the top
  ring(1.0, 0.03, 0.05, M.metal, g);
  cyl(1.0, 0, 0.08, M.darkmetal, g, 48, 0.95);
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * TAU + 0.3;
    rod([Math.cos(a) * 0.96, 0.08, Math.sin(a) * 0.96], [Math.cos(a) * 0.12, 3.6, Math.sin(a) * 0.12], 0.022, M.metal, g);
  }
  // Laika's pressurised cabin: a 64 cm cylinder with a domed lid and a porthole
  cyl(0.32, 0.12, 0.9, M.paint, g, 48);
  lathe([[0.32, 0.9], [0.3, 1.0], [0.22, 1.1], [0.0, 1.14]], M.paint, g, 48);
  ring(0.322, 0.012, 0.5, M.metal, g);
  const port = mesh(new THREE.CircleGeometry(0.08, 24), M.glass, g, [0, 0.62, 0.323]);
  ring(0.085, 0.01, 0, M.metal, port).rotation.set(0, 0, 0);
  // the radio transmitters in a Sputnik-1 sized sphere, with its antennas
  sphere(0.29, M.alu, g, [0, 1.75, 0], 48);
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * TAU + Math.PI / 4;
    rod([Math.cos(a) * 0.2, 1.85, Math.sin(a) * 0.2], [Math.cos(a) * 1.3, 2.9, Math.sin(a) * 1.3], 0.006, M.metal, g);
  }
  // the cosmic-ray counters and the solar ultraviolet and X-ray photometers on top
  cyl(0.16, 2.2, 2.9, M.lightgrey, g, 32, 0.12);
  cyl(0.12, 2.9, 3.05, M.metal, g, 32);
  lathe([[0.12, 3.05], [0.06, 3.6], [0.02, 3.75]], M.darkmetal, g, 32);
  cyl(0.008, 3.75, 4.0, M.metal, g, 8);
  return g;
}

// ------------------------------------------------------------ TIROS-1: an 18-sided hatbox of solar cells, cameras below
function tiros1() {
  const M = materials();
  const g = new THREE.Group();
  const R = 0.535;
  const H = 0.56;
  const pts = [];
  for (let k = 0; k < 18; k += 1) {
    const a = (k / 18) * TAU;
    for (const y of [-H / 2, H / 2]) pts.push(new THREE.Vector3(Math.cos(a) * R, y, Math.sin(a) * R));
  }
  facets(pts, cellsFlat(), M.alu, g, (n) => n.y < -0.9, 0.035);
  // the two TV cameras look out of the base, and the four whip antennas sweep down from it
  for (const x of [-0.18, 0.18]) {
    cyl(0.06, -H / 2 - 0.12, -H / 2, M.darkmetal, g, 24).position.x = x;
    mesh(new THREE.CircleGeometry(0.045, 24), M.glass, g, [x, -H / 2 - 0.121, 0], [Math.PI / 2, 0, 0]);
  }
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * TAU + Math.PI / 4;
    rod([Math.cos(a) * R * 0.9, -H / 2, Math.sin(a) * R * 0.9], [Math.cos(a) * (R + 0.3), -H / 2 - 0.42, Math.sin(a) * (R + 0.3)], 0.005, M.metal, g);
  }
  // the receiving antenna on top
  cyl(0.02, H / 2, H / 2 + 0.05, M.metal, g, 12);
  cyl(0.006, H / 2 + 0.05, H / 2 + 0.5, M.metal, g, 8);
  return g;
}

// ------------------------------------------------------------ Echo 1: a 30.5 m balloon of aluminised Mylar
function echo1() {
  const M = materials();
  const g = new THREE.Group();
  const R = 15.25;
  const skin = new THREE.MeshStandardMaterial({color: 0xe8ebee, roughness: 0.12, metalness: 1});
  sphere(R, skin, g, [0, 0, 0], 96);
  // the seams between its 82 gores, and the two caps where they met
  for (let k = 0; k < 41; k += 1) {
    const m = mesh(new THREE.TorusGeometry(R * 1.0008, 0.012, 4, 128), M.darkmetal, g);
    m.rotation.y = (k / 41) * Math.PI;
  }
  for (const y of [-1, 1]) cyl(1.4, y * R - 0.05, y * R + 0.05, M.metal, g, 48).position.y = y * (R - 0.03);
  return g;
}

// ------------------------------------------------------------ Early Bird (Intelsat I): a small spinning drum
function earlybird() {
  const M = materials();
  const g = new THREE.Group();
  const R = 0.36;
  const H = 0.59;
  const cells = M.cells.clone();
  cells.map = M.cells.map.clone();
  cells.map.repeat.set(10, 1.6);
  mesh(new THREE.CylinderGeometry(R, R, H * 0.86, 64, 1, true), cells, g);
  cyl(R * 1.005, H * 0.43, H * 0.5, M.alu, g);
  cyl(R * 1.005, -H * 0.5, -H * 0.43, M.alu, g);
  // the apogee motor's nozzle, and the slotted microwave antenna on its mast
  lathe([[0.035, -H * 0.5], [0.08, -H * 0.5 - 0.1]], M.engine, g, 24);
  cyl(0.06, H * 0.5, H * 0.5 + 0.06, M.metal, g, 24);
  cyl(0.035, H * 0.5 + 0.06, H * 0.5 + 0.34, M.alu, g, 24);
  for (let k = 0; k < 7; k += 1) cyl(0.037, H * 0.5 + 0.09 + k * 0.035, H * 0.5 + 0.1 + k * 0.035, M.darkmetal, g, 24);
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * TAU;
    rod([Math.cos(a) * R * 0.9, H * 0.5, Math.sin(a) * R * 0.9], [Math.cos(a) * (R + 0.1), H * 0.5 + 0.38, Math.sin(a) * (R + 0.1)], 0.004, M.metal, g);
  }
  return g;
}

// ------------------------------------------------------------ Luna 9: the 58 cm landing capsule, petals open
function luna9() {
  const M = materials();
  const g = new THREE.Group();
  const R = 0.29;
  // four petals that opened to set it upright, lying on the ground
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * TAU;
    const petal = mesh(new THREE.SphereGeometry(R * 1.02, 24, 12, -Math.PI / 4, Math.PI / 2, 0, Math.PI / 2), M.alu, g);
    petal.material = M.alu.clone();
    petal.material.side = THREE.DoubleSide;
    petal.rotation.set(0, -a, 0);
    const piv = new THREE.Group();
    piv.add(petal);
    petal.position.set(R * 0.9, 0, 0);
    petal.rotation.set(0, 0, -Math.PI / 2 - 0.15);
    piv.rotation.y = a;
    piv.position.y = 0.06;
    g.add(piv);
  }
  // the body, the camera turret with its mirror, and four spring-out antennas
  sphere(R * 0.82, M.metal, g, [0, R * 0.62, 0], 40);
  cyl(R * 0.82, R * 0.62, R * 0.7, M.darkmetal, g, 40);
  cyl(0.07, R * 1.3, R * 1.75, M.metal, g, 24);
  cyl(0.05, R * 1.75, R * 1.9, M.glass, g, 24);
  lathe([[0.05, R * 1.9], [0.02, R * 2.0]], M.metal, g, 24);
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * TAU + Math.PI / 4;
    rod([Math.cos(a) * 0.1, R * 1.3, Math.sin(a) * 0.1], [Math.cos(a) * 0.48, R * 1.3 + 0.62, Math.sin(a) * 0.48], 0.006, M.metal, g);
  }
  return g;
}

// ------------------------------------------------------------ Venera 7: a heavily insulated ball built for Venus
function venera7() {
  const M = materials();
  const g = new THREE.Group();
  const R = 0.5;
  sphere(R, M.lightgrey, g, [0, R, 0], 48);
  ring(R * 1.01, 0.02, R, M.darkmetal, g);
  // the parachute compartment and the antenna on top
  cyl(0.22, R * 1.85, R * 2.25, M.metal, g, 32, 0.25);
  lathe([[0.22, R * 2.25], [0.15, R * 2.4], [0.0, R * 2.45]], M.metal, g, 32);
  lathe([[0.03, R * 2.45], [0.11, R * 2.75], [0.03, R * 2.78]], M.darkmetal, g, 24);
  cyl(0.008, R * 2.78, R * 3.15, M.metal, g, 8);
  return g;
}

// ------------------------------------------------------------ Lunokhod 1: an eight-wheeled tub, lid open to the Sun
function lunokhod1() {
  const M = materials();
  const g = new THREE.Group();
  // the chassis and eight wire-mesh wheels, 51 cm across
  box(1.7, 0.08, 2.1, M.darkmetal, g, [0, 0.5, 0]);
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 4; k += 1) {
      const z = -0.85 + k * 0.567;
      const w = new THREE.Group();
      for (const x of [-0.09, 0.09]) mesh(new THREE.TorusGeometry(0.245, 0.012, 6, 32), M.metal, w, [x, 0, 0], [0, Math.PI / 2, 0]);
      for (let j = 0; j < 12; j += 1) rod([-0.09, Math.cos((j / 12) * TAU) * 0.245, Math.sin((j / 12) * TAU) * 0.245], [0.09, Math.cos((j / 12) * TAU) * 0.245, Math.sin((j / 12) * TAU) * 0.245], 0.007, M.metal, w);
      for (let j = 0; j < 8; j += 1) rod([0, 0, 0], [0, Math.cos((j / 8) * TAU) * 0.25, Math.sin((j / 8) * TAU) * 0.25], 0.008, M.metal, w);
      cyl(0.05, -0.12, 0.12, M.darkmetal, w, 16).rotation.z = Math.PI / 2;
      w.position.set(sx * 0.95, 0.255, z);
      g.add(w);
    }
  }
  // the pressurised instrument tub, wider at the top
  const tub = lathe([[0.55, 0.55], [0.72, 0.62], [0.8, 0.95], [0.82, 1.15]], M.drab, g, 48);
  tub.scale.set(1, 1, 1.2);
  const top = mesh(new THREE.CircleGeometry(0.82, 48), M.lightgrey, g, [0, 1.15, 0], [-Math.PI / 2, 0, 0]);
  top.scale.set(1, 1.2, 1);
  // the lid, hinged at the back and swung open, solar cells on its inside
  const hinge = new THREE.Group();
  const lid = new THREE.Group();
  const shell = mesh(new THREE.SphereGeometry(1.4, 48, 8, 0, TAU, 0, 0.62), M.drab, lid, [0, -1.138, 0]);
  shell.material = M.drab.clone();
  shell.material.side = THREE.DoubleSide;
  mesh(new THREE.CircleGeometry(0.8, 48), M.cells, lid, [0, -0.01, 0], [Math.PI / 2, 0, 0]);
  lid.scale.set(1, 1, 1.2);
  lid.position.set(0, 0, 0.98);
  hinge.add(lid);
  hinge.position.set(0, 1.15, -0.98);
  hinge.rotation.x = -1.95;
  g.add(hinge);
  box(0.5, 0.06, 0.06, M.metal, g, [0, 1.15, -0.98]);
  // the TV cameras on the front, the cone and helical antennas at the back, and the laser reflector
  for (const x of [-0.25, 0.25]) {
    cyl(0.06, 0, 0.12, M.darkmetal, g, 20).position.set(x, 1.0, 0.98);
    g.children[g.children.length - 1].rotation.x = Math.PI / 2;
  }
  box(0.3, 0.12, 0.08, M.metal, g, [0, 0.82, 1.0]);
  rod([0.45, 1.15, -0.3], [0.55, 1.75, -0.3], 0.015, M.metal, g);
  lathe([[0.0, 1.75], [0.18, 2.0], [0.2, 2.02]], M.alu, g, 24).position.set(0.55, 0, -0.3);
  cyl(0.012, 1.15, 2.05, M.metal, g, 8).position.set(-0.5, 1.6, -0.5);
  box(0.24, 0.1, 0.18, M.metal, g, [-0.35, 1.2, 0.55]);
  return g;
}

// ------------------------------------------------------------ Mangalyaan (Mars Orbiter Mission)
function mom() {
  const M = materials();
  const g = new THREE.Group();
  box(1.5, 1.5, 1.5, M.mli, g, [0, 0, 0]);
  box(1.52, 0.03, 1.52, M.alu, g, [0, 0.75, 0]);
  // the 2.2 m dish on top, the 440 N engine below, and one three-panel solar wing
  const dish = lathe(Array.from({length: 13}, (_, k) => [(k / 12) * 1.1, 0.92 + 0.22 * (k / 12) ** 2]), M.paint, g, 64);
  dish.material = M.paint.clone();
  dish.material.side = THREE.DoubleSide;
  cyl(0.12, 0.76, 0.95, M.metal, g, 24);
  for (let k = 0; k < 3; k += 1) rod([Math.cos((k / 3) * TAU) * 1.0, 1.12, Math.sin((k / 3) * TAU) * 1.0], [0, 1.6, 0], 0.012, M.metal, g);
  cyl(0.05, 1.55, 1.65, M.darkmetal, g, 16);
  bell(0.05, 0.16, 0.3, g, 0, -0.75, 0, 24);
  rod([0.76, 0, 0], [1.1, 0, 0], 0.04, M.metal, g);
  for (let k = 0; k < 3; k += 1) panel(1.78, 1.38, M.cells, g, [1.1 + 0.92 + k * 1.82, 0, 0], [-Math.PI / 2 + 0.25, 0, 0]);
  return g;
}

// ------------------------------------------------------------ Hayabusa2
function hayabusa2() {
  const M = materials();
  const g = new THREE.Group();
  box(1.0, 1.25, 1.6, M.mli, g, [0, 0, 0]);
  box(1.02, 0.03, 1.62, M.black, g, [0, 0.63, 0]);
  // two flat high-gain antennas and the return capsule on top
  box(0.9, 0.05, 0.42, M.paint, g, [0, 0.72, 0.35], [0, 0, 0.12]);
  cyl(0.22, 0.66, 0.76, M.metal, g, 24).position.z = -0.25;
  mesh(new THREE.CircleGeometry(0.42, 32), M.paint, g, [0, 0.95, -0.25], [-Math.PI / 2 + 0.3, 0, 0]);
  cyl(0.2, 0.63, 0.83, M.lightgrey, g, 32).position.set(-0.28, 0.73, -0.55);
  // the sampler horn underneath, 1 m long, and the impactor
  cyl(0.05, -1.6, -0.62, M.metal, g, 24, 0.08);
  cyl(0.11, -1.66, -1.58, M.metal, g, 24);
  cyl(0.15, -0.8, -0.62, M.paint, g, 24).position.set(0.3, -0.71, 0.5);
  // ion engines on the back, and two three-panel wings, 6 m tip to tip
  for (let k = 0; k < 4; k += 1) cyl(0.06, 0, 0.08, M.darkmetal, g, 16).position.set(-0.2 + (k % 2) * 0.4, -0.2 + Math.floor(k / 2) * 0.4, -0.84);
  for (const s of [-1, 1]) {
    rod([s * 0.5, 0.1, 0], [s * 0.7, 0.1, 0], 0.03, M.metal, g);
    for (let k = 0; k < 3; k += 1) panel(0.76, 1.2, M.cells, g, [s * (0.7 + 0.39 + k * 0.78), 0.1, 0], [0, 0, 0]);
  }
  return g;
}

// ------------------------------------------------------------ Chang'e 4: the lander, with Yutu-2 driving off
function change4() {
  const M = materials();
  const g = new THREE.Group();
  // the lander: a gold-wrapped body on four legs, its two wings raised, the camera mast on top
  const L = new THREE.Group();
  box(2.2, 1.0, 2.2, M.mli, L, [0, 1.6, 0]);
  box(2.24, 0.04, 2.24, M.alu, L, [0, 2.12, 0]);
  bell(0.12, 0.35, 0.5, L, 0, 1.1, 0, 24);
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * TAU + Math.PI / 4;
    const foot = [Math.cos(a) * 2.1, 0.06, Math.sin(a) * 2.1];
    rod([Math.cos(a) * 1.25, 1.9, Math.sin(a) * 1.25], foot, 0.07, M.metal, L);
    rod([Math.cos(a) * 1.2, 1.15, Math.sin(a) * 1.2], foot, 0.045, M.metal, L);
    cyl(0.3, 0.02, 0.1, M.metal, L, 24).position.set(foot[0], 0.04, foot[2]);
  }
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    panel(1.5, 1.6, M.cells, w, [0, 0.8, 0]);
    w.position.set(0, 2.12, s * 1.12);
    w.rotation.x = s * -0.35;
    L.add(w);
  }
  cyl(0.04, 2.12, 3.2, M.metal, L, 12).position.x = 0.8;
  box(0.25, 0.2, 0.25, M.darkmetal, L, [0.8, 3.3, 0]);
  mesh(new THREE.CircleGeometry(0.3, 24), M.paint, L, [-0.6, 2.6, -0.3], [-1.0, 0, 0]);
  cyl(0.03, 2.12, 2.55, M.metal, L, 8).position.set(-0.6, 2.335, -0.45);
  g.add(L);
  // Yutu-2: six wheels, two folding wings and a mast with stereo cameras
  const Y = new THREE.Group();
  box(1.0, 0.55, 1.5, M.mli, Y, [0, 0.62, 0]);
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 3; k += 1) {
      cyl(0.15, -0.08, 0.08, M.metal, Y, 20).rotation.z = Math.PI / 2;
      Y.children[Y.children.length - 1].position.set(sx * 0.62, 0.15, -0.55 + k * 0.55);
    }
    rod([sx * 0.5, 0.5, -0.6], [sx * 0.62, 0.15, 0.55], 0.03, M.metal, Y);
    const w = new THREE.Group();
    panel(0.9, 1.3, M.cells, w, [sx * 0.45, 0, 0], [-Math.PI / 2, 0, 0]);
    w.position.set(sx * 0.5, 0.92, 0);
    w.rotation.z = sx * 0.3;
    Y.add(w);
  }
  cyl(0.03, 0.9, 1.5, M.metal, Y, 8).position.z = 0.6;
  box(0.4, 0.1, 0.1, M.darkmetal, Y, [0, 1.55, 0.6]);
  Y.position.set(3.4, 0, 0.8);
  Y.rotation.y = 0.5;
  g.add(Y);
  return g;
}

// ------------------------------------------------------------ batch 3 (2026-11-01)
// Luna 2: like Luna 1, a polished sphere about 1.22 m across with whip antennas on one hemisphere
function luna2() {
  const M = materials();
  const g = new THREE.Group();
  const R = 0.61;
  sphere(R, M.alu, g, [0, 0, 0], 64);
  ring(R * 1.003, 0.008, 0, M.metal, g);
  // the rigid magnetometer mast and four whips, all from the top hemisphere
  cyl(0.025, R * 0.95, R + 0.9, M.metal, g, 12);
  sphere(0.05, M.metal, g, [0, R + 0.92, 0], 16);
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * TAU + Math.PI / 4;
    const base = [Math.cos(a) * R * 0.55, R * 0.83, Math.sin(a) * R * 0.55];
    rod(base, [Math.cos(a) * 1.7, R + 1.1, Math.sin(a) * 1.7], 0.008, M.metal, g);
  }
  return g;
}

// Luna 3: a 1.3 m canister with domed ends, 1.2 m across at its flange, solar cells round its middle and the
// camera port at the top
function luna3() {
  const M = materials();
  const g = new THREE.Group();
  const R = 0.5;
  lathe([[0.02, 0], [0.3, 0.04], [0.45, 0.12], [R, 0.25], [R, 1.0], [0.46, 1.12], [0.32, 1.22], [0.1, 1.27], [0.02, 1.27]], M.alu, g, 64);
  lathe([[R, 0.95], [0.6, 0.97], [0.6, 1.01], [R, 1.03]], M.metal, g, 64);
  // solar cells on the cylinder, in panels
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * TAU;
    const p = panel(0.3, 0.55, M.cells, g, [Math.sin(a) * (R + 0.005), 0.6, Math.cos(a) * (R + 0.005)]);
    p.rotation.y = a;
  }
  cyl(0.12, 1.24, 1.3, M.darkmetal, g, 24);
  mesh(new THREE.CircleGeometry(0.09, 24), M.glass, g, [0, 1.301, 0], [-Math.PI / 2, 0, 0]);
  // antennas: four on top, two below
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * TAU + Math.PI / 4;
    rod([Math.cos(a) * 0.35, 1.15, Math.sin(a) * 0.35], [Math.cos(a) * 0.8, 1.75, Math.sin(a) * 0.8], 0.007, M.metal, g);
  }
  for (const s of [-1, 1]) rod([s * 0.25, 0.08, 0], [s * 0.55, -0.6, 0], 0.007, M.metal, g);
  return g;
}

// Mariner 2: a hexagonal bus 1 m across, a truss tower with the instruments and the omni antenna, two solar wings
// (5 m across) and the dish underneath; 3.7 m tall
function mariner2() {
  const M = materials();
  const g = new THREE.Group();
  const bus = cyl(0.5, 0, 0.36, M.metal, g, 6);
  bus.rotation.y = Math.PI / 6;
  cyl(0.505, 0.33, 0.36, M.mli, g, 6).rotation.y = Math.PI / 6;
  // the tower: four legs up to the omni antenna, with the magnetometer and radiometer on the way
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * TAU + Math.PI / 4;
    rod([Math.cos(a) * 0.32, 0.36, Math.sin(a) * 0.32], [Math.cos(a) * 0.06, 2.75, Math.sin(a) * 0.06], 0.018, M.metal, g);
  }
  for (const y of [1.0, 1.7, 2.3]) {
    const r = 0.32 - ((y - 0.36) / (2.75 - 0.36)) * 0.26;
    ring(r, 0.012, y, M.metal, g);
  }
  box(0.22, 0.18, 0.22, M.mli, g, [0, 1.0, 0]);
  cyl(0.06, 1.6, 1.95, M.darkmetal, g, 16).position.x = 0.12;
  lathe([[0.03, 2.75], [0.16, 3.05], [0.17, 3.1], [0.02, 3.2]], M.paint, g, 24);
  // solar wings, the longer one carrying the solar-sail flap
  for (const [s, len] of [[-1, 1.83], [1, 1.95]]) {
    rod([s * 0.48, 0.2, 0], [s * 0.6, 0.2, 0], 0.03, M.metal, g);
    panel(len, 0.76, M.cells, g, [s * (0.6 + len / 2), 0.2, 0], [-Math.PI / 2, 0, 0]);
  }
  // the high-gain dish below, angled toward Earth
  const dish = lathe(Array.from({length: 11}, (_, k) => [(k / 10) * 0.6, 0.12 * (k / 10) ** 2]), M.paint, g, 48);
  dish.material = M.paint.clone();
  dish.material.side = THREE.DoubleSide;
  dish.position.set(0.2, -0.45, 0);
  dish.rotation.set(Math.PI, 0, 0.5);
  rod([0.1, 0, 0], [0.2, -0.45, 0], 0.025, M.metal, g);
  return g;
}

// Mars 3: the orbiter's propellant block and engine, two solar wings and its dish, the lander in its cone on top;
// 4.1 m tall, 2 m across, 5.9 m with the wings out
function mars3() {
  const M = materials();
  const g = new THREE.Group();
  bell(0.12, 0.32, 0.45, g, 0, 0.45, 0, 24);
  lathe([[0.3, 0.45], [0.95, 0.55], [1.0, 0.8], [1.0, 1.75], [0.85, 1.95]], M.drab, g, 48);
  cyl(0.85, 1.95, 2.35, M.darkmetal, g, 48);
  // the toroidal instrument compartment
  mesh(new THREE.TorusGeometry(0.75, 0.22, 16, 48), M.drab, g, [0, 2.15, 0], [Math.PI / 2, 0, 0]);
  for (const s of [-1, 1]) {
    rod([s * 0.95, 1.3, 0], [s * 1.1, 1.3, 0], 0.04, M.metal, g);
    panel(1.85, 2.0, M.cells, g, [s * (1.1 + 0.925), 1.3, 0]);
  }
  // the parabolic dish on one side, the radiator panel on the other
  const dish = lathe(Array.from({length: 11}, (_, k) => [(k / 10) * 0.8, 0.2 * (k / 10) ** 2]), M.paint, g, 48);
  dish.material = M.paint.clone();
  dish.material.side = THREE.DoubleSide;
  dish.position.set(0, 1.3, 1.25);
  dish.rotation.set(Math.PI / 2, 0, 0);
  rod([0, 1.3, 1.0], [0, 1.3, 1.25], 0.03, M.metal, g);
  box(0.9, 0.9, 0.04, M.white, g, [0, 1.2, -1.05]);
  // the descent module: a cone-shaped aeroshell with the lander sphere above it
  lathe([[0.85, 2.35], [1.0, 2.45], [0.55, 3.1], [0.35, 3.2]], M.lightgrey, g, 48);
  sphere(0.5, M.drab, g, [0, 3.55, 0], 40);
  ring(0.5, 0.02, 3.55, M.darkmetal, g);
  cyl(0.18, 3.95, 4.1, M.metal, g, 24);
  return g;
}

// Buran: the orbiter as it landed, gear down. 36.37 m long, 23.92 m across the wings, 16.35 m tall on its gear.
// Nose along +x, white with black tiles underneath and on the leading edges.
function buran() {
  const M = materials();
  const g = new THREE.Group();
  const L = 36.37;
  const prof = [[2.5, 0], [2.75, 1.0], [2.8, 25], [2.72, 28.5], [2.35, 31.5], [1.75, 33.8], [1.0, 35.4], [0.35, 36.2], [0.02, L]];
  const body = new THREE.Group();
  lathe(prof, M.white, body, 64, Math.PI, Math.PI);
  lathe(prof.map(([r, y]) => [r * 1.004, y]), M.tiles, body, 64, 0, Math.PI);
  body.rotation.z = -Math.PI / 2;
  body.scale.set(1, 1, 1);
  const bodyWrap = new THREE.Group();
  bodyWrap.add(body);
  bodyWrap.scale.set(1, 0.92, 1);
  g.add(bodyWrap);
  // the double-delta wing, low on the body
  const wingShape = new THREE.Shape([V2(1.2, 0), V2(1.2, -11.0), V2(3.0, -11.96), V2(16.0, -4.7), V2(24.0, -2.75), V2(27.0, 0), V2(24.0, 2.75), V2(16.0, 4.7), V2(3.0, 11.96), V2(1.2, 11.0)]);
  const wing = mesh(new THREE.ExtrudeGeometry(wingShape, {depth: 0.45, bevelEnabled: false}), M.white, g, [0, -1.45, 0], [Math.PI / 2, 0, 0]);
  wing.renderOrder = 1;
  mesh(new THREE.ShapeGeometry(wingShape), M.tiles, g, [0, -1.92, 0], [Math.PI / 2, 0, 0]);
  // black leading edges
  for (const s of [-1, 1]) {
    rod([16.0, -1.67, s * 4.7], [3.0, -1.67, s * 11.96], 0.24, M.black, g);
    rod([24.0, -1.67, s * 2.75], [16.0, -1.67, s * 4.7], 0.24, M.black, g);
    // the two orbital-manoeuvring pods at the back
    const pod = sphere(1, M.white, g, [4.2, 1.9, s * 1.55], 24);
    pod.scale.set(4.2, 0.85, 0.85);
  }
  // the fin, with its split rudder
  const finShape = new THREE.Shape([V2(-0.6, 0), V2(8.2, 0), V2(3.0, 8.3), V2(1.0, 8.3), V2(-0.8, 2.0)]);
  mesh(new THREE.ExtrudeGeometry(finShape, {depth: 0.36, bevelEnabled: false}), M.white, g, [0.1, 2.3, -0.18]);
  box(0.06, 6.0, 0.38, M.lightgrey, g, [0.2, 5.3, 0], [0, 0, 0.21]);
  // the body flap and the two OMS nozzles in the tail
  box(1.6, 0.3, 5.0, M.tiles, g, [-0.5, -2.0, 0]);
  for (const s of [-1, 1]) {
    const b = bell(0.12, 0.4, 0.8, g, 0.2, 1.4, s * 0.9, 20);
    b.rotation.z = -Math.PI / 2;
  }
  // cockpit windows
  for (let k = -2; k <= 2; k += 1) {
    const w = panel(0.55, 0.42, M.glass, g, [31.6, 1.95, k * 0.62]);
    w.rotation.set(0, Math.PI / 2, 0);
    w.rotation.z = -0.9;
    w.rotation.order = 'YZX';
  }
  // landing gear: the nose gear and two main gears, 3 m down to the runway
  const gear = (x, z, n) => {
    cyl(0.12, -5.0, -2.2, M.metal, g, 12).position.set(x, -3.6, z);
    for (let k = 0; k < n; k += 1) {
      const wz = z + (k - (n - 1) / 2) * 0.55;
      const w = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 24), M.black, g, [x, -5.45, wz], [Math.PI / 2, 0, 0]);
      w.scale.set(1, 1, 1);
    }
  };
  gear(29.0, 0, 2);
  gear(11.0, -3.2, 2);
  gear(11.0, 3.2, 2);
  return g;
}

// Falcon 1 (flight 4): 22.25 m tall and 1.7 m wide, one Merlin on the first stage and a Kestrel under the fairing
function falcon1() {
  const M = materials();
  const g = new THREE.Group();
  const R = 0.85;
  bell(0.14, 0.5, 1.15, g, 0, 1.2, 0, 28);
  lathe([[0.4, 1.12], [R, 1.25], [R, 1.6]], M.soot, g, 48);
  cyl(R, 1.6, 15.3, M.white, g, 64);
  ring(R + 0.004, 0.02, 9.0, M.lightgrey, g);
  box(0.12, 13.2, 0.08, M.paint, g, [0, 8.3, R + 0.03]);
  // black interstage, then the short second stage and the fairing
  cyl(R, 15.3, 16.7, M.carbon, g, 64);
  cyl(R, 16.7, 18.2, M.white, g, 64);
  ring(R + 0.004, 0.025, 18.2, M.grey, g);
  lathe([[R, 18.2], [R, 19.6], ...ogive(R, 2.65, 19.6, 24, 0.05).slice(1)], M.white, g, 64);
  return g;
}

// Dragon 1 (C2+): the capsule with its nose cap swung open, its unpressurised trunk and two solar wings.
// 6.1 m long and 3.7 m wide.
function dragon1() {
  const M = materials();
  const g = new THREE.Group();
  const TR = 1.8;
  cyl(TR, 0, 2.3, M.white, g, 64);
  ring(TR + 0.004, 0.025, 2.28, M.black, g);
  // solar wings, folded out from fairings on the trunk
  for (const s of [-1, 1]) {
    box(0.35, 1.6, 0.35, M.white, g, [s * (TR + 0.12), 1.15, 0]);
    rod([s * TR, 1.15, 0], [s * (TR + 0.9), 1.15, 0], 0.05, M.metal, g);
    for (let k = 0; k < 3; k += 1) panel(1.6, 1.4, M.cells, g, [s * (TR + 0.9 + 0.82 + k * 1.64), 1.15, 0], [-Math.PI / 2 + 0.15, 0, 0]);
  }
  // capsule: heat shield, the sloped sidewall and the nose cap
  lathe([[0.05, 2.3], [1.55, 2.3], [1.85, 2.38], [1.83, 2.55]], M.black, g, 64);
  lathe([[1.83, 2.55], [1.02, 5.2], [0.98, 5.35]], M.lightgrey, g, 96);
  ring(0.99, 0.03, 5.35, M.metal, g);
  // windows, the Draco thruster pods and the grapple fixture
  const onWall = (y, a, w, h, mat) => {
    const t = (y - 2.55) / (5.2 - 2.55);
    const r = 1.83 + (1.02 - 1.83) * t + 0.015;
    const slope = Math.atan2(1.83 - 1.02, 5.2 - 2.55);
    const p = panel(w, h, mat, g, [Math.sin(a) * r, y, Math.cos(a) * r]);
    p.rotation.set(-slope, a, 0, 'YXZ');
    return p;
  };
  for (const a of [0.6, Math.PI - 0.5]) onWall(4.2, a, 0.3, 0.3, M.glass).geometry = new THREE.CircleGeometry(0.14, 24);
  for (let k = 0; k < 4; k += 1) onWall(3.3, (k / 4) * TAU + 0.3, 0.32, 0.36, M.darkmetal);
  box(0.25, 0.25, 0.1, M.darkmetal, g, [0.0, 3.6, 1.62]).rotation.x = -0.3;
  // the open nose cap, hinged at one side; the berthing ring shows in the hole
  cyl(0.82, 5.35, 5.55, M.metal, g, 48);
  const cap = lathe([[0.95, 0], [0.8, 0.35], [0.45, 0.62], [0.02, 0.72]], M.white, null, 48);
  cap.material = M.white.clone();
  cap.material.side = THREE.DoubleSide;
  const hinge = new THREE.Group();
  hinge.position.set(0, 5.4, -0.95);
  cap.position.set(0, 0, 0.95);
  hinge.add(cap);
  hinge.rotation.x = -1.35;
  g.add(hinge);
  return g;
}

// Tianwen-1's lander on Mars with Zhurong rolled down its ramp. The rover is 2.6 x 3 x 1.85 m with its four
// wings and mast up.
function tianwen1() {
  const M = materials();
  const g = new THREE.Group();
  // the lander: an octagonal platform on four legs, with the ramp folded down
  const P = new THREE.Group();
  const deck = cyl(1.5, 1.0, 1.25, M.mli, P, 8);
  deck.rotation.y = Math.PI / 8;
  cyl(1.52, 1.25, 1.29, M.alu, P, 8).rotation.y = Math.PI / 8;
  bell(0.12, 0.35, 0.5, P, 0, 1.0, 0, 24);
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * TAU + Math.PI / 4;
    const foot = [Math.cos(a) * 2.0, 0.05, Math.sin(a) * 2.0];
    rod([Math.cos(a) * 1.3, 1.2, Math.sin(a) * 1.3], foot, 0.07, M.metal, P);
    rod([Math.cos(a) * 1.25, 0.95, Math.sin(a) * 1.25], foot, 0.045, M.metal, P);
    cyl(0.28, 0.02, 0.1, M.metal, P, 20).position.set(foot[0], 0.04, foot[2]);
  }
  for (const z of [-0.45, 0.45]) {
    const ramp = box(2.3, 0.05, 0.5, M.metal, P, [2.45, 0.66, z]);
    ramp.rotation.z = -0.5;
  }
  g.add(P);
  // Zhurong: body, six wheels, four butterfly wings and the mast
  const Z = new THREE.Group();
  box(1.5, 0.55, 1.0, M.white, Z, [0, 0.75, 0]);
  box(1.52, 0.04, 1.02, M.alu, Z, [0, 1.04, 0]);
  for (const sz of [-1, 1]) {
    for (let k = 0; k < 3; k += 1) {
      const w = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.16, 20), M.metal, Z, [-0.65 + k * 0.65, 0.18, sz * 0.72], [Math.PI / 2, 0, 0]);
      w.scale.set(1, 1, 1);
    }
    rod([-0.65, 0.18, sz * 0.62], [0.65, 0.18, sz * 0.62], 0.035, M.metal, Z);
    rod([0, 0.6, sz * 0.5], [0, 0.18, sz * 0.62], 0.04, M.metal, Z);
  }
  // wings: two big ones at the front raised up and out, two at the back
  const wing = (x, sz, w, h, tilt) => {
    const hinge = new THREE.Group();
    hinge.position.set(x, 1.06, sz * 0.5);
    panel(w, h, M.cells, hinge, [0, 0, sz * h / 2], [-Math.PI / 2, 0, 0]);
    hinge.rotation.x = sz * tilt;
    Z.add(hinge);
  };
  wing(0.38, 1, 0.72, 1.05, -0.45);
  wing(0.38, -1, 0.72, 1.05, -0.45);
  wing(-0.38, 1, 0.72, 0.85, -0.25);
  wing(-0.38, -1, 0.72, 0.85, -0.25);
  // the mast with the navigation and terrain cameras, 1.85 m off the ground
  cyl(0.04, 1.06, 1.7, M.metal, Z, 12).position.x = 0.6;
  box(0.18, 0.14, 0.42, M.darkmetal, Z, [0.6, 1.78, 0]);
  Z.position.set(4.6, 0, 0.0);
  Z.rotation.y = -0.25;
  g.add(Z);
  return g;
}

// DART: a 1.8 x 1.9 x 2.6 m box with its two roll-out solar arrays, 8.5 x 2.4 m each, the flat high-gain antenna
// and the DRACO camera looking forward
function dart() {
  const M = materials();
  const g = new THREE.Group();
  box(1.8, 1.9, 2.6, M.mli, g, [0, 0, 0]);
  box(1.82, 0.03, 2.62, M.black, g, [0, 0.95, 0]);
  cyl(0.18, 0, 0.5, M.black, g, 24).position.set(0, 0.15, 1.42);
  g.children[g.children.length - 1].rotation.x = Math.PI / 2;
  mesh(new THREE.CircleGeometry(0.5, 32), M.paint, g, [0, 1.05, -0.4], [-Math.PI / 2, 0, 0]);
  cyl(0.5, 0.95, 1.04, M.lightgrey, g, 32).position.z = -0.4;
  for (const s of [-1, 1]) {
    rod([s * 0.9, 0.2, 0], [s * 1.4, 0.2, 0], 0.05, M.metal, g);
    // the blanket, its central boom and the roll at the tip
    panel(8.5, 2.4, M.cellsWide, g, [s * (1.4 + 4.25), 0.2, 0], [-Math.PI / 2, 0, 0]);
    rod([s * 1.4, 0.21, 0], [s * 9.9, 0.21, 0], 0.04, M.metal, g);
    const roll = cyl(0.09, -1.2, 1.2, M.metal, g, 16);
    roll.rotation.x = Math.PI / 2;
    roll.position.set(s * 9.9, 0.2, 0);
  }
  // LICIACube, the little Italian cubesat that rode along
  box(0.24, 0.24, 0.36, M.darkmetal, g, [0.55, -1.08, -0.6]);
  return g;
}

// Freedom 7 on its Mercury-Redstone: NASA's model of the capsule (1.8 m wide, dark shingles) on a Redstone drawn
// from its dimensions, 1.78 m wide and 25.41 m tall with the escape tower
async function freedom7(loadNasa) {
  const M = materials();
  const g = new THREE.Group();
  const R = 0.89;
  bell(0.2, 0.42, 0.9, g, 0, 0.9, 0, 28);
  cyl(R, 0.9, 17.0, M.white, g, 64);
  ring(R + 0.004, 0.03, 4.2, M.lightgrey, g);
  cyl(R + 0.005, 13.4, 14.3, M.black, g, 64);
  // four fins at the base, with their small rudders
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * TAU + Math.PI / 4;
    const shape = new THREE.Shape([V2(0, 0), V2(0.75, 0), V2(0.75, 0.55), V2(0, 2.4)]);
    const fin = mesh(new THREE.ExtrudeGeometry(shape, {depth: 0.07, bevelEnabled: false}), M.white, g);
    fin.position.set(Math.sin(a) * R, 0.9, Math.cos(a) * R);
    fin.rotation.y = a - Math.PI / 2;
    fin.position.x -= Math.cos(a) * 0.035;
    fin.position.z += Math.sin(a) * 0.035;
  }
  // the adapter up to the capsule's heat shield
  lathe([[R, 17.0], [0.93, 17.6], [0.93, 17.95]], M.white, g, 64);
  const cap = await loadNasa('redstone-3-freedom-7');
  const b = new THREE.Box3().setFromObject(cap);
  const sz = b.getSize(new THREE.Vector3());
  const s = 1.8 / sz.x;
  cap.scale.setScalar(s);
  cap.traverse((o) => {
    if (o.isMesh) o.material = new THREE.MeshStandardMaterial({color: 0x2a2c30, roughness: 0.42, metalness: 0.65});
  });
  const c = b.getCenter(new THREE.Vector3()).multiplyScalar(s);
  const top = 17.95 + sz.y * s;
  cap.position.set(-c.x, 17.95 - b.min.y * s, -c.z);
  g.add(cap);
  // the escape tower: a red truss and the escape rocket, up to 25.41 m
  const RED = new THREE.MeshStandardMaterial({color: 0xb23a2a, roughness: 0.5});
  const t0 = top;
  const t1 = 23.25;
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * TAU;
    rod([Math.cos(a) * 0.35, t0, Math.sin(a) * 0.35], [Math.cos(a) * 0.12, t1, Math.sin(a) * 0.12], 0.03, RED, g);
    const a2 = a + TAU / 3;
    rod([Math.cos(a) * 0.3, t0 + 0.6, Math.sin(a) * 0.3], [Math.cos(a2) * 0.22, t0 + 1.5, Math.sin(a2) * 0.22], 0.018, RED, g);
  }
  cyl(0.14, t1, 25.05, M.white, g, 24);
  lathe([[0.14, 25.05], [0.09, 25.3], [0.02, 25.41]], M.white, g, 24);
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * TAU;
    bell(0.03, 0.06, 0.18, g, Math.cos(a) * 0.08, t1, Math.sin(a) * 0.08, 12);
  }
  return g;
}

export const BUILDERS = {luna2, luna3, mariner2, mars3, buran, falcon1, dragon1, tianwen1, dart, freedom7, sputnik2, tiros1, echo1, earlybird, luna9, venera7, lunokhod1, mom, hayabusa2, change4, telstar, dfh1, aryabhata, ohsumi, voskhod2, soyuz, salyut1, navstar, ariane1, newglenn: newGlenn, tianhe, vikram, kuiper, sputnik, vanguard, syncom, vostok, shenzhou, falcon9, falconheavy: falconHeavy, dragon, starlink, starlinkv2: starlinkV2, sls, starship, shuttle};
