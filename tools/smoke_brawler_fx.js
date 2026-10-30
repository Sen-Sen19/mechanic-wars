// Brawler effects smoke test: strike events, hit-stop, combo counter, afterimages, headless stays silent.
// Run: node tools/smoke_brawler_fx.js
for (const f of ["config", "characters", "arena", "fighter", "projectiles", "sim", "bots", "brawler_fx"]) require("../src/" + f + ".js");
const MW = globalThis.MW;
const I = (o) => Object.assign({}, MW.IDLE_INTENT, o);
const D = () => MW.Bots.dummy();
let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  (" + detail + ")" : ""));
  if (!ok) failures++;
}
const FX = MW.BrawlerFx;

function duel(attacker, victim, withFx) {
  const a = MW.CHARACTERS[attacker], d = MW.CHARACTERS[victim];
  const sim = new MW.Sim(MW.ARENA, [a, d]);
  if (withFx) sim.fx = [];
  for (let i = 0; i < 120; i++) sim.step([I({}), D()]);
  const [fa, fd] = sim.fighters;
  fa.y = 560 - a.height; fd.y = 560 - d.height; fa.vy = fd.vy = 0;
  fa.x = 245; fa.facing = 1; fd.x = fa.x + a.width + 14; fd.facing = -1;
  for (let i = 0; i < 5; i++) sim.step([I({}), D()]);
  if (withFx) sim.fx.length = 0;
  return sim;
}
function collect(sim, intentAt, ticks) {
  const seen = [];
  for (let t = 0; t < ticks; t++) {
    const [fa, fd] = sim.fighters;
    fd.x = fa.x + fa.stats.width + 14; fd.vx = 0;
    sim.step([intentAt(t), D()]);
    seen.push(...sim.fx); sim.fx.length = 0;
  }
  return seen;
}

check("only the Brawler asks for strike events", MW.CHARACTERS.fighter.hitFx === "brawler" && ["mage", "assassin", "hitter", "tank"].every((id) => !MW.CHARACTERS[id].hitFx));
check("power strike and fist rush carry skill ids", MW.CHARACTERS.fighter.skills[0].attack.id === "power_strike" && MW.CHARACTERS.fighter.skills[1].attack.id === "fist_rush");

// 1) jab -> strike event with the right shape
let sim = duel("fighter", "tank", true);
let ev = collect(sim, (t) => I({ attackPressed: t === 0 }), 14).filter((e) => e.type === "strike");
check("one jab -> one strike event, shape jab", ev.length === 1 && ev[0].shape === "jab", ev.map((e) => e.shape).join(","));
check("strike event points forward, names owner and target", ev[0] && ev[0].dir === 1 && ev[0].ownerId === 0 && ev[0].targetId === 1 && ev[0].dmg > 0);

// 2) power strike -> strike event shape power; FX turns it into a freeze
sim = duel("fighter", "tank", true);
ev = collect(sim, (t) => I({ skillPressed: [t === 0, false, false, false] }), 60).filter((e) => e.type === "strike");
check("power strike -> strike event, shape power", ev.length === 1 && ev[0].shape === "power", ev.map((e) => e.shape).join(","));
FX.reset();
FX.event(ev[0]);
let frozen = 0;
while (FX.freezeStep()) frozen++;
check("power strike freezes the game (hit-stop)", frozen === FX.TUNE.hitStop.power, "frozen " + frozen + " ticks");
check("victim trembles while frozen", FX.jitter({ id: 1 }) !== null);
FX.reset();
FX.event({ type: "strike", shape: "jab", x: 300, y: 500, dir: 1, ownerId: 0, targetId: 1, dmg: 6, empowered: false, blocked: false, ko: false });
check("a jab does not freeze", FX.freezeStep() === false);
check("freeze is capped", (() => { FX.reset(); FX.event({ type: "strike", shape: "meteor", x: 0, y: 0, dir: 1, ownerId: 0, targetId: 1, dmg: 45, ko: true }); let n = 0; while (FX.freezeStep()) n++; return n <= 16 && n >= 10; })());
FX.reset();

// 3) combo counter: counts up inside the window, ends after it
const hit = (o) => Object.assign({ type: "strike", shape: "jab", x: 300, y: 500, dir: 1, ownerId: 0, targetId: 1, dmg: 6, empowered: false, blocked: false, ko: false }, o);
FX.event(hit({})); FX.event(hit({})); FX.event(hit({ dmg: 10 }));
check("three hits -> combo 3 with summed damage", FX._combo[0] && FX._combo[0].n === 3 && Math.abs(FX._combo[0].dmg - 22) < 1e-6, JSON.stringify(FX._combo[0]));
FX.event(hit({ blocked: true }));
check("blocked hits do not count", FX._combo[0].n === 3);
sim = duel("fighter", "tank", true);
for (let i = 0; i < FX.TUNE.comboWindow + 5; i++) { FX.update(sim); FX.tick(); }
check("combo ends after the window", !FX._combo[0]);

// 4) empowered + overdrive: filling momentum spawns effects
FX.reset();
sim = duel("fighter", "tank", true);
const me = sim.fighters[0];
FX.update(sim);
const before = FX._rings.length + FX._words.length;
me.momentum = 5;
FX.update(sim);
check("filling momentum triggers the overdrive burst", FX._rings.length + FX._words.length > before && FX._words.some((w) => w.text === "OVERDRIVE"));

// 5) afterimages while dashing
FX.reset();
sim = duel("fighter", "tank", true);
sim.fighters[1].x = 600;
let ghostsSeen = 0;
for (let t = 0; t < 30; t++) {
  sim.step([I({ skillPressed: [false, t === 0, false, false] }), D()]);
  FX.update(sim); FX.tick();
  ghostsSeen = Math.max(ghostsSeen, FX._ghosts.length);
}
check("Fist Rush leaves afterimages", ghostsSeen > 0, "max ghosts " + ghostsSeen);

// 6) other characters send no strike events; headless (sim.fx = null) stays silent
sim = duel("tank", "fighter", true);
ev = collect(sim, (t) => I({ attackPressed: t === 0 }), 60);
check("tank attacks send no strike events", ev.every((e) => e.type !== "strike"));
sim = duel("fighter", "tank", false);
let threw = false;
try { for (let t = 0; t < 40; t++) sim.step([I({ attackPressed: t === 0 }), D()]); } catch (e) { threw = true; }
check("headless run works and sim.fx stays null", !threw && sim.fx === null);

console.log(failures ? "\n" + failures + " check(s) failed" : "\nAll Brawler fx checks passed.");
process.exit(failures ? 1 : 0);
