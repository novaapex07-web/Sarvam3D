/* Material library. Everything is procedural and cheap: PBR metallic
   for chrome, fresnel-translucent physical for glass, and noise-displaced
   standard for the organic forms. No textures, no transmission pass. */
import { Color, DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial } from "three";
import { glassFresnelInject, organicDisplaceInject } from "./shaders.js";

export function createChrome(envMap) {
  return new MeshStandardMaterial({
    color: new Color(0xf4f2ee),
    metalness: 1.0,
    roughness: 0.05,
    envMap,
    envMapIntensity: 1.45,
  });
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
