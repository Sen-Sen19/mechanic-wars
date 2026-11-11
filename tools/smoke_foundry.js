// Foundry trial-entry smoke test: roster, stats, hammer slam, art draws in every pose. Run: node tools/smoke_foundry.js
require("../src/config.js");
require("../src/characters.js");
require("../src/arena.js");
require("../src/fighter.js");
require("../src/projectiles.js");
require("../src/sim.js");
require("../src/character_art.js");
require("../src/foundry_art.js");
const MW = globalThis.MW, C = MW.CHARACTERS, I = MW.IDLE_INTENT, S = MW.STATE;
const intent = (x) => Object.assign({}, I, x);
let failures = 0;
function check(name, ok, extra) { console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  (" + extra + ")" : "")); if (!ok) failures++; }

const F = C.foundry;
check("foundry is defined and in the roster", !!F && MW.CHARACTER_ORDER.includes("foundry"));
check("name / title / look", F.name === "Foundry" && F.title === "The Molten Core" && F.look === "foundry");
check("select-card stats: HP 560, ARM 38, SPD 3.4", F.maxHP === 560 && F.armor === 38 && F.runSpeed === 3.4);
check("no skills, passive or ultimate yet", F.skills.every((s) => s === null) && !F.passive && !F.ultimate);
check("melee hammer slam, slow and heavy", F.attack.type === "melee" && F.attack.startup >= 18 && F.attack.recovery >= 30 && F.attack.damage > C.fighter.attack.damage);
check("heavy and slow: more HP and weight than Titan, slower than Titan", F.maxHP > C.fighter.maxHP && F.weight > C.fighter.weight && F.runSpeed < C.fighter.runSpeed);
check("every stat is a real number (no silent zeros)", ["maxHP", "armor", "weight", "runSpeed", "jumpStrength", "airJumpStrength", "width", "height"].every((k) => Number.isFinite(F[k]) && F[k] > 0));

// combat: the hammer hurts a dummy standing in range
{
  const sim = new MW.Sim(MW.ARENA, [F, C.fighter]);
  for (let i = 0; i < 120; i++) sim.step([I, I]);
  const [a, b] = sim.fighters;
  a.invuln = b.invuln = 0;
  a.x = 400; b.x = 400 + 70; a.facing = 1; b.facing = -1;
  const hp0 = b.hp;
  for (let i = 0; i < 90; i++) sim.step([intent({ attackPressed: i === 0, attackHeld: i === 0 }), I]);
  check("hammer slam damages a dummy in reach", b.hp < hp0, "hp " + hp0 + " -> " + b.hp);
}

// art: draws without throwing in every pose, both facings, with and without heat
{
  const { createCanvas } = (() => { try { return require("canvas"); } catch (e) { return {}; } })();
  if (!createCanvas) console.log("SKIP art draw test (node-canvas not installed)");
  else {
    const ctx = createCanvas(300, 300).getContext("2d");
    const sim = new MW.Sim(MW.ARENA, [F, C.fighter]);
    for (let i = 0; i < 90; i++) sim.step([I, I]);
    const f = sim.fighters[0];
    let ok = true, err = "";
    for (const facing of [1, -1]) for (const st of [S.IDLE, S.RUN, S.ATTACK_STARTUP, S.ATTACK_ACTIVE, S.ATTACK_RECOVERY, S.HITSTUN, S.RISING, S.KO]) for (const hp of [F.maxHP, F.maxHP * 0.3]) {
      try { f.state = st; f.facing = facing; f.hp = hp; f.hit = Object.assign({}, F.attack); f.stateTimer = 5; f.tempered = hp < F.maxHP; ctx.save(); ctx.translate(150, 250); MW.CharacterArt.draw(ctx, f, false, null); MW.CharacterArt.draw(ctx, f, true, null); ctx.restore(); }
      catch (e) { ok = false; err = st + ": " + e.message; }
    }
    check("art draws in every pose, both facings, hot and cold, and as a hit flash", ok, err);
  }
}
{ // select screen draws a stand-in fighter with no hp: must not produce NaN
  const { createCanvas } = (() => { try { return require("canvas"); } catch (e) { return {}; } })();
  if (createCanvas) {
    const ctx = createCanvas(300, 300).getContext("2d");
    const fake = { stats: F, x: 0, y: 0, facing: 1, state: S.IDLE, vx: 0, vy: 0, grounded: true };
    let ok = true; try { ctx.translate(150, 250); MW.CharacterArt.draw(ctx, fake, false, null); } catch (e) { ok = false; }
    check("draws a stand-in fighter without hp (select screen)", ok);
  }
}
console.log(failures ? failures + " FAILED" : "ALL PASSED");
process.exit(failures ? 1 : 0);
