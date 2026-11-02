import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder': MeshoptDecoder});
for (const n of process.argv.slice(2)) {
  const doc = await io.read(`models/web/${n}.glb`);
  console.log('==', n);
  for (const m of doc.getRoot().listMaterials()) console.log('  ', JSON.stringify(m.getName()), m.getBaseColorFactor().map((x) => x.toFixed(2)).join(','), m.getBaseColorTexture() ? 'tex' : '', 'met', m.getMetallicFactor(), 'rough', m.getRoughnessFactor());
}
