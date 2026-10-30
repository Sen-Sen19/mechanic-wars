// Void Mage effects smoke test: every skill runs with sim.fx on and every draw function is called each tick against a no-op canvas.
require("../src/config.js"); require("../src/characters.js"); require("../src/arena.js"); require("../src/fighter.js");
require("../src/projectiles.js"); require("../src/sim.js"); require("../src/bots.js"); require("../src/mage_fx.js");
const MW = globalThis.MW;
const I = (o) => Object.assign({}, MW.IDLE_INTENT, o);
const SK = (i) => { const a = [false, false, false, false]; a[i] = true; return a; };
const grad = { addColorStop() {} };
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === "createRadialGradient" || k === "createLinearGradient" ? () => grad : () => {}), set: (t, k, v) => ((t[k] = v), true) });
let failures = 0, calls = 0;
const sim = new MW.Sim(MW.ARENA, [MW.CHARACTERS.mage, MW.CHARACTERS.fighter]);
sim.fx = [];
for (let i = 0; i < 120; i++) sim.step([I({}), MW.IDLE_INTENT]);
const [m, e] = sim.fighters;
m.x = 400; e.x = 560; m.invuln = e.invuln = 0;
const script = [[0, { skillPressed: SK(0) }], [420, { skillPressed: SK(1) }], [520, { skillPressed: SK(2) }], [760, { skillPressed: SK(3) }], [1100, { attackHeld: true }], [1200, { attackHeld: false }]];
const kinds = new Set();
try {
  for (let t = 0; t < 2600; t++) {
    let intent = I({});
    for (const [at, o] of script) if (t >= at && t < at + (o.attackHeld ? 90 : 1)) intent = I(o);
    if (t === 1500) { m.mana = 100; intent = I({ ultPressed: true }); }
    if (t > 1700 && t % 40 === 0) intent = I({ attackPressed: true });
    sim.step([intent, MW.IDLE_INTENT]);
    for (const ev of sim.fx) { kinds.add(ev.type + ":" + (ev.kind || "")); MW.MageFx.event(ev); }
    sim.fx.length = 0;
    MW.MageFx.tick();
    for (const f of sim.fighters) if (f.stats.id === "mage") { MW.MageFx.drawFighter(ctx, f); calls++; }
    for (const p of sim.projectiles) MW.MageFx.drawBolt(ctx, p);
    MW.MageFx.draw(ctx);
  }
} catch (err) { console.log("FAIL  fx threw: " + err.stack); failures++; }
console.log((failures ? "FAIL" : "PASS") + "  all void fx draw paths ran (" + calls + " frames)");
console.log("events seen: " + [...kinds].sort().join(", "));
process.exit(failures ? 1 : 0);
