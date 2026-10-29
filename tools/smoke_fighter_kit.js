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


// ===== skill 3: Rising Fist, skill 4: Iron Guard, ultimate: Meteor Breaker =====
function onStage(victimStats, gap, fighterStats) {
  const sim = new MW.Sim(MW.ARENA, [fighterStats || C.fighter, victimStats]);
  for (let i = 0; i < 120; i++) sim.step([I({}), MW.Bots.dummy()]);
  const [a, d] = sim.fighters;
  a.x = 400; a.facing = 1; a.y = 560 - a.stats.height; a.vy = 0;
  d.x = a.x + a.stats.width + gap; d.facing = -1; d.y = 560 - d.stats.height; d.vy = 0;
  a.invuln = 0; d.invuln = 0;
  return sim;
}

// --- Rising Fist ---
{
  const def = C.fighter.skills[2].attack;
  check("Rising Fist has an id (fx + logic look it up)", def.id === "rising_fist");
  const sim = onStage(dummyStats, 10);
  const [a, d] = sim.fighters;
  const hp0 = d.hp;
  run(sim, 1, I({ skillPressed: [false, false, true, false] }));
  run(sim, def.startup + 2, I({}));
  check("Rising Fist damage", Math.abs(hp0 - d.hp - def.damage) < 1e-6, (hp0 - d.hp).toFixed(2));
  check("Rising Fist damage is above the old 14", def.damage >= 20);
  // real launch on a normal-weight target: about 2 body heights straight up, no blast-zone KO
  const sim2 = onStage(C.mage, 10);
  const [a2, d2] = sim2.fighters;
  const y0 = d2.y; let minY = d2.y;
  run(sim2, 1, I({ skillPressed: [false, false, true, false] }));
  for (let i = 0; i < 120; i++) { run(sim2, 1, I({})); minY = Math.min(minY, d2.y); }
  check("Rising Fist launches the Mage high (>= 150 px)", y0 - minY >= 150, (y0 - minY).toFixed(0) + " px");
  check("...but not out of the arena at full HP", d2.respawns === 0, "respawns " + d2.respawns);
}

// --- Iron Guard ---
{
  const def = C.fighter.skills[3].attack;
  check("Iron Guard has an id", def.id === "iron_guard");
  const sim = onStage(dummyStats, 20, C.fighter);
  const [a, d] = sim.fighters;
  a.momentum = 3;
  run(sim, 1, I({ skillPressed: [false, false, false, true] }));
  run(sim, def.startup + 2, I({}));
  check("guard is active", a.state === S.ATTACK_ACTIVE && a.hit.id === "iron_guard", a.state);
  const hp0 = a.hp, mana0 = a.mana;
  a.takeHit(d, { damage: 20, knockback: 3 }, -1);
  const expected = (20 * 100 / (100 + C.fighter.armor)) * def.damageReduction;
  check("Iron Guard cuts damage (takes 35%)", Math.abs(hp0 - a.hp - expected) < 1e-6, (hp0 - a.hp).toFixed(2) + " vs " + expected.toFixed(2));
  check("a blocked hit does not break momentum", a.momentum === 3, "momentum " + a.momentum);
  check("a blocked hit gives mana", a.mana === mana0 + def.blockMana, "mana " + a.mana);
  check("guard is not interrupted by the hit (super armor)", a.state === S.ATTACK_ACTIVE && a.hit.id === "iron_guard", a.state);
  check("block sets up the empowered punch", a.guardEmpowered === true);
}
{
  // counter + empowered punch, through the Sim
  const def = C.fighter.skills[3].attack;
  const sim = onStage(dummyStats, 20, C.fighter);
  sim.fx = [];
  const [a, d] = sim.fighters;
  run(sim, 1, I({ skillPressed: [false, false, false, true] }));
  run(sim, def.startup + 2, I({}));
  const dhp = d.hp;
  d.startAttack(0); // the dummy swings its shield bash at the guarding Fighter
  run(sim, 40, I({}));
  const counterDmg = def.counter.damage;
  check("Iron Guard counters a close attacker", dhp - d.hp >= counterDmg - 1e-6, "dummy lost " + (dhp - d.hp).toFixed(1));
  check("counter / block / cast events reach the renderer", ["cast", "block", "impact"].every((t) => sim.fx.some((e) => e.type === t)), sim.fx.map((e) => e.type).join(","));
  // empowered basic punch = 2x damage, once
  run(sim, 120, I({})); // let the guard end
  check("empower is still waiting after the guard ends", a.guardEmpowered === true);
  d.hp = d.stats.maxHP; d.state = S.FALLING; d.hit = null; d.invuln = 0; a.x = 400; d.x = a.x + C.fighter.width + 10; d.y = a.y; d.vx = 0; d.vy = 0;
  const hp1 = d.hp;
  run(sim, 1, I({ attackPressed: true }));
  run(sim, 12, I({}));
  const dealt = hp1 - d.hp;
  check("empowered punch does 2x damage", Math.abs(dealt - C.fighter.attack.damage * def.empower.damage) < 1e-6, dealt.toFixed(2));
  check("empower is used up", a.guardEmpowered === false);
}
{
  // the bonus runs out
  const def = C.fighter.skills[3].attack;
  const sim = onStage(dummyStats, 20, C.fighter);
  const [a, d] = sim.fighters;
  a.guardEmpowered = true; a.guardEmpowerLeft = def.empower.window; a.guardEmpowerCfg = def.empower;
  run(sim, def.empower.window + 5, I({}));
  check("empowered punch expires after its window", a.guardEmpowered === false);
}
{
  // guard stays a counter-free block against far attackers (ranged)
  const sim = onStage(dummyStats, 400, C.fighter);
  const [a, d] = sim.fighters;
  run(sim, 1, I({ skillPressed: [false, false, false, true] }));
  run(sim, 10, I({}));
  const hp0 = d.hp;
  a.takeHit(d, { damage: 10, knockback: 2 }, -1);
  sim.step([I({}), MW.Bots.dummy()]);
  check("far attackers get no counter", d.hp === hp0);
}

// --- Meteor Breaker (ultimate) ---
{
  const U = C.fighter.ultimate.attack;
  check("Meteor Breaker has an id and is a skill (no basic-attack chaining)", U.id === "meteor_breaker" && U.isSkill === true);
  for (const gap of [10, 100, 180]) {
    const sim = onStage(dummyStats, gap);
    const [a, d] = sim.fighters;
    a.mana = 100;
    const hp0 = d.hp;
    run(sim, 1, I({ ultPressed: true }));
    run(sim, U.startup + U.active + 4, I({}));
    check("Meteor hits at gap " + gap + "px (charge stops at the enemy)", Math.abs(hp0 - d.hp - U.damage) < 1e-6, (hp0 - d.hp).toFixed(1));
  }
  const sim = onStage(dummyStats, 10);
  sim.fx = [];
  const [a, d] = sim.fighters;
  a.mana = 100;
  run(sim, 1, I({ ultPressed: true }));
  run(sim, U.startup + U.active + 4, I({}));
  check("ultimate spends the mana and does not refill it", a.mana === 0, "mana " + a.mana);
  check("ultimate does not build momentum", a.momentum === 0, "momentum " + a.momentum);
  check("Meteor sends cast + impact events", sim.fx.some((e) => e.type === "cast" && e.id === "meteor_breaker") && sim.fx.some((e) => e.type === "impact" && e.fx === "meteor"));
  // basic attack pressed during the ultimate must not chain after it
  const sim2 = onStage(dummyStats, 300);
  const [a2] = sim2.fighters;
  a2.mana = 100;
  run(sim2, 1, I({ ultPressed: true }));
  run(sim2, 3, I({ attackPressed: true }));
  let guard = 0;
  while (a2.hit && a2.hit.id === "meteor_breaker" && guard++ < 200) run(sim2, 1, I({}));
  check("no basic attack chains out of the ultimate", !a2.hit, a2.hit ? "chained into " + (a2.hit.id || "basic") : "ok");
  // real damage on a real character (armor applies)
  const sim3 = onStage(C.mage, 10);
  const [a3, d3] = sim3.fighters;
  a3.mana = 100;
  const h3 = d3.hp;
  run(sim3, 1, I({ ultPressed: true }));
  run(sim3, U.startup + U.active + 4, I({}));
  const pct = (h3 - d3.hp) / C.mage.maxHP;
  check("Meteor takes about half a Mage's HP (40-60%)", pct >= 0.4 && pct <= 0.62, (pct * 100).toFixed(0) + "%");
  check("...and does not blast a full-HP Mage out of the arena", d3.respawns === 0, "respawns " + d3.respawns);
}

console.log(failures ? "\n" + failures + " FAILED" : "\nAll fighter-kit checks passed.");
process.exit(failures ? 1 : 0);
