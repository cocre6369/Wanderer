import { WorldGen } from '../src/world/gen.js';
import { RiverSystem } from '../src/world/rivers.js';
import { defaultGen, genForType } from '../src/world/config.js';

const desc = { seed: '847293', size: 'medium', type: 'normal', gen: genForType('normal') };
const gen = new WorldGen(desc);
const N = 256, span = 6144;
const counts = {}; let min=1e9,max=-1e9, water=0, snow=0;
const t0 = Date.now();
for (let i=0;i<N;i++) for (let j=0;j<N;j++){
  const x = -span/2 + (i/(N-1))*span, z = -span/2 + (j/(N-1))*span;
  const c = gen.sample(x,z);
  counts[c.biome]=(counts[c.biome]||0)+1;
  if (c.h<min) min=c.h; if(c.h>max) max=c.h;
  if (gen.waterLevel(x,z,c.h)!==null) water++;
  if (c.snow>0.5) snow++;
}
const ms = Date.now()-t0;
console.log(`samples ${N*N} in ${ms}ms -> ${(ms*1000/(N*N)).toFixed(1)}us/sample`);
console.log('height range', min.toFixed(1), max.toFixed(1));
console.log('water frac', (water/(N*N)).toFixed(3), 'snow frac', (snow/(N*N)).toFixed(3));
const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
console.log('biomes:', sorted.map(([k,v])=>`${k}:${(100*v/(N*N)).toFixed(2)}%`).join('  '));
const RARE=new Set(['frozen_jungle','red_snow','crystal_forest','volcanic_swamp','dead_forest','flooded_desert','mushroom_valley']);
let rare=0; for(const k in counts) if(RARE.has(k)) rare+=counts[k];
console.log('rare biome coverage:', (100*rare/(N*N)).toFixed(3)+'%');

const rivers = new RiverSystem(gen);
const t1 = Date.now();
rivers.ensureRegion(-1500,-1500,1500,1500);
console.log('queued source cells', rivers.pending);
rivers.processAll();
console.log(`rivers built in ${Date.now()-t1}ms, walks=${[...rivers.walks.values()].filter(Boolean).length}, segments=${rivers.totalSegments}`);
const w = rivers.waterAt(0,0,400);
console.log('water at origin?', w ? {y:w.y.toFixed(2), flow:w.flow.toFixed(1), width:w.width.toFixed(1)} : null);
