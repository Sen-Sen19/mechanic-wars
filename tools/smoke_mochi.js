// Mochi (Sleepy Dreamer) trial-entry smoke test: roster, stats, basic attack, art. Run: node tools/smoke_mochi.js
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

const M = C.mochi;
check("mochi is defined and last in the roster", !!M && MW.CHARACTER_ORDER[MW.CHARACTER_ORDER.length - 1] === "mochi");
check("name / title / look", M.name === "Mochi" && M.title === "The Sleepy Dreamer" && M.look === "mochi");
check("hit box is 36 x 68 from the design doc", M.width === 36 && M.height === 68);
check("shorter than Assassin and Hitter, clearly smaller than Monarch", M.height < C.assassin.height && M.height < C.hitter.height && M.height < C.monarch.height - 20);
check("no skills, passive or ultimate yet", M.skills.every((s) => s === null) && !M.passive && !M.ultimate);
check("every stat is a real number (no silent zeros)", ["maxHP", "armor", "weight", "runSpeed", "jumpStrength", "airJumpStrength", "width", "height"].every((k) => Number.isFinite(M[k]) && M[k] > 0));

// combat: the placeholder swat lands and damages
{
  const sim = new MW.Sim(MW.ARENA, [M, C.fighter]);
  for (let i = 0; i < 120; i++) sim.step([I, I]);
  const [a, b] = sim.fighters;
  a.invuln = b.invuln = 0;
  a.x = 500; b.x = 500 + M.width + 6; a.facing = 1; b.facing = -1;
  const hp0 = b.hp;
  for (let i = 0; i < 60; i++) { sim.step([intent({ attackPressed: i % 30 === 0, attackHeld: false }), I]); b.invuln = 0; }
  check("her basic swat damages the enemy", b.hp < hp0, "hp " + hp0 + " -> " + b.hp);
}

// art: draws every state without throwing, both facings, normal + flash pass, over many frames (springs, blink, yawn, z)
{
  const g = new Proxy({}, { get: (t, p) => (p === "createRadialGradient" || p === "createLinearGradient" ? () => ({ addColorStop() {} }) : typeof p === "symbol" ? undefined : () => {}), set: () => true });
  const S = MW.STATE;
  let ok = true, err = "";
  for (const state of [S.IDLE, S.RUN, S.FALLING, S.RISING, S.HITSTUN, S.KO, S.ATTACK_STARTUP, S.ATTACK_ACTIVE, S.ATTACK_RECOVERY]) {
    for (const facing of [1, -1]) {
      for (const flash of [false, true]) {
        const f = { id: 1, stats: M, x: 100, y: 200, facing, state, flash: 0, hit: Object.assign({}, M.attack, { startup: 4, recovery: 6, active: 3 }), vx: 3, vy: -2, grounded: state !== S.FALLING && state !== S.RISING, chainIndex: 0, stateTimer: 2 };
        try { for (let i = 0; i < 3; i++) MW.CharacterArt.draw(g, f, flash, { spawn() {} }); } catch (e) { ok = false; err = state + ": " + e.stack.split("\n").slice(0, 2).join(" "); }
      }
    }
  }
  check("mochi art draws in every state, both facings, flash pass", ok, err);
  // long idle: exercise yawn / drowsy / z-particle code paths with a faked clock
  const realNow = performance.now.bind(performance);
  let t = 0, ok2 = true, err2 = "";
  performance.now = () => t;
  try {
    const f = { id: 2, stats: M, x: 100, y: 200, facing: 1, state: S.IDLE, flash: 0, hit: null, vx: 0, vy: 0, grounded: true, stateTimer: 0 };
    for (t = 0; t < 40000; t += 16) MW.CharacterArt.draw(g, f, false, { spawn() {} });
    const z = f._art.mochi;
    check("idle timer ran long enough to yawn and spawn z", z.idleT > 30 && z.zCount >= 3, "idleT " + z.idleT.toFixed(1) + ", z spawned " + z.zCount);
  } catch (e) { ok2 = false; err2 = e.stack.split("\n").slice(0, 2).join(" "); } finally { performance.now = realNow; }
  check("40 s idle draw loop does not throw", ok2, err2);
}
console.log(failures ? failures + " check(s) FAILED." : "All Mochi checks passed.");
process.exit(failures ? 1 : 0);
