/* Entry point: DOM behaviour + boot of the 3D gallery. */
import "./styles.css";
import { initApp } from "./three/app.js";

const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Progressive reveal for editorial blocks. */
function setupReveal() {
  const items = Array.from(document.querySelectorAll("[data-reveal]"));
  if (!items.length) return;

  if (prefersReduced || !("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-in"));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.2, rootMargin: "0px 0px -12% 0px" }
  );

  items.forEach((el) => io.observe(el));
}

/* Lightweight scroll-progress rail (rAF-throttled, passive listener). */
function setupProgress() {
  const fill = document.querySelector(".progress__fill");
  let queued = false;

  const read = () => {
    queued = false;
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    const p = Math.min(1, Math.max(0, window.scrollY / max));
    if (fill) fill.style.transform = `scaleX(${p})`;
  };

  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(read);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  read();
}

function boot() {
  setupReveal();
  setupProgress();

  const canvas = document.getElementById("gl");
  const fallback = document.getElementById("fallback");

  /* Building the scene (geometry + the PMREM bake) is synchronous work.
     Defer it by one frame so the page's text paints and the document
     reaches DOMContentLoaded before the GPU/CPU cost lands. */
  let started = false;
  const start3D = () => {
    if (started) return;
    started = true;

    let app = null;
    try {
      app = initApp({ canvas, reducedMotion: prefersReduced });
    } catch (err) {
      app = null;
      if (import.meta.env.DEV) console.warn("[OTHERFORM] 3D init failed:", err);
    }

    if (!app) {
      /* Graceful degradation: static CSS sculpture, no WebGL required. */
      if (fallback) fallback.hidden = false;
      if (canvas) canvas.style.display = "none";
      document.documentElement.classList.add("no-webgl");
      return;
    }

    /* Small public handle — useful for debugging and for host pages that
       want to drive the scene. */
    window.__OTHERFORM__ = app;

    document.querySelectorAll("[data-replay]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: prefersReduced ? "auto" : "smooth" });
        app.replay();
      });
    });
  };

  requestAnimationFrame(() => requestAnimationFrame(start3D));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
