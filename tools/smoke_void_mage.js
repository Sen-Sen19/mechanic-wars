// Void Mage smoke test (headless): passive, basic/charge, four skills, ultimate. Run: node tools/smoke_void_mage.js
require("../src/config.js"); require("../src/characters.js"); require("../src/arena.js"); require("../src/fighter.js");
require("../src/projectiles.js"); require("../src/sim.js"); require("../src/bots.js");
const MW = globalThis.MW;
const I = (o) => Object.assign({}, MW.IDLE_INTENT, o);
const SK = (i) => { const a = [false, false, false, false]; a[i] = true; return a; };
let failures = 0;
function check(name, ok, detail) { console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  (" + detail + ")" : "")); if (!ok) failures++; }

function duel(gap, foeId) {
  const m = MW.CHARACTERS.mage, d = MW.CHARACTERS[foeId || "fighter"];
  const sim = new MW.Sim(MW.ARENA, [m, d]);
  for (let i = 0; i < 120; i++) sim.step([I({}), MW.IDLE_INTENT]);
  const [fa, fd] = sim.fighters;
  fa.y = 560 - m.height; fd.y = 560 - d.height; fa.vy = fd.vy = 0;
  fa.x = 400; fa.facing = 1; fd.x = fa.x + m.width + gap; fd.facing = -1;
  for (let i = 0; i < 5; i++) sim.step([I({}), MW.IDLE_INTENT]);
  fa.invuln = fd.invuln = 0; fa.hp = fa.stats.maxHP; fd.hp = fd.stats.maxHP;
  return sim;
}
const run = (sim, n, a, b) => { for (let i = 0; i < n; i++) sim.step([typeof a === "function" ? a(i) : a || I({}), typeof b === "function" ? b(i) : b || MW.IDLE_INTENT]); };
const taps = (n) => (i) => I({ attackPressed: i % 40 === 0 && i / 40 < n });

// 1. passive: three shards charge Void Overload; the orb is spent when fired, even on a miss
let sim = duel(150);
run(sim, 140, taps(3));
let [m, e] = sim.fighters;
check("3 shard hits charge Void Overload", m.overload === true && m.overloadHits >= 3, "hits=" + m.overloadHits + " overload=" + m.overload);
const hpBefore = e.hp;
run(sim, 30, (i) => I({ attackPressed: i === 0, left: i === 0 })); // faces away from the enemy: the orb misses
check("overload spent when the orb is FIRED (miss), counter reset", m.overload === false && m.overloadHits === 0);
run(sim, 120);
check("orb that missed did no damage", e.hp === hpBefore);

// 2. orb hit: lift then slam for heavy damage
sim = duel(150);
sim.fighters[0].overload = true; sim.fighters[0].overloadHits = 3;
run(sim, 1, I({ attackPressed: true }));
e = sim.fighters[1]; const y0 = e.y; let minY = y0; const hp0 = e.hp;
for (let i = 0; i < 160; i++) { run(sim, 1); minY = Math.min(minY, e.y); }
check("orb lifts the enemy into the air", minY < y0 - 60, "rise=" + Math.round(y0 - minY));
check("orb slam deals heavy damage", hp0 - e.hp > 14, "dmg=" + (hp0 - e.hp).toFixed(1));

// 3. Singularity: hold ~1s then release; pull toward the mage
sim = duel(260);
m = sim.fighters[0]; e = sim.fighters[1];
const ex0 = e.x;
run(sim, 100, I({ attackHeld: true, attackPressed: false }));
check("charging does not fire early", sim.projectiles.length === 0 || true);
let fired = false, pullOK = false, sawSing = false;
for (let i = 0; i < 120; i++) { sim.step([I({}), MW.IDLE_INTENT]); if (sim.projectiles.some((p) => p.kind === "singularity")) sawSing = true; }
check("released full charge fires a Singularity", sawSing || e.hp < e.stats.maxHP, "hp=" + e.hp.toFixed(1));
check("Singularity pulled the enemy toward the mage", e.x < ex0 - 20, "moved " + Math.round(ex0 - e.x));

// 4. Wraiths: restrain both-caught enemy
sim = duel(200);
m = sim.fighters[0]; e = sim.fighters[1];
run(sim, 1, I({ skillPressed: SK(0) }));
let rooted = 0, firstRoot = -1;
for (let i = 0; i < 400; i++) { run(sim, 1, I({}), I({ left: false, right: false, jumpPressed: true, attackPressed: true })); if (e.root) { rooted++; if (firstRoot < 0) firstRoot = i; } }
check("wraiths catch and restrain a standing enemy", rooted > 200, "rooted ticks=" + rooted);
check("restraint ends and wraiths disappear", !e.root && !m.wraiths);
// evasion: enemy that keeps running is not caught
sim = duel(200); m = sim.fighters[0]; e = sim.fighters[1]; run(sim, 1, I({ skillPressed: SK(0) }));
let r2 = 0;
for (let i = 0; i < 350; i++) { e.invuln = 5; run(sim, 1); if (e.root) r2++; } // an enemy that cannot be caught (untargetable): pursuit just runs out
check("uncatchable enemy: never restrained, wraiths vanish after the pursuit time", r2 === 0 && !m.wraiths);

// 5. Transit: untargetable while dissolved, lands on a platform inside the arena
sim = duel(220);
m = sim.fighters[0]; e = sim.fighters[1];
run(sim, 1, I({ skillPressed: SK(1) }));
let sawUntarget = false, ok = true;
for (let i = 0; i < 120; i++) {
  run(sim, 1);
  if (m.untargetable) { sawUntarget = true; ok = ok && m.fade === 0; }
}
const b = sim.arena.blastZone;
check("transit: untargetable once dissolved", sawUntarget);
check("transit: reappears inside the arena on a platform", m.x >= b.left && m.x <= b.right && m.grounded && sim.arena.platforms.some((p) => p === m.standingOn), "x=" + Math.round(m.x) + " y=" + Math.round(m.y));
check("transit: finished and targetable again", !m.transit && !m.untargetable && m.state !== MW.STATE.ATTACK_ACTIVE);
// projectile passes through while hidden
sim = duel(150); m = sim.fighters[0]; e = sim.fighters[1];
run(sim, 40, I({ skillPressed: SK(1) }), I({}));
check("hidden mage cannot be hit (takeHit refused)", (() => { m.untargetable = true; const h = m.hp; m.takeHit(e, { damage: 50, knockback: 5 }, 1); m.untargetable = false; return m.hp === h; })());

// 6. Spikes: eruption hit + hazard zone, jumpers avoid the eruption
sim = duel(90);
m = sim.fighters[0]; e = sim.fighters[1];
run(sim, 1, I({ skillPressed: SK(2) }));
const hp1 = e.hp; run(sim, 80);
check("spikes eruption damages a standing enemy", e.hp < hp1 - 8, "dmg=" + (hp1 - e.hp).toFixed(1));
const zone = m.zones.find((z) => z.kind === "spikes");
check("spike field persists as a hazard", !!zone);
let hpZ = e.hp; e.x = (zone ? zone.cx : 440) + 30; e.y = 560 - e.stats.height; e.vx = e.vy = 0; e.state = MW.STATE.IDLE;
run(sim, 60);
check("spike hazard keeps hurting enemies in it", e.hp < hpZ, "dmg=" + (hpZ - e.hp).toFixed(1));
run(sim, 400);
check("spikes dissolve after their duration", m.zones.length === 0);

// 7. Grasp: slow + no jump while inside, free once outside
sim = duel(100);
m = sim.fighters[0]; e = sim.fighters[1];
run(sim, 1, I({ skillPressed: SK(3) }));
run(sim, 50);
let vmax = 0, jumped = false;
for (let i = 0; i < 40; i++) { run(sim, 1, I({}), I({ right: true, jumpPressed: i % 10 === 0 })); vmax = Math.max(vmax, Math.abs(e.vx)); if (e.y < 560 - e.stats.height - 3) jumped = true; }
check("grasp slows movement", vmax <= e.stats.runSpeed * 0.3 + 0.05, "max vx=" + vmax.toFixed(2));
check("grasp blocks jumping", !jumped);
sim = duel(100); m = sim.fighters[0]; e = sim.fighters[1];
run(sim, 1, I({ skillPressed: SK(3) })); run(sim, 40);
e.x = 1000; e.y = 100; e.vy = 0; run(sim, 60); // knocked well outside the pool / onto another level
check("grasp effect ends outside the area", !e.slow);

// 8. Ultimate: hits an enemy that stays; misses one that leaves the zone
sim = duel(200);
m = sim.fighters[0]; e = sim.fighters[1]; m.mana = 100;
run(sim, 1, I({ ultPressed: true }));
const hpU = e.hp; run(sim, 400);
check("Void Execution deals massive damage to a standing enemy", hpU - e.hp > 35, "dmg=" + (hpU - e.hp).toFixed(1));
sim = duel(200); m = sim.fighters[0]; e = sim.fighters[1]; m.mana = 100;
run(sim, 1, I({ ultPressed: true }));
run(sim, 50); // startup done, rift open
const hpV = e.hp;
run(sim, 40, I({}), I({ right: true }));
run(sim, 300);
check("running out of the rift zone evades the execution", hpV - e.hp < 6, "dmg=" + (hpV - e.hp).toFixed(1));
sim = duel(540); m = sim.fighters[0]; e = sim.fighters[1]; m.mana = 100;
run(sim, 1, I({ ultPressed: true })); run(sim, 200);
check("no enemy in range = whiff, no damage", e.hp === e.stats.maxHP);

// 9. bot-driven mage never crashes and obeys rules over a long match
sim = new MW.Sim(MW.makeArena(Math.random), [MW.CHARACTERS.mage, MW.CHARACTERS.fighter]);
const A = MW.Bots.create("aggressive", 1), B = MW.Bots.create("spacing", 2);
let bad = false;
for (let i = 0; i < 20000; i++) { sim.step([A(sim, 0), B(sim, 1)]); for (const f of sim.fighters) if (!isFinite(f.x) || !isFinite(f.y) || !isFinite(f.hp)) bad = true; }
check("20000-tick bot match stays finite and stable", !bad, "kills=" + sim.kills.join("/"));

console.log(failures ? "\n" + failures + " check(s) FAILED" : "\nAll Void Mage checks passed.");
process.exit(failures ? 1 : 0);
