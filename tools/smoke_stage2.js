// Stage 2 smoke test: character data + shared state machine. Run: node tools/smoke_stage2.js
require("../src/config.js");
require("../src/characters.js");
require("../src/arena.js");
require("../src/fighter.js");
require("../src/projectiles.js");
require("../src/sim.js");
const MW = globalThis.MW;

const I = (o) => Object.assign({}, MW.IDLE_INTENT, o);
const settle = (sim, n = 150) => { for (let i = 0; i < n; i++) sim.step([I({})]); };
const newSim = (c) => new MW.Sim(MW.ARENA, [c]);

let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  (" + detail + ")" : ""));
  if (!ok) failures++;
}

const C = MW.CHARACTERS;
const order = MW.CHARACTER_ORDER;

// --- data integrity ---
const numKeys = ["width", "height", "maxHP", "armor", "weight", "runSpeed", "jumpStrength", "airJumpStrength",
  "groundAccel", "groundFriction", "airAccel", "airDrag", "maxAirJumps", "maxFallSpeed", "fastFallSpeed", "dropThroughFrames"];
const atkKeys = ["damage", "startup", "recovery", "knockback"];
for (const id of order) {
  const c = C[id];
  let ok = c && c.id === id && typeof c.name === "string" && typeof c.color === "string" && typeof c.look === "string";
  for (const k of numKeys) ok = ok && Number.isFinite(c[k]) && c[k] >= 0;
  const a = c.attack;
  ok = ok && a && (a.type === "melee" || a.type === "projectile");
  for (const k of atkKeys) ok = ok && Number.isFinite(a[k]) && a[k] > 0;
  if (a.type === "melee") ok = ok && Number.isFinite(a.active) && Number.isFinite(a.range) && a.range > 0;
  if (a.type === "projectile") ok = ok && a.projectile && a.projectile.speed > 0 && a.projectile.range > 0 && a.projectile.size > 0;
  check("data complete: " + id, !!ok);
}
check("five characters in order list", order.length === 5 && new Set(order).size === 5 && Object.keys(C).length === 5);

// --- identity relationships (the intended design, encoded as checks) ---
const f = C.fighter, m = C.mage, a = C.assassin, h = C.hitter, t = C.tank;
check("assassin is fastest", order.every((id) => id === "assassin" || C[id].runSpeed < a.runSpeed));
check("tank is slowest", order.every((id) => id === "tank" || C[id].runSpeed > t.runSpeed));
check("tank has most HP", order.every((id) => id === "tank" || C[id].maxHP < t.maxHP));
check("assassin has least HP and armor", order.every((id) => id === "assassin" || (C[id].maxHP > a.maxHP && C[id].armor > a.armor)));
check("tank has highest armor and weight", order.every((id) => id === "tank" || (C[id].armor < t.armor && C[id].weight < t.weight)));
check("tank armor stays modest (<= 40% reduction)", 100 / (100 + t.armor) >= 0.6, "takes " + (100 / (100 + t.armor) * 100).toFixed(0) + "% damage");
check("hitter hits harder than assassin, with stronger knockback than assassin and fighter", h.attack.damage > a.attack.damage && h.attack.knockback > f.attack.knockback && h.attack.knockback > a.attack.knockback);
// Total cycle cap raised 18 -> 33 ticks in Stage 7: a 18-tick shockwave cycle out-traded every matchup in the balance sim.
check("hitter attacks quickly: shorter startup than fighter, committed recovery", h.attack.startup < f.attack.startup && h.attack.startup + h.attack.recovery <= 33);
check("hitter is quick but slower than assassin", h.runSpeed > f.runSpeed && h.runSpeed < a.runSpeed);
check("hitter is lighter and smaller than fighter (fighter is the big body)", h.width < f.width && h.height < f.height && h.weight < f.weight);
check("fighter is bigger than every other non-tank character", order.every((id) => id === "fighter" || id === "tank" || (C[id].width < f.width && C[id].height < f.height)));
check("mage has the slowest basic attack of all (startup + recovery)", order.every((id) => id === "mage" || (C[id].attack.startup + C[id].attack.recovery) < m.attack.startup + m.attack.recovery));
check("mage + hitter are projectile, rest melee", m.attack.type === "projectile" && h.attack.type === "projectile" && [f, a, t].every((c) => c.attack.type === "melee"));
check("mage bolt out-ranges and out-speeds hitter shockwave", m.attack.projectile.range > h.attack.projectile.range && m.attack.projectile.speed > h.attack.projectile.speed);
check("hitter shockwave reaches well beyond melee range", h.attack.projectile.range > 2 * Math.max(f.attack.range, a.attack.range, t.attack.range));
check("mage is less durable than fighter", m.maxHP < f.maxHP && m.armor < f.armor);

// --- movement per character ---
for (const id of order) {
  const c = C[id];

  let sim = newSim(c); settle(sim);
  let fi = sim.fighters[0];
  check(id + ": lands and idles", fi.grounded && fi.state === MW.STATE.IDLE, "state=" + fi.state);

  for (let i = 0; i < 15; i++) sim.step([I({ right: true })]); // short run: stay on the small top platform
  check(id + ": reaches its own runSpeed", Math.abs(fi.vx - c.runSpeed) < 0.01 && fi.state === MW.STATE.RUN, "vx=" + fi.vx.toFixed(2));

  // single jump from the main floor must reach the 130px-high side platform
  sim = newSim(c); settle(sim);
  fi = sim.fighters[0];
  sim.step([I({ downPressed: true, downHeld: true })]); settle(sim); // main floor
  while (fi.x + c.width / 2 > 420) sim.step([I({ left: true })]);
  for (let i = 0; i < 25; i++) sim.step([I({})]); // stop sliding
  sim.step([I({ jumpPressed: true })]);
  check(id + ": jump leaves ground (rising)", fi.state === MW.STATE.RISING);
  for (let i = 0; i < 60; i++) sim.step([I({})]);
  check(id + ": single jump reaches side platform", fi.grounded && fi.standingOn && fi.standingOn.y === 430, "standingOn.y=" + (fi.standingOn && fi.standingOn.y));

  // air jump limit
  sim = newSim(c); settle(sim);
  fi = sim.fighters[0];
  sim.step([I({ jumpPressed: true })]);
  sim.step([I({ jumpPressed: true })]);
  const vy2 = fi.vy;
  sim.step([I({ jumpPressed: true })]);
  check(id + ": exactly one air jump", fi.vy > vy2 && fi.airJumpsLeft === 0);

  // drop-through
  sim = newSim(c); settle(sim);
  fi = sim.fighters[0];
  sim.step([I({ downPressed: true, downHeld: true })]); settle(sim);
  check(id + ": drop-through reaches main floor", fi.grounded && Math.abs(fi.y - (560 - c.height)) < 0.01, "y=" + fi.y.toFixed(2));
}

// --- state machine gating ---
{
  const sim = newSim(C.fighter); settle(sim);
  const fi = sim.fighters[0];
  fi.state = MW.STATE.HITSTUN; fi.stateTimer = 999; // simulate a non-locomotion state
  const x0 = fi.x;
  for (let i = 0; i < 20; i++) sim.step([I({ right: true, jumpPressed: i === 0 })]);
  check("non-locomotion state ignores player input", fi.x === x0 && fi.grounded && fi.state === MW.STATE.HITSTUN);
}

// --- character swap ---
{
  const sim = newSim(C.fighter); settle(sim);
  sim.setCharacter(0, C.tank);
  const fi = sim.fighters[0];
  check("setCharacter swaps stats and respawns", fi.stats.id === "tank" && !fi.grounded && fi.respawns === 0 && fi.x === MW.ARENA.spawns[0].x - C.tank.width / 2);
}

console.log(failures === 0 ? "\nAll Stage 2 checks passed." : "\n" + failures + " check(s) FAILED.");
process.exit(failures === 0 ? 0 : 1);
