// Input-feel smoke test: buffering, air drift, interpolation data. Run: node tools/smoke_feel.js
require("../src/config.js");
require("../src/characters.js");
require("../src/arena.js");
require("../src/fighter.js");
require("../src/projectiles.js");
require("../src/sim.js");
require("../src/bots.js");
const MW = globalThis.MW;
const C = MW.CHARACTERS, S = MW.STATE, B = MW.CONFIG.inputBufferFrames;
const I = (o) => Object.assign({}, MW.IDLE_INTENT, o);
const D = () => MW.Bots.dummy();
let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  (" + detail + ")" : ""));
  if (!ok) failures++;
}
function settled(a, d) {
  const sim = new MW.Sim(MW.ARENA, [a, d || C.tank]);
  for (let i = 0; i < 120; i++) sim.step([I({}), D()]);
  return sim;
}

// jump pressed shortly before landing (no air jumps left) still jumps on landing
{
  const sim = settled(C.fighter);
  const f = sim.fighters[0];
  sim.step([I({ jumpPressed: true }), D()]);
  sim.step([I({ jumpPressed: true }), D()]); // air jump used
  while (f.vy < 0 || !f.grounded) {
    if (f.vy > 0 && f.y + f.stats.height > 300 - 40 && !f.grounded) break; // close to landing
    sim.step([I({}), D()]);
  }
  sim.step([I({ jumpPressed: true }), D()]); // too early: no air jumps left -> buffered
  let jumped = false;
  for (let i = 0; i < B + 2 && !jumped; i++) { sim.step([I({}), D()]); if (f.vy < -8) jumped = true; }
  check("jump pressed just before landing fires on landing (buffer)", jumped);
}

// jump pressed during hitstun fires as soon as hitstun ends
{
  const sim = settled(C.fighter, C.assassin);
  const [fa, fd] = sim.fighters;
  fd.takeHit(fa, C.fighter.attack, 1);
  const stun = fd.stateTimer;
  for (let i = 0; i < stun - 3; i++) sim.step([I({}), D()]);
  sim.step([I({}), I({ jumpPressed: true })]); // press 2-3 ticks before hitstun ends
  let jumped = false;
  for (let i = 0; i < 12 && !jumped; i++) { sim.step([I({}), D()]); if (fd.vy < -8) jumped = true; }
  check("jump pressed late in hitstun is not lost", jumped);
}

// attack pressed during hitstun fires when it ends
{
  const sim = settled(C.fighter, C.assassin);
  const [fa, fd] = sim.fighters;
  fd.takeHit(fa, C.fighter.attack, 1);
  const stun = fd.stateTimer;
  for (let i = 0; i < stun - 3; i++) sim.step([I({}), D()]);
  sim.step([I({}), I({ attackPressed: true })]);
  let attacked = false;
  for (let i = 0; i < 12 && !attacked; i++) { sim.step([I({}), D()]); if (fd.state === S.ATTACK_STARTUP) attacked = true; }
  check("attack pressed late in hitstun is not lost", attacked);
}

// air drift: steering works during an air attack, but not on the ground
{
  const sim = settled(C.assassin);
  const f = sim.fighters[0];
  sim.step([I({ jumpPressed: true }), D()]);
  for (let i = 0; i < 3; i++) sim.step([I({}), D()]);
  sim.step([I({ attackPressed: true }), D()]);
  const x0 = f.x;
  for (let i = 0; i < 6; i++) sim.step([I({ right: true }), D()]);
  check("can steer during an air attack", f.state.startsWith("attack") && f.vx > 1 && f.x > x0, "vx=" + f.vx.toFixed(2));
  check("facing does not flip mid-attack", f.facing === 1);

  const g = settled(C.assassin);
  const f2 = g.fighters[0];
  g.step([I({ attackPressed: true }), D()]);
  for (let i = 0; i < 3; i++) g.step([I({ left: true }), D()]);
  check("ground attack still roots the fighter", Math.abs(f2.vx) < 0.01 && f2.facing === 1);
}

// full movement sequence: run, jump, air jump, air attack, land, run again
{
  const sim = settled(C.fighter);
  const f = sim.fighters[0];
  for (let i = 0; i < 6; i++) sim.step([I({ right: true }), D()]);
  sim.step([I({ right: true, jumpPressed: true }), D()]);
  for (let i = 0; i < 5; i++) sim.step([I({ right: true }), D()]);
  sim.step([I({ right: true, jumpPressed: true }), D()]);
  sim.step([I({ right: true, attackPressed: true }), D()]);
  for (let i = 0; i < 40; i++) sim.step([I({ left: true }), D()]);
  check("run -> jump -> air jump -> air attack -> steer back works", f.airJumpsLeft === 0 || f.grounded);
}

// spamming attack while reversing the stick turns the fighter around (Fighter has a step-in chain)
for (const id of ["fighter", "assassin", "tank"]) {
  const sim = settled(C[id]);
  const f = sim.fighters[0];
  for (let i = 0; i < 30; i++) sim.step([I({ right: true, attackPressed: true }), D()]);
  const faced = f.facing;
  const x0 = f.x;
  for (let i = 0; i < 40; i++) sim.step([I({ left: true, attackPressed: true }), D()]);
  check(id + ": spam attack + stick reversed -> turns and moves left", faced === 1 && f.facing === -1 && f.vx <= 0, "facing " + faced + " -> " + f.facing);
}

// interpolation data
{
  const sim = settled(C.fighter);
  const f = sim.fighters[0];
  sim.step([I({ right: true }), D()]);
  check("previous position recorded for interpolation", f.px !== f.x && f.px < f.x);
  sim.step([I({ attackPressed: true }), D()]);
  const m = new MW.Sim(MW.ARENA, [C.mage, C.tank]);
  for (let i = 0; i < 120; i++) m.step([I({}), D()]);
  m.step([I({ attackPressed: true }), D()]);
  for (let i = 0; i < 22; i++) m.step([I({}), D()]);
  const p = m.projectiles[0];
  check("projectile records previous position", p && p.px < p.x);
  m.fighters[0].x = -3000; m.step([I({}), D()]);
  check("respawn does not interpolate across the screen", m.fighters[0].px === m.fighters[0].x);
}

console.log(failures === 0 ? "\nAll feel checks passed." : "\n" + failures + " check(s) FAILED.");
process.exit(failures === 0 ? 0 : 1);
