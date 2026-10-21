/* Material library. Everything is procedural and cheap: PBR metallic for
   chrome, fresnel-translucent physical for glass, and noise-displaced
   standard for the matte organic solids. No textures, no transmission pass. */
import { Color, DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial } from "three";
import { glassFresnelInject, organicDisplaceInject } from "./shaders.js";

export function createChrome(
  envMap,
  { color = 0xf4f2ee, roughness = 0.05, envMapIntensity = 1.45, displace = null } = {}
) {
  const material = new MeshStandardMaterial({
    color: new Color(color),
    metalness: 1.0,
    roughness,
    envMap,
    envMapIntensity,
  });

  if (displace) {
    const uniforms = {
      uTime: { value: 0 },
      uAmp: { value: displace.amp ?? 0.05 },
      uFreq: { value: displace.freq ?? 1.2 },
      uSpeed: { value: displace.speed ?? 0.16 },
    };
    organicDisplaceInject(material, uniforms);
    material.userData.uniforms = uniforms;
  }

  return material;
}

export function createGlass(envMap, tint = 0xeaf1f4) {
  const uniforms = {
    uMin: { value: 0.03 },
    uMax: { value: 0.58 },
  };

  const material = new MeshPhysicalMaterial({
    color: new Color(tint),
    metalness: 0.0,
    roughness: 0.04,
    transparent: true,
    opacity: 1.0, // alpha is driven by the fresnel term below
    depthWrite: false,
    envMap,
    envMapIntensity: 1.4,
    clearcoat: 0.6,
    clearcoatRoughness: 0.08,
    side: DoubleSide,
  });

  glassFresnelInject(material, uniforms);
  material.userData.uniforms = uniforms;
  return material;
}

export function createOrganic(
  envMap,
  { color = 0xcec2ab, roughness = 0.62, metalness = 0.0, amp = 0.08, freq = 1.3, speed = 0.16 } = {}
) {
  const uniforms = {
    uTime: { value: 0 },
    uAmp: { value: amp },
    uFreq: { value: freq },
    uSpeed: { value: speed },
  };

  const material = new MeshStandardMaterial({
    color: new Color(color),
    metalness,
    roughness,
    envMap,
    envMapIntensity: 0.5,
  });

  organicDisplaceInject(material, uniforms);
  material.userData.uniforms = uniforms;
  return material;
}
