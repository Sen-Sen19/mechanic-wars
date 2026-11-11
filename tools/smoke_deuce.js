// Deuce trial-entry smoke test: roster, stats, card flick, art. Run: node tools/smoke_deuce.js
require("../src/config.js");
require("../src/characters.js");
require("../src/arena.js");
require("../src/fighter.js");
require("../src/projectiles.js");
require("../src/sim.js");
require("../src/character_art.js");
require("../src/deuce_art.js");
const MW = globalThis.MW, C = MW.CHARACTERS, I = MW.IDLE_INTENT;
const intent = (x) => Object.assign({}, I, x);
let failures = 0;
function check(name, ok, extra) { console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  (" + extra + ")" : "")); if (!ok) failures++; }

const F = C.deuce;
check("deuce is defined and in the roster", !!F && MW.CHARACTER_ORDER.includes("deuce"));
check("name / title / look", F.name === "Deuce" && F.title === "The House Always Wins" && F.look === "deuce");
check("no skills, passive or ultimate yet", F.skills.every((s) => s === null) && !F.passive && !F.ultimate);
check("ranged card basic with the card projectile style", F.attack.type === "projectile" && F.attack.projectile.style === "card");
check("slim and light: narrower and lighter than Titan, less HP", F.width < C.fighter.width && F.weight < C.fighter.weight && F.maxHP < C.fighter.maxHP);
check("every stat is a real number (no silent zeros)", ["maxHP", "armor", "weight", "runSpeed", "jumpStrength", "airJumpStrength", "width", "height"].every((k) => Number.isFinite(F[k]) && F[k] > 0));

// combat: his cards fly and hurt a dummy standing in range
{
  const sim = new MW.Sim(MW.ARENA, [F, C.fighter]);
  for (let i = 0; i < 120; i++) sim.step([I, I]);
  const [a, b] = sim.fighters;
  a.invuln = b.invuln = 0;
  a.x = 400; b.x = 400 + 260; a.facing = 1; b.facing = -1;
  const hp0 = b.hp;
  let spawned = 0;
  for (let i = 0; i < 120; i++) {
    sim.step([intent({ attackPressed: true, attackHeld: true }), I]);
    spawned = Math.max(spawned, (sim.projectiles || []).length);
    b.invuln = 0;
  }
  check("tapping attack throws cards", spawned > 0, "max in flight " + spawned);
  check("his cards damage the enemy at range", b.hp < hp0, "hp " + hp0 + " -> " + b.hp);
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
        for (let ci = 0; ci < 1; ci++) {
          const f = { id: 1, stats: F, x: 100, y: 200, facing, state, flash: 0, hit: Object.assign({}, F.attack, (F.attack.chain ? F.attack.chain[ci] : {}), { startup: 4, recovery: 6, active: 3 }), vx: 3, vy: -2, grounded: state !== S.FALLING && state !== S.RISING, chainIndex: ci, stateTimer: 2 };
          try { MW.CharacterArt.draw(g, f, flash, { spawn() {} }); } catch (e) { ok = false; err = state + ": " + e.message; }
        }
      }
    }
  }
  check("deuce art draws in every state, both facings, flash pass", ok, err);
}

// select screen: the roster grows to include her without breaking the layout
{
  require("../src/select.js");
  const order = MW.CHARACTER_ORDER, roster = order.map((id) => C[id]);
  const sel = new MW.SelectScreen(null, { roster, kinds: ["dummy", "aggressive", "spacing"], width: 1600, height: 900 });
  const cells = sel.rects.cells;
  const within = cells.every((c) => c.x >= 0 && c.y >= 0 && c.x + c.w <= 1600 && c.y + c.h <= 900);
  const clearOfStart = sel.rects.ai.every((b) => b.y + b.h < sel.rects.start.y) && cells.every((c) => c.y + c.h < sel.rects.ai[0].y);
  const clearOfPanels = cells.every((c) => c.x >= sel.rects.left.x + sel.rects.left.w && c.x + c.w <= sel.rects.right.x);
  check("select screen lays out every hero (incl. Deuce) on screen", cells.length === roster.length && within, cells.length + " cards");
  check("the roster grid, AI buttons and START do not overlap each other or the side panels", clearOfStart && clearOfPanels);
  check("Deuce comes right before Foundry in the roster", order.indexOf("foundry") === order.indexOf("deuce") + 1);
}
console.log(failures ? failures + " check(s) FAILED." : "All Deuce checks passed.");
process.exit(failures ? 1 : 0);
