// Errata Skill 4 (Data Corruption) smoke test. Run: node tools/smoke_errata_skill4.js
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
const sk = F.skills[3];

// ── slot / config
check("data_corruption is in skill slot 3", !!sk && sk.id === "data_corruption");
check("data_corruption: projectile, piercing, damage >= 22", sk && sk.attack.type === "projectile" && sk.attack.piercing && sk.attack.damage >= 22, sk ? "type: " + sk.attack.type + ", dmg: " + sk.attack.damage : "");
check("data_corruption: wide wave size (>= 100) and long range (>= 900)", sk && sk.attack.projectile && sk.attack.projectile.size >= 100 && sk.attack.projectile.range >= 900, sk ? "size: " + sk.attack.projectile.size + ", range: " + sk.attack.projectile.range : "");
check("data_corruption: style is datacorruption", sk && sk.attack.projectile && sk.attack.projectile.style === "datacorruption");

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

const SKILL4 = intent({ skillPressed: [false, false, false, true] });

// ── Projectile launch and piercing check
{
  const { sim, a, b } = setup();
  const mainPlat = MW.ARENA.platforms[0]; // x: 240, y: 560, w: 800
  a.x = 300; a.facing = 1; b.x = 650; b.facing = -1;
  a.grounded = b.grounded = true;
  a.standingOn = b.standingOn = mainPlat;
  a.y = mainPlat.y - a.stats.height;
  b.y = mainPlat.y - b.stats.height;
  const hp0 = b.hp;
  let waveSpawned = false;
  let waveAliveAfterHit = false;

  for (let i = 0; i < 70; i++) {
    sim.step([i === 0 ? SKILL4 : I, I]);
    b.invuln = 0;
    const wave = sim.projectiles.find(p => p.ownerId === a.id && p.hit && p.hit.id === "data_corruption");
    if (wave) {
      waveSpawned = true;
      if (b.hp < hp0 && wave.alive) waveAliveAfterHit = true;
    }
  }

  check("Data Corruption: spawns the corruption wave projectile", waveSpawned);
  check("Data Corruption: damages enemy caught in its path", b.hp < hp0, "hp " + hp0 + " -> " + b.hp.toFixed(1));
  check("Data Corruption: wave pierces through enemy (still alive after connecting)", waveAliveAfterHit);
  check("Data Corruption: enemy is infected with dataCorrupt status (8 cycles)", b.dataCorrupt && b.dataCorrupt.cyclesLeft === 8);
}

// ── Recurring 1-second damage surges and cast interrupt check
{
  const { sim, a, b } = setup();
  const mainPlat = MW.ARENA.platforms[0];
  a.x = 300; a.facing = 1; b.x = 650; b.facing = -1;
  a.grounded = b.grounded = true;
  a.standingOn = b.standingOn = mainPlat;
  a.y = mainPlat.y - a.stats.height;
  b.y = mainPlat.y - b.stats.height;

  // hit with Skill 4
  for (let i = 0; i < 60; i++) {
    sim.step([i === 0 ? SKILL4 : I, I]);
    b.invuln = 0;
  }
  const hpAfterWave = b.hp;
  check("Data Corruption: target has dataCorrupt active", !!b.dataCorrupt);

  // Step until 1 tick before the 3-second cycle starts the 1-second surge
  const rem = b.dataCorrupt.intervalTimer;
  for (let i = 0; i < rem - 1; i++) {
    sim.step([I, I]);
    b.invuln = 0;
  }

  // Start dummy attack on b right before surge to check if surge cancels/interrupts
  b.state = MW.STATE.ATTACK_STARTUP;
  b.hit = Object.assign({}, C.fighter.attack);
  b.stateTimer = 20;

  // Step into the surge (starts 60-tick surge)
  sim.step([I, I]);
  b.invuln = 0;
  check("Data Corruption: 1-second surge begins (surgeTicks active)", b.dataCorrupt && b.dataCorrupt.surgeTicks > 0, "surgeTicks: " + (b.dataCorrupt && b.dataCorrupt.surgeTicks));
  check("Data Corruption: cyclesLeft decremented to 7", b.dataCorrupt && b.dataCorrupt.cyclesLeft === 7, "cyclesLeft: " + (b.dataCorrupt && b.dataCorrupt.cyclesLeft));

  // Run through the 60-tick (1-second) surge
  for (let i = 0; i < 60; i++) {
    sim.step([I, I]);
    b.invuln = 0;
  }

  check("Data Corruption: damages enemy over the 1-second surge", b.hp < hpAfterWave, "hp " + hpAfterWave.toFixed(1) + " -> " + b.hp.toFixed(1));
  check("Data Corruption: cancelled/interrupted enemy attack into hitstun", b.state === MW.STATE.HITSTUN && b.hit === null);
}

// ── Cooldown is triggered
{
  const { sim, a, b } = setup();
  a.x = 400; b.x = 650;
  sim.step([SKILL4, I]);
  check("Data Corruption: cooldown is applied (cd >= 700)", a.cooldowns[3] >= 700, "cd: " + a.cooldowns[3]);
}

// ── Corruptible by Error Accumulation
{
  const { sim, a, b } = setup();
  a.x = 400; b.x = 650;
  a.errors = 5;
  sim.step([SKILL4, I]);
  check("Data Corruption: corruptible (5 Error stacks consumed on use)", a.errors === 0, "errors: " + a.errors);
}

console.log(failures ? failures + " check(s) FAILED." : "All Data Corruption checks passed.");
process.exit(failures ? 1 : 0);
