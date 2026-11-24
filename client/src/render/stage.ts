import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LOOK } from './style.ts';

/** Final colour grade: a touch more saturation and contrast, like a cartoon poster. */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, sat: { value: 1.18 }, con: { value: 1.06 }, vig: { value: 0.0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float sat; uniform float con; uniform float vig; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 g = mix(vec3(l), c.rgb, sat); g = (g - 0.5) * con + 0.5;
      // soft cinematic vignette (warm, never black)
      vec2 d = vUv - 0.5; float v = smoothstep(0.35, 0.95, dot(d, d) * 2.2);
      g = mix(g, g * vec3(0.78, 0.7, 0.82), v * vig);
      gl_FragColor = vec4(clamp(g, 0.0, 1.0), c.a); }`,
};

/** Kills NaN / Infinity / absurd HDR values before bloom: one bad pixel otherwise smears into black boxes. */
const CleanShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      bool bad = any(isnan(c)) || any(isinf(c));
      gl_FragColor = bad ? vec4(0.0, 0.0, 0.0, 1.0) : vec4(clamp(c.rgb, 0.0, 12.0), 1.0); }`,
};

/** GTAO also shades sprites/labels (dark boxes round heroes), so it is opt-in: ?ao */
const AO_ON = new URLSearchParams(location.search).has('ao');

export type Quality = 'low' | 'medium' | 'high';

export const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export class Stage {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.5, 260);
  sun: THREE.DirectionalLight;
  composer: EffectComposer | null = null;
  bloom: UnrealBloomPass | null = null;
  quality: Quality;
  private skyMat!: THREE.ShaderMaterial;
  private hemi!: THREE.HemisphereLight;
  private sunOffset = new THREE.Vector3(-12, 26, 14);
  /** Vertical field of view (set by the camera preset). */
  fovBase = 45;
  private bloomCfg = { strength: 0.55, threshold: 0.82 };
  private gradeCfg = { sat: 1.18, con: 1.06 };
  private gradePass: ShaderPass | null = null;
  private ao: GTAOPass | null = null;
  private rim!: THREE.DirectionalLight;

  constructor(parent: HTMLElement, quality: Quality) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', stencil: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    parent.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;touch-action:none;display:block';

    // --- sky: big gradient dome (violet top → pink → warm horizon), matches docs/ui palette
    const skyGeo = new THREE.SphereGeometry(200, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color('#3f7dff') },
        mid: { value: new THREE.Color('#9b8cff') },
        horizon: { value: new THREE.Color('#ffc4ec') },
        bottom: { value: new THREE.Color('#8f7bff') },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vP;
        void main(){ float h = vP.y; vec3 c;
          if (h > 0.25) c = mix(mid, top, smoothstep(0.25, 0.9, h));
          else if (h > -0.05) c = mix(horizon, mid, smoothstep(-0.05, 0.25, h));
          else c = mix(horizon, bottom, smoothstep(-0.05, -0.6, h));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.skyMat = skyMat;
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.renderOrder = -10;
    this.scene.add(sky);
    this.scene.fog = new THREE.Fog('#c9b4ff', 60, 160);

    // --- lights
    const hemi = (this.hemi = new THREE.HemisphereLight('#dfe6ff', '#6a5a8c', 1.1));
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight('#fff0d4', 2.2);
    this.sun.position.set(-12, 26, 14);
    this.sun.castShadow = true;
    const sm = quality === 'high' ? 4096 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -18;
    sc.right = 18;
    sc.top = 18;
    sc.bottom = -18;
    sc.near = 1;
    sc.far = 70;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 4;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    const rim = (this.rim = new THREE.DirectionalLight('#9fd8ff', 0.7));
    rim.position.set(10, 8, -16);
    this.scene.add(rim);

    if (LOOK === 'toy') {
      // soft studio reflections: every surface gets a highlight and a bit of sky bounce (the "toy" sheen)
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environmentIntensity = 0.38;
      pm.dispose();
      this.sun.shadow.radius = 6;
      this.sun.shadow.blurSamples = 16;
    }

    this.setQuality(quality);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Sky, fog and lights for a map theme. */
  applyTheme(t: { grade?: { sat: number; con: number }; sky: { top: string; mid: string; horizon: string; bottom: string }; fog: { color: string; near: number; far: number }; hemi: { sky: string; ground: string; intensity: number }; sun: { color: string; intensity: number; pos: [number, number, number] }; exposure: number; bloom?: { strength: number; threshold: number } }) {
    this.bloomCfg = t.bloom ?? { strength: 0.55, threshold: 0.82 };
    this.gradeCfg = { sat: t.grade?.sat ?? 1.18, con: t.grade?.con ?? 1.06 };
    if (this.gradePass) {
      this.gradePass.uniforms.sat.value = this.gradeCfg.sat;
      this.gradePass.uniforms.con.value = this.gradeCfg.con;
    }
    if (this.bloom) {
      this.bloom.strength = this.bloomCfg.strength;
      this.bloom.threshold = this.bloomCfg.threshold;
    }
    const u = this.skyMat.uniforms;
    u.top.value.set(t.sky.top);
    u.mid.value.set(t.sky.mid);
    u.horizon.value.set(t.sky.horizon);
    u.bottom.value.set(t.sky.bottom);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.set(t.fog.color);
    fog.near = t.fog.near;
    fog.far = t.fog.far;
    this.hemi.color.set(t.hemi.sky);
    this.hemi.groundColor.set(t.hemi.ground);
    this.hemi.intensity = t.hemi.intensity;
    this.sun.color.set(t.sun.color);
    this.sun.intensity = t.sun.intensity;
    this.sunOffset.set(...t.sun.pos);
    this.renderer.toneMappingExposure = t.exposure;
    if (LOOK === 'toy') {
      // stronger key + weaker fill = real shadows and form; AgX needs a bit more exposure than ACES
      this.sun.intensity = t.sun.intensity * 1.15;
      this.hemi.intensity = t.hemi.intensity * 0.72;
      // bloom only on real HDR highlights (glows, muzzle flashes), never on pale ground
      this.bloomCfg = { strength: Math.min(this.bloomCfg.strength, 0.22), threshold: Math.max(this.bloomCfg.threshold, 1.1) };
      if (this.bloom) { this.bloom.strength = this.bloomCfg.strength; this.bloom.threshold = this.bloomCfg.threshold; }
      this.rim.intensity = 1.1;
      this.renderer.toneMappingExposure = t.exposure * 0.96;
      // clear weather: haze only at the far horizon, never over the arena
      fog.near = Math.max(fog.near, 110);
      fog.far = Math.max(fog.far, 300);
      this.gradeCfg = { sat: (t.grade?.sat ?? 1.18) * 1.06, con: t.grade?.con ?? 1.06 };
      if (this.gradePass) {
        this.gradePass.uniforms.sat.value = this.gradeCfg.sat;
        this.gradePass.uniforms.con.value = this.gradeCfg.con;
      }
    }
  }

  /** Keep the shadow camera centred on the action. */
  aimSun(x: number, z: number) {
    this.sun.position.set(x + this.sunOffset.x, this.sunOffset.y, z + this.sunOffset.z);
    this.sun.target.position.set(x, 0, z);
  }

  setQuality(q: Quality) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(Math.min(dpr, q === 'high' ? 2 : q === 'medium' ? 1.75 : 1.25)); // sharper: low res read as 'blurry'
    this.sun.castShadow = q !== 'low';
    if (q === 'low' || (AO_ON && this.composer && (q === 'high') !== !!this.ao)) {
      // rebuild when AO availability changes
      this.composer?.dispose();
      this.composer = null;
      this.ao = null;
    }
    if (q === 'low') {
      this.composer = null;
      this.bloom = null;
      this.gradePass = null;
    } else if (!this.composer) {
      // MSAA inside the composer (the canvas' own antialias is lost once we render to targets)
      const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, stencilBuffer: true, samples: 4 });
      const composer = new EffectComposer(this.renderer, rt);
      composer.addPass(new RenderPass(this.scene, this.camera));
      if (LOOK === 'toy' && q === 'high' && AO_ON) {
        // ground-truth AO: contact darkening where heroes, props and walls meet the floor
        const ao = new GTAOPass(this.scene, this.camera, 1, 1);
        ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12 });
        ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
        ao.blendIntensity = 0.85;
        composer.addPass(ao);
        this.ao = ao;
      }
      composer.addPass(new ShaderPass(CleanShader));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), this.bloomCfg.strength, 0.5, this.bloomCfg.threshold);
      composer.addPass(this.bloom);
      composer.addPass(new OutputPass());
      this.gradePass = new ShaderPass(GradeShader);
      this.gradePass.uniforms.sat.value = this.gradeCfg.sat;
      this.gradePass.uniforms.con.value = this.gradeCfg.con;
      this.gradePass.uniforms.vig.value = 0; // no vignette: players read it as blur
      composer.addPass(this.gradePass);
      this.composer = composer;
    }
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    // keep the island in view on narrow screens
    const asp = w / h;
    let fov = asp < 1.3 ? this.fovBase + 10 : this.fovBase;
    // very wide phone screens: cap the horizontal view so heroes don't shrink to dots
    if (asp > 1.8) {
      const hMax = 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * 1.8);
      fov = (2 * Math.atan(Math.tan(hMax / 2) / asp) * 180) / Math.PI;
    }
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
      // bloom at reduced resolution: cheap and soft
      this.bloom?.resolution.set(w / 2, h / 2);
      this.ao?.setSize(w * this.renderer.getPixelRatio(), h * this.renderer.getPixelRatio());
    }
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
