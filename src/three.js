/**
 * WANDERER — three.js re-export
 * -----------------------------
 * The renderer is vendored into the repository (vendor/three) so the game
 * runs fully offline with no CDN and no build step. Every module imports
 * three through this file, which keeps the relative paths in one place and
 * lets the exact same code run in a browser and under Node for testing.
 */
export * from '../vendor/three/three.module.js';
