// Errata Skill 3 (Phantom Recursion - three-way dash) smoke test. Run: node tools/smoke_errata_skill3.js
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

const F = C.errata, sk = F.skills[2], RC = sk && sk.attack.recursion;
check("phantom_recursion is in skill slot 2", !!sk && sk.id === "phantom_recursion");
check("cooldown 720 (12s), damage >= 25", sk && sk.cooldown === 720 && sk.attack.damage >= 25, sk ? "cd " + sk.cooldown + " dmg " + sk.attack.damage : "");
check("three copies with distinct dash delays and a readable windup", RC && RC.rush.delays.length === 3 && new Set(RC.rush.delays).size === 3 && RC.rush.windup >= 12);

function setup(x) {
  const sim = new MW.Sim(MW.ARENA, [F, C.fighter]);
  sim.fx = [];
  for (let i = 0; i < 120; i++) sim.step([I, I]);
  sim.fx.length = 0;
  const [a, b] = sim.fighters;
  a.invuln = b.invuln = 0; a.cooldowns = [0, 0, 0, 0];
  const p = MW.ARENA.platforms[0];
  a.x = 330; a.facing = 1; b.x = x || 620; b.facing = -1;
  a.y = p.y - a.stats.height; b.y = p.y - b.stats.height;
  return { sim, a, b };
}
const SKILL3 = intent({ skillPressed: [false, false, true, false] });
function run(sim, a, b, ticks, onTick) {
  const ev = [];
  for (let i = 0; i < ticks; i++) {
    sim.step([i === 0 ? SKILL3 : I, I]); b.invuln = 0;
    if (onTick) onTick(i);
    for (const e of sim.fx) if (e.type === "errata") ev.push(e);
    sim.fx.length = 0;
  }
  return ev;
}

// stationary enemy: copies LEFT / RIGHT / ABOVE, exactly one real hit, decoys harmless, nobody held, collapse
{
  const { sim, a, b } = setup();
  const hp0 = b.hp; let heldDuringDash = false, rec = null;
  const ev = run(sim, a, b, 120, () => {
    if (a.recursion && !rec) rec = a.recursion;
    if (a.recursion && b.state === MW.STATE.HITSTUN && !a.recursion.hit) heldDuringDash = true;
  });
  const split = ev.find((e) => e.kind === "recursion_split");
  check("emits recursion_split with 3 copies", !!split && split.copies.length === 3);
  const L = rec ? rec.lx : 0, T = rec ? rec.ly : 0;
  const cps = rec ? rec.copies : [];
  const left = cps.find((c) => c.name === "left"), right = cps.find((c) => c.name === "right"), top = cps.find((c) => c.name === "top");
  check("one copy spawns LEFT, one RIGHT and one ABOVE the enemy", left && right && top && left.sx < L - 100 && right.sx > L + 100 && top.sy < T - 100 && Math.abs(top.sx - L) < 2);
  check("the dashes are straight and cross at the enemy: left dashes right, right dashes left, top dives down",
    left && right && top && left.ex > L && left.sy === left.ey && right.ex < L && right.sy === right.ey && top.ey > top.sy && top.ex === top.sx);
  check("exactly one copy is real", cps.filter((c) => c.isReal).length === 1);
  const real = ev.filter((e) => e.kind === "recursion_strike" && e.isReal);
  check("one real strike lands on a stationary enemy", real.length === 1 && b.hp < hp0, "hp " + hp0 + " -> " + b.hp.toFixed(1));
  check("decoys do not damage (one hit's worth of damage at most)", hp0 - b.hp <= sk.attack.damage + 0.5, "lost " + (hp0 - b.hp).toFixed(1));
  check("the enemy is NOT held during the dashes", !heldDuringDash);
  check("collapse at the end, Errata not stuck", ev.some((e) => e.kind === "recursion_collapse") && !a.recursion && a.state !== MW.STATE.ATTACK_ACTIVE);
}

// counterplay: the left/right dashes run along the ground line (jump over them) and the top one dives down a vertical line (move out of it).
// So a jump that also drifts sideways beats all three, and the lanes are fixed (no homing).
const dodge = (b) => { b.y -= 260; b.x += 120; };
{
  const { sim, a, b } = setup();
  const hp0 = b.hp, W = RC.rush.windup;
  const ev = run(sim, a, b, 140, (i) => { if (i === 20) dodge(b); }); // jumps and drifts away after the copies appeared
  check("enemy that jumps clear and leaves the crossing point takes no damage (dashes do not home)", b.hp === hp0, "hp " + b.hp);
  check("a whiff emits no real strike", !ev.some((e) => e.kind === "recursion_strike" && e.isReal));
}
// each real direction is dodgeable but a stationary target is always hit: all 3 possible real copies tested
{
  const seen = new Set(); let allHit = true, allDodged = true;
  for (let seed = 1; seed <= 60 && seen.size < 3; seed++) {
    const mk = () => { const o = setup(); o.sim.rng = (() => { let k = seed * 37 + 11; return () => ((k = (k * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); })(); return o; };
    const o = mk(); let name = null;
    run(o.sim, o.a, o.b, 120, () => { if (o.a.recursion && !name) name = o.a.recursion.copies[o.a.recursion.realIdx].name; });
    if (!name || seen.has(name)) continue;
    seen.add(name);
    if (!(o.b.hp < 300)) allHit = false;
    const d = mk(); let dn = null;
    run(d.sim, d.a, d.b, 140, (i) => { if (d.a.recursion && !dn) dn = 1; if (i === 20) dodge(d.b); });
    if (d.b.hp < 300) allDodged = false;
  }
  check("all three directions (left, right, top) occur as the real one", seen.size === 3, [...seen].join(","));
  check("whichever one is real: standing still gets hit, jumping clear dodges", allHit && allDodged);
}

// real index and dash order are random
{
  const reals = new Set(), firsts = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const { sim, a, b } = setup();
    sim.rng = (() => { let k = seed * 37 + 11; return () => ((k = (k * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); })();
    for (let i = 0; i < 40; i++) {
      sim.step([i === 0 ? SKILL3 : I, I]); b.invuln = 0;
      if (a.recursion) { reals.add(a.recursion.realIdx); firsts.add(a.recursion.copies.findIndex((c) => c.delay === 0)); break; }
    }
  }
  check("which copy is real varies between casts", reals.size >= 2, [...reals].join(","));
  check("which copy dashes first varies between casts", firsts.size >= 2, [...firsts].join(","));
}

// enemy near the platform edge: Errata never ends up off the platform because of the spawn spots
{
  const { sim, a, b } = setup();
  const p = MW.ARENA.platforms[0];
  b.x = p.x + p.w - b.stats.width - 4; // right at the edge
  const ev = run(sim, a, b, 140);
  const spl = ev.find((e) => e.kind === "recursion_split");
  const onPlat = spl && spl.copies.every((c) => c.x >= p.x && c.x <= p.x + p.w);
  check("copies spawn over the enemy's platform even at the edge", !!onPlat);
}

// interrupted during the startup: nothing happens
{
  const { sim, a, b } = setup();
  const hp0 = b.hp;
  for (let i = 0; i < 6; i++) sim.step([i === 0 ? SKILL3 : I, I]);
  a.takeHit(b, { damage: 5, knockback: 3, launchH: 1, launchV: 0.3, stun: 20 }, 1);
  for (let i = 0; i < 80; i++) { sim.step([I, I]); b.invuln = 0; }
  check("a hit during the startup cancels it", b.hp === hp0 && !a.recursion);
}
{ const { sim, a } = setup(); sim.step([SKILL3, I]); check("cooldown is applied", a.cooldowns[2] > 600, "cd " + a.cooldowns[2]); }
{ const { sim, a } = setup(); a.errors = 5; sim.step([SKILL3, I]); check("corruptible (5 Error stacks consumed on activation)", a.errors === 0, "errors: " + a.errors); }

console.log(failures ? failures + " check(s) FAILED." : "All Phantom Recursion checks passed.");
process.exit(failures ? 1 : 0);
