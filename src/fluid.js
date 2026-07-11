// GPU Navier-Stokes fluid: advection, vorticity confinement, pressure projection.
// The dye field carries the nebula's RGB gas and relaxes toward the procedural
// base cloud, so stirred gas slowly heals while the whole cloud keeps drifting.

import { Program, createFBO, createDoubleFBO, makeBlit } from './gl.js';
import {
  VERTEX, ADVECTION, DYE_ADVECTION, SPLAT, CURL, VORTICITY,
  DIVERGENCE, PRESSURE, GRADIENT_SUBTRACT,
} from './shaders.js';

const CONFIG = {
  simResolution: 224,        // velocity/pressure grid (short edge)
  dyeResolution: 1024,       // nebula gas texture (short edge)
  pressureIterations: 24,
  velocityDissipation: 0.5,  // 1/s — cursor-displaced gas settles gently
  curlStrength: 6,           // low vorticity: billows, not liquid spirals
  relaxRate: 0.18,           // 1/s — how fast stirred gas heals back to the base cloud
  splatRadius: 0.0015,       // tight cursor stir (uv², pre-aspect)
  splatForce: 3200,          // pointer velocity -> sim velocity multiplier
};

export class FluidSim {
  constructor(gl) {
    this.gl = gl;
    this.config = CONFIG;
    this.blit = makeBlit(gl);
    this.time = 0;
    this.firstFrame = true;

    this.programs = {
      advection: new Program(gl, VERTEX, ADVECTION),
      dyeAdvection: new Program(gl, VERTEX, DYE_ADVECTION),
      splat: new Program(gl, VERTEX, SPLAT),
      curl: new Program(gl, VERTEX, CURL),
      vorticity: new Program(gl, VERTEX, VORTICITY),
      divergence: new Program(gl, VERTEX, DIVERGENCE),
      pressure: new Program(gl, VERTEX, PRESSURE),
      gradientSubtract: new Program(gl, VERTEX, GRADIENT_SUBTRACT),
    };

    this.resize();
  }

  resolutionFor(shortEdge) {
    const gl = this.gl;
    const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
    let w, h;
    if (aspect >= 1) {
      h = shortEdge;
      w = Math.round(shortEdge * aspect);
    } else {
      w = shortEdge;
      h = Math.round(shortEdge / aspect);
    }
    return { w: Math.max(w, 8), h: Math.max(h, 8) };
  }

  resize() {
    const gl = this.gl;
    const sim = this.resolutionFor(this.config.simResolution);
    const dye = this.resolutionFor(this.config.dyeResolution);
    this.aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;

    this.velocity?.dispose();
    this.dye?.dispose();
    this.pressure?.dispose();
    this.divergence?.dispose();
    this.curl?.dispose();

    this.velocity = createDoubleFBO(gl, sim.w, sim.h, gl.RG16F, gl.RG, gl.HALF_FLOAT, gl.LINEAR);
    this.pressure = createDoubleFBO(gl, sim.w, sim.h, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.NEAREST);
    this.divergence = createFBO(gl, sim.w, sim.h, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.NEAREST);
    this.curl = createFBO(gl, sim.w, sim.h, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.NEAREST);
    this.dye = createDoubleFBO(gl, dye.w, dye.h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);

    this.firstFrame = true; // snap dye to the base nebula after rebuild
  }

  // Inject velocity at a point (uv coords, dx/dy in sim velocity units).
  splat(x, y, dx, dy, radiusScale = 1) {
    const gl = this.gl;
    const p = this.programs.splat;
    p.use();
    gl.uniform1i(p.uniforms.uTarget, this.velocity.read.attach(0));
    gl.uniform1f(p.uniforms.uAspect, this.aspect);
    gl.uniform2f(p.uniforms.uPoint, x, y);
    gl.uniform3f(p.uniforms.uColor, dx, dy, 0);
    gl.uniform1f(p.uniforms.uRadius, this.config.splatRadius * radiusScale);
    this.blit(this.velocity.write);
    this.velocity.swap();
  }

  step(dt) {
    const gl = this.gl;
    const { programs: pr, velocity, dye, pressure, divergence, curl, blit, config } = this;
    this.time += dt;

    gl.disable(gl.BLEND);

    // Vorticity confinement.
    pr.curl.use();
    gl.uniform1i(pr.curl.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform2f(pr.curl.uniforms.uTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    blit(curl);

    pr.vorticity.use();
    gl.uniform1i(pr.vorticity.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(pr.vorticity.uniforms.uCurl, curl.attach(1));
    gl.uniform2f(pr.vorticity.uniforms.uTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1f(pr.vorticity.uniforms.uCurlStrength, config.curlStrength);
    gl.uniform1f(pr.vorticity.uniforms.uDt, dt);
    blit(velocity.write);
    velocity.swap();

    // Pressure projection.
    pr.divergence.use();
    gl.uniform1i(pr.divergence.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform2f(pr.divergence.uniforms.uTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    blit(divergence);

    pr.pressure.use();
    gl.uniform1i(pr.pressure.uniforms.uDivergence, divergence.attach(1));
    gl.uniform2f(pr.pressure.uniforms.uTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    for (let i = 0; i < config.pressureIterations; i++) {
      gl.uniform1i(pr.pressure.uniforms.uPressure, pressure.read.attach(0));
      blit(pressure.write);
      pressure.swap();
    }

    pr.gradientSubtract.use();
    gl.uniform1i(pr.gradientSubtract.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(pr.gradientSubtract.uniforms.uVelocity, velocity.read.attach(1));
    gl.uniform2f(pr.gradientSubtract.uniforms.uTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    blit(velocity.write);
    velocity.swap();

    // Advect velocity through itself.
    pr.advection.use();
    gl.uniform1i(pr.advection.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(pr.advection.uniforms.uSource, velocity.read.attach(0));
    gl.uniform2f(pr.advection.uniforms.uTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1f(pr.advection.uniforms.uDt, dt);
    gl.uniform1f(pr.advection.uniforms.uDissipation, config.velocityDissipation);
    blit(velocity.write);
    velocity.swap();

    // Advect dye + relax toward the base nebula.
    pr.dyeAdvection.use();
    gl.uniform1i(pr.dyeAdvection.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(pr.dyeAdvection.uniforms.uSource, dye.read.attach(1));
    gl.uniform2f(pr.dyeAdvection.uniforms.uTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1f(pr.dyeAdvection.uniforms.uDt, dt);
    gl.uniform1f(pr.dyeAdvection.uniforms.uAspect, this.aspect);
    gl.uniform1f(pr.dyeAdvection.uniforms.uTime, this.time);
    gl.uniform1f(pr.dyeAdvection.uniforms.uRelaxRate, this.firstFrame ? 1e4 : config.relaxRate);
    blit(dye.write);
    dye.swap();

    this.firstFrame = false;
  }
}
