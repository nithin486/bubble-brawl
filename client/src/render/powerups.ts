import { release } from './dispose.ts';
import * as THREE from 'three';
import type { World } from '../../../shared/sim/world.ts';
import type { PowerKind } from '../../../shared/sim/types.ts';
import { TUNING } from '../../../shared/config/tuning.ts';

export const POWER_INFO: Record<PowerKind, { name: string; color: string; text: string }> = {
  magnet: { name: 'MAGNET', color: '#ff5f7a', text: 'Coins fly to you' },
  speed: { name: 'SPEED BOOTS', color: '#ffd23f', text: 'Run fast, no carry slowdown' },
  shield: { name: 'BUBBLE SHIELD', color: '#5ff0ff', text: 'Blocks the next hit' },
  bomb: { name: 'BUBBLE BOMB', color: '#ff8a3d', text: 'Boom! Knocks rivals away' },
  heal: { name: 'HEALTH', color: '#4be36a', text: '+50 health' },
  rage: { name: 'DOUBLE TROUBLE', color: '#ff4a6e', text: 'Your hits do much more damage' },
  energy: { name: 'SUPER ENERGY', color: '#b06bff', text: 'Fills your Super meter' },
};

/** Icon drawn into a canvas: used inside the 3D bubbles and on the HUD. */
export function powerIconCanvas(kind: PowerKind, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const s = size / 128;
  g.scale(s, s);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const col = POWER_INFO[kind].color;
  // disc
  const grd = g.createRadialGradient(54, 48, 6, 64, 64, 60);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(0.35, col);
  grd.addColorStop(1, shade(col));
  g.fillStyle = grd;
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 7;
  g.strokeStyle = '#ffffff';
  g.stroke();
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#2a1580';
  g.lineWidth = 8;
  if (kind === 'magnet') {
    g.beginPath();
    g.arc(64, 60, 26, Math.PI, 0);
    g.lineTo(90, 92);
    g.lineTo(74, 92);
    g.lineTo(74, 60);
    g.arc(64, 60, 10, 0, Math.PI, true);
    g.lineTo(54, 92);
    g.lineTo(38, 92);
    g.closePath();
    g.stroke();
    g.fill();
    g.fillStyle = '#2a1580';
    g.fillRect(38, 80, 16, 12);
    g.fillRect(74, 80, 16, 12);
  } else if (kind === 'speed') {
    g.beginPath();
    g.moveTo(70, 22);
    g.lineTo(38, 70);
    g.lineTo(60, 70);
    g.lineTo(52, 106);
    g.lineTo(90, 54);
    g.lineTo(68, 54);
    g.closePath();
    g.stroke();
    g.fill();
  } else if (kind === 'shield') {
    g.beginPath();
    g.moveTo(64, 24);
    g.lineTo(96, 36);
    g.quadraticCurveTo(96, 86, 64, 104);
    g.quadraticCurveTo(32, 86, 32, 36);
    g.closePath();
    g.stroke();
    g.fill();
  } else if (kind === 'heal') {
    g.beginPath();
    g.moveTo(52, 30);
    for (const [x, y] of [[76, 30], [76, 52], [98, 52], [98, 76], [76, 76], [76, 98], [52, 98], [52, 76], [30, 76], [30, 52], [52, 52]]) g.lineTo(x, y);
    g.closePath();
    g.stroke();
    g.fill();
  } else if (kind === 'rage') {
    // a flame
    g.beginPath();
    g.moveTo(66, 20);
    g.bezierCurveTo(70, 44, 98, 52, 94, 78);
    g.bezierCurveTo(92, 98, 76, 108, 62, 108);
    g.bezierCurveTo(44, 108, 32, 94, 34, 76);
    g.bezierCurveTo(35, 62, 44, 56, 46, 44);
    g.bezierCurveTo(56, 52, 58, 60, 57, 68);
    g.bezierCurveTo(70, 56, 72, 40, 66, 20);
    g.closePath();
    g.stroke();
    g.fill();
  } else if (kind === 'energy') {
    // a star
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 18 : 42;
      g[i ? 'lineTo' : 'moveTo'](64 + Math.cos(a) * r, 66 + Math.sin(a) * r);
    }
    g.closePath();
    g.stroke();
    g.fill();
  } else {
    g.beginPath();
    g.arc(60, 72, 28, 0, Math.PI * 2);
    g.stroke();
    g.fill();
    g.beginPath();
    g.moveTo(76, 48);
    g.quadraticCurveTo(84, 30, 98, 30);
    g.stroke();
    g.fillStyle = '#ffd23f';
    g.beginPath();
    g.arc(100, 28, 9, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

function shade(hex: string) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(0.55);
  return `#${c.getHexString()}`;
}

const bubbleMat = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 }, tint: { value: new THREE.Color('#9ff6ff') }, alpha: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; uniform float time; uniform vec3 tint; uniform float alpha;
      void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.0);
        vec3 irid = 0.5 + 0.5*cos(6.2831*(vec3(0.0,0.33,0.67) + f*1.4 + vP.y*0.6 + time*0.2));
        vec3 col = mix(tint, irid, 0.45);
        float s = pow(max(0.0, dot(reflect(-vV, vN), normalize(vec3(-0.4,0.8,0.4)))), 30.0);
        gl_FragColor = vec4(col + s, (0.06 + f*0.8 + s) * alpha); }`,
  });

interface BubbleView {
  g: THREE.Group;
  born: number;
}
interface BombView {
  g: THREE.Group;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  ball: THREE.Mesh;
  ballMat: THREE.MeshStandardMaterial;
  spark: THREE.Sprite;
}
interface Aura {
  shield: THREE.Mesh;
  shieldMat: THREE.ShaderMaterial;
  magnet: THREE.Mesh;
  speed: THREE.Mesh;
}

export class PowerView {
  private scene: THREE.Scene;
  private world: World;
  private bubbles = new Map<number, BubbleView>();
  private bombs = new Map<number, BombView>();
  private auras: Aura[] = [];
  private icons = new Map<PowerKind, THREE.Texture>();
  private glowTex: THREE.Texture;
  private bubbleGeo = new THREE.SphereGeometry(0.8, 28, 18);

  constructor(world: World, scene: THREE.Scene, glowTex: THREE.Texture) {
    this.scene = scene;
    this.world = world;
    this.glowTex = glowTex;
    for (const k of Object.keys(POWER_INFO) as PowerKind[]) {
      const t = new THREE.CanvasTexture(powerIconCanvas(k));
      t.colorSpace = THREE.SRGBColorSpace;
      this.icons.set(k, t);
    }
    for (let i = 0; i < world.players.length; i++) this.auras.push(this.makeAura());
  }

  private makeAura(): Aura {
    const shieldMat = bubbleMat();
    shieldMat.uniforms.tint.value.set('#5ff0ff');
    const shield = new THREE.Mesh(new THREE.SphereGeometry(1.15, 32, 20), shieldMat);
    shield.position.y = 0.95;
    shield.visible = false;
    shield.renderOrder = 6;
    const magnet = new THREE.Mesh(
      new THREE.TorusGeometry(TUNING.powerups.magnet.radius, 0.03, 6, 64),
      new THREE.MeshBasicMaterial({ color: '#ff5f7a', transparent: true, opacity: 0.6, toneMapped: false }),
    );
    magnet.rotation.x = Math.PI / 2;
    magnet.position.y = 0.1;
    magnet.visible = false;
    const speed = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 1.0, 32, 1, 0, Math.PI * 1.2),
      new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.85, side: THREE.DoubleSide, toneMapped: false }),
    );
    speed.rotation.x = -Math.PI / 2;
    speed.position.y = 0.06;
    speed.visible = false;
    this.scene.add(shield, magnet, speed);
    return { shield, shieldMat, magnet, speed };
  }

  /** Swap in a new world (rematch) without rebuilding textures. */
  setWorld(world: World) {
    this.world = world;
    for (const b of this.bubbles.values()) release(b.g);
    for (const b of this.bombs.values()) release(b.g);
    this.bubbles.clear();
    this.bombs.clear();
  }

  private makeBubble(kind: PowerKind) {
    const g = new THREE.Group();
    const mat = bubbleMat();
    mat.uniforms.tint.value.set(POWER_INFO[kind].color);
    const bubble = new THREE.Mesh(this.bubbleGeo, mat);
    bubble.renderOrder = 6;
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.icons.get(kind), transparent: true, depthWrite: false, toneMapped: false }));
    icon.scale.setScalar(1.05);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: POWER_INFO[kind].color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    glow.scale.setScalar(2.4);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), new THREE.MeshBasicMaterial({ color: '#1a0b40', transparent: true, opacity: 0.3, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.name = 'shadow';
    // glowing ground marker so you can spot power bubbles from across the island
    const mark = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 0.95, 40),
      new THREE.MeshBasicMaterial({ color: POWER_INFO[kind].color, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    );
    mark.rotation.x = -Math.PI / 2;
    shadow.add(mark);
    mark.rotation.x = 0;
    mark.position.z = 0.01;
    g.add(glow, icon, bubble, shadow);
    return g;
  }

  private makeBomb(): BombView {
    const g = new THREE.Group();
    const ballMat = new THREE.MeshStandardMaterial({ color: '#2a2440', roughness: 0.35, metalness: 0.3, emissive: '#ff2a2a', emissiveIntensity: 0 });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), ballMat);
    ball.position.y = 0.45;
    ball.castShadow = true;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.14, 12), new THREE.MeshStandardMaterial({ color: '#8a8aa0', metalness: 0.6, roughness: 0.3 }));
    cap.position.y = 0.88;
    const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#ffd23f', blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    spark.position.y = 1.02;
    spark.scale.setScalar(0.6);
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ff4a3d', transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ball, cap, spark, ring);
    this.scene.add(g);
    return { g, ring, ringMat, ball, ballMat, spark };
  }

  update(time: number) {
    const w = this.world;
    // power bubbles
    const live = new Set<number>();
    for (const u of w.powerups) {
      live.add(u.id);
      let v = this.bubbles.get(u.id);
      if (!v) {
        v = { g: this.makeBubble(u.kind), born: time };
        this.scene.add(v.g);
        this.bubbles.set(u.id, v);
      }
      const k = Math.min(1, (time - v.born) / 0.5);
      const pop = k < 1 ? 1 - Math.pow(1 - k, 3) * Math.cos(k * 9) : 1;
      v.g.position.set(u.x, 1.0 + Math.sin(time * 2.4 + u.id) * 0.15, u.z);
      v.g.scale.setScalar(pop * (1 + Math.sin(time * 3 + u.id) * 0.04));
      v.g.rotation.y = time * 0.8;
      const sh = v.g.getObjectByName('shadow')!;
      sh.position.y = -v.g.position.y + 0.03;
      v.g.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
        if (m?.uniforms?.time) m.uniforms.time.value = time;
      });
    }
    for (const [id, v] of this.bubbles) if (!live.has(id)) {
      this.scene.remove(v.g);
      this.bubbles.delete(id);
    }

    // bombs
    const liveB = new Set<number>();
    for (const b of w.bombs) {
      liveB.add(b.id);
      let v = this.bombs.get(b.id);
      if (!v) {
        v = this.makeBomb();
        this.bombs.set(b.id, v);
      }
      const fuse = TUNING.powerups.bomb.fuse;
      const k = 1 - b.fuse / fuse; // 0 → 1
      v.g.position.set(b.x, 0, b.z);
      const blink = Math.sin(time * (10 + k * 40)) > 0;
      v.ballMat.emissiveIntensity = blink ? 0.4 + k * 1.2 : 0;
      v.ball.scale.setScalar(1 + k * 0.25 + (blink ? 0.05 : 0));
      const R = TUNING.powerups.bomb.radius;
      v.ring.scale.setScalar(R * (0.2 + 0.8 * Math.min(1, k * 2.5)));
      v.ringMat.opacity = 0.35 + (blink ? 0.35 : 0);
      v.spark.scale.setScalar(0.5 + Math.random() * 0.4);
    }
    for (const [id, v] of this.bombs) if (!liveB.has(id)) {
      this.scene.remove(v.g);
      this.bombs.delete(id);
    }

    // auras on players
    w.players.forEach((p, i) => {
      const a = this.auras[i];
      const air = p.state === 'falling';
      a.shield.visible = p.shieldT > 0 && !air;
      a.shield.position.set(p.x, p.y + 0.95, p.z);
      a.shieldMat.uniforms.time.value = time;
      a.shieldMat.uniforms.alpha.value = p.shieldT < 2 && Math.sin(time * 18) > 0 ? 0.35 : 1;
      a.magnet.visible = p.magnetT > 0 && !air;
      a.magnet.position.set(p.x, 0.1, p.z);
      a.magnet.rotation.z = time * 2;
      (a.magnet.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.12 * Math.sin(time * 8);
      a.speed.visible = p.speedT > 0 && !air;
      a.speed.position.set(p.x, 0.06, p.z);
      a.speed.rotation.z = -time * 10;
    });
  }
}
