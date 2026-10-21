/* Procedural studio environment map.
   A 512x256 equirectangular canvas is baked through PMREM so chrome and
   glass get soft, believable reflections with no downloaded HDR file and
   no real-time reflection pass. Contrast is deliberately high: chrome
   needs a clear horizon and a couple of bright source streaks or it
   reads as flat ceramic. */
import {
  CanvasTexture,
  EquirectangularReflectionMapping,
  PMREMGenerator,
  SRGBColorSpace,
} from "three";

export function createStudioEnvironment(renderer) {
  const w = 512;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  /* Sky-to-floor ramp with a hard-ish horizon. */
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0.0, "#fffef9");
  sky.addColorStop(0.34, "#f2ece0");
  sky.addColorStop(0.49, "#cfc7b6");
  sky.addColorStop(0.52, "#8e8677");
  sky.addColorStop(0.7, "#4a443a");
  sky.addColorStop(1.0, "#241f19");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  /* Wide softbox high in the "ceiling". */
  const soft = ctx.createRadialGradient(w * 0.28, h * 0.16, 0, w * 0.28, h * 0.16, h * 0.6);
  soft.addColorStop(0, "rgba(255,255,255,1)");
  soft.addColorStop(0.35, "rgba(255,255,255,0.55)");
  soft.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = soft;
  ctx.fillRect(0, 0, w, h);

  /* Second, tighter source — this is what draws a crisp highlight streak. */
  const key = ctx.createRadialGradient(w * 0.66, h * 0.22, 0, w * 0.66, h * 0.22, h * 0.16);
  key.addColorStop(0, "rgba(255,252,245,1)");
  key.addColorStop(1, "rgba(255,252,245,0)");
  ctx.fillStyle = key;
  ctx.fillRect(0, 0, w, h);

  /* Cool bounce from below so the chrome is not one flat warm tone. */
  const bounce = ctx.createRadialGradient(w * 0.5, h * 0.92, 0, w * 0.5, h * 0.92, h * 0.5);
  bounce.addColorStop(0, "rgba(120,132,158,0.5)");
  bounce.addColorStop(1, "rgba(120,132,158,0)");
  ctx.fillStyle = bounce;
  ctx.fillRect(0, 0, w, h);

  /* Warm side glow to keep the palette in the ivory family. */
  const warm = ctx.createRadialGradient(w * 0.05, h * 0.5, 0, w * 0.05, h * 0.5, h * 0.45);
  warm.addColorStop(0, "rgba(255,236,205,0.45)");
  warm.addColorStop(1, "rgba(255,236,205,0)");
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, w, h);

  /* Two narrow strip lights. PMREM blurs them, but they are what give the
     chrome its characteristic bright streaks instead of a flat sheen. */
  const bar = (cx, halfWidth, y0, y1, alpha) => {
    const g = ctx.createLinearGradient(cx - halfWidth, 0, cx + halfWidth, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - halfWidth, y0, halfWidth * 2, y1 - y0);
  };
  bar(w * 0.18, w * 0.035, h * 0.08, h * 0.42, 0.9);
  bar(w * 0.74, w * 0.02, h * 0.12, h * 0.38, 0.75);

  const equirect = new CanvasTexture(canvas);
  equirect.mapping = EquirectangularReflectionMapping;
  equirect.colorSpace = SRGBColorSpace;

  const pmrem = new PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envMap = pmrem.fromEquirectangular(equirect).texture;

  equirect.dispose();
  pmrem.dispose();

  return envMap;
}
