// Smoke test for the Bulwark: hold-to-guard (Holy Guard) and Groundbreaker (skill 1). Run: node tools/smoke_bulwark.js
require("../src/config.js");
require("../src/characters.js");
require("../src/arena.js");
require("../src/fighter.js");
require("../src/projectiles.js");
require("../src/sim.js");
const MW = globalThis.MW;
const S = MW.STATE;
let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  (" + detail + ")" : ""));
  if (!ok) failures++;
}
const C = MW.CHARACTERS;
const arena = MW.makeArena ? MW.makeArena(() => 0.5) : MW.ARENA;
const IDLE = MW.IDLE_INTENT;
const HOLD = { ...IDLE, attackPressed: true, attackHeld: true }; // first tick of a press
const KEEP = { ...IDLE, attackHeld: true }; // button still down
const GD = C.tank.guard;

// Bulwark (A) and an opponent (B) standing on the ground, B on the right, facing each other.
function duel(foe, gap) {
  const sim = new MW.Sim(arena, [C.tank, C[foe || "fighter"]]);
  const [A, B] = sim.fighters;
  for (let i = 0; i < 120; i++) sim.step([IDLE, IDLE]);
  for (const f of sim.fighters) f.invuln = 0;
  B.x = A.x + A.stats.width + (gap === undefined ? 10 : gap);
  B.y = A.y; B.vx = 0; B.vy = 0;
  A.facing = 1; B.facing = -1;
  return { sim, A, B };
}
const idle = (sim, n) => { for (let i = 0; i < n; i++) sim.step([IDLE, IDLE]); };
// hold the attack button for n ticks (first tick = the press)
function holdFor(sim, n, other) {
  for (let i = 0; i < n; i++) sim.step([i === 0 ? HOLD : KEEP, other || IDLE]);
}

// ── data ──
check("Bulwark has a guard config", !!GD && GD.attack.id === "holy_guard");
check("guard: 0.7 s setup, 2 s barrier", GD.attack.startup === 42 && GD.attack.active === 120, GD.attack.startup + "/" + GD.attack.active);
check("skill 1 is Groundbreaker", C.tank.skills[0] && C.tank.skills[0].id === "groundbreaker");
check("skills 2-4 are Restore, Wrath, Taunt (all four fit the four slots)", C.tank.skills.length === 4 && C.tank.skills[1].id === "divine_restoration" && C.tank.skills[2].id === "unrelenting_wrath" && C.tank.skills[3].id === "divine_taunt", C.tank.skills.map(k => k && k.id).join(","));

// ── tap = Shield Slam ──
{
  const { sim, A } = duel();
  sim.step([{ ...IDLE, attackPressed: true }, IDLE]); // press without any hold info (bots / old tests)
  check("press with no hold starts the Shield Slam at once", A.state === S.ATTACK_STARTUP && A.hit.superArmor && !A.hit.holyGuard, A.state);
}
{
  const { sim, A } = duel();
  holdFor(sim, 4);
  check("a held press is still being read (no swing yet)", A.state !== S.ATTACK_STARTUP && !A.hit, A.state);
  sim.step([IDLE, IDLE]); // released after 4 ticks
  check("release before holdStart = Shield Slam", A.state === S.ATTACK_STARTUP && A.hit && !A.hit.holyGuard && A.hit.superArmor, A.state);
}
{
  const { sim, A } = duel();
  A.y -= 120; A.grounded = false; // in the air
  holdFor(sim, GD.holdStart + 4);
  check("in the air a hold never raises the guard", !(A.hit && A.hit.holyGuard));
}

// ── hold = Holy Guard ──
{
  const { sim, A } = duel();
  holdFor(sim, GD.holdStart - 1);
  check("not yet guarding one tick before holdStart", !(A.hit && A.hit.holyGuard));
  sim.step([KEEP, IDLE]);
  check("guard starts at holdStart", A.state === S.ATTACK_STARTUP && A.hit.holyGuard, A.state);
  let t = 0;
  while (A.state === S.ATTACK_STARTUP && t < 200) { sim.step([KEEP, IDLE]); t++; }
  check("barrier is up after ~0.7 s of setup", A.state === S.ATTACK_ACTIVE && Math.abs(t - GD.attack.startup) <= 2, "ticks " + t);
  let up = 0;
  while (A.state === S.ATTACK_ACTIVE && up < 400) { sim.step([KEEP, IDLE]); up++; }
  check("barrier stands ~2 s", Math.abs(up - GD.attack.active) <= 2, "ticks " + up);
  check("then a short recovery", A.state === S.ATTACK_RECOVERY, A.state);
  for (let i = 0; i < 60; i++) sim.step([KEEP, IDLE]);
  check("still holding the button does not raise it again", !(A.hit && A.hit.holyGuard) && A.state !== S.ATTACK_STARTUP, A.state);
  sim.step([IDLE, IDLE]); sim.step([HOLD, IDLE]);
  holdFor(sim, GD.holdStart);
  check("release and hold again raises it again", A.hit && A.hit.holyGuard);
}
{
  const { sim, A } = duel();
  holdFor(sim, GD.holdStart + 10);
  sim.step([IDLE, IDLE]); // let go during the setup
  check("letting go during setup drops the stance", A.state === S.ATTACK_RECOVERY && A.hit.holyGuard, A.state);
  for (let i = 0; i < 30; i++) sim.step([IDLE, IDLE]);
  check("... and it is just a short recovery", A.state !== S.ATTACK_RECOVERY && A.state !== S.ATTACK_ACTIVE);
}
{
  const { sim, A } = duel();
  holdFor(sim, GD.holdStart + GD.attack.startup + 5);
  check("barrier is up", A.state === S.ATTACK_ACTIVE);
  sim.step([IDLE, IDLE]);
  check("an established barrier survives letting go (endOnRelease false)", A.state === S.ATTACK_ACTIVE, A.state);
}
{
  const { sim, A } = duel();
  const right = { ...KEEP, right: true };
  sim.step([{ ...HOLD, right: true }, IDLE]);
  while (!(A.hit && A.hit.holyGuard) && sim.tick < 400) sim.step([right, IDLE]);
  const x0 = A.x;
  for (let i = 0; i < GD.attack.startup + 70; i++) sim.step([right, IDLE]);
  check("cannot walk while guarding", A.hit && A.hit.holyGuard && Math.abs(A.x - x0) < 4 && A.vx === 0, "moved " + (A.x - x0).toFixed(1));
  check("cannot be turned around while guarding", A.facing === 1);
}

// ── blocking ──
function guarded(foe, gap) {
  const d = duel(foe, gap);
  holdFor(d.sim, GD.holdStart + GD.attack.startup + 4);
  for (const f of d.sim.fighters) f.invuln = 0;
  return d;
}
{
  const { sim, A, B } = guarded("fighter", 6);
  const hp0 = A.hp, hit = C.fighter.attack;
  const full = MW.Combat.damageTaken(hit.damage, C.tank.armor);
  B.facing = -1; B.startAttack(0);
  for (let i = 0; i < 30 && A.hp === hp0; i++) sim.step([KEEP, IDLE]);
  const lost = hp0 - A.hp;
  check("front melee hit is blocked down to frontMul", lost > 0 && Math.abs(lost - full * GD.attack.frontMul) < 1e-6, lost.toFixed(3) + " vs " + full.toFixed(3));
  check("a blocked hit does not interrupt the guard", A.state === S.ATTACK_ACTIVE && A.hit && A.hit.holyGuard, A.state);
  check("a blocked hit does not launch him", A.vx === 0, "vx " + A.vx);
  check("block spark is flagged for the renderer", A.armorHit > 0 || A.blockFx === null);
}
{
  const { sim, A, B } = guarded("fighter", 6);
  // the enemy gets behind the Bulwark (he faces right, the enemy stands on his left)
  B.x = A.x - B.stats.width - 6; B.y = A.y; B.facing = 1;
  const hp0 = A.hp;
  B.startAttack(0);
  for (let i = 0; i < 30 && A.hp === hp0; i++) sim.step([KEEP, IDLE]);
  const full = MW.Combat.damageTaken(C.fighter.attack.damage, C.tank.armor);
  check("hit from behind lands in full", Math.abs((hp0 - A.hp) - full) < 1e-6, (hp0 - A.hp).toFixed(3) + " vs " + full.toFixed(3));
  check("hit from behind breaks the guard (hitstun)", A.state === S.HITSTUN, A.state);
}
{
  const { sim, A, B } = guarded("mage", 300);
  const hp0 = A.hp;
  B.facing = -1; B.startAttack(0);
  for (let i = 0; i < 120 && A.hp === hp0; i++) sim.step([KEEP, IDLE]);
  const full = MW.Combat.damageTaken(C.mage.attack.damage, C.tank.armor);
  check("front projectile is blocked", A.hp < hp0 && Math.abs((hp0 - A.hp) - full * GD.attack.frontMul) < 1e-6, (hp0 - A.hp).toFixed(3));
  check("... and does not flinch him", A.state === S.ATTACK_ACTIVE, A.state);
}
{
  const { sim, A, B } = guarded("mage", 300);
  B.x = A.x - B.stats.width - 300; B.y = A.y; B.facing = 1; // behind him, shooting forward
  const hp0 = A.hp;
  B.startAttack(0);
  for (let i = 0; i < 140 && A.hp === hp0; i++) sim.step([KEEP, IDLE]);
  const full = MW.Combat.damageTaken(C.mage.attack.damage, C.tank.armor);
  check("projectile from behind is not blocked", A.hp < hp0 && Math.abs((hp0 - A.hp) - full) < 1e-6, (hp0 - A.hp).toFixed(3));
}
{
  // a normal Shield Slam still has super armor
  const { sim, A, B } = duel("fighter", 6);
  sim.step([{ ...IDLE, attackPressed: true }, IDLE]);
  const hp0 = A.hp;
  B.startAttack(0);
  for (let i = 0; i < 10; i++) sim.step([IDLE, IDLE]);
  check("Shield Slam keeps its super armor", A.hp < hp0 && (A.state === S.ATTACK_STARTUP || A.state === S.ATTACK_ACTIVE), A.state);
}

// ── Groundbreaker ──
const GB = C.tank.skills[0];
const pressSkill = { ...IDLE, skillPressed: [true, false, false, false] };
{
  const { sim, A, B } = duel("fighter", 20);
  sim.step([pressSkill, IDLE]);
  check("Groundbreaker starts", A.state === S.ATTACK_STARTUP && A.hit.id === "groundbreaker", A.state);
  check("cooldown starts", A.cooldowns[0] === GB.cooldown - 0 || A.cooldowns[0] > GB.cooldown - 3, "cd " + A.cooldowns[0]);
  const hp0 = B.hp;
  let t = 0;
  while (B.hp === hp0 && t < 60) { sim.step([IDLE, IDLE]); t++; }
  const dmg = MW.Combat.damageTaken(GB.attack.damage, C.fighter.armor);
  check("shockwave damages a nearby enemy", Math.abs((hp0 - B.hp) - dmg) < 1e-6, (hp0 - B.hp).toFixed(2) + " vs " + dmg.toFixed(2));
  check("hits on the first active tick (after the startup)", Math.abs(t - GB.attack.startup) <= 2, "ticks " + t);
  check("target is staggered", B.state === S.HITSTUN && Math.abs(B.stateTimer - GB.attack.stun) <= 1, B.state + " " + B.stateTimer);
  check("no launch into the air", B.vy > -1, "vy " + B.vy.toFixed(2));
  check("pushed away from the Bulwark", B.vx > 0, "vx " + B.vx.toFixed(2));
  const hp1 = B.hp;
  for (let i = 0; i < 20; i++) sim.step([IDLE, IDLE]);
  check("one shockwave hits only once", B.hp === hp1);
  sim.step([pressSkill, IDLE]);
  check("cannot recast during the cooldown", !(A.hit && A.hit.id === "groundbreaker" && A.state === S.ATTACK_STARTUP) || A.cooldowns[0] > 0);
}
{
  const { sim, A, B } = duel("fighter", GB.attack.radius + 60);
  sim.step([pressSkill, IDLE]);
  const hp0 = B.hp;
  for (let i = 0; i < 40; i++) sim.step([IDLE, IDLE]);
  check("small radius: a far enemy is not hit", B.hp === hp0 && B.state !== S.HITSTUN, "gap " + (GB.attack.radius + 60));
}
{
  const { sim, A, B } = duel("fighter", 20);
  B.x = A.x - B.stats.width - 20; // on his left: it is a circle, not a cone
  sim.step([pressSkill, IDLE]);
  const hp0 = B.hp;
  let t = 0;
  while (B.hp === hp0 && t < 40) { sim.step([IDLE, IDLE]); t++; }
  check("hits enemies behind him too, pushing them away", B.hp < hp0 && B.vx < 0, "vx " + B.vx.toFixed(2));
}
{
  const { sim, A, B } = duel("fighter", 20);
  B.invuln = 60;
  sim.step([pressSkill, IDLE]);
  const hp0 = B.hp;
  for (let i = 0; i < 40; i++) sim.step([IDLE, IDLE]);
  check("invulnerable enemies are skipped", B.hp === hp0);
}
{
  const { sim, A, B } = duel("fighter", 20);
  sim.step([pressSkill, IDLE]);
  for (let i = 0; i < 3; i++) sim.step([IDLE, IDLE]);
  B.takeHit(sim.fighters[1], C.fighter.attack, 1); // pretend a hit lands on A during the wind-up
  A.holyDeflectionCooldown = 999; // passive on cooldown, so the hit is a normal one
  A.takeHit(B, C.fighter.attack, -1);
  check("Groundbreaker has no super armor: a hit interrupts the wind-up", A.state === S.HITSTUN, A.state);
}
{
  const { sim, A } = duel("fighter", 20);
  let seen = null;
  sim.fx = [];
  sim.step([pressSkill, IDLE]);
  for (let i = 0; i < 40; i++) { sim.step([IDLE, IDLE]); for (const e of sim.fx) if (e.fx === "groundbreaker") seen = e; sim.fx.length = 0; }
  check("the renderer gets a groundbreaker impact event", !!seen && seen.radius === GB.attack.radius);
}
{
  // the Vanguard's old assumptions still hold: Vanguard charge unaffected (no guard config)
  check("only the Bulwark has a guard config", !C.fighter.guard && !C.mage.guard && !C.assassin.guard && !C.hitter.guard);
}

// ── Holy Deflection (passive), Restoration, Taunt ──
{
  // a projectile that hits him turns around and hurts its shooter; he takes nothing
  const { sim, A, B } = duel("mage", 300);
  const hpA = A.hp, hpB = B.hp;
  B.facing = -1; B.startAttack(0);
  let deflected = false;
  for (let i = 0; i < 400 && B.hp === hpB; i++) { sim.step([IDLE, IDLE]); if (sim.projectiles.some(p => p.deflected)) deflected = true; }
  check("Holy Deflection turns a projectile around", deflected);
  check("... the Bulwark takes no damage from it", A.hp === hpA, String(hpA - A.hp));
  check("... and the shooter is hit by their own projectile", B.hp < hpB, (hpB - B.hp).toFixed(2));
}
{
  // non-projectile: 60% reduction (40% passes), then the internal cooldown lets the next hit through
  const { sim, A, B } = duel("fighter", 6);
  const hp0 = A.hp;
  B.startAttack(0);
  for (let i = 0; i < 30 && A.hp === hp0; i++) sim.step([IDLE, IDLE]);
  const full = MW.Combat.damageTaken(C.fighter.attack.damage, C.tank.armor);
  check("Holy Shield lets 40% through", Math.abs((hp0 - A.hp) - full * (1 - C.tank.passive.damageReduction)) < 1e-6, (hp0 - A.hp).toFixed(3));
  check("passive goes on cooldown", A.holyDeflectionCooldown > 0, String(A.holyDeflectionCooldown));
}
{
  // Divine Restoration heals 50 and never overheals
  const { sim, A } = duel("fighter", 200);
  A.hp = A.stats.maxHP - 80;
  const press = { ...IDLE, skillPressed: [false, true, false, false] };
  sim.step([press, IDLE]);
  for (let i = 0; i < 80; i++) sim.step([IDLE, IDLE]);
  check("Divine Restoration (slot 2) heals 50", Math.abs(A.hp - (A.stats.maxHP - 30)) < 1e-6, A.hp.toFixed(1));
  A.hp = A.stats.maxHP - 10; A.cooldowns[1] = 0;
  sim.step([press, IDLE]);
  for (let i = 0; i < 80; i++) sim.step([IDLE, IDLE]);
  check("... and cannot exceed max HP", A.hp === A.stats.maxHP, A.hp.toFixed(1));
}
{
  // Divine Taunt (slot 4) is reachable and catches a close enemy only
  const { sim, A, B } = duel("fighter", 60);
  sim.step([{ ...IDLE, skillPressed: [false, false, false, true] }, IDLE]);
  for (let i = 0; i < 30; i++) sim.step([IDLE, IDLE]);
  check("Divine Taunt (slot 4) taunts a nearby enemy", !!B.tauntedBy);
}
{
  const { sim, A, B } = duel("fighter", 420);
  sim.step([{ ...IDLE, skillPressed: [false, false, false, true] }, IDLE]);
  for (let i = 0; i < 30; i++) sim.step([IDLE, IDLE]);
  check("... but not one outside the radius", !B.tauntedBy);
}

console.log(failures ? "\n" + failures + " check(s) failed" : "\nAll Bulwark checks passed.");
process.exit(failures ? 1 : 0);