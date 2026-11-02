// A dark Earth drawn from Natural Earth coastlines (public domain, via world-atlas), lit from one side, with a thin
// atmosphere on the limb. No photo texture, so it stays crisp at 4K and lets the orbiting objects carry the colour.
import * as THREE from 'three';
import {feature} from 'topojson-client';
import land50 from 'world-atlas/land-50m.json';

export const drawLand = (width) => {
  const height = width / 2;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  g.fillStyle = '#04070d';
  g.fillRect(0, 0, width, height);
  // a faint graticule every 15 degrees
  g.strokeStyle = 'rgba(120, 150, 200, 0.05)';
  g.lineWidth = Math.max(1, width / 4096);
  for (let lon = -180; lon <= 180; lon += 15) {
    const x = ((lon + 180) / 360) * width;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, height);
    g.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 15) {
    const y = ((90 - lat) / 180) * height;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(width, y);
    g.stroke();
  }
  const land = feature(land50, land50.objects.land);
  // Rings that cross the 180th meridian are unwrapped (longitudes kept continuous) and drawn again one map-width over,
  // so neither the fill nor the coastline cuts a line across the whole map (which shows as a ring around the pole).
  // Antarctica, which circles the pole, is closed through the pole.
  const fill = new Path2D();
  const coast = new Path2D();
  const X = (lon) => ((lon + 180) / 360) * width;
  const Y = (lat) => ((90 - lat) / 180) * height;
  const trace = (pts, dx) => {
    pts.forEach(([lon, lat], k) => {
      const x = X(lon) + dx;
      const y = Y(lat);
      if (k === 0) fill.moveTo(x, y);
      else fill.lineTo(x, y);
      const prev = pts[k - 1];
      const seam = prev && Math.abs(Math.abs(lon) - 180) < 0.01 && Math.abs(Math.abs(prev[0]) - 180) < 0.01;
      if (k === 0 || seam) coast.moveTo(x, y);
      else coast.lineTo(x, y);
    });
    fill.closePath();
  };
  const ring = (coords) => {
    const pts = [];
    let shift = 0;
    coords.forEach(([lon, lat], k) => {
      if (k) {
        const d = lon + shift - pts[k - 1][0];
        if (d > 180) shift -= 360;
        else if (d < -180) shift += 360;
      }
      pts.push([lon + shift, lat]);
    });
    const lats = pts.map((q) => q[1]);
    if (Math.max(...lats) - Math.min(...lats) < 0.01) return; // a sliver along the pole
    if (shift !== 0) {
      // circles the pole (Antarctica): close the ring through the pole
      const pole = lats.reduce((a, b) => a + b, 0) < 0 ? -90 : 90;
      pts.push([pts[pts.length - 1][0], pole], [pts[0][0], pole]);
    }
    trace(pts, 0);
    const lons = pts.map((q) => q[0]);
    if (Math.min(...lons) < -180) trace(pts, width);
    if (Math.max(...lons) > 180) trace(pts, -width);
  };
  for (const f of land.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) poly.forEach(ring);
  }
  g.fillStyle = '#121a27';
  g.fill(fill, 'evenodd');
  g.strokeStyle = 'rgba(150, 175, 215, 0.38)';
  g.lineWidth = Math.max(1, width / 3600);
  g.stroke(coast);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
};

export function createEarth(textureWidth) {
  const group = new THREE.Group();
  const sun = new THREE.Vector3(-0.55, 0.35, 0.76).normalize();
  const map = drawLand(textureWidth);
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(1, 160, 96),
    new THREE.ShaderMaterial({
      uniforms: {uMap: {value: map}, uSun: {value: sun}},
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vUv = uv;
          vNormal = normalize(mat3(modelMatrix) * normal);
          vec4 world = modelMatrix * vec4(position, 1.0);
          vView = normalize(cameraPosition - world.xyz);
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform vec3 uSun;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vec3 base = texture2D(uMap, vUv).rgb;
          float light = dot(normalize(vNormal), uSun);
          float day = smoothstep(-0.25, 0.6, light);
          vec3 col = base * (0.38 + 1.1 * day);
          float facing = max(dot(normalize(vNormal), vView), 0.0);
          float rim = pow(1.0 - facing, 4.0);
          col += vec3(0.10, 0.22, 0.55) * rim * (0.08 + 0.5 * smoothstep(-0.2, 0.6, light));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  group.add(globe);
  // the glow just outside the limb: brightest where the view ray grazes the surface, fading out to 1.05 Earth radii
  const HALO = 1.05;
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(HALO, 128, 64),
    new THREE.ShaderMaterial({
      uniforms: {uSun: {value: sun}},
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun;
        varying vec3 vWorld;
        void main() {
          vec3 dir = normalize(vWorld - cameraPosition);
          float t = -dot(cameraPosition, dir);
          vec3 closest = cameraPosition + dir * t;
          float d = length(closest);
          float h = clamp((d - 1.0) / ${(HALO - 1).toFixed(3)}, 0.0, 1.0);
          float glow = pow(1.0 - h, 3.0);
          float lit = 0.18 + 0.82 * smoothstep(-0.35, 0.5, dot(normalize(closest), uSun));
          gl_FragColor = vec4(vec3(0.25, 0.5, 1.0) * glow * lit * 0.6, 1.0);
        }`,
    }),
  );
  group.add(halo);
  return {group, globe, sun};
}

// A fixed field of faint stars, seeded so every recorded frame matches.
export function createStars(count = 2200) {
  let s = 12345;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const pos = new Float32Array(count * 3);
  const bright = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const u = rand() * 2 - 1;
    const t = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    pos.set([r * Math.cos(t) * 400, u * 400, r * Math.sin(t) * 400], i * 3);
    bright[i] = Math.pow(rand(), 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aBright', new THREE.BufferAttribute(bright, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {uPx: {value: 1}},
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float aBright;
      uniform float uPx;
      varying float vB;
      void main() {
        vB = aBright;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (0.7 + 1.1 * aBright) * uPx;
      }`,
    fragmentShader: /* glsl */ `
      varying float vB;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * (0.1 + 0.45 * vB);
        gl_FragColor = vec4(vec3(0.75, 0.8, 0.95) * a, a);
      }`,
  });
  return new THREE.Points(geo, mat);
}
