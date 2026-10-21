/* The two sculptural compositions.
   Geometry is procedural (knots, icospheres, tori) and each heavy mesh
   keeps a pre-built set of LODs so the quality manager can swap detail
   without allocating during the frame.

   01  chrome-and-glass : a chrome torus knot threaded through a thin
                           glass halo, with an organic mass at its core.
   02  counterform      : a matte clay-like mass against a clear ring and
                           a single chrome sliver. */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  TorusGeometry,
  TorusKnotGeometry,
} from "three";
import { createChrome, createGlass, createOrganic } from "./materials.js";
import { makeDotTexture, makeShadowTexture } from "./textures.js";

/* ---- geometry builders, indexed by quality tier 0..2 ---- */

function buildKnot(tier) {
  const [tubular, radial] = [
    [130, 16],
    [190, 22],
    [250, 28],
  ][tier];
  return new TorusKnotGeometry(1.0, 0.3, tubular, radial, 2, 3);
}

/* IcosahedronGeometry subdivides into 20 * (detail + 1)^2 triangles, so the
   detail values have to be large to read as an organic mass rather than a
   faceted rock: 8 -> 1620, 16 -> 5780, 24 -> 12500 triangles. */
function buildBlob(tier, radius) {
  return new IcosahedronGeometry(radius, [8, 16, 24][tier]);
}

function buildRing(tier, radius, tube) {
  const [radial, tubular] = [
    [10, 90],
    [14, 130],
    [18, 170],
  ][tier];
  return new TorusGeometry(radius, tube, radial, tubular);
}

function buildSliver(tier) {
  const [capSeg, radialSeg] = [
    [3, 10],
    [5, 14],
    [8, 18],
  ][tier];
  return new CapsuleGeometry(0.055, 0.5, capSeg, radialSeg);
}

/* ---- shared pieces ---- */

function makeDust(count) {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const radius = 2.4 + Math.random() * 2.6;
    const theta = Math.random() * Math.PI * 2;
    positions[i * 3] = Math.cos(theta) * radius;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 4.6;
    positions[i * 3 + 2] = Math.sin(theta) * radius;
  }
  geometry.setAttribute("position", new BufferAttribute(positions, 3));

  const material = new PointsMaterial({
    size: 0.05,
    map: makeDotTexture(),
    color: new Color(0x8a7f68),
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    blending: AdditiveBlending,
    sizeAttenuation: true,
  });

  return new Points(geometry, material);
}

function makeContactShadow() {
  const mesh = new Mesh(
    new PlaneGeometry(5.4, 5.4),
    new MeshBasicMaterial({
      map: makeShadowTexture(),
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      opacity: 0.9,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/* ---- composition 01 : chrome + glass ---- */

export function createHeroSculpture(envMap) {
  const group = new Group();

  const chrome = createChrome(envMap);
  const glass = createGlass(envMap);
  const organic = createOrganic(envMap, {
    color: 0xcabda4,
    roughness: 0.55,
    amp: 0.06,
    freq: 1.25,
    speed: 0.16,
  });

  const knot = new Mesh(buildKnot(1), chrome);

  const halo = new Mesh(buildRing(1, 1.42, 0.05), glass);
  halo.rotation.set(1.16, 0.36, 0.24);

  const core = new Mesh(buildBlob(1, 0.5), organic);
  const dust = makeDust(110);

  group.add(knot, halo, core, dust);

  const shadow = makeContactShadow();

  const lods = {
    knot: [buildKnot(0), buildKnot(1), buildKnot(2)],
    halo: [buildRing(0, 1.42, 0.05), buildRing(1, 1.42, 0.05), buildRing(2, 1.42, 0.05)],
    core: [buildBlob(0, 0.5), buildBlob(1, 0.5), buildBlob(2, 0.5)],
  };
  let detail = 1;

  function setDetail(tier) {
    if (tier === detail) return;
    detail = tier;
    knot.geometry = lods.knot[tier];
    halo.geometry = lods.halo[tier];
    core.geometry = lods.core[tier];
    dust.visible = tier >= 1;
  }

  return {
    group,
    shadow,
    knot,
    halo,
    core,
    dust,
    uniforms: organic.userData.uniforms,
    setDetail,
    update(elapsed) {
      organic.userData.uniforms.uTime.value = elapsed;
    },
  };
}

/* ---- composition 02 : matte mass + glass ring + chrome sliver ---- */

export function createCounterform(envMap) {
  const group = new Group();

  const clay = createOrganic(envMap, {
    color: 0xb0a086,
    roughness: 0.95,
    metalness: 0.0,
    amp: 0.13,
    freq: 0.9,
    speed: 0.1,
  });
  const glass = createGlass(envMap, 0xdde7ec);
  const chrome = createChrome(envMap);

  const stone = new Mesh(buildBlob(1, 0.92), clay);
  stone.scale.set(1.1, 0.96, 1.03);
  stone.position.set(-0.42, 0.06, 0);

  const ring = new Mesh(buildRing(1, 0.98, 0.1), glass);
  ring.rotation.set(1.24, 0.42, 0.18);
  ring.position.set(0.08, 0.16, 0);

  const sliver = new Mesh(buildSliver(1), chrome);
  sliver.position.set(0.52, -0.4, 0.24);
  sliver.rotation.set(0.5, 0.4, 0.75);

  group.add(stone, ring, sliver);

  const shadow = makeContactShadow();
  shadow.scale.setScalar(0.66);

  const lods = {
    stone: [buildBlob(0, 0.92), buildBlob(1, 0.92), buildBlob(2, 0.92)],
    ring: [buildRing(0, 0.98, 0.1), buildRing(1, 0.98, 0.1), buildRing(2, 0.98, 0.1)],
    sliver: [buildSliver(0), buildSliver(1), buildSliver(2)],
  };
  let detail = 1;

  function setDetail(tier) {
    if (tier === detail) return;
    detail = tier;
    stone.geometry = lods.stone[tier];
    ring.geometry = lods.ring[tier];
    sliver.geometry = lods.sliver[tier];
  }

  return {
    group,
    shadow,
    stone,
    ring,
    sliver,
    uniforms: clay.userData.uniforms,
    setDetail,
    update(elapsed) {
      clay.userData.uniforms.uTime.value = elapsed;
    },
  };
}
