// Genesis — scroll from deep space down into daylight.
// Fixed fullscreen canvas; scroll position drives the sky, pointer stirs the nebula.

import { Program, makeBlit } from './gl.js';
import { VERTEX, COMPOSITE } from './shaders.js';
import { FluidSim } from './fluid.js';

const canvas = document.getElementById('gl');

function fallbackToCSS() {
  document.body.classList.add('no-gl');
}

const gl = canvas.getContext('webgl2', {
  alpha: false,
  depth: false,
  stencil: false,
  antialias: false,
  powerPreference: 'high-performance',
});

if (!gl || !gl.getExtension('EXT_color_buffer_float')) {
  fallbackToCSS();
} else {
  start(gl);
}

function start(gl) {
  const DPR_CAP = 2;

  function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      return true;
    }
    return false;
  }
  sizeCanvas();

  const fluid = new FluidSim(gl);
  const composite = new Program(gl, VERTEX, COMPOSITE);
  const blit = makeBlit(gl);

  // --- Scroll: raw target + smoothed value fed to the shader ---
  let scrollTarget = 0;
  let scrollSmooth = 0;
  function readScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    scrollTarget = max > 0 ? window.scrollY / max : 0;
  }
  window.addEventListener('scroll', readScroll, { passive: true });
  readScroll();

  // --- Pointer: accumulate movement between frames, splat once per frame ---
  const pointer = { x: 0.5, y: 0.5, dx: 0, dy: 0, active: false };
  window.addEventListener('pointermove', (e) => {
    const x = e.clientX / window.innerWidth;
    const y = 1 - e.clientY / window.innerHeight; // GL uv, origin bottom-left
    if (pointer.active) {
      pointer.dx += x - pointer.x;
      pointer.dy += y - pointer.y;
    }
    pointer.x = x;
    pointer.y = y;
    pointer.active = true;
  }, { passive: true });
  window.addEventListener('pointerleave', () => { pointer.active = false; });
  window.addEventListener('blur', () => { pointer.active = false; });

  window.addEventListener('resize', () => {
    if (sizeCanvas()) fluid.resize();
  });

  let last = performance.now();
  let time = 0;

  function frame(now) {
    const dt = Math.min(Math.max((now - last) / 1000, 0), 1 / 30);
    last = now;
    time += dt;

    // Ease scroll so the sky glides instead of jumping on wheel ticks.
    scrollSmooth += (scrollTarget - scrollSmooth) * (1 - Math.exp(-dt * 5));

    // Cursor push, "blend" style: a local radial shove (three jittered
    // sub-splats written straight into the displacement field — the parting)
    // plus a soft directional drag through the fluid sim (the wake).
    // Only while the nebula is on screen (it fades out by ~half scroll).
    const speed = Math.hypot(pointer.dx, pointer.dy);
    if (pointer.active && speed > 0 && scrollSmooth < 0.45) {
      const part = Math.min(speed * 2.8, 0.09);
      for (let i = 0; i < 3; i++) {
        const jx = (Math.random() - 0.5) * 0.016;
        const jy = (Math.random() - 0.5) * 0.016;
        const rad = 0.0028 * (0.5 + Math.random());
        fluid.splat('offset', pointer.x + jx, pointer.y + jy, part * 0.35, 0, rad, 1);
      }
      const f = fluid.config.splatForce * 0.5;
      fluid.splat('velocity', pointer.x, pointer.y, pointer.dx * f, pointer.dy * f, 0.0015, 0);
      pointer.dx = 0;
      pointer.dy = 0;
    }

    fluid.step(dt, scrollSmooth);

    composite.use();
    gl.uniform1i(composite.uniforms.uDye, fluid.cloud.attach(0));
    gl.uniform1f(composite.uniforms.uScroll, scrollSmooth);
    gl.uniform1f(composite.uniforms.uTime, time);
    gl.uniform1f(composite.uniforms.uAspect, gl.drawingBufferWidth / gl.drawingBufferHeight);
    blit(null);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
