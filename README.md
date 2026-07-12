# Genesis

Portfolio landing page background: a scroll journey from deep space down into a daytime sky.

- **Top of page**: pink/purple/blue nebula over a star field. The cursor pushes through the gas — a local radial parting plus a fluid-simulated drag wake. The push bends a displacement field rather than moving colors, so clouds thin where you pass, pile up at the rim, and always heal back to the untouched cloud.
- **Scrolling down**: nebula fades into plain night sky → dawn/dusk horizon glow → light blue day sky. Stars parallax-slide and fade out as daylight comes up.

## Run

```sh
python3 serve.py        # http://127.0.0.1:8631
```

`serve.py` is a static server that sends `Cache-Control: no-cache` — a bare
`python3 -m http.server` lets the browser mix stale and fresh ES modules
after edits. ES modules require http(s); `file://` won't work.

Debug hooks: `?tier=0..4` locks a quality tier (4 = static CSS fallback),
`?perf` logs governor decisions to the console.

## Architecture

| File | Role |
|---|---|
| `index.html` | Fixed fullscreen canvas + 500vh scroll spacer + CSS gradient fallback (`body.no-gl`) |
| `src/main.js` | Bootstrap, scroll/pointer input, render loop |
| `src/fluid.js` | Velocity sim (advect, pressure projection), displacement-field update, cloud render pass + tuning constants in `CONFIG` |
| `src/shaders.js` | All GLSL: sim kernels, procedural base nebula (fbm + domain warp + dust lanes), composite (sky gradient keyframes, star layers, soft-glow bright stars) |
| `src/gl.js` | WebGL2 helpers: programs, ping-pong FBOs, fullscreen-triangle blit |

The cloud texture is recomputed each frame: the base nebula sampled through the displacement field (rgb = premultiplied emission, alpha = dark-dust absorption). Divergence of the displacement thins stretched gas and brightens compressed gas, which is what makes a cursor push read as parting rather than refraction. Colors never mix and the cloud can never be stirred to mud.

Requires WebGL2 + `EXT_color_buffer_float`; otherwise falls back to a static CSS gradient.
