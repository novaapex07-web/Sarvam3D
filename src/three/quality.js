/* Adaptive quality controller.
   Watches smoothed frame time and moves between three tiers. It only
   touches things that are cheap to change at runtime — device pixel
   ratio, geometry LOD (pre-built, swapped in) and optional particles —
   so a tier change never triggers a visible hitch. */
export class QualityManager {
  /**
   * @param {object} opts
   * @param {import('three').WebGLRenderer} opts.renderer
   * @param {number[]} opts.pixelRatioCaps  cap per tier, low -> high
   * @param {number} opts.initialTier
   * @param {number} opts.maxTier
   * @param {(tier:number)=>void} opts.onTier
   */
  constructor({ renderer, pixelRatioCaps, initialTier = 1, maxTier = 2, onTier }) {
    this.renderer = renderer;
    this.caps = pixelRatioCaps;
    this.maxTier = maxTier;
    this.onTier = onTier;

    this.tier = -1;
    this.emaMs = 16.7;
    this.cooldownMs = 1500;
    this.upgrades = 0;

    this.apply(Math.max(0, Math.min(maxTier, initialTier)));
  }

  get devicePixelRatioCap() {
    return this.caps[this.tier];
  }

  apply(tier) {
    if (tier === this.tier) return;
    this.tier = tier;

    const dpr = Math.min(window.devicePixelRatio || 1, this.caps[tier]);
    this.renderer.setPixelRatio(dpr);

    if (this.onTier) this.onTier(tier);
  }

  /** Call once per frame with the frame delta in milliseconds. */
  update(deltaMs) {
    if (deltaMs > 0 && deltaMs < 500) {
      this.emaMs += (deltaMs - this.emaMs) * 0.05;
    }

    this.cooldownMs -= deltaMs;
    if (this.cooldownMs > 0) return;

    if (this.emaMs > 26 && this.tier > 0) {
      /* Sustained below ~38 fps — step down. */
      this.apply(this.tier - 1);
      this.emaMs = 16.7;
      this.cooldownMs = 2500;
    } else if (this.emaMs < 13.5 && this.tier < this.maxTier && this.upgrades < 2) {
      /* Comfortably above ~74 fps — step up, but cap the churn. */
      this.apply(this.tier + 1);
      this.emaMs = 16.7;
      this.cooldownMs = 4000;
      this.upgrades += 1;
    }
  }
}
