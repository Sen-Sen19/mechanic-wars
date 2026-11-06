// Errata passive (Error Accumulation) test: stacks, consumption, all ten corruption effects. Run: node tools/smoke_errata_passive.js
require("../src/config.js");
require("../src/characters.js");
require("../src/arena.js");
require("../src/fighter.js");
require("../src/projectiles.js");
require("../src/sim.js");
const MW = globalThis.MW, C = MW.CHARACTERS, I = MW.IDLE_INTENT;
const intent = (x) => Object.assign({}, I, x);
let failures = 0;
function check(name, ok, extra) { console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  (" + extra + ")" : "")); if (!ok) failures++; }

// The passive effects are tested on a plain MELEE test skill (Rift Slash numbers). Code Breaker, the real skill 1, is tested at the bottom.
const RIFT = { id: "rift_slash", name: "Rift", icon: "RFT", cooldown: 150, attack: { id: "rift_slash", type: "melee", isSkill: true, fxShape: "hook", damage: 14, startup: 12, active: 4, recovery: 20, knockback: 3.5, launchH: 0.7, launchV: 0.25, stun: 22, range: 70, advance: 2.5, manaGain: 12 } };
const CB = C.errata; // the real Errata (Code Breaker in slot 1)
const F = Object.assign({}, C.errata, { skills: [RIFT, null, null, null] }), P = F.passive;
const IDS = Object.keys(P.effects);
check("passive config: 5 max stacks and the 10 listed effects", P.type === "errata" && P.max === 5 && IDS.length === 10 &&
  ["damage_overflow", "double_execution", "position_corruption", "time_desync", "reverse_logic", "phantom_input", "critical_fault", "gravity_error", "null_frame", "chain_exception"].every((k) => P.effects[k]));

// a stats copy where ONLY `only` can be picked (weight 0 for the rest)
function forced(only) {
  const eff = {};
  for (const k of IDS) eff[k] = Object.assign({}, P.effects[k], { weight: k === only ? 1 : 0 });
  return Object.assign({}, F, { passive: Object.assign({}, P, { effects: eff }) });
}
function setup(stats) {
  const sim = new MW.Sim(MW.ARENA, [stats, C.fighter]);
  sim.fx = [];
  for (let i = 0; i < 120; i++) sim.step([I, I]);
  sim.fx.length = 0;
  const [a, b] = sim.fighters;
  a.invuln = b.invuln = 0;
  a.x = 500; b.x = 500 + F.width + 6; a.facing = 1; b.facing = -1;
  a.cooldowns = [0, 0, 0, 0];
  return { sim, a, b };
}
const SKILL = intent({ skillPressed: [true, false, false, false] });
// press the skill on tick 0, then run `ticks` ticks; returns every fx event + per-tick hp drops of b
function cast(env, ticks, onTick) {
  const { sim, a, b } = env, events = [], drops = [];
  for (let i = 0; i < ticks; i++) {
    const hp0 = b.hp;
    sim.step([i === 0 ? SKILL : I, I]);
    b.invuln = 0;
    for (const e of sim.fx) events.push(e);
    sim.fx.length = 0;
    if (b.hp < hp0) drops.push({ t: i, dmg: hp0 - b.hp });
    if (onTick) onTick(i);
  }
  return { events, drops };
}
const kinds = (ev, kind) => ev.filter((e) => e.type === "errata" && e.kind === kind);

// ── stacks
{
  const env = setup(F), { sim, a, b } = env;
  const seen = [];
  for (let i = 0; i < 150; i++) {
    sim.step([intent({ attackPressed: true }), I]);
    b.invuln = 0; b.hp = b.stats.maxHP;
    seen.push(a.errors);
  }
  check("each landed hit adds one Error stack", seen.includes(1) && seen.includes(2));
  check("stacks cap at 5", Math.max(...seen) === 5 && a.errors === 5, "max " + Math.max(...seen));
}
{
  const { a } = setup(F);
  check("5 stacks = errataFull(); 4 stacks = not", (a.errors = 5, a.errataFull()) && (a.errors = 4, !a.errataFull()));
}

// ── 4 stacks: the skill is NOT corrupted; basic attacks are never corrupted
{
  const env = setup(F); env.a.errors = 4;
  cast(env, 3);
  check("4 stacks: skill is a normal skill", env.a.hit && env.a.hit.id === "rift_slash" && !env.a.hit.corrupted && env.a.errors === 4);
}
{
  const env = setup(F); env.a.errors = 5;
  env.sim.step([intent({ attackPressed: true }), I]);
  check("5 stacks: a basic attack is not corrupted and keeps the stacks", env.a.hit && !env.a.hit.corrupted && env.a.errors === 5);
}

// ── 5 stacks: corrupted skill, stacks consumed, no stack from the corrupted hit itself
{
  const env = setup(forced("damage_overflow")); env.a.errors = 5;
  const r = cast(env, 70);
  check("5 stacks: the next skill is corrupted, stacks consumed", r.events.some((e) => e.type === "errata" && e.kind === "proc" && e.effect === "damage_overflow") && env.a.errors === 0, "errors " + env.a.errors);
}

// baseline damage of an uncorrupted Rift Slash
let base = 0;
{
  const env = setup(F); env.a.errors = 0;
  const r = cast(env, 70); base = r.drops.length ? r.drops[0].dmg : 0;
  check("baseline skill lands", base > 0, "dmg " + base.toFixed(2));
}

// ── the ten effects
{ // 1 Damage Overflow
  const env = setup(forced("damage_overflow")); env.a.errors = 5;
  const d = cast(env, 70).drops[0];
  check("Damage Overflow: bonus damage", d && d.dmg > base * 1.4, d ? d.dmg.toFixed(2) + " vs " + base.toFixed(2) : "no hit");
}
{ // 7 Critical Fault
  const env = setup(forced("critical_fault")); env.a.errors = 5;
  const d = cast(env, 70).drops[0];
  check("Critical Fault: enhanced critical hit", d && d.dmg > base * 1.6, d ? d.dmg.toFixed(2) + " vs " + base.toFixed(2) : "no hit");
}
{ // 2 Double Execution
  const env = setup(forced("double_execution")); env.a.errors = 5;
  let echoed = false, echoDmg = 0;
  cast(env, 140, () => { if (env.a.hit && env.a.hit.corrupted === "echo") { echoed = true; echoDmg = env.a.hit.damage; } });
  check("Double Execution: the skill repeats later at reduced damage", echoed && echoDmg < F.skills[0].attack.damage, "echo dmg " + echoDmg);
}
{ // 3 Position Corruption
  const env = setup(forced("position_corruption")); env.a.errors = 5;
  const r = cast(env, 80);
  const tp = kinds(r.events, "teleport")[0];
  const near = Math.abs((env.a.x + F.width / 2) - (env.b.x + env.b.stats.width / 2)) < 140;
  check("Position Corruption: teleports to the enemy after the cast, facing him", !!tp && near && ((env.b.x + env.b.stats.width / 2 >= env.a.x + F.width / 2) === (env.a.facing > 0)), tp ? "x " + Math.round(tp.x) + " -> " + Math.round(tp.x2) : "no teleport");
}
{ // 3b Position Corruption: stands BEHIND the enemy (the side he is not facing)
  const env = setup(forced("position_corruption")); const { a, b } = env;
  b.facing = 1; b.x = 600; a.x = 600 + b.stats.width + 30; a.facing = -1; // enemy faces right, Errata is in front of him on the right? no: he is behind-right, so teleport must go LEFT of the enemy
  a.teleportBehind(P.effects.position_corruption);
  check("Position Corruption: lands on the side the enemy is NOT facing", a.x + F.width <= b.x + 1, "a.x " + Math.round(a.x) + " b.x " + Math.round(b.x));
}
{ // 4 Time Desync
  const env = setup(forced("time_desync")); env.a.errors = 5;
  let slow = null;
  cast(env, 70, () => { if (env.b.slow && !slow) slow = Object.assign({}, env.b.slow); });
  check("Time Desync: enemy is slowed", slow && slow.mul === P.effects.time_desync.speedMul && slow.left > 0);
}
{ // 5 Reverse Logic (and the swap itself)
  const env = setup(forced("reverse_logic")); env.a.errors = 5;
  let rev = false;
  cast(env, 70, () => { if (env.b.reversed) rev = true; });
  check("Reverse Logic: enemy controls get reversed", rev);
  const t = setup(F); t.b.reversed = { left: 60 };
  for (let i = 0; i < 40; i++) t.sim.step([I, intent({ right: true })]);
  check("Reverse Logic: holding RIGHT moves the enemy LEFT", t.b.x < 500 + F.width + 6 - 5, "x " + Math.round(t.b.x));
  t.b.reversed = null; const x1 = t.b.x;
  for (let i = 0; i < 30; i++) t.sim.step([I, intent({ right: true })]);
  check("Reverse Logic: normal controls come back", t.b.x > x1 + 5);
}
{ // 6 Phantom Input
  const env = setup(forced("phantom_input")); env.a.errors = 5;
  const r = cast(env, 60);
  check("Phantom Input: a ghost is left behind and repeats the skill", kinds(r.events, "phantom").length === 1);
  const t = setup(F); const hp0 = t.b.hp;
  t.a.phantomStrike({ x: t.a.x, y: t.a.y, facing: 1, hit: Object.assign({}, F.skills[0].attack, { damage: 10, noError: true }) });
  check("Phantom Input: the ghost's strike damages an enemy in its reach", t.b.hp < hp0);
  const t2 = setup(F); const hp2 = t2.b.hp; t2.b.x = 900;
  t2.a.phantomStrike({ x: t2.a.x, y: t2.a.y, facing: 1, hit: Object.assign({}, F.skills[0].attack, { damage: 10 }) });
  check("Phantom Input: the ghost misses an enemy that is out of reach", t2.b.hp === hp2);
}
{ // 8 Gravity Error
  const modes = new Set();
  for (let n = 0; n < 12; n++) {
    const env = setup(forced("gravity_error")); env.a.errors = 5;
    env.sim.rng = (() => { let k = n; return () => ((k = (k * 37 + 11) % 97) / 97); })();
    let m = null, vy = 0, vx = 0;
    cast(env, 70, () => { if (env.a.hit && env.a.hit.gravityMode && !m) { m = env.a.hit.gravityMode; vy = env.b.vy; vx = env.b.vx; } });
    if (m) modes.add(m);
    if (m === "launch" && !(vy < -8)) check("Gravity Error launch lifts the enemy", false, "vy " + vy);
  }
  check("Gravity Error: launches OR pulls the enemy", modes.size >= 1 && [...modes].every((m) => m === "launch" || m === "pull"), [...modes].join("/"));
}
{ // 9 Null Frame
  const env = setup(forced("null_frame")); env.a.errors = 5;
  let on = false;
  cast(env, 30, () => { if (env.a.untargetable) on = true; });
  check("Null Frame: Errata becomes untargetable", on);
  let still = env.a.untargetable;
  cast(env, 60);
  check("Null Frame: and it wears off", !env.a.untargetable && still !== undefined);
  const t = setup(forced("null_frame")); t.a.errors = 5; t.a.cooldowns = [0, 0, 0, 0];
  t.sim.step([SKILL, I]); t.a.invuln = 0;
  const hp0 = t.a.hp; t.a.untargetable = true; t.a.nullFrame = 30;
  t.b.facing = -1; t.b.x = t.a.x + F.width + 4;
  t.sim.step([I, intent({ attackPressed: true })]);
  for (let i = 0; i < 20; i++) { t.sim.step([I, intent({ attackPressed: true })]); }
  check("Null Frame: attacks pass through him", t.a.hp === hp0, "hp " + t.a.hp + " / " + hp0);
}
{ // 10 Chain Exception (1v1: strikes the same enemy again)
  const env = setup(forced("chain_exception")); env.a.errors = 5;
  const r = cast(env, 80);
  check("Chain Exception: the skill jumps / chains a second strike", kinds(r.events, "chain").length === 1 && r.drops.length >= 2, "hits " + r.drops.length);
}

// ── random pick: every effect shows up, and the pick is made at activation
{
  const env = setup(F), { a } = env, got = new Set();
  let seed = 1; a.rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 600; i++) { a.errors = 5; a.errataQ.length = 0; const h = a.applyCorruption(Object.assign({}, F.skills[0].attack), 0); got.add(h.corrupted); }
  check("all 10 effects can be picked at random", got.size === 10, got.size + " seen");
}
{
  const env = setup(F), { a } = env;
  a.errors = 5; const before = a.errors;
  check("the effect is not chosen until the skill activates", before === 5 && !a.errataQ.length && a.nullFrame === 0);
}
{ // KO / reset clears everything
  const env = setup(forced("phantom_input")); env.a.errors = 5; cast(env, 3);
  env.a.fullReset(MW.ARENA);
  check("round reset clears stacks, queue, null frame", env.a.errors === 0 && env.a.errataQ.length === 0 && env.a.nullFrame === 0 && !env.a.untargetable);
}


// ══════════ Skill 1: Code Breaker ══════════
{
  const sk = CB.skills[0], A = sk && sk.attack;
  check("Code Breaker is skill 1: a piercing projectile, low damage, 8-10 s cooldown", sk && sk.id === "code_breaker" && A.type === "projectile" && A.piercing && A.damage <= 8 && sk.cooldown >= 480 && sk.cooldown <= 600, sk ? "cd " + sk.cooldown : "");
  check("Code Breaker: 2 s of corruption, short bursts", A.corruptMove.duration === 120 && A.corruptMove.burstMax <= 30 && A.corruptMove.pauseMin >= 10);
}
function cbEnv() { // real Errata, enemy 220 px in front, both on the main stage
  const env = setup(CB), { a, b } = env;
  a.x = 400; a.facing = 1; b.x = 640; b.facing = -1;
  return env;
}
{
  const env = cbEnv(), { sim, a, b } = env;
  let alive = null, hitTick = -1, ml = null;
  const hp0 = b.hp;
  cast(env, 90, (i) => {
    if (hitTick < 0 && b.hp < hp0) { hitTick = i; ml = b.moveCorrupt && b.moveCorrupt.left; alive = sim.projectiles.some((p) => p.ownerId === a.id); }
  });
  check("Code Breaker: the projectile hits and damages the enemy", hitTick >= 0 && b.hp < hp0, "hp " + (hp0 - b.hp).toFixed(1));
  check("Code Breaker: the projectile passes THROUGH (still flying after the hit)", alive === true);
  check("Code Breaker: the hit starts ~2 s of movement corruption", ml !== null && ml >= 110 && ml <= 120, "left " + ml);
  check("Code Breaker: cooldown starts", a.cooldowns[0] > 400, "cd " + a.cooldowns[0]);
}
{ // bursts, not every frame; the corruption ends after 2 s
  const env = cbEnv(), { sim, a, b } = env;
  const cfg = CB.skills[0].attack.corruptMove;
  b.beginMoveCorrupt(cfg);
  let starts = 0, run = 0, maxRun = 0, pauseTicks = 0, burstTicks = 0, x0 = b.x, moved = 0, ended = -1;
  for (let i = 0; i < 140; i++) {
    sim.step([I, I]); b.invuln = 0;
    if (b.moveCorrupt && b.moveCorrupt.burst) { burstTicks++; run++; maxRun = Math.max(maxRun, run); if (run === 1) starts++; } else { run = 0; if (b.moveCorrupt) pauseTicks++; }
    if (!b.moveCorrupt && ended < 0) ended = i;
    if (Math.abs(b.x - x0) > 0.5) moved++;
  }
  check("Code Breaker: several short bursts (not one long, not every frame)", starts >= 2 && maxRun <= cfg.burstMax, starts + " bursts, longest " + maxRun);
  check("Code Breaker: pauses between bursts leave the victim in control", pauseTicks >= 20 && burstTicks > pauseTicks * 0.2, "pause " + pauseTicks + " burst " + burstTicks);
  check("Code Breaker: the victim really moves on his own (idle stick)", moved >= 10, "moved ticks " + moved);
  check("Code Breaker: ends after about 2 s", ended >= 110 && ended <= 125, "ended tick " + ended);
}
{ // input handling
  const env = cbEnv(), { b } = env;
  b.beginMoveCorrupt(CB.skills[0].attack.corruptMove);
  b.moveCorrupt.burst = null; b.moveCorrupt.pause = 10;
  let o = b.moveCorruptIntent(intent({ right: true }));
  check("Code Breaker: during a pause his own stick works", o.right === true && o.left === false);
  b.moveCorrupt.burst = { kind: "left", left: 10 }; b.moveCorrupt.burstDir = -1;
  o = b.moveCorruptIntent(intent({ right: true, attackPressed: true, skillPressed: [false, true, false, false], ultPressed: true }));
  check("Code Breaker: during a burst the stick is overridden", o.left === true && o.right === false);
  check("Code Breaker: attacks, skills and ultimate stay usable during a burst", o.attackPressed && o.skillPressed[1] && o.ultPressed);
}
{ // all four directions + hop show up
  const env = cbEnv(), { b } = env, seen = new Set();
  let seed = 3; b.rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const cfg = Object.assign({}, CB.skills[0].attack.corruptMove, { duration: 6000 });
  b.beginMoveCorrupt(cfg);
  for (let i = 0; i < 4000; i++) { b.state = "idle"; b.moveCorruptIntent(I); if (b.moveCorrupt && b.moveCorrupt.burst) seen.add(b.moveCorrupt.burst.kind); }
  check("Code Breaker: random left / right / forward / backward (and a hop)", ["left", "right", "forward", "backward", "hop"].every((k) => seen.has(k)), [...seen].join(","));
}
{ // bosses
  const env = cbEnv(), { b } = env, cfg = CB.skills[0].attack.corruptMove, st = b.stats;
  b.stats = Object.assign({}, st, { boss: true }); b.beginMoveCorrupt(cfg);
  check("Code Breaker: a boss gets reduced duration", b.moveCorrupt && b.moveCorrupt.left === Math.round(cfg.duration * cfg.bossMul), "left " + (b.moveCorrupt && b.moveCorrupt.left));
  b.moveCorrupt = null; b.beginMoveCorrupt(Object.assign({}, cfg, { bossImmune: true }));
  check("Code Breaker: bossImmune = no effect on a boss", b.moveCorrupt === null);
  b.stats = st;
}
{ // it passes through a untargetable / invulnerable enemy without effect
  const env = cbEnv(), { b } = env; b.untargetable = true;
  cast(env, 90, () => { b.invuln = 0; b.untargetable = true; });
  check("Code Breaker: does nothing to an untargetable enemy", !b.moveCorrupt && b.hp === b.stats.maxHP);
}
{ // passive + projectile skill: Phantom Input's ghost fires it too; Damage Overflow boosts it
  const st = (id) => { const eff = {}; for (const k of IDS) eff[k] = Object.assign({}, P.effects[k], { weight: k === id ? 1 : 0 }); return Object.assign({}, CB, { passive: Object.assign({}, P, { effects: eff }) }); };
  let env = setup(st("phantom_input")); env.a.x = 400; env.b.x = 900; env.a.errors = 5;
  const r = cast(env, 90);
  check("Phantom Input + Code Breaker: the ghost fires a second projectile", r.events.filter((e) => e.type === "fire").length >= 2, r.events.filter((e) => e.type === "fire").length + " shots");
  env = setup(CB); env.a.x = 400; env.b.x = 640;
  const base2 = cast(env, 90).drops[0];
  env = setup(st("damage_overflow")); env.a.x = 400; env.b.x = 640; env.a.errors = 5;
  const big = cast(env, 90).drops[0];
  check("Damage Overflow boosts Code Breaker", base2 && big && big.dmg > base2.dmg * 1.4, base2 && big ? big.dmg.toFixed(2) + " vs " + base2.dmg.toFixed(2) : "no hit");
}

console.log(failures ? failures + " check(s) FAILED." : "All Errata passive checks passed.");
process.exit(failures ? 1 : 0);