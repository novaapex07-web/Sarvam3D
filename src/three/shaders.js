/* ------------------------------------------------------------------
   Lightweight custom shader chunks.
   We inject into MeshStandardMaterial / MeshPhysicalMaterial with
   onBeforeCompile so the organic displacement and the fresnel glass
   edge keep the PBR pipeline (and its environment-map reflections)
   without paying for a separate shader system.
   ------------------------------------------------------------------ */

/* Compact 3D simplex noise (Ashima / Gustavson, public domain). */
const SIMPLEX = /* glsl */ `
vec3 ofMod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 ofMod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 ofPermute(vec4 x){ return ofMod289(((x * 34.0) + 1.0) * x); }
vec4 ofTaylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

float ofSnoise(vec3 v){
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = ofMod289(i);
  vec4 p = ofPermute(ofPermute(ofPermute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = ofTaylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

/**
 * Displace vertices along their normal with layered simplex noise and
 * rebuild the normal from finite differences, so lighting follows the
 * organic surface instead of staying flat.
 */
export function organicDisplaceInject(material, uniforms, cacheKey = "organic") {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader =
      /* glsl */ `
      uniform float uTime;
      uniform float uAmp;
      uniform float uFreq;
      uniform float uSpeed;
      ${SIMPLEX}
      float ofDisp(vec3 p){
        /* Sample on the unit direction so the pattern stays consistent
           whatever the blob's radius is. */
        vec3 d = normalize(p);
        float n1 = ofSnoise(d * uFreq + vec3(0.0, 0.0, uTime * uSpeed));
        float n2 = ofSnoise(d * (uFreq * 2.15) + vec3(uTime * uSpeed * 1.3));
        return (n1 * 0.72 + n2 * 0.28) * uAmp;
      }
    ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      "#include <beginnormal_vertex>",
      /* glsl */ `
      vec3 objectNormal = vec3(normal);
      {
        const float ofEps = 0.035;
        vec3 ofT1 = normalize(cross(objectNormal, vec3(0.0, 1.0, 0.0)) + vec3(0.0001, 0.0001, 0.0001));
        vec3 ofT2 = normalize(cross(objectNormal, ofT1));
        float ofD0 = ofDisp(position);
        float ofD1 = ofDisp(position + ofT1 * ofEps);
        float ofD2 = ofDisp(position + ofT2 * ofEps);
        objectNormal = normalize(objectNormal - (ofT1 * (ofD1 - ofD0) + ofT2 * (ofD2 - ofD0)) / ofEps);
      }
      `
    );

    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      /* glsl */ `vec3 transformed = vec3(position) + normal * ofDisp(position);`
    );
  };
  material.customProgramCacheKey = () => cacheKey;
}

/**
 * Modulate a translucent material's alpha with a fresnel term so edges
 * read as glass and faces stay open. Applied at the very end of the
 * fragment shader, after tone mapping chunks have run.
 */
export function glassFresnelInject(material, uniforms, cacheKey = "glass") {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.fragmentShader =
      /* glsl */ `uniform float uMin;\nuniform float uMax;\n` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      /* glsl */ `
      #include <dithering_fragment>
      {
        vec3 ofV = normalize(vViewPosition);
        float ofFres = pow(1.0 - clamp(dot(normalize(vNormal), ofV), 0.0, 1.0), 3.0);
        gl_FragColor.a = mix(uMin, uMax, ofFres);
      }
      `
    );
  };
  material.customProgramCacheKey = () => cacheKey;
}
