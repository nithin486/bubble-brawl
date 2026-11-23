import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder': MeshoptDecoder});
const doc = await io.read(process.argv[2]);
const r = doc.getRoot();
let anim=0, mesh=0; const animAcc=new Set();
for (const a of r.listAnimations()) for (const s of a.listSamplers()) { animAcc.add(s.getInput()); animAcc.add(s.getOutput()); }
for (const acc of r.listAccessors()) { const b = acc.getArray().byteLength; if (animAcc.has(acc)) anim+=b; else mesh+=b; }
console.log('anim bytes(raw)', anim, 'mesh bytes(raw)', mesh, 'tex', r.listTextures().map(t=>t.getImage().byteLength));
const prims = r.listMeshes().flatMap(m=>m.listPrimitives()); console.log('verts', prims.reduce((s,p)=>s+p.getAttribute('POSITION').getCount(),0));
for (const a of r.listAnimations().slice(0,3)) console.log(a.getName(), a.listChannels().length, a.listSamplers()[0].getInput().getCount());
const list = r.listAccessors().map(a=>[a.getArray().byteLength, a.getType(), a.getCount(), a.listParents().map(p=>p.propertyType+':'+(p.getName?.()||'')).join('|')]).sort((a,b)=>b[0]-a[0]).slice(0,12);
console.log(list);
const by={}; for (const a of r.listAccessors()) { const k=a.listParents().filter(p=>p.propertyType!=='Root').map(p=>p.propertyType).join('|')||'none'; by[k]=(by[k]||[0,0]); by[k][0]+=a.getArray().byteLength; by[k][1]++; }
console.log(by, 'nodes', r.listNodes().length);
