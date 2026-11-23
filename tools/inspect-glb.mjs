import { NodeIO } from '@gltf-transform/core';
const io = new NodeIO();
const f = process.argv[2];
const doc = await io.read(f);
const r = doc.getRoot();
console.log('meshes:', r.listNodes().filter(n=>n.getMesh()).map(n=>n.getName()).join(', '));
console.log('anims', r.listAnimations().length, r.listAnimations().map(a=>a.getName()).join(','));
console.log('textures', r.listTextures().map(t=>t.getName()+':'+t.getMimeType()+':'+t.getImage().byteLength+':'+JSON.stringify(t.getSize())));
console.log('skins', r.listSkins().length, 'joints', r.listSkins()[0]?.listJoints().length);
