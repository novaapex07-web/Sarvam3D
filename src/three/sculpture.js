/* The two sculptural compositions.

   01  the cube : a single rounded, polished-chrome cube, floating in the
                   room. It is the object the visitor pushes around.
   02  the cluster : three rounded cubes of contrasting material — matte
                   clay, clear glass and polished chrome — gathered together.

   Geometry is procedural (RoundedBoxGeometry — no imported model), and each
   mesh keeps a pre-built set of LODs so the quality manager can swap detail
   without allocating during a frame. */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createChrome, createGlass, createOrganic } from "./materials.js";
import { makeDotTexture, makeShadowTexture } from "./textures.js";

/* Rounded-box subdivision per quality tier: 300 / 1452 / 3468 triangles. */
const SEG_LOD = [3, 5, 8];

const CUBE_SIZE = 1.7;
const CUBE_RADIUS = 0.26;

function buildCube(tier, size = CUBE_SIZE, radius = CUBE_RADIUS) {
  return new RoundedBoxGeometry(size, size, size, SEG_LOD[tier], radius);
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

/* ---- composition 01 : the floating cube ---- */

export function createHeroCube(envMap) {
  const group = new Group();

  const chrome = createChrome(envMap);
  const cube = new Mesh(buildCube(1), chrome);
  const dust = makeDust(110);

  group.add(cube, dust);

  const shadow = makeContactShadow();

  const lods = [buildCube(0), buildCube(1), buildCube(2)];
  let detail = 1;

  function setDetail(tier) {
    if (tier === detail) return;
    detail = tier;
    cube.geometry = lods[tier];
    dust.visible = tier >= 1;
  }

  return {
    group,
    shadow,
    cube,
    material: chrome,
    dust,
    setDetail,
    update() {},
  };
}

/* ---- composition 02 : the cube cluster ---- */

export function createCubeCluster(envMap) {
  const group = new Group();

  const clay = createOrganic(envMap, {
    color: 0xbfae94,
    roughness: 0.95,
    metalness: 0.0,
    amp: 0.05,
    freq: 1.15,
    speed: 0.1,
  });
  const glass = createGlass(envMap, 0xdde7ec);
  const chrome = createChrome(envMap);

  const specs = [
    { material: clay, size: 1.05, radius: 0.2, position: [-0.52, 0.04, 0], rotation: [0.2, 0.5, 0.1] },
    { material: glass, size: 0.82, radius: 0.16, position: [0.44, 0.34, 0.16], rotation: [-0.25, -0.4, 0.2] },
    { material: chrome, size: 0.52, radius: 0.1, position: [0.3, -0.46, 0.3], rotation: [0.5, 0.3, -0.3] },
  ];

  const cubes = specs.map((spec) => {
    const mesh = new Mesh(buildCube(1, spec.size, spec.radius), spec.material);
    mesh.position.set(...spec.position);
    mesh.rotation.set(...spec.rotation);
    group.add(mesh);
    return mesh;
  });

  const shadow = makeContactShadow();
  shadow.scale.setScalar(0.66);

  const lods = specs.map((spec) => [
    buildCube(0, spec.size, spec.radius),
    buildCube(1, spec.size, spec.radius),
    buildCube(2, spec.size, spec.radius),
  ]);
  let detail = 1;

  function setDetail(tier) {
    if (tier === detail) return;
    detail = tier;
    cubes.forEach((mesh, i) => {
      mesh.geometry = lods[i][tier];
    });
  }

  return {
    group,
    shadow,
    cubes,
    uniforms: clay.userData.uniforms,
    setDetail,
    update(elapsed) {
      clay.userData.uniforms.uTime.value = elapsed;
    },
  };
}
