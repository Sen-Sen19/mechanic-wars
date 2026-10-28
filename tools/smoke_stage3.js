// Stage 3 smoke test: melee combat + training dummy. Run: node tools/smoke_stage3.js
require("../src/config.js");
require("../src/characters.js");
require("../src/arena.js");
require("../src/fighter.js");
require("../src/projectiles.js");
require("../src/sim.js");
require("../src/bots.js");
const MW = globalThis.MW;
const C = MW.CHARACTERS, S = MW.STATE, K = MW.Combat, CC = MW.CONFIG.combat;
const I = (o) => Object.assign({}, MW.IDLE_INTENT, o);

let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  (" + detail + ")" : ""));
  if (!ok) failures++;
}
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// attacker (slot 0) and dummy (slot 1) settled on the top platform, dummy just in front.
function duel(a, d, gap = 10) {
  const sim = new MW.Sim(MW.ARENA, [a, d]);
  for (let i = 0; i < 120; i++) sim.step([I({}), MW.Bots.dummy()]);
  const [fa, fd] = sim.fighters;
  fa.x = 535; fa.facing = 1;
  fd.x = fa.x + a.width + gap; fd.facing = -1;
  for (let i = 0; i < 5; i++) sim.step([I({}), MW.Bots.dummy()]);
  return sim;
}

// --- formulas ---
check("damage formula: base x 100 / (100 + armor)", near(K.damageTaken(8, 20), 8 * 100 / 120));
check("armor never reaches immunity", K.damageTaken(1, 1000) > 0);
check("knockback: weight reduces it", K.knockback(6, 0, 150) < K.knockback(6, 0, 100) && K.knockback(6, 0, 80) > K.knockback(6, 0, 100));
check("knockback: grows with fraction of max HP lost", K.knockback(6, 0.5, 100) > K.knockback(6, 0, 100) && near(K.knockback(6, 1, 100), 6 * (1 + CC.knockbackScaling)));
check("hitstun scales with knockback and is capped", K.hitstun(10) > K.hitstun(3) && K.hitstun(1e6) === CC.hitstunMax);

// --- each melee character hits each dummy; numbers match the formulas ---
for (const aid of ["fighter", "assassin", "tank"]) {
  for (const did of MW.CHARACTER_ORDER) {
    const a = C[aid], d = C[did];
    const sim = duel(a, d);
    const [fa, fd] = sim.fighters;
    let t = 0;
    sim.step([I({ attackPressed: true }), MW.Bots.dummy()]);
    while (!fd.lastHit && t++ < 60) sim.step([I({}), MW.Bots.dummy()]);
    const hit = a.attack;
    const expDmg = K.damageTaken(hit.damage, d.armor);
    const lost = 1 - (d.maxHP - expDmg) / d.maxHP;
    const expKB = K.knockback(hit.knockback, lost, d.weight);
    const ok = fd.lastHit && near(fd.hp, d.maxHP - expDmg) && near(fd.lastHit.dmg, expDmg) &&
      near(fd.lastHit.knockback, expKB) && near(fd.vx, expKB * CC.launchHorizontal) && fd.vy < 0 &&
      fd.state === S.HITSTUN && fd.stateTimer === K.hitstun(expKB) && fd.flash === CC.hitFlashFrames;
    check(aid + " -> " + did + ": damage/knockback/hitstun match formulas", !!ok,
      fd.lastHit ? "dmg " + fd.lastHit.dmg.toFixed(2) + " kb " + fd.lastHit.knockback.toFixed(2) + " stun " + fd.lastHit.stun : "no hit");
  }
}

// --- weight: same hit launches a light target further than a heavy one ---
{
  const kbOn = (did) => { const sim = duel(C.fighter, C[did]); const fd = sim.fighters[1];
    sim.step([I({ attackPressed: true }), MW.Bots.dummy()]); let t = 0;
    while (!fd.lastHit && t++ < 60) sim.step([I({}), MW.Bots.dummy()]); return fd.lastHit.knockback; };
  check("light target (assassin) launched further than heavy (tank)", kbOn("assassin") > kbOn("tank"));
}

// --- hitstun lockout, then recovery ---
{
  const sim = duel(C.fighter, C.assassin);
  const fd = sim.fighters[1];
  sim.step([I({ attackPressed: true }), MW.Bots.dummy()]);
  let t = 0; while (!fd.lastHit && t++ < 60) sim.step([I({}), MW.Bots.dummy()]);
  const stun = fd.lastHit.stun;
  let locked = true, jumped = false;
  for (let i = 0; i < stun - 2; i++) {
    sim.step([I({}), I({ jumpPressed: true, right: true })]);
    if (fd.state !== S.HITSTUN) locked = false;
    if (fd.vy < -8) jumped = true;
  }
  check("hitstun ignores input", locked && !jumped);
  for (let i = 0; i < 6; i++) sim.step([I({}), MW.Bots.dummy()]);
  check("hitstun ends and fighter returns to locomotion", fd.state !== S.HITSTUN && fd.state !== S.KO, "state=" + fd.state);
}

// --- attack frame data: startup -> active -> recovery lengths ---
for (const id of ["fighter", "assassin", "tank", "mage", "hitter"]) {
  const c = C[id], a = c.attack;
  const sim = new MW.Sim(MW.ARENA, [c, C.tank]);
  for (let i = 0; i < 120; i++) sim.step([I({}), MW.Bots.dummy()]);
  const f = sim.fighters[0];
  sim.step([I({ attackPressed: true }), MW.Bots.dummy()]);
  const seen = [];
  for (let i = 0; i < 200 && f.state !== S.IDLE && f.state !== S.RUN; i++) {
    seen.push(f.state); sim.step([I({}), MW.Bots.dummy()]);
  }
  const n = (st) => seen.filter((x) => x === st).length;
  const total = a.startup + (a.active || 1) + a.recovery;
  check(id + ": attack runs startup/active/recovery from its data and returns to idle",
    n(S.ATTACK_STARTUP) === a.startup && n(S.ATTACK_ACTIVE) === (a.active || 1) && n(S.ATTACK_RECOVERY) === a.recovery,
    "S/A/R = " + n(S.ATTACK_STARTUP) + "/" + n(S.ATTACK_ACTIVE) + "/" + n(S.ATTACK_RECOVERY) + " total " + total);
}

// --- attack usable in the air ---
{
  const sim = new MW.Sim(MW.ARENA, [C.assassin, C.tank]);
  for (let i = 0; i < 120; i++) sim.step([I({}), MW.Bots.dummy()]);
  const f = sim.fighters[0];
  sim.step([I({ jumpPressed: true }), MW.Bots.dummy()]);
  sim.step([I({}), MW.Bots.dummy()]);
  sim.step([I({ attackPressed: true }), MW.Bots.dummy()]);
  check("attack can start in the air", !f.grounded && f.state === S.ATTACK_STARTUP);
}

// --- Fighter 3-hit chain connects on a Tank dummy ---
{
  const sim = duel(C.fighter, C.tank, 10);
  const [fa, fd] = sim.fighters;
  const combos = [];
  for (let i = 0; i < 140; i++) {
    const before = fd.lastHit;
    sim.step([I({ attackPressed: true }), MW.Bots.dummy()]);
    if (fd.lastHit !== before) combos.push(fd.lastHit.combo);
  }
  check("fighter chain lands hit 1, 2 and 3 in order", combos.slice(0, 3).join() === "1,2,3", "combos=" + combos.join());
  check("chain finisher hits harder than light hits", C.fighter.attack.chain[2].damage > C.fighter.attack.damage && C.fighter.attack.chain[2].knockback > C.fighter.attack.knockback);
}

// --- one swing hits a target only once ---
{
  const sim = duel(C.tank, C.tank, 5);
  const fd = sim.fighters[1];
  let hits = 0, prev = null;
  sim.step([I({ attackPressed: true }), MW.Bots.dummy()]);
  for (let i = 0; i < 60; i++) { sim.step([I({}), MW.Bots.dummy()]); if (fd.lastHit !== prev) { hits++; prev = fd.lastHit; } }
  check("one swing hits once (tank, 5-tick active window)", hits === 1, "hits=" + hits);
}

// --- out of range whiffs ---
{
  const sim = duel(C.assassin, C.tank, 200);
  const fd = sim.fighters[1];
  sim.step([I({ attackPressed: true }), MW.Bots.dummy()]);
  for (let i = 0; i < 30; i++) sim.step([I({}), MW.Bots.dummy()]);
  check("attack out of range misses", fd.lastHit === null && fd.hp === C.tank.maxHP);
}

// --- KO: HP zero is the only KO; round resets, kill counter increments ---
{
  const sim = duel(C.fighter, C.assassin);
  const [fa, fd] = sim.fighters;
  fd.hp = 1;
  sim.step([I({ attackPressed: true }), MW.Bots.dummy()]);
  let t = 0; while (fd.state !== S.KO && t++ < 60) sim.step([I({}), MW.Bots.dummy()]);
  check("hp reaches zero -> KO, kill counted", fd.hp === 0 && fd.state === S.KO && sim.kills[0] === 1 && sim.koTimer > 0);
  for (let i = 0; i < CC.koFrames + 2; i++) sim.step([I({}), MW.Bots.dummy()]);
  check("both fighters reset at full HP after KO", fa.hp === fa.stats.maxHP && fd.hp === fd.stats.maxHP && fd.state !== S.KO && sim.koTimer === 0 && sim.kills[0] === 1);
  sim.reset();
  check("manual reset clears kill counter", sim.kills[0] === 0 && sim.kills[1] === 0);
}

// --- invulnerable fighters cannot be hit ---
{
  const sim = duel(C.fighter, C.tank);
  const fd = sim.fighters[1]; fd.invuln = 30;
  sim.step([I({ attackPressed: true }), MW.Bots.dummy()]);
  for (let i = 0; i < 20; i++) sim.step([I({}), MW.Bots.dummy()]);
  check("invulnerable target is not hit", fd.lastHit === null);
}

console.log(failures === 0 ? "\nAll Stage 3 checks passed." : "\n" + failures + " check(s) FAILED.");
process.exit(failures === 0 ? 0 : 1);
