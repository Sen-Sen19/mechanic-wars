// Errata Skill 2 (Frame Skip) smoke test. Run: node tools/smoke_errata_skill2.js
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

const F = C.errata;
const sk = F.skills[1];

// ── slot / config
check("frame_skip is in skill slot 1", !!sk && sk.id === "frame_skip");
check("frame_skip: melee, 9 s cooldown, medium-high damage (20-30)", sk && sk.attack.type === "melee" && sk.cooldown === 540 && sk.attack.damage >= 18 && sk.attack.damage <= 32, sk ? "cd " + sk.cooldown + " dmg " + sk.attack.damage : "no skill");
check("frame_skip: has frameSkip config block", sk && !!sk.attack.frameSkip, sk ? JSON.stringify(sk.attack.frameSkip) : "");
check("frame_skip: startup ~18, active ~6", sk && sk.attack.startup === 18 && sk.attack.active === 6, sk ? "startup " + sk.attack.startup + " active " + sk.attack.active : "");

// ── helper
function setup() {
  const sim = new MW.Sim(MW.ARENA, [F, C.fighter]);
  sim.fx = [];
  for (let i = 0; i < 120; i++) sim.step([I, I]);
  sim.fx.length = 0;
  const [a, b] = sim.fighters;
  a.invuln = b.invuln = 0;
  a.cooldowns = [0, 0, 0, 0];
  return { sim, a, b };
}
const SKILL2 = intent({ skillPressed: [false, true, false, false] });

// ── long-range snap: enemy is far away; after the skill Errata should be near the enemy
{
  const { sim, a, b } = setup();
  a.x = 200; a.facing = 1; b.x = 700; b.facing = -1;
  a.grounded = b.grounded = true;
  const plat = MW.ARENA.platforms[0];
  a.standingOn = b.standingOn = plat;
  a.y = b.y = plat.y - F.height;
  const startX = a.x;
  let snapDone = false, hitLanded = false;
  const hp0 = b.hp;
  for (let i = 0; i < 60; i++) {
    sim.step([i === 0 ? SKILL2 : I, I]);
    b.invuln = 0;
    // detect frame_skip_in event
    for (const e of sim.fx) if (e.type === "errata" && e.kind === "frame_skip_in") snapDone = true;
    sim.fx.length = 0;
    if (b.hp < hp0) hitLanded = true;
  }
  const nearEnemy = Math.abs((a.x + F.width / 2) - (b.x + C.fighter.width / 2)) < 150;
  check("Frame Skip: Errata teleports toward the far enemy", snapDone, "startX " + Math.round(startX) + " endX " + Math.round(a.x));
  check("Frame Skip: Errata ends up near the enemy", nearEnemy, "gap " + Math.round(Math.abs(a.x - b.x)));
  check("Frame Skip: the strike lands and damages the enemy", hitLanded, "hp " + hp0 + " -> " + b.hp.toFixed(1));
}

// ── close range: enemy already within snapRange — no teleport, still hits
{
  const { sim, a, b } = setup();
  const plat = MW.ARENA.platforms[0];
  a.x = 500; b.x = 500 + F.width + 6; a.facing = 1; b.facing = -1;
  a.grounded = b.grounded = true;
  a.standingOn = b.standingOn = plat;
  a.y = b.y = plat.y - F.height;
  const startX = a.x;
  let snapped = false;
  const hp0 = b.hp;
  for (let i = 0; i < 60; i++) {
    sim.step([i === 0 ? SKILL2 : I, I]);
    b.invuln = 0;
    for (const e of sim.fx) if (e.type === "errata" && e.kind === "frame_skip_in") snapped = true;
    sim.fx.length = 0;
  }
  check("Frame Skip: no teleport when already in range", !snapped, "snapped " + snapped);
  check("Frame Skip: still hits the enemy at close range", b.hp < hp0, "hp " + hp0.toFixed(1) + " -> " + b.hp.toFixed(1));
}

// ── cooldown starts after use
{
  const { sim, a, b } = setup();
  a.x = 400; b.x = 700; a.facing = 1;
  for (let i = 0; i < 40; i++) { sim.step([i === 0 ? SKILL2 : I, I]); b.invuln = 0; }
  check("Frame Skip: cooldown starts after use", a.cooldowns[1] > 400, "cd " + a.cooldowns[1]);
}

// ── afterimage is left at the launch position
{
  const { sim, a, b } = setup();
  a.x = 200; b.x = 700; a.facing = 1;
  const plat = MW.ARENA.platforms[0];
  a.grounded = b.grounded = true; a.standingOn = b.standingOn = plat;
  a.y = b.y = plat.y - F.height;
  for (let i = 0; i < 25; i++) { sim.step([i === 0 ? SKILL2 : I, I]); b.invuln = 0; sim.fx.length = 0; }
  check("Frame Skip: afterimage left at launch spot", a.afterimages.length > 0, "images " + a.afterimages.length);
}

// ── corruptible: Error Accumulation can corrupt it
{
  // We can't easily force a specific effect without a forced() helper, but we can
  // check that at 5 stacks the skill uses applyCorruption and comes out as a corrupted hit.
  const env_a_errors = (() => {
    const { sim, a, b } = setup();
    a.x = 400; b.x = 700; a.facing = 1;
    a.errors = 5;
    // applyCorruption is called inside useSkill; we can observe a.errors being reset to 0
    for (let i = 0; i < 5; i++) { sim.step([i === 0 ? SKILL2 : I, I]); b.invuln = 0; }
    return a.errors;
  })();
  check("Frame Skip: corruptible (5 Error stacks are consumed on use)", env_a_errors === 0, "errors after cast " + env_a_errors);
}

// ── Errata faces the enemy after the snap
{
  const { sim, a, b } = setup();
  a.x = 800; a.facing = -1; b.x = 200; b.facing = 1; // Errata is to the right, enemy to the left
  const plat = MW.ARENA.platforms[0];
  a.grounded = b.grounded = true; a.standingOn = b.standingOn = plat;
  a.y = b.y = plat.y - F.height;
  for (let i = 0; i < 25; i++) { sim.step([i === 0 ? SKILL2 : I, I]); b.invuln = 0; sim.fx.length = 0; }
  check("Frame Skip: Errata faces the enemy after the snap", a.facing === -1, "facing " + a.facing + " (enemy is left of snap position)");
}

console.log(failures ? failures + " check(s) FAILED." : "All Frame Skip checks passed.");
process.exit(failures ? 1 : 0);
