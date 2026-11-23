import { NodeIO } from '@gltf-transform/core';
import { resample } from '@gltf-transform/functions';
const io = new NodeIO();
const doc = await io.read(process.argv[2]);
await doc.transform(resample({tolerance:0.0005}));
const keep = new Set(['Idle','Running_A','Cheer','Hit_A']);
let tot=0, constRest=0, constOther=0; const byPath={};
for (const a of doc.getRoot().listAnimations()) { if(!keep.has(a.getName())) continue;
 for (const ch of a.listChannels()) { tot++; const s=ch.getSampler(); const out=s.getOutput(); const n=out.getElementSize(); const arr=out.getArray();
  let constant=true; for(let i=n;i<arr.length;i++) if(Math.abs(arr[i]-arr[i%n])>1e-4){constant=false;break;}
  const node=ch.getTargetNode(); const p=ch.getTargetPath(); const rest= p==='translation'?node.getTranslation():p==='rotation'?node.getRotation():node.getScale();
  const eq = constant && rest.every((v,i)=>Math.abs(v-arr[i])<1e-3);
  if(eq) constRest++; else if(constant) constOther++; byPath[p+(eq?'=':constant?'c':'')]=(byPath[p+(eq?'=':constant?'c':'')]||0)+1; }}
console.log({tot,constRest,constOther,byPath});
