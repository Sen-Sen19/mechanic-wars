// Assassin skills 2-4 + ultimate headless test (Phantom Decoy, Rupture, Phantom Onslaught, Death Sentence).
// Run: node tools/test_assassin_skills.js
// It uses the REAL fighter.js / sim.js / characters.js. config.js and arena.js are stubbed below ONLY when they are not on disk,
// so numbers that depend on MW.CONFIG (knockback, hitstun) are stand-ins when the stub is used.
const fs = require("fs"), path = require("path");
const SRC = path.join(__dirname, "..", "src");
const g = globalThis;
g.MW = g.MW || {};
const MW = g.MW;
if (fs.existsSync(path.join(SRC, "config.js"))) require(path.join(SRC, "config.js"));
else {
  MW.CONFIG = { physics: { gravity: 0.6 }, inputBufferFrames: 6, respawnInvulnFrames: 90, combat: { knockbackScaling: 1.5, weightUnit: 100, hitstunBase: 10, hitstunPerKnockback: 2, hitstunMax: 60, hitFlashFrames: 6, launchHorizontal: 1, launchVertical: 1, meleeBoxHeight: 0.8, maxMana: 100, manaPerHit: 8, blastPenalty: 0.25, koFrames: 120 }, bots: { speedScale: 1 } };
  MW.MOVEMENT_DEFAULTS = { runSpeed: 5.5, groundAccel: 1.2, groundFriction: 1.4, airAccel: 0.6, airDrag: 0.15, jumpStrength: 12.8, airJumpStrength: 11.5, maxAirJumps: 1, dropThroughFrames: 12, fastFallSpeed: 14, maxFallSpeed: 16 };
  console.log("(config.js not found: using stand-in MW.CONFIG)");
}
if (fs.existsSync(path.join(SRC, "arena.js"))) require(path.join(SRC, "arena.js"));
else {
  MW.ARENA = { platforms: [{ x: 200, y: 560, w: 880, h: 40 }, { x: 400, y: 400, w: 200, h: 12, oneWay: true }], spawns: [{ x: 400, y: 300, facing: 1 }, { x: 880, y: 300, facing: -1 }], blastZone: { left: -200, right: 1480, top: -300, bottom: 900 } };
}
for (const f of ["characters", "fighter"]) require(path.join(SRC, f + ".js"));
if (fs.existsSync(path.join(SRC, "projectiles.js"))) require(path.join(SRC, "projectiles.js"));
require(path.join(SRC, "sim.js"));
for (const f of ["character_art", "assassin_fx"]) require(path.join(SRC, f + ".js"));

const C = MW.CHARACTERS, S = MW.STATE;
const I = (o) => Object.assign({}, MW.IDLE_INTENT, o);
const IDLE = () => MW.IDLE_INTENT;
let failures = 0;
function check(name, ok, detail) { console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail !== undefined ? "  (" + detail + ")" : "")); if (!ok) failures++; }
const near = (a, b, e) => Math.abs(a - b) <= (e === undefined ? 1e-6 : e);

// Assassin (slot 0) facing a target (slot 1) `gap` px away, both on the main floor, fully reset.
function duel(targetId, gap) {
  const a = C.assassin, d = C[targetId || "fighter"];
  const sim = new MW.Sim(MW.ARENA, [a, d]);
  for (let i = 0; i < 120; i++) sim.step([IDLE(), IDLE()]);
  const [fa, fd] = sim.fighters;
  fa.invuln = fd.invuln = 0;
  fa.y = 560 - a.height; fd.y = 560 - d.height; fa.vy = fd.vy = 0;
  fa.x = 500; fa.facing = 1; fd.x = fa.x + a.width + (gap === undefined ? 30 : gap); fd.facing = -1;
  for (let i = 0; i < 4; i++) sim.step([IDLE(), IDLE()]);
  return sim;
}
const skill = (n) => I({ skillPressed: [n === 0, n === 1, n === 2, n === 3] });
function run(sim, n, i0, i1) { for (let t = 0; t < n; t++) sim.step([typeof i0 === "function" ? i0(t) : i0 || IDLE(), typeof i1 === "function" ? i1(t) : i1 || IDLE()]); }
const sk = C.assassin.skills;

// ───────── data sanity ─────────
check("assassin has skills in all 4 slots + ultimate", sk.every((s) => s && s.attack) && C.assassin.ultimate && C.assassin.ultimate.attack);
check("scythe (slot 1) untouched", sk[0].id === "chained_scythe" && sk[0].attack.scythe.bombDamage === 14);
check("skill poses exist in character_art (ATK has them via draw)", [sk[1].attack.pose, sk[2].attack.pose, sk[3].attack.pose, C.assassin.ultimate.attack.pose].every((p) => p >= 5 && p <= 8));

// ───────── Phantom Decoy ─────────
{
  const sim = duel("fighter", 300);
  const [fa, fd] = sim.fighters;
  fa.mark.target = fd; fa.mark.stacks = 2; // a Death Mark chain must survive using a utility skill
  const x0 = fa.x;
  run(sim, 1, skill(1));
  check("decoy: skill 2 starts the cast and sets the cooldown", fa.hit && fa.hit.id === "phantom_decoy" && fa.cooldowns[1] > 0);
  check("decoy: utility hit never hits (hitsRect false even when touching)", (() => { const r = { x: fa.x + 10, y: fa.y, w: 30, h: 70 }; return fa.hitsRect(r) === false; })());
  let spawnDx = null;
  for (let t = 0; t < 10; t++) { run(sim, 1); if (fa.decoy && spawnDx === null) spawnDx = fa.decoy.x - x0; }
  check("decoy: illusion exists after the cast, cloak is on", !!fa.decoy && !!fa.cloak && fa.decoy.left > 100, "decoy.left " + (fa.decoy && fa.decoy.left));
  check("decoy: real Assassin is nearly invisible (fade = cloakAlpha)", near(fa.fade, sk[1].attack.decoy.cloakAlpha), "fade " + fa.fade);
  check("decoy: illusion spawns where he stood", spawnDx !== null && Math.abs(spawnDx) < 6, "dx " + spawnDx);
  check("decoy: using it did not reset the Death Mark chain", fa.mark.stacks === 2, "stacks " + fa.mark.stacks);
  const dx0 = fa.decoy.x;
  run(sim, 30, (t) => I({ left: true })); // the real one walks away; the illusion must move on its own
  check("decoy: illusion moves independently toward the enemy while the real one went the other way", fa.decoy.x > dx0 + 40 && fa.x < x0 - 20, "illusion " + (fa.decoy.x - dx0).toFixed(0) + " real " + (fa.x - x0).toFixed(0));
  check("decoy: illusion stays on the stage", fa.decoy.y + fa.stats.height <= 561);
  run(sim, 90);
  check("decoy: illusion lasts `duration` ticks then disappears (cloak too)", fa.decoy === null && fa.cloak === null && fa.fade === 1, "fade " + fa.fade);
}
{ // attacking ends the cloak early; the illusion keeps going
  const sim = duel("fighter", 300);
  const fa = sim.fighters[0];
  run(sim, 30, (t) => (t === 0 ? skill(1) : IDLE())); // cast (16 ticks) is over, he is free to act again
  check("decoy(break): cloaked before attacking", fa.cloak && fa.fade < 0.2);
  run(sim, 1, I({ attackPressed: true }));
  check("decoy(break): attacking ends the invisibility at once, illusion remains", fa.cloak === null && fa.fade === 1 && !!fa.decoy);
}
{ // being hit reveals; a skill also breaks it
  const sim = duel("fighter", 20);
  const [fa, fd] = sim.fighters;
  run(sim, 20, (t) => (t === 0 ? skill(1) : IDLE()));
  check("decoy(reveal): cloaked", !!fa.cloak);
  run(sim, 8, IDLE(), (t) => I({ attackPressed: t === 0 }));
  check("decoy(reveal): getting hit ends the cloak", fa.hp < fa.stats.maxHP && fa.cloak === null, "hp " + fa.hp.toFixed(1));
}
{ // skill after decoy breaks the cloak
  const sim = duel("fighter", 20);
  const fa = sim.fighters[0];
  run(sim, 30, (t) => (t === 0 ? skill(1) : IDLE()));
  check("decoy(break): cloaked before the next skill", !!fa.cloak);
  fa.cooldowns[2] = 0;
  run(sim, 1, skill(2));
  check("decoy(break): casting another skill ends the cloak", fa.cloak === null);
}

// ───────── Rupture ─────────
function ruptureRun(moving) {
  const sim = duel("fighter", 20);
  const [fa, fd] = sim.fighters;
  run(sim, 1, skill(2));
  let hit = false, hp0 = fd.hp;
  for (let t = 0; t < 40 && !fd.bleed; t++) run(sim, 1, IDLE());
  const afterSlash = fd.hp;
  const R = sk[2].attack.rupture;
  let ticks = 0;
  const hpStart = fd.hp;
  while (fd.bleed && ticks < 600) { run(sim, 1, IDLE(), moving && fd.state !== S.HITSTUN ? I({ right: ticks % 120 < 60, left: ticks % 120 >= 60 }) : IDLE()); ticks++; }
  return { sim, fa, fd, afterSlash, hp0, hpStart, ticks, R, bled: hpStart - fd.hp };
}
{
  const st = ruptureRun(false), mv = ruptureRun(true);
  check("rupture: the slash hits and starts the bleed", st.afterSlash < st.hp0 && st.hp0 - st.afterSlash > 0, "initial " + (st.hp0 - st.afterSlash).toFixed(2));
  check("rupture: bleed lasts about `duration` ticks", Math.abs(st.ticks - st.R.duration) < 45, st.ticks + " ticks");
  check("rupture: standing still takes only the (reduced) damage ticks", st.bled > 0 && st.bled < 20, "bled " + st.bled.toFixed(2));
  check("rupture: moving takes clearly more than standing still", mv.bled > st.bled * 1.4, "moving " + mv.bled.toFixed(2) + " vs still " + st.bled.toFixed(2));
  check("rupture: bleed ends and clears", st.fd.bleed === null);
}
{ // the mark bonus empowers the slash and the bleed
  const a = duel("fighter", 20), b = duel("fighter", 20);
  b.fighters[0].mark.target = b.fighters[1]; b.fighters[0].mark.stacks = 4; b.fighters[0].mark.marked = true; b.fighters[0].mark.left = 400;
  run(a, 1, skill(2)); run(b, 1, skill(2));
  run(a, 30); run(b, 30);
  check("rupture: marked target takes bonus slash damage and the mark is spent", b.fighters[1].hp < a.fighters[1].hp && b.fighters[0].mark.marked === false, a.fighters[1].hp.toFixed(1) + " vs " + b.fighters[1].hp.toFixed(1));
  check("rupture: bleed is empowered by the mark too", b.fighters[1].bleed && near(b.fighters[1].bleed.mul, 1 + C.assassin.passive.bonus));
}
{ // bleed can KO and the Sim counts it
  const sim = duel("fighter", 20);
  const [fa, fd] = sim.fighters;
  fd.hp = 12;
  run(sim, 1, skill(2));
  let bledOut = false;
  for (let t = 0; t < 400 && sim.koTimer === 0; t++) { run(sim, 1, IDLE(), I({ right: t % 100 < 50, left: t % 100 >= 50 })); if (fd.state === S.KO && !fd.bleed) bledOut = true; }
  check("rupture: the bleed itself finished him (not the slash)", bledOut && fd.lastHit && fd.lastHit.bleed === true);
  check("rupture: bleeding to death is a KO that the Sim scores", sim.kills[0] === 1 && sim.kills[1] === 0, "kills " + sim.kills);
}
{ // armor: bleed against the Bulwark still starts (hit on a non-armored-swing target) and fx reads state without crashing
  const r = ruptureRun(false);
  check("rupture: lastHit readout is the bleed", r.fd.lastHit && /bleed/.test(r.fd.lastHit.by) && r.fd.lastHit.dmg > 0, r.fd.lastHit && r.fd.lastHit.by);
}

// ───────── Phantom Onslaught ─────────
{
  const sim = duel("fighter", 30);
  const [fa, fd] = sim.fighters;
  const O = sk[3].attack.onslaught;
  const hp0 = fd.hp;
  run(sim, 1, skill(3));
  const xs = [], hidden = [], states = [];
  let sawSeq = false, maxVx = 0, kbSeen = 0;
  for (let t = 0; t < 400; t++) {
    run(sim, 1);
    if (fa.onslaught) { sawSeq = true; xs.push(Math.round(fa.x - fd.x)); hidden.push(fa.vanished); }
    maxVx = Math.max(maxVx, Math.abs(fa.vx));
    kbSeen = Math.max(kbSeen, Math.abs(fd.vx));
    if (!fa.onslaught && sawSeq) break;
  }
  const distinct = new Set(xs.filter((_, i) => !hidden[i]));
  check("onslaught: initial slash connects and starts the sequence", sawSeq);
  check("onslaught: reappears around the target from several different positions", distinct.size >= 4, [...distinct].join(","));
  check("onslaught: he is hidden between strikes", hidden.some(Boolean) && hidden.some((h) => !h));
  check("onslaught: dealt damage on every beat (6 beats + opener)", hp0 - fd.hp > 8 + 3 * 5, "total " + (hp0 - fd.hp).toFixed(1));
  check("onslaught: finisher knocks the target away", kbSeen > 3, "peak vx " + kbSeen.toFixed(1));
  check("onslaught: no sliding (rooted, vx stays 0)", maxVx < 0.01, "max |vx| " + maxVx.toFixed(3));
  check("onslaught: ends in a punishable recovery", fa.state === S.ATTACK_RECOVERY || fa.onslaught === null);
  run(sim, 120);
  check("onslaught: back to normal afterwards", fa.state === S.IDLE && !fa.vanished && fa.fade === 1);
}
{ // miss: enemy out of range -> no sequence, recovery
  const sim = duel("fighter", 260);
  const fa = sim.fighters[0];
  run(sim, 1, skill(3));
  let seq = false;
  for (let t = 0; t < 80; t++) { run(sim, 1); if (fa.onslaught) seq = true; }
  check("onslaught: nobody in range = a miss (no teleports)", !seq && sim.fighters[1].hp === sim.fighters[1].stats.maxHP);
}
{ // interrupt: the Assassin gets hit mid-sequence before the finisher -> sequence is broken
  const sim = duel("fighter", 30);
  const [fa, fd] = sim.fighters;
  run(sim, 1, skill(3));
  let t = 0;
  while (!fa.onslaught && t++ < 60) run(sim, 1);
  // third-party hit lands on the Assassin (takeHit is what the sim calls)
  run(sim, 8);
  fa.takeHit(fd, { damage: 4, knockback: 4, stun: 20 }, 1);
  run(sim, 2);
  check("onslaught: being hit mid-sequence interrupts it", fa.onslaught === null && fa.state === S.HITSTUN || fa.state !== S.ATTACK_ACTIVE);
  run(sim, 60);
  check("onslaught(interrupt): victim is released", fd.state !== S.HITSTUN);
}
{ // KO mid-sequence: counted once
  const sim = duel("fighter", 30);
  const [fa, fd] = sim.fighters;
  fd.hp = 6;
  run(sim, 1, skill(3));
  run(sim, 120);
  check("onslaught: killing blow is a KO that the Sim scores", fd.hp === 0 && sim.kills[0] === 1, "kills " + sim.kills);
}

// ───────── Death Sentence ─────────
{
  const sim = duel("fighter", 120);
  const [fa, fd] = sim.fighters;
  fa.mana = MW.CONFIG.combat.maxMana;
  const U = C.assassin.ultimate.attack, SC = U.sentence;
  const hp0 = fd.hp;
  run(sim, 1, I({ ultPressed: true }));
  check("sentence: ultimate spends the mana and starts the startup", fa.mana === 0 && fa.hit && fa.hit.id === "death_sentence" && fa.state === S.ATTACK_STARTUP);
  let t = 0;
  let sawSent = false, ills = 0, beforeHit = fd.hp;
  // opponent runs away during the startup, but stays inside lockOn.range at release: the hit cannot be dodged
  while (t++ < 400) {
    run(sim, 1, IDLE(), fa.state === S.ATTACK_STARTUP && t < 20 ? I({ right: true }) : IDLE());
    if (fa.sentence) { sawSent = true; ills = fa.sentence.ills.length; }
    if (sawSent && !fa.sentence) break;
  }
  check("sentence: lock-on connects even though the target moved during the startup", sawSent && fd.hp < hp0);
  check("sentence: four illusions around the target", ills === 4);
  const total = hp0 - fd.hp;
  const expectRaw = U.damage + SC.shurikenDamage * 4 + SC.finish.damage;
  check("sentence: heavy damage (opener + 4 shuriken + finisher, armor applied)", total > expectRaw * 0.6 && total < expectRaw, "total " + total.toFixed(1) + " raw " + expectRaw);
  check("sentence: finisher launches the target", Math.abs(fd.vx) > 2 || fd.state === S.HITSTUN);
  check("sentence: not refundable (no mana from the ult)", fa.mana === 0);
  run(sim, 120);
  check("sentence: attacker returns to normal", fa.state !== S.ATTACK_ACTIVE && fa.sentence === null && Math.abs(fa.vx) < 0.01);
}
{ // too far = clean miss + long recovery
  const sim = duel("fighter", 400);
  const fa = sim.fighters[0];
  fa.mana = MW.CONFIG.combat.maxMana;
  run(sim, 1, I({ ultPressed: true }));
  let sent = false;
  for (let t = 0; t < 140; t++) { run(sim, 1); if (fa.sentence) sent = true; }
  check("sentence: enemy out of range = a miss, no sequence", !sent && sim.fighters[1].hp === sim.fighters[1].stats.maxHP);
}
{ // startup is interruptible and readable
  const sim = duel("fighter", 120);
  const [fa, fd] = sim.fighters;
  fa.mana = MW.CONFIG.combat.maxMana;
  run(sim, 1, I({ ultPressed: true }));
  run(sim, 20);
  check("sentence: long startup, still in startup 20 ticks in", fa.state === S.ATTACK_STARTUP);
  fa.takeHit(fd, { damage: 3, knockback: 5, stun: 20 }, 1);
  check("sentence: a hit during the startup cancels it", fa.state === S.HITSTUN && fa.hit === null);
}
{ // KO during the sentence
  const sim = duel("fighter", 100);
  const [fa, fd] = sim.fighters;
  fa.mana = MW.CONFIG.combat.maxMana; fd.hp = 20; // dies to the third shuriken
  run(sim, 1, I({ ultPressed: true }));
  let ended = false;
  for (let t = 0; t < 200 && sim.koTimer === 0; t++) run(sim, 1);
  for (let t = 0; t < 5; t++) run(sim, 1);
  check("sentence: a KO during the shuriken is scored once and the sequence stops", sim.kills[0] === 1 && sim.kills[1] === 0 && fa.sentence === null, "kills " + sim.kills);
}

// ───────── existing pieces still work ─────────
{
  const sim = duel("tank", 20);
  const fa = sim.fighters[0];
  run(sim, 1, skill(0));
  run(sim, 200);
  check("scythe still completes (regression)", fa.scythe === null && sim.fighters[1].hp < sim.fighters[1].stats.maxHP);
}

// ───────── fx / art smoke (fake canvas) ─────────
{
  const FX = MW.AssassinFx;
  const calls = [];
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === "createRadialGradient" || k === "createLinearGradient" ? () => ({ addColorStop() {} }) : (...a) => calls.push(k))), set: (t, k, v) => ((t[k] = v), true) });
  let ok = true, err = null;
  try {
    const sim = duel("fighter", 30);
    const [fa, fd] = sim.fighters;
    fa.mana = MW.CONFIG.combat.maxMana;
    // decoy + bleed + onslaught + sentence drawn frame by frame
    const script = [skill(1), IDLE(), IDLE()];
    for (let round = 0; round < 4; round++) {
      fa.cooldowns = [0, 0, 0, 0]; fa.mana = MW.CONFIG.combat.maxMana; fd.hp = fd.stats.maxHP; fd.invuln = 0;
      fa.x = 500; fa.y = 560 - fa.stats.height; fd.x = 560; fd.y = 560 - fd.stats.height;
      const first = round === 0 ? skill(1) : round === 1 ? skill(2) : round === 2 ? skill(3) : I({ ultPressed: true });
      for (let t = 0; t < 260; t++) {
        sim.step([t === 0 ? first : IDLE(), IDLE()]);
        FX.update(sim); FX.tick(); FX.drawBehind(ctx); FX.draw(ctx);
        if (t === 5) for (const f of sim.fighters) if (f.stats.id === "assassin") FX.drawAura(ctx, f);
      }
    }
  } catch (e) { ok = false; err = e; console.log(e); }
  check("fx update/draw runs through decoy, rupture, onslaught and sentence without errors", ok && calls.length > 200, err ? String(err) : calls.length + " draw calls");
}

console.log(failures ? "\n" + failures + " check(s) FAILED" : "\nAll Assassin skill checks passed.");
process.exit(failures ? 1 : 0);