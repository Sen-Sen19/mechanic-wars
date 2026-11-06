// Mochi (Stormforged) trial-entry smoke test: roster, stats, 3-hit chain, art. Run: node tools/smoke_mochi.js
require("../src/config.js");
require("../src/characters.js");
require("../src/arena.js");
require("../src/fighter.js");
require("../src/projectiles.js");
require("../src/sim.js");
require("../src/character_art.js");
require("../src/mochi_art.js");
const MW = globalThis.MW, C = MW.CHARACTERS, I = MW.IDLE_INTENT;
const intent = (x) => Object.assign({}, I, x);
let failures = 0;
function check(name, ok, extra) { console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  (" + extra + ")" : "")); if (!ok) failures++; }

const F = C.mochi;
check("mochi is defined and in the roster", !!F && MW.CHARACTER_ORDER.includes("mochi"));
check("name / title / look", F.name === "Mochi" && F.title === "The Sleepy Dreamer" && F.look === "mochi");
check("no skills, passive or ultimate yet", F.skills.every((s) => s === null) && !F.passive && !F.ultimate);
check("3-hit melee chain", F.attack.type === "melee" && F.attack.chain.length === 3);
check("lighter than Titan, lower HP than Titan", F.weight < C.fighter.weight && F.maxHP < C.fighter.maxHP);
check("narrower and lighter than Titan, so Titan stays the big body", F.width < C.fighter.width && F.weight < C.fighter.weight);
check("every stat is a real number (no silent zeros)", ["maxHP", "armor", "weight", "runSpeed", "jumpStrength", "airJumpStrength", "width", "height"].every((k) => Number.isFinite(F[k]) && F[k] > 0));

// combat: chain through all three hits against a dummy
{
  const sim = new MW.Sim(MW.ARENA, [F, C.fighter]);
  for (let i = 0; i < 120; i++) sim.step([I, I]);
  const [a, b] = sim.fighters;
  a.invuln = b.invuln = 0;
  a.x = 500; b.x = 500 + F.width + 6; a.facing = 1; b.facing = -1;
  const hp0 = b.hp, seen = new Set();
  for (let i = 0; i < 90; i++) {
    sim.step([intent({ attackPressed: true, attackHeld: true }), I]);
    if (a.hit) seen.add(a.chainIndex);
    b.invuln = 0;
  }
  check("tapping attack walks the whole chain (swat, flop, slam)", seen.has(0) && seen.has(1) && seen.has(2), "seen " + [...seen].join(","));
  check("her basic hits damage the enemy", b.hp < hp0, "hp " + hp0 + " -> " + b.hp);
}

// art: draws every state without throwing, both facings, normal + flash pass
{
  const calls = { n: 0 };
  const g = new Proxy({}, { get: (t, p) => (p === "createRadialGradient" || p === "createLinearGradient" ? () => ({ addColorStop() {} }) : typeof p === "symbol" ? undefined : () => { calls.n++; }), set: () => true });
  const S = MW.STATE;
  let ok = true, err = "";
  for (const state of [S.IDLE, S.RUN, S.FALLING, S.RISING, S.HITSTUN, S.KO, S.ATTACK_STARTUP, S.ATTACK_ACTIVE, S.ATTACK_RECOVERY]) {
    for (const facing of [1, -1]) {
      for (const flash of [false, true]) {
        for (let ci = 0; ci < 3; ci++) {
          const f = { id: 1, stats: F, x: 100, y: 200, facing, state, flash: 0, hit: Object.assign({}, F.attack, F.attack.chain[ci], { startup: 4, recovery: 6, active: 3 }), vx: 3, vy: -2, grounded: state !== S.FALLING && state !== S.RISING, chainIndex: ci, stateTimer: 2 };
          try { MW.CharacterArt.draw(g, f, flash, { spawn() {} }); } catch (e) { ok = false; err = state + ": " + e.message; }
        }
      }
    }
  }
  check("mochi art draws in every state, both facings, flash pass", ok, err);
}
console.log(failures ? failures + " check(s) FAILED." : "All Mochi checks passed.");
process.exit(failures ? 1 : 0);