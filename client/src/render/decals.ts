import * as THREE from 'three';
import type { Decal } from './themes.ts';

type Kind = Parameters<Decal>[0];

/** Hand-painted (canvas) ground details: cheap, tiny, and they break up flat floors. */
const texCache = new Map<Kind, THREE.Texture>();
const matCache = new Map<Kind, THREE.Material>();
const plane = new THREE.PlaneGeometry(1, 1);
let tuft: THREE.BufferGeometry | null = null;

function canvas(draw: (g: CanvasRenderingContext2D, s: number) => void, s = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = s;
  draw(c.getContext('2d')!, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

function texture(kind: Kind): THREE.Texture {
  let t = texCache.get(kind);
  if (t) return t;
  const r = rng(kind.length * 977 + 13);
  switch (kind) {
    case 'manhole':
      t = canvas((g, s) => {
        const c = s / 2;
        g.fillStyle = '#3b3946';
        g.beginPath(); g.arc(c, c, c - 4, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#5c5a6a'; g.lineWidth = 6;
        g.beginPath(); g.arc(c, c, c - 10, 0, Math.PI * 2); g.stroke();
        g.lineWidth = 4;
        for (let i = -3; i <= 3; i++) {
          g.beginPath(); g.moveTo(c + i * 13, c - 40 + Math.abs(i) * 4); g.lineTo(c + i * 13, c + 40 - Math.abs(i) * 4); g.stroke();
        }
        g.fillStyle = '#26242f';
        g.beginPath(); g.arc(c, c, 9, 0, Math.PI * 2); g.fill();
      });
      break;
    case 'puddle':
      t = canvas((g, s) => {
        const gr = g.createRadialGradient(s * 0.45, s * 0.45, 4, s / 2, s / 2, s / 2);
        gr.addColorStop(0, 'rgba(190,225,255,0.85)');
        gr.addColorStop(0.55, 'rgba(120,160,230,0.7)');
        gr.addColorStop(0.85, 'rgba(80,90,150,0.45)');
        gr.addColorStop(1, 'rgba(80,90,150,0)');
        g.fillStyle = gr;
        g.beginPath();
        for (let a = 0; a <= 24; a++) {
          const ang = (a / 24) * Math.PI * 2;
          const rr = s * (0.34 + r() * 0.12);
          g.lineTo(s / 2 + Math.cos(ang) * rr, s / 2 + Math.sin(ang) * rr * 0.7);
        }
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.7)';
        g.beginPath(); g.ellipse(s * 0.38, s * 0.42, 14, 4, -0.3, 0, Math.PI * 2); g.fill();
      });
      break;
    case 'crack':
      t = canvas((g, s) => {
        g.strokeStyle = 'rgba(40,34,52,0.75)';
        g.lineCap = 'round';
        const branch = (x: number, y: number, a: number, len: number, w: number) => {
          if (len < 6 || w < 0.6) return;
          const x2 = x + Math.cos(a) * len;
          const y2 = y + Math.sin(a) * len;
          g.lineWidth = w;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
          branch(x2, y2, a + (r() - 0.5) * 0.9, len * 0.8, w * 0.8);
          if (r() < 0.45) branch(x2, y2, a + (r() < 0.5 ? 0.9 : -0.9), len * 0.55, w * 0.6);
        };
        branch(s / 2, s / 2, 0.2, 20, 4);
        branch(s / 2, s / 2, Math.PI + 0.3, 18, 3.5);
      });
      break;
    case 'leaves':
      t = canvas((g, s) => {
        const cols = ['#e8a23a', '#d9653b', '#f2c94c', '#b5532f'];
        for (let i = 0; i < 14; i++) {
          g.save();
          g.translate(s * (0.2 + r() * 0.6), s * (0.2 + r() * 0.6));
          g.rotate(r() * 6.3);
          g.fillStyle = cols[i % 4];
          g.beginPath(); g.ellipse(0, 0, 9, 4.5, 0, 0, Math.PI * 2); g.fill();
          g.restore();
        }
      });
      break;
    case 'moss':
      t = canvas((g, s) => {
        for (let i = 0; i < 40; i++) {
          const x = s / 2 + (r() - 0.5) * s * 0.7;
          const y = s / 2 + (r() - 0.5) * s * 0.7;
          const gr = g.createRadialGradient(x, y, 0, x, y, 14);
          gr.addColorStop(0, 'rgba(120,170,90,0.55)');
          gr.addColorStop(1, 'rgba(120,170,90,0)');
          g.fillStyle = gr;
          g.fillRect(x - 14, y - 14, 28, 28);
        }
      });
      break;
    case 'grass':
      t = canvas((g, s) => {
        for (let i = 0; i < 11; i++) {
          const x = s * (0.15 + (i / 10) * 0.7);
          const h = s * (0.45 + r() * 0.5);
          const lean = (r() - 0.5) * 30;
          const gr = g.createLinearGradient(0, s, 0, s - h);
          gr.addColorStop(0, '#2f7a2c');
          gr.addColorStop(1, '#9be05a');
          g.fillStyle = gr;
          g.beginPath(); g.moveTo(x - 6, s); g.quadraticCurveTo(x + lean * 0.3, s - h * 0.6, x + lean, s - h); g.quadraticCurveTo(x + lean * 0.3 + 3, s - h * 0.5, x + 6, s); g.fill();
        }
      });
      break;
  }
  texCache.set(kind, t!);
  return t!;
}

function material(kind: Kind) {
  let m = matCache.get(kind);
  if (!m) {
    const map = texture(kind);
    m =
      kind === 'grass'
        ? new THREE.MeshLambertMaterial({ map, alphaTest: 0.4, side: THREE.DoubleSide })
        : new THREE.MeshLambertMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    if (kind === 'puddle') (m as THREE.MeshLambertMaterial).emissive = new THREE.Color('#6a7fc8').multiplyScalar(0.35);
    matCache.set(kind, m);
  }
  return m;
}

/** Two crossed planes: a little tuft of grass that stands up. */
function tuftGeo() {
  if (tuft) return tuft;
  const a = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const b = a.clone().rotateY(Math.PI / 2);
  const pos = [...a.attributes.position.array, ...b.attributes.position.array];
  const uv = [...a.attributes.uv.array, ...b.attributes.uv.array];
  const nrm = [...a.attributes.normal.array, ...b.attributes.normal.array];
  const idx = [...(a.index!.array as ArrayLike<number> & Iterable<number>)];
  const idx2 = [...(b.index!.array as ArrayLike<number> & Iterable<number>)].map((i) => i + 4);
  tuft = new THREE.BufferGeometry();
  tuft.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tuft.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  tuft.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  tuft.setIndex([...idx, ...idx2]);
  return tuft;
}

export function makeDecal(kind: Kind, size: number, x = 0, z = 0, rot = 0): THREE.Mesh {
  if (kind === 'grass') {
    const m = new THREE.Mesh(tuftGeo(), material(kind));
    m.scale.set(size, size * 0.6, size);
    m.position.set(x, 0, z);
    m.rotation.y = rot;
    return m;
  }
  const m = new THREE.Mesh(plane, material(kind));
  m.rotation.set(-Math.PI / 2, 0, rot);
  m.scale.setScalar(size);
  m.position.set(x, 0.035, z);
  m.receiveShadow = true;
  m.renderOrder = 1;
  return m;
}
