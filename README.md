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

## Performance & weak hardware

It renders at `min(devicePixelRatio, 1.5)`, capped to ~1.5M pixels, behind a frame-time
**governor**: if it can't hold ~60fps it steps *down* an 8-rung quality ladder until it
settles. It only ever steps down, so a slow GPU lands on a stable tier instead of flickering
between resolutions. The governor's clock is wall-time, so a 25fps device reacts as fast in
real seconds as a 60fps one.

Crucially, the ladder sheds the **expensive swirl** (domain-warp folds) *before* it sheds
detail (fBm octaves) or resolution — so cheaper tiers still read as a wispy nebula rather than
a flat blur. If even the lowest animated tier can't keep up, it switches to **static mode**:
the animation freezes and the canvas repaints only on scroll. Because a static frame isn't
running at 60fps, it renders at near-full detail — the weakest devices get a *crisp* frozen
nebula (that still shifts night→day as you scroll), not a smooth blur.

`prefers-reduced-motion: reduce` uses that same static path automatically, and there's a CSS
gradient fallback if WebGL is entirely unavailable.

You can test all of this on **any** machine (including fast ones) via URL params:

| Param | Effect |
|-------|--------|
| `?debug` | Show an FPS / tier / octaves / warp / resolution HUD. Toggle live with the `` ` `` backtick key. |
| `?load=N` | Inject `N` (0–256) heavy noise evals per pixel — synthetic GPU load to emulate a weak GPU. Crank it until frame time rises and watch the governor react. |
| `?quality=high\|medium\|low\|potato\|static` | Lock a quality tier (disables the auto-governor) so you can eyeball each one. `static` is the frozen-but-crisp fallback. |

Example: `index.html?debug&load=200` on a fast laptop drives the frame time up and you'll see
the governor walk down the tiers and settle. `index.html?quality=static` shows the frozen fallback.

## Notes

- WebGL2 with a WebGL1 fallback; needs no extensions. Falls back to a CSS gradient where WebGL is unavailable.
- Pauses rendering when the tab is hidden; honors `prefers-reduced-motion`.
