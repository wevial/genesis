# Genesis

Portfolio landing page background: a scroll journey from deep space down into a daytime sky.

- **Top of page**: pink/purple/blue nebula over a star field. The nebula is a real GPU fluid sim (Navier–Stokes) — the cursor stirs the gas, and stirred gas slowly heals back into a procedurally drifting base cloud.
- **Scrolling down**: nebula fades into plain night sky → dawn/dusk horizon glow → light blue day sky. Stars parallax-slide and fade out as daylight comes up.

## Run

Any static server from the repo root, e.g.:

```sh
python3 -m http.server 8631
```

ES modules require http(s); `file://` won't work.

## Architecture

| File | Role |
|---|---|
| `index.html` | Fixed fullscreen canvas + 500vh scroll spacer + CSS gradient fallback (`body.no-gl`) |
| `src/main.js` | Bootstrap, scroll/pointer input, render loop |
| `src/fluid.js` | Fluid sim passes (advect, vorticity, pressure projection) + tuning constants in `CONFIG` |
| `src/shaders.js` | All GLSL: sim kernels, procedural base nebula (fbm + domain warp + dust lanes), composite (sky gradient keyframes, star layers, bright spiked stars) |
| `src/gl.js` | WebGL2 helpers: programs, ping-pong FBOs, fullscreen-triangle blit |

The dye field is RGBA: rgb carries premultiplied nebula emission, alpha carries dark-dust absorption — both are advected by the fluid, so the cursor moves dust lanes too.

Requires WebGL2 + `EXT_color_buffer_float`; otherwise falls back to a static CSS gradient.
