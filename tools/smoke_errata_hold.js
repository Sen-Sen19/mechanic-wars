// Errata hold key (Unstable Rendering) test: tap vs hold, charge time, 5 hops, afterimages, charges + recharge, cancel, steering, safe landing.
// Run: node tools/smoke_errata_hold.js
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

const H = C.errata.hold, U = H && H.attack && H.attack.unstable;
check("config: hold key with 5 hops, 0.8 s charge, 3 charges, 4 s recharge", !!U && U.hops === 5 && U.chargeTime === 48 && U.hops * U.hopTicks === 30 && H.charges === 3 && H.rechargeTime === 240);

function setup(foeX) {
  const sim = new MW.Sim(MW.ARENA, [C.errata, C.fighter]);
  sim.fx = [];
  for (let i = 0; i < 150; i++) sim.step([I, I]);
  sim.fx.length = 0;
  const [a, b] = sim.fighters;
  a.invuln = b.invuln = 0;
  a.x = 600; a.facing = 1; b.x = foeX === undefined ? 1000 : foeX; b.facing = -1;
  a.vx = 0; b.vx = 0;
  return { sim, a, b };
}
const HOLD = intent({ attackPressed: true, attackHeld: true }), KEEP = intent({ attackHeld: true });
// hold the button for `n` ticks (press on tick 0), then let go and run `after` more ticks. Collects errata events.
function run(env, n, after, steer) {
  const { sim } = env, ev = [];
  for (let i = 0; i < n + after; i++) {
    const held = i < n;
    const base = i === 0 ? HOLD : held ? KEEP : I;
    const inp = steer ? Object.assign({}, base, steer) : base;
    sim.step([inp, I]);
    for (const e of sim.fx) if (e.type === "errata") ev.push(e);
    sim.fx.length = 0;
    env.b.invuln = 0;
  }
  return ev;
}
const hops = (ev) => ev.filter((e) => e.kind === "hop");

// ── a quick tap is still the basic attack (no hops, no charge spent)
{
  const env = setup(), { a, b } = env;
  b.x = a.x + 40; // in reach
  const hp0 = b.hp;
  const ev = run(env, 4, 40);
  check("tap = basic attack: hits the enemy, no hops, no charge spent", hops(ev).length === 0 && a.holdCharges === 3 && b.hp < hp0, "hp " + hp0 + " -> " + b.hp);
}

// ── a full hold: charges for 0.8 s, then exactly 5 hops over 0.5 s
{
  const env = setup(), { sim, a } = env;
  const x0 = a.x, ev = [];
  let firstHop = -1, lastHop = -1, sawCharge = false, maxP = 0;
  for (let i = 0; i < 130; i++) {
    sim.step([i === 0 ? HOLD : KEEP, I]);
    if (a.unstableCharge() >= 0) { sawCharge = true; maxP = Math.max(maxP, a.unstableCharge()); }
    for (const e of sim.fx) if (e.type === "errata") { ev.push(e); if (e.kind === "hop") { if (firstHop < 0) firstHop = i; lastHop = i; } }
    sim.fx.length = 0;
    env.b.invuln = 0;
  }
  check("charging: the charge fraction rises toward 1 while held", sawCharge && maxP > 0.9, "max " + maxP.toFixed(2));
  check("exactly 5 hops", hops(ev).length === 5, "hops " + hops(ev).length);
  check("first hop lands about 0.8 s after the press", firstHop >= 44 && firstHop <= 52, "tick " + firstHop);
  check("the 5 hops take about 0.5 s", lastHop - firstHop >= 22 && lastHop - firstHop <= 30, (lastHop - firstHop) + " ticks");
  check("one stored charge is spent", a.holdCharges === 2, "charges " + a.holdCharges);
  check("he moved toward the enemy (no direction held)", a.x > x0 + 100, "x " + x0 + " -> " + Math.round(a.x));
  check("no Error stacks and no corruption from the hold key", a.errors === 0 && !ev.some((e) => e.kind === "proc"));
}

// ── afterimages are really created, one per hop
{
  const env = setup(), { sim, a } = env;
  let maxImages = 0;
  for (let i = 0; i < 100; i++) { sim.step([i === 0 ? HOLD : KEEP, I]); maxImages = Math.max(maxImages, a.afterimages.length); sim.fx.length = 0; }
  check("5 afterimages exist at once", maxImages === 5, "max " + maxImages);
  for (let i = 0; i < 60; i++) { sim.step([I, I]); sim.fx.length = 0; }
  check("afterimages disappear again", a.afterimages.length === 0);
}

// ── release too early = cancelled, nothing spent
{
  const env = setup(), { a } = env;
  const ev = run(env, 30, 80);
  check("release at 0.5 s cancels: no hops, no charge spent", hops(ev).length === 0 && a.holdCharges === 3 && !a.unstable);
}

// ── a hit during the charge cancels it
{
  const env = setup(), { sim, a, b } = env;
  let ev = [];
  for (let i = 0; i < 90; i++) {
    sim.step([i === 0 ? HOLD : KEEP, I]);
    if (i === 30) { b.invuln = 0; a.invuln = 0; a.takeHit(b, { type: "melee", damage: 5, knockback: 2, stun: 20 }, 1); }
    for (const e of sim.fx) if (e.type === "errata") ev.push(e);
    sim.fx.length = 0;
  }
  check("a hit while charging cancels it: no hops, no charge spent", hops(ev).length === 0 && a.holdCharges === 3);
}

// ── charges: no charge = the hold is just a tap, and they come back one per 4 s (max 3)
{
  const env = setup(), { sim, a } = env;
  const used = [];
  for (let k = 0; k < 2; k++) { a.x = 600; a.vx = 0; hops(run(env, 55, 30)); used.push(a.holdCharges); }
  check("each full use spends one stored charge (3 -> 2 -> 1, minus any that came back)", used[0] <= 2 && used[1] <= used[0] && used[1] >= 0, used.join(","));
  a.holdCharges = 0; a.holdRecharge = 0; a.x = 600; a.vx = 0;
  const ev0 = run(env, 70, 20);
  check("with 0 charges the hold does nothing special (no hops)", hops(ev0).length === 0 && a.holdCharges === 0);
  a.holdCharges = 0; a.holdRecharge = 0;
  for (let i = 0; i < 239; i++) { sim.step([I, I]); sim.fx.length = 0; }
  const before = a.holdCharges;
  sim.step([I, I]); sim.fx.length = 0;
  check("one charge comes back after exactly 4 s (240 ticks)", before === 0 && a.holdCharges === 1, "before " + before + ", after " + a.holdCharges);
  for (let i = 0; i < 800; i++) { sim.step([I, I]); sim.fx.length = 0; }
  check("charges never go above 3", a.holdCharges === 3);
}

// ── steering: the held direction decides where he goes (random but not uncontrollable)
{
  function trial(dirIntent) {
    const env = setup(1000), { sim, a } = env;
    a.x = 640; a.vx = 0;
    const x0 = a.x;
    run(env, 54, 40, dirIntent);
    return a.x - x0;
  }
  let r = 0, l = 0, N = 30, rs = [], mn = 1e9, mx = -1e9;
  for (let i = 0; i < N; i++) { const d = trial({ right: true }); r += d; rs.push(d); mn = Math.min(mn, d); mx = Math.max(mx, d); }
  for (let i = 0; i < N; i++) l += trial({ left: true });
  check("holding right sends him right (average)", r / N > 150, "avg " + Math.round(r / N));
  check("holding left sends him left (average)", l / N < -150, "avg " + Math.round(l / N));
  check("destinations are NOT always the same (unpredictable)", mx - mn > 40, "spread " + Math.round(mn) + " .. " + Math.round(mx));
}

// ── safety: never outside the arena, never falls into the void, over many random layouts and edge starts
{
  let bad = 0, ko = 0, runs = 0, offPlat = 0;
  for (let t = 0; t < 60; t++) {
    const arena = MW.makeArena();
    const sim = new MW.Sim(arena, [C.errata, C.fighter]);
    sim.fx = [];
    for (let i = 0; i < 150; i++) sim.step([I, I]);
    const [a, b] = sim.fighters;
    a.invuln = b.invuln = 0;
    a.x = t % 3 === 0 ? 250 : t % 3 === 1 ? 1000 : 600; // main-stage edges and middle
    a.vx = 0;
    const dir = t % 2 ? { right: true } : { left: true };
    for (let i = 0; i < 130; i++) {
      sim.step([Object.assign({}, i === 0 ? HOLD : i < 56 ? KEEP : I, dir), I]);
      sim.fx.length = 0; b.invuln = 0; b.x = 1000; b.y = 400;
      const bz = arena.blastZone;
      if (a.x < bz.left || a.x + a.stats.width > bz.right || a.y < bz.top || a.y > bz.bottom) bad++;
    }
    for (let i = 0; i < 120; i++) { sim.step([I, I]); sim.fx.length = 0; b.invuln = 0; b.x = 1000; b.y = 400; }
    runs++;
    if (a.hp < a.stats.maxHP * 0.74) ko++; // a blast-zone penalty would cost 25% of max HP
    if (!a.grounded) offPlat++;
  }
  check("always inside the arena during the hops (" + runs + " random layouts)", bad === 0, "violations " + bad);
  check("never lost HP to a blast zone after the hops", ko === 0, ko + " runs");
  check("always ends standing on a platform", offPlat === 0, offPlat + " runs in the air");
}

// ── nothing else broke: other characters have no hold charges and the Void Mage hold still uses its cooldown
{
  check("only Errata has a charges-based hold", C.mage.hold && !C.mage.hold.charges && !(C.fighter.hold));
  const sim = new MW.Sim(MW.ARENA, [C.mage, C.fighter]);
  for (let i = 0; i < 150; i++) sim.step([I, I]);
  const m = sim.fighters[0];
  check("a non-Errata fighter: holdReady follows holdCd", m.holdReady() === true && (m.holdCd = 10, m.holdReady() === false));
}

console.log(failures ? "\n" + failures + " check(s) FAILED" : "\nAll Errata hold key checks passed.");
process.exit(failures ? 1 : 0);
