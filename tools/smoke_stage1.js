// Stage 1 headless smoke test. Run: node tools/smoke_stage1.js
require("../src/config.js");
require("../src/characters.js");
require("../src/arena.js");
require("../src/fighter.js");
require("../src/projectiles.js");
require("../src/sim.js");
const MW = globalThis.MW;

const I = (o) => Object.assign({}, MW.IDLE_INTENT, o);
const H = MW.CHARACTERS.fighter.height; // Fighter body height
const newSim = () => new MW.Sim(MW.ARENA, [MW.CHARACTERS.fighter]);
const settle = (sim, n = 150) => { for (let i = 0; i < n; i++) sim.step([I({})]); };

let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  (" + detail + ")" : ""));
  if (!ok) failures++;
}

// 1. Spawn falls and lands on the top platform (y=300).
{
  const sim = newSim(); settle(sim);
  const f = sim.fighters[0];
  check("spawn lands on top platform", f.grounded && Math.abs(f.y - (300 - H)) < 0.01, "y=" + f.y.toFixed(2));
}

// 2. Run speed reaches runSpeed.
{
  const sim = newSim(); settle(sim);
  for (let i = 0; i < 20; i++) sim.step([I({ right: true })]);
  const f = sim.fighters[0];
  check("runs right at runSpeed", Math.abs(f.vx - MW.CHARACTERS.fighter.runSpeed) < 0.01 && f.facing === 1, "vx=" + f.vx.toFixed(2));
}

// 3. Jump, air jump, and third jump is refused.
{
  const sim = newSim(); settle(sim);
  const f = sim.fighters[0];
  sim.step([I({ jumpPressed: true })]); const vy1 = f.vy;
  sim.step([I({ jumpPressed: true })]); const vy2 = f.vy;
  sim.step([I({ jumpPressed: true })]); const vy3 = f.vy;
  check("ground jump goes up", vy1 < -10, "vy=" + vy1.toFixed(2));
  check("air jump goes up", vy2 < -10 && f.airJumpsLeft === 0, "vy=" + vy2.toFixed(2));
  check("third jump refused", vy3 > vy2, "vy3=" + vy3.toFixed(2));
}

// 4. Air jump refills on landing.
{
  const sim = newSim(); settle(sim);
  const f = sim.fighters[0];
  sim.step([I({ jumpPressed: true })]);
  sim.step([I({ jumpPressed: true })]);
  settle(sim);
  check("air jump refills after landing", f.grounded && f.airJumpsLeft === 1);
}

// 5. Drop through one-way platform lands on main floor (y=560).
{
  const sim = newSim(); settle(sim);
  const f = sim.fighters[0];
  sim.step([I({ downPressed: true, downHeld: true })]);
  settle(sim);
  check("drop-through lands on main floor", f.grounded && Math.abs(f.y - (560 - H)) < 0.01, "y=" + f.y.toFixed(2));
}

// 6. Cannot drop through the solid main floor.
{
  const sim = newSim(); settle(sim);
  const f = sim.fighters[0];
  sim.step([I({ downPressed: true, downHeld: true })]); settle(sim); // now on main floor
  sim.step([I({ downPressed: true, downHeld: true })]); settle(sim);
  check("solid floor cannot be dropped through", f.grounded && Math.abs(f.y - (560 - H)) < 0.01, "y=" + f.y.toFixed(2));
}

// 7. Jump up through a one-way platform from the main floor.
{
  const sim = newSim(); settle(sim);
  const f = sim.fighters[0];
  sim.step([I({ downPressed: true, downHeld: true })]); settle(sim); // main floor, x=640
  // move left to under the left platform (x 300..520), then jump
  for (let i = 0; i < 40; i++) sim.step([I({ left: true })]);
  while (f.x + 20 > 440) sim.step([I({ left: true })]);
  sim.step([I({ jumpPressed: true })]);
  for (let i = 0; i < 40; i++) sim.step([I({})]);
  check("can jump up onto a one-way platform", f.grounded && f.standingOn && f.standingOn.y === 430, "standingOn.y=" + (f.standingOn && f.standingOn.y));
}

// 8. Fast-fall is faster than normal fall.
{
  const fall = (fast) => {
    const sim = newSim(); const f = sim.fighters[0];
    f.x = 250; f.y = -100; f.vy = 0; f.invuln = 0;
    let t = 0;
    while (!f.grounded && t < 500) { sim.step([I({ downHeld: fast })]); t++; }
    return t;
  };
  const slow = fall(false), fast = fall(true);
  check("fast-fall reaches ground sooner", fast < slow, "normal=" + slow + " ticks, fast=" + fast + " ticks");
}

// 9. Blast zone respawns.
{
  const sim = newSim(); settle(sim);
  const f = sim.fighters[0];
  f.x = -2000;
  sim.step([I({})]);
  check("blast zone triggers respawn", f.respawns === 1 && f.invuln > 0 && f.x > 0, "respawns=" + f.respawns);
  sim.reset();
  check("reset clears respawn count", f.respawns === 0);
}

console.log(failures === 0 ? "\nAll checks passed." : "\n" + failures + " check(s) FAILED.");
process.exit(failures === 0 ? 0 : 1);
