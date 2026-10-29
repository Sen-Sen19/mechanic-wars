// Smoke test for the random arena generator. Run: node tools/smoke_arena.js
require("../src/config.js");
require("../src/characters.js");
require("../src/arena.js");
require("../src/fighter.js");
require("../src/projectiles.js");
require("../src/sim.js");
require("../src/bots.js");
const MW = globalThis.MW;
const S = MW.STATE;
let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  (" + detail + ")" : ""));
  if (!ok) failures++;
}
function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

const N = 300;
const counts = new Set(), layouts = new Set();
let badStage = 0, badCount = 0, badBounds = 0, badOverlap = 0, badReach = 0, badSpawn = 0, badMid = 0;
for (let i = 1; i <= N; i++) {
  const a = MW.makeArena(seeded(i * 7919));
  const stage = a.platforms[0];
  const fl = a.platforms.slice(1);
  counts.add(fl.length);
  layouts.add(JSON.stringify(fl));
  if (stage.x !== 240 || stage.y !== 560 || stage.w !== 800 || stage.oneWay) badStage++;
  if (fl.length < 2 || fl.length > 5) badCount++;
  for (const p of fl) {
    if (!p.oneWay || p.x < 100 || p.x + p.w > 1180 || p.w < 140 || p.w > 260) badBounds++;
    if (p.y > 450 || p.y < 285) badBounds++;
  }
  for (let x = 0; x < fl.length; x++) for (let y = x + 1; y < fl.length; y++) {
    const p = fl[x], q = fl[y];
    if (Math.abs(p.y - q.y) <= 60 && !(p.x + p.w + 70 < q.x || q.x + q.w + 70 < p.x)) badOverlap++;
  }
  const low = fl.filter((p) => p.y >= 410);
  const mid = fl.filter((p) => p.y < 410);
  for (const p of low) if (Math.min(p.x + p.w, 1040) - Math.max(p.x, 240) < 80) badReach++;
  for (const p of mid) if (!low.some((l) => Math.abs((l.x + l.w / 2) - (p.x + p.w / 2)) <= 180 + (l.w + p.w) / 2)) badMid++;
  const [s1, s2] = a.spawns;
  if (!(s1.x < 640 && s2.x > 640 && s1.facing === 1 && s2.facing === -1 && s2.x - s1.x >= 400)) badSpawn++;
}
check("main stage is always the same", badStage === 0);
check("floating platform count is always 2-5", badCount === 0);
check("count really varies across matches", counts.size >= 3, [...counts].sort().join(","));
check("layouts really differ (>= 250 unique of " + N + ")", layouts.size >= 250, layouts.size + " unique");
check("every platform is inside the frame with a sane width", badBounds === 0, "bad=" + badBounds);
check("no platforms overlap or crowd each other", badOverlap === 0, "bad=" + badOverlap);
check("low platforms overlap the stage so they are jumpable", badReach === 0, "bad=" + badReach);
check("upper platforms always sit near a low platform", badMid === 0, "bad=" + badMid);
check("P1 spawns left facing right, P2 spawns right facing left, well apart", badSpawn === 0, "bad=" + badSpawn);

// Playing on random arenas: spawn on the stage, stay separated left/right, and bots survive 10s without errors.
let spawnOk = 0, crashed = 0, hits = 0;
const sample = 40;
for (let i = 1; i <= sample; i++) {
  const a = MW.makeArena(seeded(i * 104729));
  const sim = new MW.Sim(a, [MW.CHARACTERS.fighter, MW.CHARACTERS.assassin]);
  const [f1, f2] = sim.fighters;
  for (let t = 0; t < 40; t++) sim.step([MW.IDLE_INTENT, MW.IDLE_INTENT]);
  if (f1.grounded && f2.grounded && f1.x < f2.x && Math.abs(f1.y + f1.stats.height - 560) < 2 && Math.abs(f2.y + f2.stats.height - 560) < 2 && f2.x - f1.x > 300) spawnOk++;
  try {
    const b1 = MW.Bots.create("aggressive", i), b2 = MW.Bots.create("aggressive", i + 1000);
    const sim2 = new MW.Sim(a, [MW.CHARACTERS.fighter, MW.CHARACTERS.tank]);
    for (let t = 0; t < 600; t++) sim2.step([b1(sim2, 0), b2(sim2, 1)]);
    hits += sim2.fighters.reduce((n, f) => n + (f.lastHit ? 1 : 0), 0);
  } catch (e) { crashed++; console.log(e); }
}
check("on random arenas both fighters land on the stage, P1 left of P2, 300+ px apart", spawnOk === sample, spawnOk + "/" + sample);
check("bots play 10s on random arenas without errors", crashed === 0);
check("bots still fight each other on random arenas", hits > sample / 2, "hit-sides=" + hits);

// Sim.setArena swaps the layout and restarts
{
  const a1 = MW.makeArena(seeded(1)), a2 = MW.makeArena(seeded(2));
  const sim = new MW.Sim(a1, [MW.CHARACTERS.fighter, MW.CHARACTERS.mage]);
  sim.kills[0] = 3;
  sim.setArena(a2);
  check("setArena swaps the layout and clears the score", sim.arena === a2 && sim.kills[0] === 0 && sim.fighters[0].x < sim.fighters[1].x);
}
console.log(failures ? "\n" + failures + " check(s) FAILED." : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
