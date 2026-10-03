# WANDERER — The Drifting Lands

A procedural open-world game of exploration, discovery and survival, written
from scratch as a single ES-module codebase. No build step, no bundler, no npm
install — three.js is vendored into the repository, everything else is ours.

**Every world is generated from a seed and a set of rules.** The same seed with
the same settings always produces the same mountains, the same rivers, the same
ruins, and the same wolves waiting in the same trees.

---

## Download

**→ [`releases/index.html`](releases/index.html) is the single download page.** Open it for the
current and previous versions and what changed in each.

The current release is **v1.0.0**:

```bash
git clone --branch v1.0.0 https://github.com/cocre6369/Wanderer.git
# or download the archive:
# https://github.com/cocre6369/Wanderer/archive/refs/tags/v1.0.0.zip
```

Either way you get the same 68 files, and both run offline — the archive contains the vendored
three.js, so no CDN is contacted.

## Run it

```bash
node server.mjs 8080
# → http://localhost:8080/
```

That's the whole install. Any static file server works too (`python3 -m
http.server`, nginx, GitHub Pages) as long as `.js` is served as
`text/javascript` — the game is a plain ES-module graph.

Requires a browser with WebGL 2 and ES modules: current Chrome, Edge, Firefox
or Safari. No network access is needed once the files are on disk.

## Controls

| | |
|---|---|
| `WASD` / mouse | move, look |
| `Shift` | sprint (stamina) |
| `Space` | jump · hold against a ledge to mantle |
| `C` | crouch · `X` while running to slide · `G` to glide |
| `Q` | dodge (brief invulnerability) |
| `LMB` / `RMB` / `MMB` | light attack · heavy attack · block (time it to parry) |
| `E` | interact — harvest, talk, open, use a station |
| `I` `R` `M` `J` `K` | inventory · crafting · map · journal · character |
| `B` | build mode |
| `1`–`0` / wheel | hotbar |
| `Z` | third ↔ first person |
| `Esc` | settings |
| `Shift+F5` | save now |

---

## What is in here

### World generation
- **Multi-noise geography** — continent, mountain, canyon, plateau, volcano and
  anomaly fields combine into a heightfield, then a climate model (latitude
  scaled by world size, altitude lapse, volcanic heating, a shaped polar field
  and an aridity gate) picks from **25 biomes**, 7 of them rare and gated on the
  anomaly field. Biome borders blend rather than snap.
- **Rivers that flow downhill.** Springs are placed on high ground and walked
  downhill along the analytic gradient, accumulating flow into width and carve
  depth; lakes fill basins. 160 rivers on a medium world in ~32 ms.
- **Layered underground** — shallow caverns, deep caverns and the abyss,
  generated on demand and carved into the surface above them.
- **Contextual placement, not scatter.** 35 POI types with placement rules:
  villages need flat habitable ground near water and are spaced on a coarse
  grid; ruins cluster where the ruin-density field is high; oases only in
  deserts; hollow spires only where resonance is strong. 22% of cells get a
  second, smaller structure.
- **Reproducible.** `tools/test.mjs` asserts bit-identical heights, climates and
  POI placement across two independently built worlds from one seed.

### Rendering
- Continuous LOD terrain: 5 levels, 128 m–2048 m tiles, ring streaming, seams
  snapped to the neighbour's cell size (measured **0.00% unshared boundary
  vertices** — no cracks).
- Procedural sky dome with a full day/night cycle, moon phases, stars and
  weather-driven fog; one shared uniform block feeds terrain, water and
  vegetation shaders.
- One `InstancedMesh` per plant species for the whole world, wind in the vertex
  shader, placements hashed so vegetation is deterministic and free to cull.
- Everything else — props, ruins, creatures, the player, icons — is generated
  geometry or inline SVG. **There are no image or model assets in this repo.**

### Systems
- **Movement**: walk, sprint, jump, crouch, slide, swim, climb, mantle, glide,
  ladders, with mud/deep-snow/ice/slope modifiers that change your speed.
- **Inventory**: 55-slot grid + 10-slot hotbar + 8 equipment slots, stacking,
  splitting, weight, search, sort, categories, rarity colours, durability.
- **118 items** with procedural SVG icons, 3D-relevant stats and value; weapons
  are generated from 11 archetypes × 10 materials × 6 rarities × 14 prefixes ×
  8 suffixes, with names that come out of the combination.
- **Crafting**: 80 recipes across 9 stations and 4 tiers, gated by *knowledge*
  rather than level. Recipes are discovered from blueprints, people and ruins.
- **Combat**: wind-up / active / recovery frames per archetype, reach and arc,
  light and heavy attacks, combos, blocking that costs stamina, a 0.22 s parry
  window, dodge i-frames, stagger, crits, elemental affinities, status effects.
- **Building**: 13 piece types × 4 materials on a 2 m snap grid with free
  placement available, stacking, doors, repair, salvage, collision the player
  actually stands on, and farms with crops that need water and the right
  temperature.
- **Actors**: 44 creature archetypes from biome tables, distance-gated AI (full
  state machine ≤ 70 m, position only ≤ 200 m, dormant beyond), wildlife that
  bolts from noise, hostiles that leash to their home, and NPCs with routines.
- **Weather**: seeded fronts drifting across the world, filtered by what the
  ground allows — blizzards need cold, sandstorms need sand, ashfall only
  downwind of volcanic ground. Nine states.
- **Audio**: 100% synthesised at runtime. Footsteps per surface, a generative
  soundtrack that re-harmonises by biome, danger and time of day, and
  positional wind, water, birds, insects and cave rumble.
- **Discovery**: journal across 7 categories, a mystery layer (the Choir,
  hollow spires, echo shards, attunement) that unlocks as you find things,
  contextual tutorial hints that only fire when the situation is real, and
  random world events drawn from what is actually near you.
- **Saves**: IndexedDB with a localStorage fallback and an in-memory fallback
  after that, 6 slots + autosave, atomic writes with a temp record so a crash
  mid-write cannot destroy the previous save, schema versioning with
  migrations.

### Performance
Chunked streaming with a 3.5 ms/frame build budget, LOD, frustum and distance
culling, pooled particles and footprint decals, distance-gated AI, and
background generation queues worked in slices so the frame never stalls.

---

## Layout

```
index.html            entry point
server.mjs            dependency-free dev server
src/
  three.js            re-export shim over the vendored renderer
  main.js             boot: title → world creation → play
  game.js             orchestrator and frame loop
  core/               rng, noise, names, input
  world/              config, biomes, gen, rivers, poi, world facade
  render/             sky, water, terrain, vegetation, structures, creatures,
                      player model, particles, shared env uniforms
  entities/           player, camera rig, actors
  systems/            items, icons, inventory, crafting, combat, building,
                      resources, structures, weather, actors, discovery,
                      dialog, audio, save
  ui/                 dom helpers, in-game UI, title/creation screens
styles/main.css       the whole visual identity
tools/test.mjs        the test suite — `node tools/test.mjs`
tools/smoke.mjs       geometry/entity smoke test (run by the suite)
vendor/three/         three.js r160.1, vendored with its licence
releases/index.html   the download & versions page
```

## Tests

```bash
node tools/test.mjs      # 67 checks, exit 1 on failure
```

Covers: generator determinism (heights, climate, POI placement), mesher
integrity (no NaN vertices, unit normals, crack-free LOD seams, water sheets),
river descent, biome count, resource harvesting and depletion, POI geometry and
terrain carving, build collision rules, farming, weather variety, actor
streaming and AI, icon coverage, save migration and round-trips, combat
(hits, parry, block, dodge, loot), crafting graph closure and the module graph.

**Not covered:** anything requiring a real GPU — shader compilation and final
visuals. That needs a browser.

## Licence

MIT. three.js is © its authors, MIT — see `vendor/three/LICENSE`.
