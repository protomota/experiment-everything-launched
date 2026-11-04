// Shrinks the NASA models for the web: drops animations, joins and welds meshes, simplifies heavy ones, resizes
// textures to WebP and packs geometry with meshopt. node tools/models.mjs [names...]
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup, flatten, join, weld, simplify, prune, textureCompress, meshopt, quantize, resample, instance, palette} from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import {MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';

// target triangle counts (simplify only when a model is above it); [count, error] lets a dense model lose more detail
const MODELS = {
  'explorer-jupiter-c-rocket': 20000,
  'atlas-6-friendship-7': 30000,
  gemini: 40000,
  'agena-target-vehicle': 30000,
  'saturn-v': 40000,
  skylab: 30000,
  'apollo-soyuz': 40000,
  'space-shuttle-a': 60000,
  'space-shuttle-d': 40000,
  'space-shuttle-d-door-prt': 10000,
  'space-shuttle-d-door-stb': 10000,
  mir: 10000,
  'hubble-space-telescope-a': 20000,
  'international-space-station-iss-a': 20000,
  'international-space-station-iss-b': 60000,
  'landsat-1-2-and-3': 30000,
  'voyager-probe-a': 30000,
  'voyager-probe-b': 30000,
  'james-webb-space-telescope-b': 30000,
  'cassini-huygens-a': 40000,
  'chandra-x-ray-observatory': 30000,
  galileo: 30000,
  'gamma-ray-observatory': 30000,
  'ingenuity-mars-helicopter': 15000,
  'juno-a': 40000,
  'kepler-a': 30000,
  magellan: 30000,
  'mars-2020-perseverance-rover': 50000,
  // NASA/JPL-Caltech's textured Spirit and Opportunity model (science.nasa.gov/resource/spirit-and-opportunity-rover-3d-model)
  'mars-exploration-rover-jpl': 32000,
  'parker-solar-probe': 30000,
  'pioneer-10': 30000,
  rosetta: 30000,
  'solar-and-heliospheric-observatory': 30000,
  'viking-lander': 30000,
  'redstone-3-freedom-7': [30000, 0.01],
  'tracking-and-data-relay-satellites-tdrs-a': 20000,
  ulysses: 30000,
  stardust: 30000,
  'spitzer-space-telescope': 30000,
  messenger: 30000,
  dawn: 30000,
  'osiris-rex': [30000, 0.05],
  'insight-lander': [30000, 0.03],
  'insight-lander-b': 40000,
  // not NASA's: "2008 Tesla Roadster" by the 86 guy, CC BY 4.0 (https://skfb.ly/oP8Mt), roof off, in models/sketchfab/
  'tesla-roadster-2008': 40000,
};
const FROM = {'tesla-roadster-2008': 'models/sketchfab'};
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(MODELS);
const tris = (doc) => {
  let n = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const idx = p.getIndices();
    n += idx ? idx.getCount() / 3 : p.getAttribute('POSITION').getCount() / 3;
  }
  return Math.round(n);
};
for (const name of names) {
  const src = `${FROM[name] || 'models/nasa'}/${name}.glb`;
  const doc = await io.read(src);
  for (const a of doc.getRoot().listAnimations()) a.dispose();
  doc.getRoot().listExtensionsUsed().forEach((e) => { if (e.extensionName === 'KHR_draco_mesh_compression') e.dispose(); });
  const before = tris(doc);
  await doc.transform(dedup(), instance({min: 5}), flatten(), join(), weld());
  const [target, error] = [MODELS[name]].flat().concat(0.002);
  const now = tris(doc);
  if (now > target) await doc.transform(simplify({simplifier: MeshoptSimplifier, ratio: target / now, error, lockBorder: false}));
  await doc.transform(
    prune(),
    textureCompress({encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82}),
    quantize(),
    meshopt({encoder: MeshoptEncoder, level: 'medium'}),
  );
  const out = `models/web/${name}.glb`;
  await io.write(out, doc);
  console.log(name, before, '->', tris(doc), 'tris', (fs.statSync(src).size / 1e6).toFixed(2), '->', (fs.statSync(out).size / 1e6).toFixed(2), 'MB');
}
