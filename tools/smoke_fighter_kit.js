// Fighter kit smoke test: Combat Momentum passive + Skill 1 Power Strike. Run: node tools/smoke_fighter_kit.js
require("../src/config.js");
require("../src/characters.js");
require("../src/arena.js");
require("../src/fighter.js");
require("../src/projectiles.js");
require("../src/sim.js");
require("../src/bots.js");
const MW = globalThis.MW;
const C = MW.CHARACTERS, S = MW.STATE;
const I = (o) => Object.assign({}, MW.IDLE_INTENT, o);
let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  (" + detail + ")" : ""));
  if (!ok) failures++;
}

// Fighter vs a durable, armorless, super-heavy dummy so it never gets launched out of range.
const dummyStats = Object.assign({}, C.tank, { maxHP: 100000, armor: 0, weight: 100000 });
function duel(gap = 10) {
  const sim = new MW.Sim(MW.ARENA, [C.fighter, dummyStats]);
  for (let i = 0; i < 120; i++) sim.step([I({}), MW.Bots.dummy()]);
  const [fa, fd] = sim.fighters;
  fa.x = 535; fa.facing = 1;
  fd.x = fa.x + C.fighter.width + gap; fd.facing = -1;
  for (let i = 0; i < 5; i++) sim.step([I({}), MW.Bots.dummy()]);
  return sim;
}
function run(sim, n, intent) { for (let i = 0; i < n; i++) sim.step([i === 0 ? intent : I({}), MW.Bots.dummy()]); }
const P = C.fighter.passive;

// --- passive: gains only on landed hits ---
{
  const sim = duel(400); // far away: whiffs
  const [a] = sim.fighters;
  for (let i = 0; i < 4; i++) run(sim, 30, I({ attackPressed: true }));
  check("whiffed attacks give no momentum", a.momentum === 0, "momentum " + a.momentum);
}
{
  const sim = duel();
  const [a, d] = sim.fighters;
  run(sim, 40, I({ attackPressed: true }));
  check("a landed hit gives 1 momentum", a.momentum === 1, "momentum " + a.momentum);
  // decay after the delay
  run(sim, P.decayDelay + 5, I({}));
  check("momentum fades after idling", a.momentum === 0, "momentum " + a.momentum);
}
{
  const sim = duel();
  const [a, d] = sim.fighters;
  a.momentum = 4;
  a.takeHit(d, { damage: 1, knockback: 0 }, -1);
  check("taking a hit loses momentum (hurtLoss)", a.momentum === 4 - P.hurtLoss, "momentum " + a.momentum);
}

// --- skill 1: Power Strike ---
{
  const sim = duel();
  const [a, d] = sim.fighters;
  const def = C.fighter.skills[0];
  const hp0 = d.hp;
  run(sim, 1, I({ skillPressed: [true, false, false, false] }));
  check("skill starts a startup state", a.state === S.ATTACK_STARTUP && a.hit.isSkill, a.state);
  check("cooldown starts", a.cooldowns[0] > 0, "cd " + a.cooldowns[0]);
  run(sim, def.attack.startup + 2, I({}));
  const dealt = hp0 - d.hp;
  const expected = def.attack.damage * 100 / (100 + 0);
  check("Power Strike damage (normal)", Math.abs(dealt - expected) < 1e-6, dealt.toFixed(2) + " vs " + expected);
  check("target is staggered", d.state === S.HITSTUN && d.stateTimer <= def.attack.stun, "stun " + d.stateTimer);
  check("hit adds momentum + mana", a.momentum === 1 && a.mana === def.attack.manaGain, "m " + a.momentum + " mana " + a.mana);
  // cannot cancel into a basic attack
  run(sim, 1, I({ attackPressed: true }));
  check("skill cannot be chained into a basic attack", a.hit && a.hit.isSkill);
  run(sim, 300, I({}));
  // recast on cooldown does nothing
  const sim2 = duel();
  const [a2] = sim2.fighters;
  run(sim2, 1, I({ skillPressed: [true, false, false, false] }));
  run(sim2, 70, I({}));
  const cd = a2.cooldowns[0];
  run(sim2, 1, I({ skillPressed: [true, false, false, false] }));
  check("cannot recast during cooldown", a2.cooldowns[0] === cd - 1 && !(a2.state === S.ATTACK_STARTUP), "cd " + a2.cooldowns[0]);
}

// --- empowered Power Strike ---
{
  const sim = duel();
  const [a, d] = sim.fighters;
  const def = C.fighter.skills[0];
  a.momentum = P.max;
  const hp0 = d.hp;
  run(sim, 1, I({ skillPressed: [true, false, false, false] }));
  check("full momentum is consumed on cast", a.momentum === 0 && a.hit.empowered);
  run(sim, def.attack.startup + 2, I({}));
  const dealt = hp0 - d.hp;
  const expected = def.attack.damage * (1 + P.bonus);
  check("empowered damage = base x (1 + bonus)", Math.abs(dealt - expected) < 1e-6, dealt.toFixed(2) + " vs " + expected);
  // next cast (after cooldown) is NOT empowered again
  run(sim, 300, I({}));
  run(sim, 1, I({ skillPressed: [true, false, false, false] }));
  check("bonus applies only once", !a.hit.empowered);
}

// --- missed skill is punishable ---
{
  const sim = duel(400);
  const [a] = sim.fighters;
  run(sim, 1, I({ skillPressed: [true, false, false, false] }));
  const total = C.fighter.skills[0].attack;
  let ticks = 1;
  while (a.hit && ticks < 200) { run(sim, 1, I({})); ticks++; }
  check("missed Power Strike has long startup+recovery", ticks >= total.startup + total.recovery, ticks + " ticks");
}

// --- skill 2: Fist Rush ---
{
  const def = C.fighter.skills[1].attack;
  const cast = { skillPressed: [false, true, false, false] };
  // missed rush: travels about dashSpeed x startup px, then long recovery
  const sim = duel(400);
  const [a] = sim.fighters;
  const x0 = a.x;
  run(sim, 1, I(cast));
  let ticks = 1;
  while (a.hit && ticks < 200) { run(sim, 1, I({})); ticks++; }
  const dist = a.x - x0;
  check("Fist Rush dashes forward (~90px)", dist >= 80 && dist <= 130, dist.toFixed(0) + " px");
  check("missed Rush is punishable", ticks >= def.startup + def.recovery, ticks + " ticks");
  check("Rush has its own cooldown", a.cooldowns[1] > 0 && a.cooldowns[0] === 0, "cd " + a.cooldowns[1]);
  // hit: dash stops on contact, damage + brief stun
  const sim2 = duel(60);
  const [a2, d2] = sim2.fighters;
  const hp0 = d2.hp;
  run(sim2, 1, I(cast));
  run(sim2, def.startup + def.active + 2, I({}));
  check("Rush hits for its damage", Math.abs(hp0 - d2.hp - def.damage) < 1e-6, (hp0 - d2.hp).toFixed(2));
  check("Rush stops at the target (no run-through)", a2.x + C.fighter.width <= d2.x + 20, "gap " + (d2.x - (a2.x + C.fighter.width)).toFixed(0));
  check("Rush stun is brief and fixed", d2.state === S.HITSTUN && d2.stateTimer <= def.stun, "stun " + d2.stateTimer);
  // empowered
  const sim3 = duel(60);
  const [a3, d3] = sim3.fighters;
  a3.momentum = P.max;
  const hp3 = d3.hp;
  run(sim3, 1, I(cast));
  run(sim3, def.startup + def.active + 2, I({}));
  check("Rush gets the momentum bonus", Math.abs(hp3 - d3.hp - def.damage * (1 + P.bonus)) < 1e-6 && a3.momentum <= 1, (hp3 - d3.hp).toFixed(2));
}

console.log(failures ? "\n" + failures + " FAILED" : "\nAll fighter-kit checks passed.");
process.exit(failures ? 1 : 0);
