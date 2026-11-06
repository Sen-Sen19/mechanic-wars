// Errata Skill 3 (Phantom Recursion) smoke test. Run: node tools/smoke_errata_skill3.js
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
const sk = F.skills[2];

// ── slot / config
check("phantom_recursion is in skill slot 2", !!sk && sk.id === "phantom_recursion");
check("phantom_recursion: cooldown 720 (12s), damage >= 25", sk && sk.cooldown === 720 && sk.attack.damage >= 25, sk ? "cd " + sk.cooldown + " dmg " + sk.attack.damage : "");
check("phantom_recursion: has 3 copies configured", sk && sk.attack.recursion && sk.attack.recursion.copies.length === 3, sk ? JSON.stringify(sk.attack.recursion.copies) : "");
check("phantom_recursion: each copy has distinct hitAt timing", sk && sk.attack.recursion && new Set(sk.attack.recursion.copies.map(c => c.hitAt)).size === 3);

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

const SKILL3 = intent({ skillPressed: [false, false, true, false] });

// ── Execution and event checks
{
  const { sim, a, b } = setup();
  a.x = 250; a.facing = 1; b.x = 600; b.facing = -1;
  const hp0 = b.hp;
  let splitSeen = false, strikeEvents = [], collapseSeen = false;

  for (let i = 0; i < 80; i++) {
    sim.step([i === 0 ? SKILL3 : I, I]);
    b.invuln = 0;
    for (const e of sim.fx) {
      if (e.type === "errata") {
        if (e.kind === "recursion_split") splitSeen = true;
        if (e.kind === "recursion_strike") strikeEvents.push(e);
        if (e.kind === "recursion_collapse") collapseSeen = true;
      }
    }
    sim.fx.length = 0;
  }

  check("Phantom Recursion: emits recursion_split event with 3 copies", splitSeen);
  check("Phantom Recursion: emits 3 recursion_strike events", strikeEvents.length === 3, "strikes " + strikeEvents.length);
  const realStrikes = strikeEvents.filter(s => s.isReal);
  const decoyStrikes = strikeEvents.filter(s => !s.isReal);
  check("Phantom Recursion: exactly 1 real strike and 2 decoys", realStrikes.length === 1 && decoyStrikes.length === 2, "real: " + realStrikes.length + ", decoy: " + decoyStrikes.length);
  check("Phantom Recursion: damages the enemy", b.hp < hp0, "hp " + hp0 + " -> " + b.hp.toFixed(1));
  check("Phantom Recursion: emits recursion_collapse at end", collapseSeen);
}

// ── Randomness of real copy selection
{
  const realIndices = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const { sim, a, b } = setup();
    sim.rng = (() => { let k = seed * 37 + 11; return () => ((k = (k * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); })();
    a.x = 400; b.x = 650;
    sim.step([SKILL3, I]); // cast
    for (let i = 0; i < 20; i++) {
      sim.step([I, I]);
      if (a.recursion) realIndices.add(a.recursion.realIdx);
    }
  }
  check("Phantom Recursion: real copy index is chosen randomly across runs", realIndices.size >= 2, "indices seen: " + [...realIndices].join(","));
}

// ── Cooldown is triggered
{
  const { sim, a, b } = setup();
  a.x = 400; b.x = 650;
  sim.step([SKILL3, I]);
  check("Phantom Recursion: cooldown is applied", a.cooldowns[2] > 600, "cd " + a.cooldowns[2]);
}

// ── Corruptible by Error Accumulation
{
  const { sim, a, b } = setup();
  a.x = 400; b.x = 650;
  a.errors = 5;
  sim.step([SKILL3, I]);
  check("Phantom Recursion: corruptible (5 Error stacks are consumed on activation)", a.errors === 0, "errors: " + a.errors);
}

console.log(failures ? failures + " check(s) FAILED." : "All Phantom Recursion checks passed.");
process.exit(failures ? 1 : 0);
