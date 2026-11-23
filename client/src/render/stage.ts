import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

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

  constructor(parent: HTMLElement, quality: Quality) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', powerPreference: 'high-performance' });
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
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.renderOrder = -10;
    this.scene.add(sky);
    this.scene.fog = new THREE.Fog('#c9b4ff', 60, 160);

    // --- lights
    const hemi = new THREE.HemisphereLight('#dfe6ff', '#6a5a8c', 1.1);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight('#fff0d4', 2.2);
    this.sun.position.set(-12, 26, 14);
    this.sun.castShadow = true;
    const sm = quality === 'high' ? 2048 : 1024;
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
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    const rim = new THREE.DirectionalLight('#9fd8ff', 0.7);
    rim.position.set(10, 8, -16);
    this.scene.add(rim);

    this.setQuality(quality);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setQuality(q: Quality) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(Math.min(dpr, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1));
    this.sun.castShadow = q !== 'low';
    if (q === 'low') {
      this.composer = null;
      this.bloom = null;
    } else if (!this.composer) {
      const composer = new EffectComposer(this.renderer);
      composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 0.82);
      composer.addPass(this.bloom);
      composer.addPass(new OutputPass());
      this.composer = composer;
    }
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    // keep the island in view on narrow screens
    this.camera.fov = w / h < 1.3 ? 55 : 45;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
      // bloom at reduced resolution: cheap and soft
      this.bloom?.resolution.set(w / 2, h / 2);
    }
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
