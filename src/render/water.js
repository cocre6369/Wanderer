/**
 * WANDERER — Water
 * ----------------
 * One shader shared by the open ocean plane and the per-chunk water sheets
 * (rivers, lakes, marshes). Depth is supplied per vertex so shorelines foam
 * and shallow water reads as shallow.
 */

import * as THREE from '../three.js';

const WATER_VERT = /* glsl */`
attribute float aDepth;
uniform float uTime, uWave;
varying vec3 vWorld;
varying float vDepth;
varying float vCrest;

void main() {
  vec3 p = position;
  float deep = smoothstep(0.0, 1.2, aDepth);
  float w = sin(p.x * 0.16 + uTime * 1.05) * 0.42
          + sin(p.z * 0.21 - uTime * 0.86) * 0.42
          + sin((p.x + p.z) * 0.07 + uTime * 0.55) * 0.60;
  p.y += w * uWave * (0.25 + 0.75 * deep);
  vCrest = w;
  vDepth = aDepth;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const WATER_FRAG = /* glsl */`
precision highp float;
uniform vec3 uDeep, uShallow, uSunDir, uSunColor, uSkyColor, uFogColor, uCamPos;
uniform float uTime, uFogNear, uFogFar, uOpacity, uNight;
varying vec3 vWorld;
varying float vDepth;
varying float vCrest;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec2 uv = vWorld.xz;
  // animated ripple normal from two scrolling noise fields
  float n1 = vnoise(uv * 0.22 + vec2(uTime * 0.05, uTime * 0.03));
  float n2 = vnoise(uv * 0.55 - vec2(uTime * 0.07, uTime * 0.04));
  vec3 N = normalize(vec3((n1 - 0.5) * 0.55 + (n2 - 0.5) * 0.25, 1.0, (n2 - 0.5) * 0.45 + (n1 - 0.5) * 0.2));

  vec3 V = normalize(uCamPos - vWorld);
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);

  float d = clamp(vDepth / 5.5, 0.0, 1.0);
  vec3 body = mix(uShallow, uDeep, d);
  vec3 col = mix(body, uSkyColor, clamp(fres * 0.85, 0.0, 0.9));

  // sun glint
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 110.0);
  col += uSunColor * spec * (1.2 - uNight);

  // shoreline foam
  float foam = smoothstep(0.85, 0.0, vDepth) * smoothstep(0.15, 0.85, vCrest * 0.5 + 0.5);
  col = mix(col, vec3(0.86, 0.92, 0.94), foam * 0.55);

  float dist = length(uCamPos - vWorld);
  float f = smoothstep(uFogNear, uFogFar, dist);
  col = mix(col, uFogColor, f);

  gl_FragColor = vec4(col, uOpacity);
}`;

export function createWaterMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uWave: { value: 0.22 },
      uDeep: { value: new THREE.Color(0x0d3c50) },
      uShallow: { value: new THREE.Color(0x3f92a8) },
      uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2) },
      uSunColor: { value: new THREE.Color(1, 1, 0.95) },
      uSkyColor: { value: new THREE.Color(0.6, 0.75, 0.9) },
      uFogColor: { value: new THREE.Color(0.7, 0.8, 0.88) },
      uCamPos: { value: new THREE.Vector3() },
      uFogNear: { value: 220 },
      uFogFar: { value: 1600 },
      uOpacity: { value: 0.92 },
      uNight: { value: 0 },
    },
  });
}

/** The single big ocean plane that follows the player at sea level. */
export class Ocean {
  constructor(scene, material, size = 6000) {
    const geo = new THREE.PlaneGeometry(size, size, 96, 96);
    geo.rotateX(-Math.PI / 2);
    const depth = new Float32Array(geo.attributes.position.count);
    depth.fill(12);
    geo.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1));
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.size = size;
  }
  update(camPos, visible) {
    const s = this.size * 0.5 - 40;
    this.mesh.position.set(
      Math.round(camPos.x / 8) * 8,
      0,
      Math.round(camPos.z / 8) * 8,
    );
    this.mesh.visible = visible;
  }
}

export default createWaterMaterial;
