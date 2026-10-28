// Assassin effects smoke test: swing / hit events, frenzy rises and falls, headless stays silent.
// Run: node tools/smoke_assassin_fx.js
for (const f of ["config", "characters", "arena", "fighter", "projectiles", "sim", "bots", "assassin_fx"]) require("../src/" + f + ".js");
const MW = globalThis.MW;
const I = (o) => Object.assign({}, MW.IDLE_INTENT, o);
const D = () => MW.Bots.dummy();
let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  (" + detail + ")" : ""));
  if (!ok) failures++;
}

function duel(withFx) {
  const a = MW.CHARACTERS.assassin, d = MW.CHARACTERS.tank;
  const sim = new MW.Sim(MW.ARENA, [a, d]);
  if (withFx) sim.fx = [];
  for (let i = 0; i < 120; i++) sim.step([I({}), D()]);
  const [fa, fd] = sim.fighters;
  fa.y = 560 - a.height; fd.y = 560 - d.height; fa.vy = fd.vy = 0;
  fa.x = 245; fa.facing = 1; fd.x = fa.x + a.width + 20; fd.facing = -1;
  for (let i = 0; i < 5; i++) sim.step([I({}), D()]);
  if (withFx) sim.fx.length = 0;
  return sim;
}

check("assassin attack is tagged blood", MW.CHARACTERS.assassin.attack.fxStyle === "blood");
check("fighter and tank are not tagged", !MW.CHARACTERS.fighter.attack.fxStyle && !MW.CHARACTERS.tank.attack.fxStyle);

let sim = duel(true);
const seen = [];
for (let t = 0; t < 12; t++) {
  sim.step([I({ attackPressed: t === 0 }), D()]);
  seen.push(...sim.fx); sim.fx.length = 0;
}
check("one swing -> swing event then hit event", seen.length === 2 && seen[0].type === "swing" && seen[1].type === "hit", seen.map((e) => e.type).join(","));
check("events are tagged blood and point forward", seen.every((e) => e.style === "blood" && e.dir === 1));
check("hit event is on the target's near edge (x = 245 + 32 + 20)", seen[1] && Math.abs(seen[1].x - 297) < 1, seen[1] && seen[1].x);

// frenzy: 4 hits = full, then it decays; being hit halves it
const FX = MW.AssassinFx;
const fakeSim = { fighters: [{ id: 0, stats: MW.CHARACTERS.assassin, x: 0, px: 0, y: 0, facing: 1, state: "idle" }, { id: 1, stats: MW.CHARACTERS.tank, x: 0, px: 0, y: 0, facing: 1, state: "idle" }] };
for (let i = 0; i < 4; i++) FX.event({ type: "hit", style: "blood", x: 0, y: 0, dir: 1, ownerId: 0, targetId: 1 });
check("4 hits fill the frenzy", FX.frenzyOf(0) === 1, FX.frenzyOf(0));
FX.event({ type: "hit", style: "blood", x: 0, y: 0, dir: 1, ownerId: 1, targetId: 0 });
check("getting hit halves the frenzy", Math.abs(FX.frenzyOf(0) - 0.5) < 1e-9, FX.frenzyOf(0));
for (let i = 0; i < 200; i++) FX.update(fakeSim);
check("frenzy fades to zero by itself", FX.frenzyOf(0) === 0 && fakeSim.fighters[0]._frenzy === 0);
for (let i = 0; i < 200; i++) FX.tick();
check("effects clean themselves up", FX._parts.length === 0 && FX._slashes.length === 0 && FX._ghosts.length === 0);
FX.event({ type: "hit", style: "arcane", x: 0, y: 0, dir: 1, ownerId: 0, targetId: 1 });
check("other fx styles are ignored", FX._parts.length === 0);

const quiet = duel(false);
for (let t = 0; t < 12; t++) quiet.step([I({ attackPressed: t === 0 }), D()]);
check("headless run (sim.fx = null) emits nothing", quiet.fx === null);

console.log(failures ? "\n" + failures + " check(s) FAILED" : "\nAll assassin fx checks passed.");
process.exit(failures ? 1 : 0);
