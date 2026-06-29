# Genesis

A scroll-driven **night → day** space background for the web. WebGL, single file, zero dependencies, no build step.

At the top of the page it's deep space — an animated pink/purple nebula over a twinkling starfield. As you scroll down it transitions through dawn into an open daytime sky:

| Scroll | Sky | Nebula | Stars |
|-------:|-----|--------|-------|
| `0.00` | black night | full | full |
| `~0.42` | deepening | **faded out** | full |
| `~0.48` | twilight / dawn horizon | gone | full |
| `0.55 → 0.95` | warming to day | gone | **fading** |
| `1.00` | bright sky-blue | gone | gone |

The nebula disappears first; the stars linger over the dark sky, then fade as daylight comes up.

## Use it

`index.html` is self-contained — open it directly, or copy two things into your own page:

1. `<canvas id="bg"></canvas>` as the first element in `<body>`.
2. The `<script>` block, and the `#bg` CSS rule (`position: fixed; inset: 0; z-index: -1`).

The effect is driven by scroll position (`0` at the top, `1` at the bottom), so the page must be taller than the viewport. The demo `<section>`s in `index.html` exist only to give it scroll height — replace them with your real content.

## Tuning

All knobs are near the top of the fragment shader / JS in `index.html`:

- **Sky colors** — `nightCol` / `twilightCol` / `dayCol`
- **Nebula fade-out point** — `nebAmt` (`smoothstep(0.0, 0.42, s)`)
- **Star fade-out window** — `starAmt` (`smoothstep(0.55, 0.95, s)`)
- **Nebula palette** — `C1` (cool-purple edges) / `C2` / `C3` (medium-pink core)
- **Animation speed** — the `* T` multipliers in the density block
- **Scroll easing** — `scrollS += (targetS - scrollS) * 0.08`

## Notes

- WebGL2 with a WebGL1 fallback; needs no extensions. Falls back gracefully where WebGL is unavailable.
- Renders at `min(devicePixelRatio, 1.5)` with a frame-time governor that lowers detail if a frame budget is missed, so it stays smooth on integrated GPUs.
- Pauses rendering when the tab is hidden.
