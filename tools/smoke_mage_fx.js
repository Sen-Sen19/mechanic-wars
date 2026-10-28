// Mage effects smoke test: the sim emits fire / hit / fizzle events when sim.fx is on,
// stays silent when it is off, and mage_fx.js loads without a DOM. Run: node tools/smoke_mage_fx.js
require("../src/config.js");
require("../src/characters.js");
require("../src/arena.js");
require("../src/fighter.js");
require("../src/projectiles.js");
require("../src/sim.js");
require("../src/bots.js");
require("../src/mage_fx.js");
const MW = globalThis.MW;
const I = (o) => Object.assign({}, MW.IDLE_INTENT, o);
const D = () => MW.Bots.dummy();
let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  (" + detail + ")" : ""));
  if (!ok) failures++;
}

function duel(gap, withFx) {
  const m = MW.CHARACTERS.mage, d = MW.CHARACTERS.fighter;
  const sim = new MW.Sim(MW.ARENA, [m, d]);
  if (withFx) sim.fx = [];
  for (let i = 0; i < 120; i++) sim.step([I({}), D()]);
  const [fa, fd] = sim.fighters;
  fa.y = 560 - m.height; fd.y = 560 - d.height; fa.vy = fd.vy = 0;
  fa.x = 245; fa.facing = 1; fd.x = fa.x + m.width + gap; fd.facing = -1;
  for (let i = 0; i < 5; i++) sim.step([I({}), D()]);
  if (withFx) sim.fx.length = 0;
  return sim;
}
function run(sim, ticks) {
  const seen = [];
  for (let t = 0; t < ticks; t++) {
    sim.step([I({ attackPressed: t === 0 }), D()]);
    if (sim.fx) { seen.push(...sim.fx); sim.fx.length = 0; }
  }
  return seen;
}

check("mage bolt is marked arcane", MW.CHARACTERS.mage.attack.projectile.style === "arcane");

let ev = run(duel(120, true), 90);
check("hit: fire then hit events, both tagged arcane", ev.length === 2 && ev[0].type === "fire" && ev[1].type === "hit" && ev.every((e) => e.style === "arcane"), ev.map((e) => e.type).join(","));
check("fire event is in front of the mage", ev[0] && ev[0].dir === 1 && ev[0].x > 245 + MW.CHARACTERS.mage.width);

ev = run(duel(1000, true), 140); // target far away: bolt runs out of range
check("miss: fire then fizzle (no hit)", ev.length === 2 && ev[0].type === "fire" && ev[1].type === "fizzle", ev.map((e) => e.type).join(","));

const quiet = duel(120, false);
run(quiet, 90);
check("headless run (sim.fx = null) emits nothing and does not crash", quiet.fx === null);

// effects module: events create particles, tick clears them
const P = MW.MageFx._pool;
P.length = 0;
MW.MageFx.event({ type: "hit", style: "arcane", x: 10, y: 10, dir: 1 });
check("hit event spawns particles", P.length > 10, P.length + " particles");
for (let i = 0; i < 120; i++) MW.MageFx.tick();
check("particles all fade out", P.length === 0);
MW.MageFx.event({ type: "hit", style: "bullet", x: 0, y: 0, dir: 1 });
check("other projectile styles are ignored", P.length === 0);

console.log(failures ? "\n" + failures + " check(s) FAILED" : "\nAll mage fx checks passed.");
process.exit(failures ? 1 : 0);
