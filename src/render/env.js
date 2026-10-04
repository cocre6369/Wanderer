/**
 * WANDERER — Shared render environment uniforms
 * ---------------------------------------------
 * One object referenced by every custom material, so the sun, fog and camera
 * only ever have to be written once per frame.
 */

import * as THREE from '../three.js';

export const ENV = {
  uTime:     { value: 0 },
  uSunDir:   { value: new THREE.Vector3(0.3, 0.8, 0.2) },
  uSunColor: { value: new THREE.Color(1, 1, 0.95) },
  uAmbient:  { value: new THREE.Color(0.34, 0.38, 0.46) },
  uSkyColor: { value: new THREE.Color(0.62, 0.76, 0.9) },
  uFogColor: { value: new THREE.Color(0.7, 0.8, 0.88) },
  uCamPos:   { value: new THREE.Vector3() },
  uFogNear:  { value: 260 },
  uFogFar:   { value: 1800 },
  uNight:    { value: 0 },
  uWind:     { value: 1 },
};

export function updateEnv(sky, camera, opts = {}) {
  ENV.uSunDir.value.copy(sky.sunDir);
  ENV.uSunColor.value.copy(sky.uniforms.uSunColor.value);
  ENV.uAmbient.value.copy(sky.ambient);
  ENV.uSkyColor.value.copy(sky.uniforms.uZenith.value).lerp(sky.uniforms.uHorizon.value, 0.45);
  ENV.uCamPos.value.copy(camera.position);
  const fog = opts.fogColor || sky.fogColor;
  ENV.uFogColor.value.copy(fog);
  ENV.uFogNear.value = opts.fogNear === undefined ? 260 : opts.fogNear;
  ENV.uFogFar.value = opts.fogFar === undefined ? 1800 : opts.fogFar;
  ENV.uNight.value = Math.min(1, Math.max(0, -sky.sunElevation * 5 + 0.2));
}

export default ENV;
