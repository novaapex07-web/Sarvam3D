/* ------------------------------------------------------------------
   OTHERFORM — 3D orchestrator.
   One renderer, one scene, two compositions. Scroll drives a global
   progress value; the pointer both turns the cube and nudges it around;
   a quality manager adapts pixel ratio, LOD and dust from measured frame
   time. Rendering pauses while the tab is hidden.
   ------------------------------------------------------------------ */
import {
  ACESFilmicToneMapping,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { createStudioEnvironment } from "./env.js";
import { createCubeCluster, createHeroCube } from "./sculpture.js";
import { QualityManager } from "./quality.js";

const FOV = 46;
const FIT_RADIUS = 2.25;
const MIN_DISTANCE = 5.4;
const MAX_DISTANCE = 10.5;

/* Compositions sit above the optical centre so the editorial text, which
   is anchored to the lower part of each section on mobile, stays clear. */
const HERO_Y = 0.95;
const COUNTER_Y = 0.62;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

/** Smooth 0->1 ramp between two edges. */
function smooth(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Distance at which a sphere of FIT_RADIUS fits the current aspect. */
function fitDistance(aspect) {
  const vHalf = (FOV * Math.PI) / 180 / 2;
  const hHalf = Math.atan(Math.tan(vHalf) * aspect);
  const dist = Math.max(FIT_RADIUS / Math.sin(vHalf), FIT_RADIUS / Math.sin(hHalf));
  return clamp(dist * 1.02, MIN_DISTANCE, MAX_DISTANCE);
}

function detectWebGL() {
  try {
    const probe = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (probe.getContext("webgl2") || probe.getContext("webgl"))
    );
  } catch {
    return false;
  }
}

export function initApp({ canvas, reducedMotion = false }) {
  if (!canvas || !detectWebGL()) return null;

  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;

  /* Optional manual override, e.g. ?tier=2 — useful for demos, kiosks and
     for capturing screenshots at a pinned quality level. */
  const forcedMatch = /[?&]tier=([0-2])\b/.exec(window.location.search);
  const forcedTier = forcedMatch ? Number(forcedMatch[1]) : null;

  /* Antialias cannot change after context creation, so decide once. */
  const antialias = !coarse && cores >= 4;

  const renderer = new WebGLRenderer({
    canvas,
    antialias,
    alpha: true,
    stencil: false,
    powerPreference: "high-performance",
  });
  renderer.setClearAlpha(0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 60);

  const envMap = createStudioEnvironment(renderer);
  scene.environment = envMap;

  const hero = createHeroCube(envMap);
  const counter = createCubeCluster(envMap);
  scene.add(hero.group, hero.shadow, counter.group, counter.shadow);

  /* ---- sizing ---- */
  let width = 0;
  let height = 0;
  let aspect = 1;

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    aspect = width / Math.max(1, height);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  resize();

  /* ---- adaptive quality ---- */
  let initialTier = coarse ? 1 : 2;
  if (cores <= 2) initialTier = Math.min(initialTier, 1);
  if (coarse && memory <= 3) initialTier = 0;
  if (forcedTier !== null) initialTier = forcedTier;

  const quality = new QualityManager({
    renderer,
    pixelRatioCaps: [1.0, 1.5, 2.0],
    initialTier,
    maxTier: 2,
    onTier: (tier) => {
      hero.setDetail(tier);
      counter.setDetail(tier);
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    },
  });

  /* ---- scroll progress (passive, rAF-read) ---- */
  let targetProgress = 0;
  let progress = 0;

  function readScroll() {
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    targetProgress = clamp(window.scrollY / max, 0, 1);
  }
  readScroll();
  window.addEventListener("scroll", readScroll, { passive: true });

  /* ---- pointer: turn it, push it, press it ---- */
  let dragYaw = 0;
  let dragPitch = 0;
  let curYaw = 0;
  let curPitch = 0;

  let shiftX = 0; // target offset while dragging
  let shiftY = 0;
  let curShiftX = 0; // smoothed offset actually applied
  let curShiftY = 0;

  let pressTarget = 0; // 1 while a pointer is down
  let press = 0; // smoothed
  let pulse = 0; // decaying kick fired on press and on release

  let activePointer = null;
  let lastX = 0;
  let lastY = 0;

  function onPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    activePointer = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    pressTarget = 1;
    pulse = 1;
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-dragging");
  }

  function onPointerMove(event) {
    if (event.pointerId !== activePointer) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;

    dragYaw += dx * 0.0065;
    /* Vertical rotation is mouse-only: on touch, vertical drags must
       scroll the page instead of grabbing the object. */
    if (event.pointerType === "mouse") {
      dragPitch = clamp(dragPitch + dy * 0.004, -0.7, 0.7);
      shiftY = clamp(shiftY + dy * 0.0022, -0.45, 0.45);
    }
    /* The cube also drifts with the drag, then springs home. */
    shiftX = clamp(shiftX + dx * 0.0022, -0.5, 0.5);
  }

  function endPointer(event) {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    pressTarget = 0;
    pulse = Math.max(pulse, 0.8);
    canvas.classList.remove("is-dragging");
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  /* ---- render loop ---- */
  let rafId = 0;
  let last = 0;
  let elapsed = 0;
  let firstFrame = true;
  let frameCount = 0;

  function frame(now) {
    rafId = requestAnimationFrame(frame);

    const deltaMs = last ? now - last : 16.7;
    last = now;
    const dt = Math.min(0.05, deltaMs / 1000);
    if (!reducedMotion) elapsed += dt;

    /* smooth everything toward its target */
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 7);
    progress += (targetProgress - progress) * k;

    const kd = reducedMotion ? 1 : 1 - Math.exp(-dt * 9);
    curYaw += (dragYaw - curYaw) * kd;
    curPitch += (dragPitch - curPitch) * kd;

    press += (pressTarget - press) * (reducedMotion ? 1 : 1 - Math.exp(-dt * 14));
    pulse *= reducedMotion ? 0.8 : Math.exp(-dt * 4.5);

    /* the drift springs home once the finger lifts */
    if (activePointer === null) {
      const decay = reducedMotion ? 0.8 : Math.exp(-dt * 3.5);
      shiftX *= decay;
      shiftY *= decay;
    }
    const ks = reducedMotion ? 1 : 1 - Math.exp(-dt * 9);
    curShiftX += (shiftX - curShiftX) * ks;
    curShiftY += (shiftY - curShiftY) * ks;

    const p = progress;
    const t = elapsed;
    const idle = reducedMotion ? 0 : 1;

    /* ---------- composition 01 : the floating cube ---------- */
    const heroOut = smooth(0.44, 0.62, p);
    hero.group.visible = heroOut < 0.999;

    /* touch response: a squash while held, an overshoot on release */
    const react = (press * 0.1 + pulse * 0.12) * (reducedMotion ? 0.5 : 1);
    const heroScale = lerp(0.92, 1.12, smooth(0.05, 0.45, p)) * lerp(1, 0.55, heroOut);

    hero.group.position.set(
      lerp(0, -0.2, smooth(0.15, 0.5, p)) - heroOut * 1.1 + curShiftX,
      HERO_Y +
        lerp(0, 0.25, smooth(0, 0.45, p)) +
        heroOut * 1.8 +
        curShiftY +
        idle * Math.sin(t * 0.6) * 0.12,
      lerp(0, -0.3, smooth(0.15, 0.5, p)) - heroOut * 1.4
    );

    hero.group.scale.set(
      heroScale * (1 + react * 0.5),
      heroScale * (1 - react * 0.6),
      heroScale * (1 + react * 0.5)
    );

    hero.group.rotation.set(
      p * 0.5 + curPitch * 0.8 + idle * Math.sin(t * 0.12) * 0.06 + pulse * 0.18,
      p * 2.2 + curYaw + idle * t * 0.16,
      p * -0.28 + idle * Math.sin(t * 0.23) * 0.05
    );

    /* "form" change on scroll: a slow non-uniform stretch of the cube */
    const stretch = smooth(0.28, 0.68, p);
    hero.cube.scale.set(
      lerp(1, 1.18, stretch),
      lerp(1, 0.86, stretch),
      lerp(1, 1.06, stretch)
    );

    /* the chrome brightens a little while it is being handled */
    hero.material.envMapIntensity = 1.45 + press * 0.55 + pulse * 0.3;

    hero.shadow.position.set(hero.group.position.x, HERO_Y - 1.35, hero.group.position.z);
    hero.shadow.material.opacity = 0.9 * (1 - heroOut);

    /* ---------- composition 02 : the cube cluster ---------- */
    const bIn = smooth(0.6, 0.78, p);
    const bOut = smooth(0.88, 0.98, p);
    counter.group.visible = bIn > 0.002 && bOut < 0.999;

    counter.group.position.set(
      lerp(1.6, 0, bIn) - bOut * 1.6,
      COUNTER_Y + lerp(-0.3, 0, bIn) + bOut * 1.6,
      0
    );
    counter.group.scale.setScalar(lerp(0.8, 1, bIn) * lerp(1, 0.5, bOut));
    counter.group.rotation.set(
      0.12 + curPitch * 0.3,
      lerp(0.8, -0.12, bIn) + curYaw * 0.35 + idle * Math.sin(t * 0.15) * 0.07,
      0
    );

    /* each cube turns a little on its own */
    counter.cubes.forEach((mesh, i) => {
      const phase = i * 1.7;
      mesh.rotation.y += idle * dt * (0.18 - i * 0.04);
      mesh.position.y += idle * Math.sin(t * 0.7 + phase) * 0.0006;
    });

    counter.update(t);

    counter.shadow.position.set(counter.group.position.x, COUNTER_Y - 1.15, counter.group.position.z);
    counter.shadow.material.opacity = 0.8 * bIn * (1 - bOut);

    /* ---------- camera ---------- */
    const base = fitDistance(aspect);
    camera.position.set(
      curYaw * -0.35,
      lerp(0.15, 0.5, smooth(0.1, 0.55, p)) + idle * Math.sin(t * 0.1) * 0.05,
      base + lerp(0, -1.0, smooth(0.1, 0.5, p)) + lerp(0, 1.6, smooth(0.75, 1, p))
    );
    camera.lookAt(0, lerp(0.3, 0.5, smooth(0.1, 0.6, p)), 0);

    renderer.render(scene, camera);
    frameCount += 1;

    if (firstFrame) {
      firstFrame = false;
      canvas.classList.add("is-ready");
    }

    if (!reducedMotion && forcedTier === null) quality.update(deltaMs);
  }

  function start() {
    if (rafId) return;
    last = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    if (!rafId) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  /* ---- lifecycle ---- */
  function onResize() {
    resize();
    readScroll();
  }
  window.addEventListener("resize", onResize, { passive: true });
  window.addEventListener("orientationchange", onResize, { passive: true });

  function onVisibility() {
    if (document.hidden) stop();
    else start();
  }
  document.addEventListener("visibilitychange", onVisibility);

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    stop();
  });
  canvas.addEventListener("webglcontextrestored", () => {
    last = 0;
    start();
  });

  start();

  /* ---- public API ---- */
  return {
    replay() {
      dragYaw = 0;
      dragPitch = 0;
      shiftX = 0;
      shiftY = 0;
      pressTarget = 0;
      pulse = 0;
      elapsed = 0;
      readScroll();
      if (document.hidden === false) start();
    },
    dispose() {
      stop();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      window.removeEventListener("scroll", readScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      envMap.dispose();
      renderer.dispose();
    },
    get progress() {
      return progress;
    },
    get qualityTier() {
      return quality.tier;
    },
    get frames() {
      return frameCount;
    },
  };
}
