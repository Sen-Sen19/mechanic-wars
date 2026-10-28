// Stage 4 smoke test: shared projectile system (Mage bolt, Hitter shockwave). Run: node tools/smoke_stage4.js
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
const D = () => MW.Bots.dummy();

let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  (" + detail + ")" : ""));
  if (!ok) failures++;
}
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// Both fighters on the main stage, dummy `gap` px in front of the attacker's front edge (facing right),
// or behind them when dir = -1 (attacker faces left).
function duel(a, d, gap, dir = 1) {
  const sim = new MW.Sim(MW.ARENA, [a, d]);
  for (let i = 0; i < 120; i++) sim.step([I({}), D()]);
  const [fa, fd] = sim.fighters;
  const floor = 560;
  fa.y = floor - a.height; fd.y = floor - d.height; fa.vy = fd.vy = 0;
  if (dir > 0) { fa.x = 245; fa.facing = 1; fd.x = fa.x + a.width + gap; fd.facing = -1; }
  else { fd.x = 245; fd.facing = 1; fa.x = fd.x + d.width + gap; fa.facing = -1; }
  for (let i = 0; i < 5; i++) sim.step([I({}), D()]);
  return sim;
}
// fire once, run until the dummy is hit or `max` ticks pass; returns ticks taken (or -1)
function fire(sim, max = 200) {
  const fd = sim.fighters[1];
  sim.step([I({ attackPressed: true }), D()]);
  let t = 1;
  while (!fd.lastHit && t < max) { sim.step([I({}), D()]); t++; }
  return fd.lastHit ? t : -1;
}

// --- data sanity: bolt is the fast long-range one, shockwave the slow short one ---
const mp = C.mage.attack.projectile, hp = C.hitter.attack.projectile;
check("bullet is faster than the bolt, but the bolt is longer-ranged", hp.speed > mp.speed && mp.range > hp.range);
check("bullet is smaller than the bolt", hp.size < mp.size);

// --- each projectile character hits each dummy; numbers match the formulas ---
for (const aid of ["mage", "hitter"]) {
  for (const did of MW.CHARACTER_ORDER) {
    const a = C[aid], d = C[did];
    const sim = duel(a, d, 100);
    const fd = sim.fighters[1];
    const t = fire(sim);
    const expDmg = K.damageTaken(a.attack.damage, d.armor);
    const lost = 1 - (d.maxHP - expDmg) / d.maxHP;
    const expKB = K.knockback(a.attack.knockback, lost, d.weight);
    const ok = t > 0 && near(fd.hp, d.maxHP - expDmg) && near(fd.lastHit.knockback, expKB) &&
      near(fd.vx, expKB * CC.launchHorizontal) && fd.state === S.HITSTUN && fd.stateTimer === K.hitstun(expKB);
    check(aid + " -> " + did + ": projectile damage/knockback/hitstun match formulas", !!ok,
      t > 0 ? "hit after " + t + " ticks, dmg " + fd.lastHit.dmg.toFixed(2) + " kb " + fd.lastHit.knockback.toFixed(2) : "no hit");
  }
}

// --- range: bolt reaches far, shockwave does not ---
{
  const far = duel(C.mage, C.tank, 600);
  check("mage bolt hits at 600px", fire(far) > 0);
  const tooFar = duel(C.mage, C.tank, 760);
  check("mage bolt expires past its range (760px misses)", fire(tooFar, 150) < 0 && tooFar.projectiles.length === 0);
  const near1 = duel(C.hitter, C.tank, 100);
  check("hitter shockwave hits at 100px", fire(near1) > 0);
  const mid = duel(C.hitter, C.tank, 350);
  check("hitter shockwave hits at 350px (longer range)", fire(mid) > 0);
  const far2 = duel(C.hitter, C.tank, 520);
  check("hitter shockwave expires past its range (520px misses)", fire(far2, 200) < 0 && far2.projectiles.length === 0);
}

// --- speed: hitter fires fast, mage has a slow wind-up; mage bolt flies faster once launched ---
{
  const tm = fire(duel(C.mage, C.tank, 120));
  const th = fire(duel(C.hitter, C.tank, 120));
  check("hitter shockwave lands sooner than mage bolt at 120px (mage wind-up is slow)", tm > 0 && th > 0 && th < tm, "mage " + tm + "t, hitter " + th + "t");
  const tm2 = fire(duel(C.mage, C.tank, 600));
  const th2 = fire(duel(C.hitter, C.tank, 400));
  check("gunner bullet flies faster than the mage bolt after launch", (th2 - C.hitter.attack.startup) / 400 < (tm2 - C.mage.attack.startup) / 600);
}

// --- shared behaviour ---
{
  const sim = duel(C.mage, C.tank, 300);
  sim.step([I({ attackPressed: true }), D()]);
  let spawned = 0, maxLive = 0;
  for (let i = 0; i < 60; i++) { sim.step([I({}), D()]); maxLive = Math.max(maxLive, sim.projectiles.length); }
  check("one attack fires exactly one projectile", maxLive === 1);
  check("projectile is consumed on hit", sim.projectiles.length === 0 && sim.fighters[1].lastHit !== null);
}
{
  // attacker faces left, dummy is to its left
  const sim = duel(C.mage, C.assassin, 300, -1);
  const fd = sim.fighters[1];
  check("left-facing bolt hits and launches the target leftward", fire(sim) > 0 && fd.vx < 0, "vx=" + fd.vx.toFixed(2));
}
{
  const sim = duel(C.mage, C.tank, 300);
  sim.fighters[1].invuln = 200;
  check("invulnerable target is passed through, not hit", fire(sim, 80) < 0 && sim.fighters[1].hp === C.tank.maxHP);
}
{
  const sim = duel(C.mage, C.tank, 300);
  const fd = sim.fighters[1];
  sim.step([I({ attackPressed: true }), D()]);
  for (let i = 0; i < 26; i++) sim.step([I({}), D()]);
  const live = sim.projectiles.length;
  sim.reset();
  check("manual reset removes projectiles", live === 1 && sim.projectiles.length === 0);
  const sim2 = duel(C.mage, C.tank, 300);
  sim2.step([I({ attackPressed: true }), D()]);
  for (let i = 0; i < 26; i++) sim2.step([I({}), D()]);
  check("owner had a live projectile before the swap", sim2.projectiles.length === 1);
  sim2.setCharacter(0, C.fighter);
  check("swapping the owner's character removes their projectiles", sim2.projectiles.length === 0);
}
{
  // hit while winding up cancels the shot
  const sim = duel(C.mage, C.tank, 50); // mage: slow wind-up, easy to interrupt
  const [fa, fd] = sim.fighters;
  sim.step([I({ attackPressed: true }), D()]);
  for (let i = 0; i < 5; i++) sim.step([I({}), D()]);
  fa.takeHit(fd, C.tank.attack, -1); // knocked out of startup
  for (let i = 0; i < 40; i++) sim.step([I({}), D()]);
  check("being hit during startup cancels the projectile", fd.lastHit === null && sim.projectiles.length === 0);
}
{
  // KO by projectile: kill counted, round resets
  const sim = duel(C.mage, C.assassin, 200);
  const fd = sim.fighters[1]; fd.hp = 1;
  fire(sim);
  check("projectile KO counts a kill", fd.state === S.KO && sim.kills[0] === 1);
  for (let i = 0; i < CC.koFrames + 2; i++) sim.step([I({}), D()]);
  check("round resets after projectile KO", fd.hp === fd.stats.maxHP && sim.projectiles.length === 0);
}
{
  // can fire in the air
  const sim = new MW.Sim(MW.ARENA, [C.mage, C.tank]);
  for (let i = 0; i < 120; i++) sim.step([I({}), D()]);
  const f = sim.fighters[0];
  sim.step([I({ jumpPressed: true }), D()]);
  for (let i = 0; i < 4; i++) sim.step([I({}), D()]);
  sim.step([I({ attackPressed: true }), D()]);
  let seen = 0;
  for (let i = 0; i < 20; i++) { sim.step([I({}), D()]); seen = Math.max(seen, sim.projectiles.length); }
  check("projectile attack works in the air", seen === 1);
}

console.log(failures === 0 ? "\nAll Stage 4 checks passed." : "\n" + failures + " check(s) FAILED.");
process.exit(failures === 0 ? 0 : 1);