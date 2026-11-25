import type { Input } from '../../shared/sim/types.ts';

/**
 * Keyboard + mouse + touch → sim Input. Camera looks toward -z, so "up" on screen is -z.
 * Button presses latch until the sim consumes them (no lost taps between frames).
 */
export class InputManager {
  private keys = new Set<string>();
  private latch = { dash: false, grab: false, skill: false };
  private stick = { x: 0, y: 0, active: false };
  /** Fire held down: mouse button, J key or the touch fire button (automatic weapons keep shooting). */
  private mouseHeld = false;
  private touchHeld = false;
  /** Look speed multiplier (Settings). */
  sensitivity = 1;
  onFirstInput: (() => void) | null = null;
  onAnyKey: ((code: string) => void) | null = null;
  enabled = true;
  /** Camera turn accumulated since the last read (radians). */
  private yaw = 0;
  private pitch = 0;
  /** When true (third-person view) a click locks the mouse so it can turn the camera. */
  mouseLook = false;
  /** How far ahead the aim scope sits (metres); mouse up / down slides it. */
  aimDist = 8;
  /** Cursor position in CSS px, and when it last moved (the scope follows it on desktop). */
  mouse = { x: 0, y: 0, t: -99 };

  constructor(canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.first();
      this.onAnyKey?.(e.code);
      if (e.code === 'Space') this.press('dash');
      if (e.code === 'KeyJ') this.press('grab');
      if (e.code === 'KeyK') this.press('skill');
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseHeld = this.touchHeld = false;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseHeld = false;
    });
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.t = performance.now();
      if (document.pointerLockElement === canvas) {
        this.yaw -= e.movementX * 0.0025 * this.sensitivity;
        this.pitch -= e.movementY * 0.0021 * this.sensitivity; // mouse up = look up
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (this.mouseLook && document.pointerLockElement !== canvas && this.enabled) {
        // first click only captures the mouse (no accidental grab)
        canvas.requestPointerLock?.();
        return;
      }
      if (e.button === 0) {
        this.press('grab');
        this.mouseHeld = true;
      }
      if (e.button === 2) this.press('skill');
      this.first();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private first() {
    if (this.onFirstInput) {
      const f = this.onFirstInput;
      this.onFirstInput = null;
      f();
    }
  }

  press(b: 'dash' | 'grab' | 'skill') {
    if (!this.enabled) return;
    this.latch[b] = true;
    this.first();
  }

  setStick(x: number, y: number, active: boolean) {
    this.stick.x = x;
    this.stick.y = y;
    this.stick.active = active;
    if (active && (x || y)) this.first();
  }

  /** Drag-to-look from the touch look zone. */
  look(dx: number, dy = 0) {
    this.yaw -= dx * 0.0068 * this.sensitivity;
    this.pitch -= dy * 0.0048 * this.sensitivity; // drag up = look up
  }

  holdFire(on: boolean) {
    this.touchHeld = on;
  }

  get firing() {
    return this.enabled && (this.mouseHeld || this.touchHeld || this.keys.has('KeyJ'));
  }

  /** Camera turn since last call (mouse, touch drag, Q/E). */
  takeYaw(dt: number) {
    let y = this.yaw;
    this.yaw = 0;
    if (this.keys.has('KeyQ')) y += dt * 2.6;
    if (this.keys.has('KeyE')) y -= dt * 2.6;
    return y;
  }

  /** Camera look up/down since last call. */
  takePitch() {
    const p = this.pitch;
    this.pitch = 0;
    return p;
  }

  releaseMouse() {
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  /** Read and clear. */
  read(): Input {
    let mx = 0;
    let mz = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) mz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) mz += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (this.stick.active) {
      mx += this.stick.x;
      mz += this.stick.y;
    }
    const m = Math.hypot(mx, mz);
    if (m > 1) {
      mx /= m;
      mz /= m;
    }
    const out: Input = { mx, mz, dash: this.latch.dash, grab: this.latch.grab, skill: this.latch.skill };
    this.latch.dash = this.latch.grab = this.latch.skill = false;
    if (!this.enabled) return { mx: 0, mz: 0, dash: false, grab: false, skill: false };
    return out;
  }

  get moving() {
    const k = this.keys;
    return this.stick.active || ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some((c) => k.has(c));
  }
}
