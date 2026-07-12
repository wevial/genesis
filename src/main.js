// Genesis — scroll from deep space down into daylight.
// Fixed fullscreen canvas; scroll position drives the sky, pointer parts the nebula.

import { Program, makeBlit } from './gl.js';
import { VERTEX, COMPOSITE } from './shaders.js';
import { FluidSim } from './fluid.js';
import { Governor, TIERS } from './perf.js';

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
  let dprCap = 2;
  let running = true;
  let rafId = 0;

  function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      return true;
    }
    return false;
  }
  // The governor picks the initial tier before any GPU allocation, so weak
  // devices never build full-size buffers just to throw them away.
  const governor = new Governor({
    debug: new URLSearchParams(location.search).has('perf'),
    onApply(tier) {
      dprCap = tier.dpr;
      fluid.config.simResolution = tier.sim;
      fluid.config.cloudResolution = tier.cloud;
      fluid.config.pressureIterations = tier.iters;
      sizeCanvas();
      fluid.resize();
    },
    onFallback() {
      running = false;
      cancelAnimationFrame(rafId);
      fallbackToCSS();
    },
  });
  if (!running) return;

  dprCap = TIERS[governor.tier].dpr;
  sizeCanvas();
  const fluid = new FluidSim(gl, TIERS[governor.tier]);
  const composite = new Program(gl, VERTEX, COMPOSITE);
  const blit = makeBlit(gl);

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  // --- Scroll: raw target + smoothed value fed to the shader ---
  let scrollTarget = 0;
  let scrollSmooth = 0;
  function readScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    scrollTarget = max > 0 ? window.scrollY / max : 0;
  }
  window.addEventListener('scroll', readScroll, { passive: true });
  readScroll();
  scrollSmooth = scrollTarget;

  // --- Pointer: accumulate movement between frames, splat once per frame.
  // Mouse only — touch is for scrolling, not stirring. ---
  const pointer = { x: 0.5, y: 0.5, dx: 0, dy: 0, active: false };
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
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

  // Pause the whole loop while the tab is hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
    } else if (running) {
      last = performance.now();
      rafId = requestAnimationFrame(frame);
    }
  });

  let last = performance.now();
  let time = 0;
  let nebulaWasVisible = true;

  function frame(now) {
    const rawDt = now - last;
    const dt = Math.min(Math.max(rawDt / 1000, 0), 1 / 30);
    last = now;

    if (!governor.frame(rawDt)) return; // bailed to static fallback

    const frozen = reducedMotion.matches;
    if (!frozen) time += dt;

    // Ease scroll so the sky glides instead of jumping on wheel ticks —
    // unless the user asked for reduced motion, where gliding IS the motion.
    scrollSmooth = frozen
      ? scrollTarget
      : scrollSmooth + (scrollTarget - scrollSmooth) * (1 - Math.exp(-dt * 5));

    // The nebula's territory has left the viewport past ~0.65 scroll (and the
    // composite stops sampling it at 0.65) — skip all fluid/cloud work there.
    const nebulaVisible = scrollSmooth < 0.68;
    if (nebulaWasVisible && !nebulaVisible) fluid.clearDynamics();
    nebulaWasVisible = nebulaVisible;

    if (nebulaVisible) {
      if (!frozen) {
        // Cursor push, "blend" style: a local radial shove (three jittered
        // sub-splats written straight into the displacement field — the parting)
        // plus a soft directional drag through the fluid sim (the wake).
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
        }
        fluid.step(dt, scrollSmooth);
      } else if (fluid.cloudDirty || Math.abs(scrollSmooth - fluid.cloudScroll) > 1e-4) {
        // Reduced motion: no sim, no drift — but the frozen cloud still has
        // to exist and track scroll, or the nebula would simply be missing.
        fluid.renderCloud(scrollSmooth);
      }
    }
    pointer.dx = 0;
    pointer.dy = 0;

    composite.use();
    gl.uniform1i(composite.uniforms.uDye, fluid.cloud.attach(0));
    gl.uniform1f(composite.uniforms.uScroll, scrollSmooth);
    gl.uniform1f(composite.uniforms.uTime, time);
    gl.uniform1f(composite.uniforms.uAspect, gl.drawingBufferWidth / gl.drawingBufferHeight);
    blit(null);

    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);
}
