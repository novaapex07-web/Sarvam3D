# OTHERFORM — size and performance report

Everything below was measured on the actual production build produced by
`npm run build` in this repository. Nothing here is estimated or assumed.

## 1. Budget verdict

| | Measured | Budget | Used |
|---|---|---|---|
| Initial transfer, brotli | **101.3 KB** | 1,000 KB | 10.1% |
| Initial transfer, gzip | **122.5 KB** | 1,000 KB | 12.3% |
| Initial transfer, uncompressed | 481.7 KB | — | — |
| Initial requests | **3** | — | — |
| Third-party requests | **0** | — | — |

The site meets the sub-1,000 KB compressed budget with roughly an order of
magnitude of headroom. The figures count every byte the browser must fetch
before the page is usable: the document, the stylesheet and the single
JavaScript chunk. There are no fonts, images, icons, analytics or CDN
requests, because there are no such assets — all art is generated at runtime.

## 2. Method

1. `npm run build` (Vite 5.4.10, Rollup, esbuild minify, CSS minify).
2. Every file under `dist/` was read as bytes, then compressed independently
   with `gzip -9` and with Python `brotli` at quality 11.
3. Request count was confirmed by loading the built site over HTTP in headless
   Chrome and recording every response, not by inspecting the HTML by hand.

## 3. Build output

| File | Raw | gzip | brotli |
|---|---:|---:|---:|
| `dist/index.html` | 4,465 | 1,558 | 1,170 |
| `dist/assets/index-CfVKFyDC.css` | 5,088 | 1,944 | 1,684 |
| `dist/assets/index-DJ0nK7fC.js` | 483,711 | 121,982 | 100,915 |
| **Total (3 files)** | **493,264** | **125,484** | **103,769** |

Request types observed on load: `document`, `stylesheet`, `script`. Nothing else.

## 4. Major dependency sizes

Three.js is effectively the whole bundle. Two builds were compared to quantify
what tree-shaking buys:

| Build | Raw | gzip | brotli |
|---|---:|---:|---:|
| Three.js, namespace import (no tree-shaking) | 680,487 | 173,489 | 142,375 |
| **Shipped bundle** (tree-shaken Three.js + app) | **483,711** | **121,982** | **100,915** |
| Saving from tree-shaking | −196,776 (−28.9%) | −51,507 (−29.7%) | −41,460 (−29.1%) |

The application's own source — all of `src/`, `index.html`, `vite.config.js` —
is about 45 KB unminified across 11 files, so on the order of 10–15 KB of the
shipped chunk is first-party code and the remainder is the tree-shaken Three.js
core: `WebGLRenderer`, the PBR material system, `PMREMGenerator`, and
`RoundedBoxGeometry`.

Notably absent: React, GSAP, any UI framework, any loader, any image or font
file, and any HDR environment map. The environment map is a 512×256 canvas
gradient baked through `PMREMGenerator` at runtime, so it costs a few
kilobytes of code rather than a few hundred kilobytes of asset.

## 5. Initial scene load behaviour

Measured in headless Chrome at a 390×844 viewport, device pixel ratio 2, with
the quality tier pinned to 1. Absolute numbers on this software-rendered
environment are slow; the ordering and the effect of each step are what matter.

| Milestone | Time |
|---|---:|
| First paint / first contentful paint | 632 ms |
| `DOMContentLoaded` | 626 ms |
| `load` | 627 ms |
| First rendered 3D frame (`#gl` gains `.is-ready`) | 3,202 ms |

Behaviour:

1. HTML, CSS and JS are fetched in parallel; the editorial text paints as soon
   as CSS is applied — there is no loading screen and no blocking intro.
2. Scene construction (geometry, materials, the PMREM bake) is deferred by two
   animation frames, so it no longer blocks `DOMContentLoaded`. This was a real
   fix: before deferral, `DOMContentLoaded` landed at over 1.7 s instead of
   ~0.63 s, because the whole scene was built synchronously during boot.
3. The canvas is transparent until the first frame is rendered, then fades in
   over 1.1 s. Until then the page reads as a plain ivory page with text.

## 6. Frame time and FPS

**These figures are not representative of real-device performance.** They were
taken in headless Chrome using the ANGLE/SwiftShader software rasteriser —
there is no GPU in this environment — and the renderer reported itself as
`SwiftShader Device (Subzero)`. They are reported because the brief asks for
measurements rather than claims, and because they demonstrate the adaptive
system working under load.

| Scenario | Result |
|---|---:|
| Hero cube on screen, tier 2 pinned, software rasteriser | ~6.0 fps |
| Transform chapter, tier 2 pinned, software rasteriser | ~5.5 fps |
| Hero cube on screen, tier 1 pinned, software rasteriser | ~9.6 fps |
| Transform chapter, tier 1 pinned, software rasteriser | ~8.4 fps |
| Auto tier under software rendering | adapted down to **tier 0** (pixel ratio 1.0, low LOD, dust off) |
| Device pixel ratio applied at tier 2 | 2.0 (drawing buffer 780×1688 for a 390×844 viewport) |
| Device pixel ratio applied after auto-downgrade | 1.0 (drawing buffer 390×844) |

> Correction: an earlier revision of this report quoted "~24 fps" mid-page. That
> sample was taken at the closing chapter, where the stage is empty and there is
> nothing to draw — it measured an idle scene. The figures above are sampled
> with geometry actually on screen, which is why they are much lower.

The last two rows are the useful result: the quality manager detected the slow
software renderer, dropped to the low tier, and cut the drawing buffer from
780×1688 to 390×844 — a 4× reduction in shaded pixels — without any code
intervention. That is the mechanism the brief asks for, verified end to end.

## 7. Functional verification

Performed against the built site in headless Chrome. All results below are
observed, not assumed.

| Check | Result |
|---|---|
| Production build succeeds | ✅ |
| Loads with 3 requests, all HTTP 200 | ✅ |
| No page errors, no console errors or warnings | ✅ |
| WebGL context created; first frame rendered | ✅ |
| Adaptive quality engages and changes tier | ✅ (downgraded to tier 0 under software load) |
| Horizontal touch drag rotates the cube | ✅ (rendered frame changed) |
| Vertical scrolling unaffected by drag handling | ✅ (`scrollY` unchanged during a horizontal drag) |
| Cube reacts to a press (squash) | ✅ (rendered frame changed while held) |
| Cube moves while being dragged | ✅ (rendered frame changed during the drag) |
| Cube settles after release | ✅ (rendered frame changed again after release) |
| Replay control returns to the opening | ✅ (no errors) |
| `prefers-reduced-motion: reduce` | ✅ (renders, all reveals visible, no errors) |
| WebGL unavailable | ✅ (static CSS fallback shown, canvas hidden, API absent, text readable, no errors) |
| Render loop pauses when the page is hidden | ✅ (0 frames rendered while hidden) |
| Render loop resumes when visible again | ✅ |

The three interaction checks are isolated by pinning `prefers-reduced-motion`,
which stops the ambient drift — so any change between the captured frames can
only come from the pointer input itself.

## 8. What was not tested

Stated plainly, because the brief explicitly forbids claiming a test that did
not happen:

- **No real mobile device was used.** There is no phone or GPU in this
  environment. Real-device frame rate, thermal behaviour and battery impact are
  unknown. The software-rendered FPS numbers above must not be read as
  real-device performance.
- **No 5–10 minute session was run**, and no long-session memory growth was
  profiled. The only long-run risk identified by inspection is geometry LOD
  objects being retained for all three tiers for the lifetime of the page — a
  fixed, bounded cost (all LODs are built once at startup), not a leak.
- **No repeated-interaction stress test** was run beyond a few gestures.
- Background-tab behaviour was verified by simulating the visibility state
  change and counting rendered frames; a real browser's tab throttling was not
  exercised.
- Network conditions were a local HTTP server; no throttled 3G/4G profile was
  simulated.

## 9. Remaining bottlenecks

1. **Scene construction is the largest startup cost.** Geometry generation plus
   the PMREM environment bake is synchronous work. It is deferred past first
   paint, but it still occupies a single long task. On a real GPU this is
   expected to be far cheaper; if it were not, the next step would be to build
   the second composition lazily as chapter 04 approaches.
2. **The translucent glass cubes in the cluster** cover a meaningful screen area
   with `transparent`, `depthWrite: false` and a double-sided material. On a GPU
   this is cheap; the tier system already reduces resolution when it is not.
3. **Bundle size is essentially Three.js.** Further reduction would mean
   dropping to a hand-rolled WebGL renderer, which would trade a large amount
   of maintainability for bytes that are not currently scarce.

## 10. Reproducing these numbers

```bash
npm install
npm run build

# per-file raw / gzip / brotli
find dist -type f -exec sh -c 'printf "%s\t%s\n" "$(gzip -9 -c "$1" | wc -c)" "$1"' _ {} \;
```

The measurement harnesses used here are not part of the deliverable; they are
plain Puppeteer scripts that serve `dist/` and drive the page. The same checks
can be reproduced in Chrome DevTools (Network tab for transfer size, Performance
panel for frame time, Rendering panel for paint flashing).
