import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
const q = new URLSearchParams(location.search);
const W = 1200, H = 900;
const renderer = new THREE.WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
renderer.setSize(W, H);
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.style.margin = '0';
document.body.style.background = '#111';
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15181d);
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(5, 8, 6);
scene.add(sun);
const draco = new DRACOLoader();
draco.setDecoderPath(location.origin + '/__draco/');
draco.setDecoderConfig({type: 'js'});
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);
loader.setMeshoptDecoder(MeshoptDecoder);
loader.load(q.get('m'), (g) => {
  const root = g.scene;
  scene.add(root);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  let tris = 0, meshes = 0;
  const mats = new Set(), texs = new Set();
  root.traverse((o) => {
    if (o.isMesh) {
      meshes++;
      const gg = o.geometry;
      tris += gg.index ? gg.index.count / 3 : gg.attributes.position.count / 3;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        mats.add(m.name || m.uuid);
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) if (m[k]) texs.add(m[k].uuid + k);
      });
    }
  });
  const r = size.length() / 2;
  const views = q.get('one') ? [[+q.get('az') || 35, +q.get('el') || 20]] : [[0, 0], [35, 20], [90, 0], [0, 89]];
  const cam = new THREE.PerspectiveCamera(30, (W / 2) / (H / 2), r / 100, r * 100);
  renderer.setScissorTest(true);
  views.forEach(([az, el], k) => {
    const one = views.length === 1;
    const x = one ? 0 : (k % 2) * W / 2, y = one ? 0 : (1 - Math.floor(k / 2)) * H / 2;
    const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
    const d = r / Math.sin(THREE.MathUtils.degToRad(15)) * (one ? 0.75 : 1.05);
    cam.position.set(c.x + d * Math.cos(e) * Math.sin(a), c.y + d * Math.sin(e), c.z + d * Math.cos(e) * Math.cos(a));
    cam.up.set(0, 1, 0);
    if (el > 80) cam.up.set(0, 0, -1);
    cam.lookAt(c);
    const vw = one ? W : W / 2, vh = one ? H : H / 2;
    cam.aspect = vw / vh; cam.updateProjectionMatrix();
    renderer.setViewport(x, y, vw, vh);
    renderer.setScissor(x, y, vw, vh);
    renderer.render(scene, cam);
  });
  window.STATS = {size: size.toArray().map((v) => +v.toFixed(3)), center: c.toArray().map((v) => +v.toFixed(3)), tris: Math.round(tris), meshes, mats: mats.size, texs: texs.size, anims: g.animations.length};
  window.DONE = true;
}, undefined, (e) => { window.STATS = {error: String(e)}; window.DONE = true; });
