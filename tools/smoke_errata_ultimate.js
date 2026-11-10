// Errata ultimate (SYSTEM: RELOCATION ERROR) smoke test. Run: node tools/smoke_errata_ultimate.js
require("../src/config.js");
require("../src/characters.js");
require("../src/arena.js");
require("../src/fighter.js");
require("../src/projectiles.js");
require("../src/sim.js");
require("../src/errata_ult_fx.js");
const MW = globalThis.MW, C = MW.CHARACTERS, I = MW.IDLE_INTENT;
const intent = (x) => Object.assign({}, I, x);
let failures = 0;
function check(name, ok, extra) { console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  (" + extra + ")" : "")); if (!ok) failures++; }
const ULT = intent({ ultPressed: true });
const F = C.errata, U = F.ultimate && F.ultimate.attack, R = U && U.relocation;

check("errata has the ultimate relocation_error", !!U && U.id === "relocation_error" && !!R);
check("ultimate is not marked corruptible", U && !U.corruptible);

function setup(arenaSeed, opts) {
  const arena = arenaSeed ? MW.makeArena(arenaSeed) : MW.ARENA;
  const sim = new MW.Sim(arena, [F, C.fighter]);
  sim.fx = [];
  for (let i = 0; i < 120; i++) sim.step([I, I]);
  const [a, b] = sim.fighters;
  a.invuln = b.invuln = 0;
  const plat = arena.platforms[0];
  a.x = 400; a.facing = 1; b.x = 640; b.facing = -1;
  if (opts && opts.far) { a.x = 250; b.x = 1000; }
  a.y = plat.y - a.stats.height; b.y = plat.y - b.stats.height;
  a.mana = MW.CONFIG.combat.maxMana;
  sim.fx.length = 0;
  return { sim, a, b, arena };
}

// ── full hit: capture, hidden + untargetable while fragmented, relocation to a valid spot, one big hit
{
  const { sim, a, b, arena } = setup();
  const hp0 = b.hp, startX = b.x + b.stats.width / 2;
  let sawFrag = false, sawUntarget = false, sawRebuild = false, destChecked = false, ctlDuringCapture = true, hits = 0, lastHp = hp0, explodeDmg = 0;
  const kinds = new Set();
  let destX = null, destFeet = null;
  for (let i = 0; i < 360; i++) {
    sim.step([i === 0 ? ULT : I, I]);
    b.invuln = 0;
    if (a.relocation && a.relocation.dest) { destX = a.relocation.dest.x; destFeet = a.relocation.dest.feet; }
    if (b.fragmented) { sawFrag = true; if (b.untargetable) sawUntarget = true; }
    if (a.relocation && a.relocation.phase === "rebuild") sawRebuild = true;
    let boom = false;
    for (const ev of sim.fx) if (ev.type === "errata" && /^reloc_/.test(ev.kind)) { kinds.add(ev.kind); if (ev.kind === "reloc_explode") boom = true; }
    sim.fx.length = 0;
    if (boom) explodeDmg = lastHp - b.hp;
    if (b.hp < lastHp) { hits++; lastHp = b.hp; }
    if (a.relocation && ["lift", "suspend"].includes(a.relocation.phase) && b.state !== MW.STATE.HITSTUN) ctlDuringCapture = false;
  }
  check("ultimate cast consumed the mana", a.mana === 0 || a.mana < MW.CONFIG.combat.maxMana);
  check("victim is shattered (fragmented) and untargetable mid-sequence", sawFrag && sawUntarget);
  check("rebuild phase reached", sawRebuild);
  check("victim is held (cannot act) while lifted / suspended", ctlDuringCapture);
  check("destination chosen", destX !== null, destX !== null ? "x " + destX.toFixed(0) + ", feet " + destFeet.toFixed(0) : "");
  const bz = arena.blastZone;
  check("destination inside the arena", destX > bz.left && destX < bz.right && destFeet < bz.bottom);
  check("destination is on a platform top", arena.platforms.some((p) => Math.abs(p.y - destFeet) < 0.5 && destX >= p.x && destX <= p.x + p.w));
  const ecx = a.x + a.stats.width / 2, ecy = a.y + a.stats.height / 2;
  check("destination keeps the minimum distance from Errata", Math.hypot(destX - ecx, destFeet - b.stats.height / 2 - ecy) >= R.minDistance, Math.hypot(destX - ecx, destFeet - b.stats.height / 2 - ecy).toFixed(0) + " px");
  check("destination is not where the victim was held", Math.hypot(destX - startX, 0) >= 0 && Math.abs(destX - startX) + Math.abs(destFeet - (arena.platforms[0].y)) >= R.minFromOrigin * 0.5);
  check("emits capture / fragment / explosion fx", ["reloc_emerge", "reloc_grab", "reloc_fragment", "reloc_land", "reloc_explode"].every((k) => kinds.has(k)), [...kinds].join(","));
  check("victim takes the grab + explosion damage", hp0 - b.hp >= (R.damage + R.grabDamage) * 0.5, "hp " + hp0 + " -> " + b.hp.toFixed(1));
  check("the reconstruction explosion is the big hit", explodeDmg >= R.damage * 0.5, "explosion " + explodeDmg.toFixed(1) + " dmg (after armor)");
  check("victim visible & hittable again after the sequence", !b.fragmented && !b.untargetable);
  check("Errata is not stuck in the ultimate", !a.relocation && a.state !== MW.STATE.ATTACK_ACTIVE);
}

// ── dodge: leaving the tendril circle before emerge ends = clean miss
{
  const { sim, a, b } = setup();
  const hp0 = b.hp;
  for (let i = 0; i < 300; i++) {
    sim.step([i === 0 ? ULT : I, I]);
    b.invuln = 0;
    if (i === R.emergeTicks + U.startup - 6) { b.x += 200; } // walked away before the grab
  }
  check("moving out of the capture circle = miss (no damage, never fragmented)", b.hp === hp0 && !b.fragmented, "hp " + b.hp);
}

// ── out of range = miss
{
  const { sim, a, b } = setup(null, { far: true });
  const hp0 = b.hp;
  if (Math.abs(b.x - a.x) <= R.range) console.log("WARN: test positions are inside the range");
  for (let i = 0; i < 200; i++) { sim.step([i === 0 ? ULT : I, I]); b.invuln = 0; }
  check("out of range = pure miss", b.hp === hp0 && !a.relocation);
}

// ── interrupted during the startup: nothing happens
{
  const { sim, a, b } = setup();
  const hp0 = b.hp;
  for (let i = 0; i < 12; i++) { sim.step([i === 0 ? ULT : I, I]); }
  a.takeHit(b, { damage: 5, knockback: 3, launchH: 1, launchV: 0.3, stun: 20 }, 1);
  for (let i = 0; i < 200; i++) { sim.step([I, I]); b.invuln = 0; }
  check("hit during the startup cancels the ultimate", !b.fragmented && !a.relocation);
}

// ── victim killed mid-sequence is released cleanly
{
  const { sim, a, b } = setup();
  for (let i = 0; i < 120; i++) { sim.step([i === 0 ? ULT : I, I]); b.invuln = 0; if (a.relocation && a.relocation.phase === "suspend") break; }
  b.hp = 0; b.state = MW.STATE.KO;
  for (let i = 0; i < 80; i++) sim.step([I, I]);
  check("victim KO'd mid-sequence: flags cleared, Errata recovers", !b.fragmented && !a.relocation);
}

// ── random arenas + many seeds: destination always valid, never inside a platform
{
  let bad = 0, n = 0;
  for (let s = 1; s <= 40; s++) {
    let seed = s * 9301 + 49297; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const { sim, a, b, arena } = setup(rnd);
    a.rand = rnd;
    for (let i = 0; i < 300; i++) {
      sim.step([i === 0 ? ULT : I, I]); b.invuln = 0;
      if (a.relocation && a.relocation.dest && !a.relocation._seen) {
        a.relocation._seen = true; n++;
        const d = a.relocation.dest, vw = b.stats.width, vh = b.stats.height;
        const r = { x: d.x - vw / 2, y: d.feet - vh - 2, w: vw, h: vh + 2 };
        const inPlat = arena.platforms.some((p) => r.x < p.x + p.w && r.x + r.w > p.x && r.y < p.y + p.h && r.y + r.h > p.y + 3);
        const bz = arena.blastZone;
        if (inPlat || d.x < bz.left || d.x > bz.right || d.feet > bz.bottom) bad++;
      }
    }
  }
  check("40 random arenas: destination always valid", n > 0 && bad === 0, n + " relocations, " + bad + " bad");
}

// ── renderer: every phase draws without throwing (stub 2D context)
{
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  const { sim, a, b } = setup();
  let ok = true, drew = new Set();
  try {
    for (let i = 0; i < 330; i++) {
      sim.step([i === 0 ? ULT : I, I]); b.invuln = 0; sim.fx.length = 0;
      MW.ErrataUlt.draw(ctx, a, sim.tick);
      if (a.relocation) drew.add(a.relocation.phase); else if (a.hit && a.hit.relocation) drew.add("startup");
    }
  } catch (e) { ok = false; console.log(e.stack); }
  check("renderer draws every phase without errors", ok && ["startup", "emerge", "lift", "suspend", "fragment", "travel", "rebuild"].every((p) => drew.has(p)), [...drew].join(","));
}

console.log(failures ? "\n" + failures + " failure(s)" : "\nAll good.");
process.exit(failures ? 1 : 0);
