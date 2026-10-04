import { WorldGen } from '../src/world/gen.js';
import { RiverSystem, RIVER_CELL } from '../src/world/rivers.js';
import { genForType } from '../src/world/config.js';
import { cellRng } from '../src/core/rng.js';

const gen = new WorldGen({ seed: '847293', size: 'medium', type: 'normal', gen: genForType('normal') });
// histogram of lowHeight over region
let above=0, tot=0, hs=[];
for (let x=-4000;x<=4000;x+=128) for(let z=-4000;z<=4000;z+=128){ const h=gen.lowHeight(x,z); tot++; if(h>=14) above++; hs.push(h); }
hs.sort((a,b)=>a-b);
console.log('lowHeight >=14:', (100*above/tot).toFixed(1)+'%', 'median', hs[hs.length>>1].toFixed(1), 'p90', hs[(hs.length*0.9)|0].toFixed(1));

const rivers = new RiverSystem(gen);
rivers.ensureRegion(-1500,-1500,1500,1500);
const q = rivers.queue.slice();
let passChance=0, passH=0, built=0, lens=[];
for (const [i,j] of q){
  const rng = cellRng(gen.seed,i,j,771);
  if (!rng.chance(0.06+gen.p.river*0.62)) continue;
  passChance++;
  let bh=-1e9;
  for(let t=0;t<4;t++){ const x=(i+rng.float())*RIVER_CELL, z=(j+rng.float())*RIVER_CELL; const h=gen.lowHeight(x,z); if(h>bh)bh=h; }
  if (bh>=14) passH++;
}
rivers.processAll();
for (const w of rivers.walks.values()) if(w){built++; lens.push(w.pts.length);}
console.log({queued:q.length, passChance, passH, built, avgLen:(lens.reduce((a,b)=>a+b,0)/lens.length).toFixed(1), maxLen:Math.max(...lens)});

// trace one river
const first=[...rivers.walks.values()].filter(Boolean)[0];
if(first){ console.log('river start', first.pts[0].x.toFixed(0), first.pts[0].z.toFixed(0), 'y', first.pts[0].y.toFixed(1));
  console.log('trace:', first.pts.filter((p,i)=>i%3===0).map(p=>`${p.y.toFixed(1)}/${p.wy.toFixed(1)}`).join(' '));
  console.log('end', first.pts[first.pts.length-1].y.toFixed(1), 'flow', first.flow.toFixed(1)); }
