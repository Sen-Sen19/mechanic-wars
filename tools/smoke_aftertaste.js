// Aftertaste trial-entry smoke test: roster, stats, cleaver chop, art draws in every pose. Run: node tools/smoke_aftertaste.js
require("../src/config.js");
require("../src/characters.js");
require("../src/arena.js");
require("../src/fighter.js");
require("../src/projectiles.js");
require("../src/sim.js");
require("../src/character_art.js");
require("../src/aftertaste_art.js");
const MW = globalThis.MW, C = MW.CHARACTERS, I = MW.IDLE_INTENT, S = MW.STATE;
const intent = (x) => Object.assign({}, I, x);
let failures = 0;
function check(name, ok, extra) { console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  (" + extra + ")" : "")); if (!ok) failures++; }

const A = C.aftertaste;
check("aftertaste is defined and in the roster", !!A && MW.CHARACTER_ORDER.includes("aftertaste"));
check("name / title / look", A.name === "Aftertaste" && A.title === "The Flavor of Violence" && A.look === "aftertaste");
check("no skills, passive or ultimate yet", A.skills.every((s) => s === null) && !A.passive && !A.ultimate);
check("melee cleaver chop, slow and heavy", A.attack.type === "melee" && A.attack.startup >= 14 && A.attack.recovery >= 20 && A.attack.damage > C.fighter.attack.damage);
check("tougher than Titan, slower than Titan, quicker than Foundry", A.maxHP > C.fighter.maxHP && A.runSpeed < C.fighter.runSpeed && A.runSpeed > C.foundry.runSpeed);
check("every stat is a real number (no silent zeros)", ["maxHP", "armor", "weight", "runSpeed", "jumpStrength", "airJumpStrength", "width", "height"].every((k) => Number.isFinite(A[k]) && A[k] > 0));
check("art module is loaded", !!MW.Aftertaste && typeof MW.Aftertaste.draw === "function");

// combat: the cleaver hurts a dummy standing in range
{
  const sim = new MW.Sim(MW.ARENA, [A, C.fighter]);
  for (let i = 0; i < 120; i++) sim.step([I, I]);
  const [a, b] = sim.fighters;
  a.invuln = b.invuln = 0;
  a.x = 400; b.x = 400 + 70; a.facing = 1; b.facing = -1;
  const hp0 = b.hp;
  for (let i = 0; i < 90; i++) sim.step([intent({ attackPressed: i === 0, attackHeld: i === 0 }), I]);
  check("cleaver chop damages a dummy in reach", b.hp < hp0, "hp " + hp0 + " -> " + b.hp);
}

// art: draws without throwing in every pose, both facings
const { createCanvas } = (() => { try { return require("canvas"); } catch (e) { return {}; } })();
if (!createCanvas) console.log("SKIP art draw test (node-canvas not installed)");
else {
  const ctx = createCanvas(300, 300).getContext("2d");
  const sim = new MW.Sim(MW.ARENA, [A, C.fighter]);
  for (let i = 0; i < 90; i++) sim.step([I, I]);
  const f = sim.fighters[0];
  let ok = true, err = "";
  for (const facing of [1, -1]) for (const st of [S.IDLE, S.RUN, S.ATTACK_STARTUP, S.ATTACK_ACTIVE, S.ATTACK_RECOVERY, S.HITSTUN, S.RISING, S.KO]) {
    try { f.state = st; f.facing = facing; f.hit = Object.assign({}, A.attack); f.stateTimer = 5; ctx.save(); ctx.translate(150, 250); MW.CharacterArt.draw(ctx, f, false, null); MW.CharacterArt.draw(ctx, f, true, null); ctx.restore(); }
    catch (e) { ok = false; err = st + ": " + e.message; }
  }
  check("art draws in every pose, both facings, and as a hit flash", ok, err);
  const fake = { stats: A, x: 0, y: 0, facing: 1, state: S.IDLE, vx: 0, vy: 0, grounded: true };
  let ok2 = true; try { ctx.translate(150, 250); MW.CharacterArt.draw(ctx, fake, false, null); } catch (e) { ok2 = false; err = e.message; }
  check("draws a stand-in fighter without hp (select screen)", ok2, err);
}
console.log(failures ? failures + " check(s) failed" : "All checks passed.");
process.exit(failures ? 1 : 0);
