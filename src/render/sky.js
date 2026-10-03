/**
 * WANDERER — Sky, sun, moon, stars, clouds
 * ----------------------------------------
 * A procedural atmosphere dome: the colour palette is driven by the sun's
 * elevation, so sunrise, noon, sunset and night all fall out of one curve.
 * Clouds are fbm in the fragment shader and drift with the wind; stars fade
 * in as the light goes.
 */

import * as THREE from '../three.js';

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w * 0.9999;
}`;

const SKY_FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform vec3 uZenith, uHorizon, uGround, uSunColor;
uniform vec3 uSunDir, uMoonDir;
uniform float uTime, uStarAmt, uCloudAmt, uCloudDark, uWind;
uniform float uMoonPhase, uHaze;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), u.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.07; a *= 0.5; }
  return v;
}
float stars(vec3 d){
  vec2 uv = vec2(atan(d.z, d.x) * 3.2, d.y * 6.0);
  vec2 g = floor(uv * 26.0);
  float h = hash(g);
  if (h < 0.965) return 0.0;
  vec2 c = (g + vec2(hash(g + 1.3), hash(g + 7.1))) / 26.0;
  float d = length(uv - c) * 26.0;
  float tw = 0.65 + 0.35 * sin(uTime * 2.0 + h * 40.0);
  return smoothstep(1.0, 0.0, d) * tw * (0.4 + h * 1.4);
}

void main() {
  vec3 d = normalize(vDir);
  float up = clamp(d.y, -1.0, 1.0);

  // base gradient
  float t = pow(clamp(up * 0.5 + 0.5, 0.0, 1.0), 0.72);
  vec3 col = mix(uHorizon, uZenith, smoothstep(0.42, 0.95, t));
  col = mix(uGround, col, smoothstep(-0.06, 0.06, up));

  // sun
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * pow(sd, 900.0) * 8.0;                 // disc
  col += uSunColor * pow(sd, 22.0) * 0.42;                 // inner glow
  col += uSunColor * pow(sd, 4.0) * 0.14 * uHaze;          // wide scatter

  // moon with phase
  float md = max(dot(d, uMoonDir), 0.0);
  vec3 moonCol = vec3(0.86, 0.9, 1.0);
  float disc = smoothstep(0.99935, 0.99965, md);
  vec3 off = normalize(uMoonDir + normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0))) * (1.0 - uMoonPhase) * 0.0022);
  float shade = smoothstep(0.9990, 0.9996, max(dot(d, off), 0.0));
  col += moonCol * disc * (0.35 + 0.65 * shade) * 2.4;
  col += moonCol * pow(md, 260.0) * 0.10;

  // stars
  if (uStarAmt > 0.001 && up > -0.02) col += vec3(0.9, 0.94, 1.0) * stars(d) * uStarAmt * smoothstep(-0.02, 0.2, up);

  // clouds: project onto a plane above
  if (uCloudAmt > 0.001 && up > 0.015) {
    vec2 cp = d.xz / max(up, 0.06) * 0.42;
    cp += vec2(uTime * uWind * 0.012, uTime * uWind * 0.006);
    float c = fbm(cp * 1.15);
    float c2 = fbm(cp * 2.6 + 13.0);
    float cover = smoothstep(0.52 - uCloudAmt * 0.24, 0.80, c * 0.72 + c2 * 0.36);
    float light = clamp(dot(normalize(vec3(d.x, 0.35, d.z)), uSunDir) * 0.5 + 0.62, 0.0, 1.0);
    vec3 cloudCol = mix(vec3(0.20, 0.22, 0.28) * uCloudDark, mix(vec3(1.0), uSunColor, 0.35) * (0.55 + 0.55 * light), 0.82);
    float fade = smoothstep(0.015, 0.16, up);
    col = mix(col, cloudCol, cover * fade * 0.94);
  }

  // horizon haze band
  col = mix(col, uHorizon, pow(1.0 - clamp(up, 0.0, 1.0), 9.0) * 0.55 * uHaze);

  gl_FragColor = vec4(col, 1.0);
}`;

/** Palette keyframes keyed on sun elevation (sin of angle above horizon). */
const PALETTE = [
  { e: -0.35, zenith: [0.012, 0.020, 0.055], horizon: [0.035, 0.055, 0.110], ground: [0.015, 0.020, 0.035], sun: [0.25, 0.30, 0.45] },
  { e: -0.10, zenith: [0.055, 0.075, 0.170], horizon: [0.220, 0.150, 0.230], ground: [0.045, 0.045, 0.070], sun: [0.75, 0.42, 0.32] },
  { e: 0.04,  zenith: [0.150, 0.230, 0.440], horizon: [0.960, 0.540, 0.300], ground: [0.110, 0.090, 0.110], sun: [1.00, 0.62, 0.33] },
  { e: 0.22,  zenith: [0.215, 0.400, 0.700], horizon: [0.830, 0.760, 0.680], ground: [0.180, 0.170, 0.160], sun: [1.00, 0.88, 0.70] },
  { e: 0.60,  zenith: [0.235, 0.470, 0.800], horizon: [0.720, 0.830, 0.920], ground: [0.230, 0.230, 0.230], sun: [1.00, 0.97, 0.90] },
  { e: 1.00,  zenith: [0.250, 0.500, 0.860], horizon: [0.760, 0.870, 0.960], ground: [0.250, 0.250, 0.255], sun: [1.00, 1.00, 0.96] },
];

function samplePalette(e) {
  let a = PALETTE[0], b = PALETTE[PALETTE.length - 1];
  for (let i = 0; i < PALETTE.length - 1; i++) {
    if (e >= PALETTE[i].e && e <= PALETTE[i + 1].e) { a = PALETTE[i]; b = PALETTE[i + 1]; break; }
  }
  const t = (b.e === a.e) ? 0 : Math.min(1, Math.max(0, (e - a.e) / (b.e - a.e)));
  const mix3 = (x, y) => [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
  return { zenith: mix3(a.zenith, b.zenith), horizon: mix3(a.horizon, b.horizon), ground: mix3(a.ground, b.ground), sun: mix3(a.sun, b.sun) };
}

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = {
      uZenith: { value: new THREE.Color(0.24, 0.47, 0.8) },
      uHorizon: { value: new THREE.Color(0.75, 0.85, 0.94) },
      uGround: { value: new THREE.Color(0.22, 0.22, 0.22) },
      uSunColor: { value: new THREE.Color(1, 1, 0.96) },
      uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2) },
      uMoonDir: { value: new THREE.Vector3(-0.3, -0.8, -0.2) },
      uTime: { value: 0 },
      uStarAmt: { value: 0 },
      uCloudAmt: { value: 0.5 },
      uCloudDark: { value: 1 },
      uWind: { value: 1 },
      uMoonPhase: { value: 0.5 },
      uHaze: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.uniforms,
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 16), mat);
    this.mesh.scale.setScalar(4000);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    scene.add(this.mesh);

    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.palette = samplePalette(0.6);
    this.fogColor = new THREE.Color();
    this.ambient = new THREE.Color();
    this.moonPhase = 0.5;
    this.cloudAmt = 0.5;
    this.cloudDark = 1;
  }

  /** t: 0..1 through the day (0 = midnight, 0.25 = sunrise, 0.5 = noon). */
  update(dt, t, opts = {}) {
    const ang = (t - 0.25) * Math.PI * 2;
    const tilt = 0.42;
    this.sunDir.set(Math.cos(ang), Math.sin(ang), Math.sin(ang * 0.5) * tilt).normalize();
    this.moonDir.copy(this.sunDir).multiplyScalar(-1);
    const e = this.sunDir.y;

    const p = samplePalette(e);
    this.palette = p;
    this.uniforms.uZenith.value.setRGB(p.zenith[0], p.zenith[1], p.zenith[2]);
    this.uniforms.uHorizon.value.setRGB(p.horizon[0], p.horizon[1], p.horizon[2]);
    this.uniforms.uGround.value.setRGB(p.ground[0], p.ground[1], p.ground[2]);
    this.uniforms.uSunColor.value.setRGB(p.sun[0], p.sun[1], p.sun[2]);
    this.uniforms.uSunDir.value.copy(this.sunDir);
    this.uniforms.uMoonDir.value.copy(this.moonDir);
    this.uniforms.uTime.value += dt;
    this.uniforms.uStarAmt.value = Math.min(1, Math.max(0, (-e + 0.02) * 5)) * (opts.stars === false ? 0 : 1);
    this.uniforms.uCloudAmt.value = this.cloudAmt;
    this.uniforms.uCloudDark.value = this.cloudDark;
    this.uniforms.uMoonPhase.value = this.moonPhase;
    this.uniforms.uWind.value = opts.wind === undefined ? 1 : opts.wind;
    this.uniforms.uHaze.value = opts.haze === undefined ? 1 : opts.haze;

    // Fog + light colours follow the horizon band.
    const fogMix = opts.fogTint || 0.55;
    this.fogColor.setRGB(
      p.horizon[0] * fogMix + p.zenith[0] * (1 - fogMix),
      p.horizon[1] * fogMix + p.zenith[1] * (1 - fogMix),
      p.horizon[2] * fogMix + p.zenith[2] * (1 - fogMix),
    );
    const day = Math.min(1, Math.max(0, e * 2.4 + 0.22));
    this.ambient.setRGB(
      0.16 + p.zenith[0] * 0.55 * day + 0.03,
      0.17 + p.zenith[1] * 0.55 * day + 0.03,
      0.22 + p.zenith[2] * 0.55 * day + 0.04,
    );
    this.sunIntensity = 0.12 + day * 1.15;
    this.sunElevation = e;
    this.isNight = e < -0.04;
  }

  /** Attach to a camera so the dome always surrounds the viewer. */
  follow(camera) { this.mesh.position.copy(camera.position); }

  /** Where the moon is in its cycle, 0..1 (drives the phase shading). */
  setMoonPhase(day) { this.moonPhase = ((day % 8) + 8) % 8 / 8; }
}

export default Sky;
