// Event Horizon (Void Mage ultimate) smoke test, headless. Run: node tools/smoke_event_horizon.js
// Checks the sim side (grab must connect, 5 spaced piercing hits, slam is the biggest hit, victim held, miss / interrupt / KO are safe)
// and that every new draw path runs without throwing against a no-op canvas.
require("../src/config.js"); require("../src/characters.js"); require("../src/arena.js"); require("../src/fighter.js");
require("../src/projectiles.js"); require("../src/sim.js"); require("../src/bots.js"); require("../src/mage_fx.js");
const MW = globalThis.MW, S = MW.STATE;
const I = (o) => Object.assign({}, MW.IDLE_INTENT, o);
let failures = 0;
const check = (name, ok, extra) => { console.log((ok ? "PASS  " : "FAIL  ") + name + (extra ? "  (" + extra + ")" : "")); if (!ok) failures++; };
const grad = { addColorStop() {} };
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === "createRadialGradient" || k === "createLinearGradient" ? () => grad : () => {}), set: (t, k, v) => ((t[k] = v), true) });
const C = MW.CHARACTERS.mage.ultimate.attack.execution;

// A duel on the main stage, mage on the left, foe `gap` px to the right. fx events are collected with their tick.
function duel(gap, foe, mx) {
  mx = mx || 480;
  const sim = new MW.Sim(MW.ARENA, [MW.CHARACTERS.mage, MW.CHARACTERS[foe || "fighter"]]);
  sim.fx = [];
  const [m, e] = sim.fighters;
  m.x = mx; e.x = mx + gap; m.y = 560 - m.stats.height - 2; e.y = 560 - e.stats.height - 2;
  for (let i = 0; i < 40; i++) sim.step([I({}), MW.IDLE_INTENT]);
  m.x = mx; e.x = mx + gap; m.invuln = e.invuln = 0; m.mana = 100; e.hp = e.stats.maxHP;
  return { sim, m, e, log: [], hits: [], drawn: 0 };
}
function step(D, n, i0, i1, draw) {
  for (let k = 0; k < n; k++) {
    const { sim, m, e } = D, hp = e.hp, t = (D.t = (D.t || 0) + 1);
    sim.step([i0 || I({}), i1 || MW.IDLE_INTENT]);
    for (const ev of sim.fx) { D.log.push([t, ev.kind || ev.type]); MW.MageFx.event(ev); }
    sim.fx.length = 0; MW.MageFx.tick();
    if (e.hp < hp - 0.001) D.hits.push({ t, dmg: hp - e.hp, state: e.state });
    if (m.execution && ["lift", "impale", "windup", "slam"].includes(m.execution.phase)) { D.heldN = (D.heldN || 0) + 1; if (e.state === S.HITSTUN) D.held = (D.held || 0) + 1; }
    if (draw !== false) { MW.MageFx.lift(m); MW.MageFx.drawBack(ctx, sim, 1); for (const f of sim.fighters) if (f.stats.id === "mage") MW.MageFx.drawFighter(ctx, f); MW.MageFx.drawFront(ctx, sim, 1); MW.MageFx.draw(ctx); D.drawn++; }
  }
}
const kinds = (D) => D.log.map((x) => x[1]);

// 1. A standing enemy: grab connects, 5 piercing hits spaced by impaleGap, then the slam as the biggest single hit
let D = duel(220); step(D, 1, I({ ultPressed: true })); step(D, 420);
const imp = D.hits.filter((h) => h.dmg < 20), slam = D.hits.filter((h) => h.dmg >= 20);
const total = D.hits.reduce((a, h) => a + h.dmg, 0);
check("ultimate is named Event Horizon", MW.CHARACTERS.mage.ultimate.name === "Event Horizon");
check("5 distinct piercing hits", imp.length === C.impales, "hits=" + imp.length);
check("piercing hits are spaced so each is readable", imp.every((h, i) => i === 0 || h.t - imp[i - 1].t === C.impaleGap), imp.map((h) => h.t).join(","));
check("exactly one slam and it is the largest single hit", slam.length === 1 && slam[0].dmg > Math.max(...imp.map((h) => h.dmg)), slam.map((h) => h.dmg.toFixed(1)).join(","));
check("the slam comes after every piercing hit", slam[0] && slam[0].t > imp[imp.length - 1].t);
check("total damage is about 65-80 (before ring-out) on a Fighter", total >= 58 && total <= 85, "total=" + total.toFixed(1));
check("no blast-zone ring-out from a slam in the middle of the stage", D.e.hp > D.e.stats.maxHP - 100 && total < 90, "hp=" + D.e.hp.toFixed(1));
check("victim cannot act the whole time it is held", D.held === D.heldN && D.heldN > 40, "held " + D.held + "/" + D.heldN);
const order = kinds(D).filter((k) => ["rift_open", "grab", "impale", "windup", "slam", "release", "rift_close"].includes(k));
check("fx events come in the right order", order.join(" ") === "rift_open grab " + "impale ".repeat(5) + "windup slam release rift_close".trim(), order.join(" "));
check("victim is released: no control left and it is not stuck", !D.e.ctl && D.m.execution === null);
step(D, 200, I({}), I({}));
check("both fighters act normally again afterwards", D.m.state !== S.ATTACK_ACTIVE && D.e.state !== S.HITSTUN && D.m.untargetable !== true, "m=" + D.m.state + " e=" + D.e.state);
check("every draw path ran (back / fighter / front)", D.drawn > 600, "frames=" + D.drawn);

// 2. The grab can be dodged: leave the zone while the rift opens -> no piercing, rift closes, Mage recovers
D = duel(220); step(D, 1, I({ ultPressed: true })); step(D, 62); step(D, 40, I({}), I({ right: true })); step(D, 300);
check("dodging the grab = no damage and no execution", D.hits.length === 0 && !kinds(D).includes("impale") && !kinds(D).includes("grab"), "hits=" + D.hits.length);
check("a missed grab still closes the rift", kinds(D).includes("rift_miss") && kinds(D).includes("rift_close"));
check("Mage recovers after a miss", D.m.execution === null && D.m.state !== S.ATTACK_ACTIVE);

// 3. Nobody in range: pure whiff
D = duel(560, "fighter", 300); step(D, 1, I({ ultPressed: true })); step(D, 250);
check("nobody in range = nothing happens", D.hits.length === 0 && !kinds(D).includes("rift_open"));

// 4. The startup can be interrupted: a hit on the Mage during startup cancels everything
D = duel(60); step(D, 1, I({ ultPressed: true }), I({ attackPressed: true })); step(D, 20, I({}), I({ attackPressed: true })); step(D, 300);
check("interrupting the startup cancels the ultimate", !kinds(D).includes("rift_open") && !kinds(D).includes("impale"), "events=" + kinds(D).join(","));

// 5. KO mid-execution: no more damage events after the kill, the animation still finishes and the Mage recovers
D = duel(220); D.e.hp = 14; step(D, 1, I({ ultPressed: true })); step(D, 400);
check("a victim killed mid-execution stops taking damage", D.sim.kills[0] === 1 && D.hits.length === 3, "kills=" + D.sim.kills[0] + " hits=" + D.hits.length);
check("the entity still dissolves and the rift closes after a KO", kinds(D).includes("release") && kinds(D).includes("rift_close"));
check("the Mage is free after a KO finish", D.m.execution === null && D.m.state !== S.ATTACK_ACTIVE);

// 6. The Mage is knocked out of it after the grab: the entity tears away, nothing stays held
D = duel(220); step(D, 1, I({ ultPressed: true })); step(D, 125);
const hpPre = D.e.hp; D.m.takeHit && 0; step(D, 3); 
D.sim.fighters[0].state = S.HITSTUN; D.sim.fighters[0].stateTimer = 20; step(D, 80);
check("Mage hit mid-execution: execution ends and victim is freed", D.m.execution === null && !D.e.ctl, "hpLost=" + (hpPre - D.e.hp).toFixed(1));

// 7. Bot-driven match stays finite over a long run, with the new draw hooks running every tick
const sim = new MW.Sim(MW.makeArena(Math.random), [MW.CHARACTERS.mage, MW.CHARACTERS.fighter]); sim.fx = [];
const A = MW.Bots.create("aggressive", 1), B = MW.Bots.create("spacing", 2); let bad = false;
for (let i = 0; i < 12000; i++) {
  sim.sim = null; sim.step([A(sim, 0), B(sim, 1)]);
  for (const ev of sim.fx) MW.MageFx.event(ev); sim.fx.length = 0; MW.MageFx.tick();
  for (const f of sim.fighters) if (f.stats.id === "mage") MW.MageFx.lift(f);
  MW.MageFx.drawBack(ctx, sim, 0.5); MW.MageFx.drawFront(ctx, sim, 0.5); MW.MageFx.draw(ctx);
  for (const f of sim.fighters) if (!isFinite(f.x) || !isFinite(f.y) || !isFinite(f.hp)) bad = true;
}
check("12000-tick bot match with the new draw hooks stays finite", !bad);

console.log(failures ? "\n" + failures + " check(s) FAILED" : "\nAll Event Horizon checks passed.");
process.exit(failures ? 1 : 0);
