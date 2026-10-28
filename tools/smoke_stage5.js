// Stage 5 smoke test: blast-zone penalty, seeded bots, match loop, select screen logic.
// Run: node tools/smoke_stage5.js
require("../src/config.js");
require("../src/characters.js");
require("../src/arena.js");
require("../src/fighter.js");
require("../src/projectiles.js");
require("../src/sim.js");
require("../src/bots.js");
require("../src/character_art.js");
require("../src/render.js");
require("../src/select.js");
const MW = globalThis.MW;
const C = MW.CHARACTERS, S = MW.STATE, CC = MW.CONFIG.combat, ORDER = MW.CHARACTER_ORDER;
const I = (o) => Object.assign({}, MW.IDLE_INTENT, o);
const IDLE = () => MW.IDLE_INTENT;

let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  (" + detail + ")" : ""));
  if (!ok) failures++;
}
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
function settled(a, b) {
  const sim = new MW.Sim(MW.ARENA, [a, b]);
  for (let i = 0; i < 120; i++) sim.step([IDLE(), IDLE()]);
  return sim;
}

// ---------- blast zone ----------
check("blast penalty is 25% of max HP", CC.blastPenalty === 0.25);
for (const id of ORDER) {
  const c = C[id];
  const sim = settled(c, C.tank);
  const f = sim.fighters[0];
  f.x = -2000; // far outside the blast zone
  sim.step([IDLE(), IDLE()]);
  check(id + ": leaving the arena costs 25% of max HP (armor ignored)", near(f.hp, c.maxHP * 0.75) && f.respawns === 1, "hp " + f.hp.toFixed(2) + "/" + c.maxHP);
  check(id + ": respawns on the spawn point with invulnerability", f.invuln > 0 && f.state !== S.KO && f.x > 0 && f.x < 1280 && sim.koTimer === 0);
}
{
  const sim = settled(C.fighter, C.tank);
  const f = sim.fighters[0];
  f.x = -2000; sim.step([IDLE(), IDLE()]);
  for (let i = 0; i < 30; i++) sim.step([IDLE(), IDLE()]);
  check("penalty is charged once per exit, not every tick", near(f.hp, 75) && f.respawns === 1);
  check("blast zone shows up in the last-hit readout", f.lastHit && f.lastHit.by === "BLAST ZONE" && near(f.lastHit.dmg, 25));
  // exit again: second penalty
  f.invuln = 0; f.y = 5000; sim.step([IDLE(), IDLE()]);
  check("a second exit costs another 25%", near(f.hp, 50) && f.respawns === 2);
}
{
  // exit from being launched (real hit), not just teleported
  const sim = settled(C.fighter, C.assassin);
  const [fa, fd] = sim.fighters;
  fd.x = 1300; fd.vx = 30; fd.y = 200; fd.vy = -5;
  const hp0 = fd.hp;
  for (let i = 0; i < 30; i++) sim.step([IDLE(), IDLE()]);
  check("a fighter flying out of bounds pays the penalty and comes back", near(fd.hp, hp0 - C.assassin.maxHP * 0.25) && fd.respawns === 1, "hp " + fd.hp.toFixed(1));
}
{
  // blast zone can KO
  const sim = settled(C.fighter, C.assassin);
  const [fa, fd] = sim.fighters;
  fd.hp = 10; // less than the 17.5 penalty
  fd.x = -2000; sim.step([IDLE(), IDLE()]);
  check("blast penalty that empties HP is a KO, kill counted", fd.hp === 0 && fd.state === S.KO && sim.kills[0] === 1 && sim.koTimer > 0);
  check("KO'd fighter does not take the penalty again", (() => { const r = fd.respawns; for (let i = 0; i < 10; i++) sim.step([IDLE(), IDLE()]); return fd.respawns === r; })());
  for (let i = 0; i < CC.koFrames + 2; i++) sim.step([IDLE(), IDLE()]);
  check("round resets at full HP after a blast-zone KO", fd.hp === C.assassin.maxHP && fd.state !== S.KO && fa.hp === C.fighter.maxHP && sim.koTimer === 0);
}

// ---------- bots ----------
check("bot kinds listed", MW.Bots.KINDS.join() === "dummy,aggressive,spacing" && MW.Bots.LABELS.aggressive);
{
  const b = MW.Bots.create("dummy");
  const sim = settled(C.fighter, C.fighter);
  const it = b(sim, 1);
  check("dummy brain returns an idle intent", it === MW.IDLE_INTENT);
}

// every character, driven by each bot, hits an idle Tank
for (const kind of ["aggressive", "spacing"]) {
  for (const id of ORDER) {
    const sim = new MW.Sim(MW.ARENA, [C.tank, C[id]]);
    const bot = MW.Bots.create(kind);
    for (let t = 0; t < 900; t++) sim.step([IDLE(), bot(sim, 1)]);
    check(kind + " bot (" + id + ") damages an idle Tank within 15 s", sim.fighters[0].lastHit !== null || sim.kills[1] > 0, "tank hp " + sim.fighters[0].hp.toFixed(0) + ", kills " + sim.kills[1]);
  }
}

// same seed -> identical run; different seeds are allowed to differ
function trace(kindA, kindB, seed, ticks, a = C.fighter, b = C.mage) {
  const sim = new MW.Sim(MW.ARENA, [a, b]);
  const ba = MW.Bots.create(kindA, seed), bb = MW.Bots.create(kindB, seed + 1);
  let h = 0;
  for (let t = 0; t < ticks; t++) {
    sim.step([ba(sim, 0), bb(sim, 1)]);
    for (const f of sim.fighters) h = (h * 31 + Math.round(f.x * 10) + Math.round(f.y * 10) + Math.round(f.hp * 10)) | 0;
  }
  return h + ":" + sim.kills.join(",");
}
check("same seed gives exactly the same match", trace("aggressive", "spacing", 99, 3000) === trace("aggressive", "spacing", 99, 3000));
{
  const seeds = new Set([1, 2, 3, 4, 5].map((s) => trace("aggressive", "spacing", s, 1500)));
  check("different seeds give different matches", seeds.size > 1, seeds.size + " distinct of 5");
}

// climbing: bot starts on the main floor, target sits on the top platform
for (const id of ORDER) {
  const sim = new MW.Sim(MW.ARENA, [C.tank, C[id]]);
  for (let t = 0; t < 120; t++) sim.step([IDLE(), IDLE()]);
  const bot = MW.Bots.create("aggressive");
  const f = sim.fighters[1];
  f.y = 560 - C[id].height; f.x = 300; f.vy = 0; f.vx = 0; // on the main floor, far left
  let reachedHigher = false;
  for (let t = 0; t < 900 && !reachedHigher; t++) {
    sim.step([IDLE(), bot(sim, 1)]);
    if (f.grounded && f.standingOn && f.standingOn.y < 560) reachedHigher = true;
  }
  check(id + ": bot climbs from the main floor toward a target on a higher platform", reachedHigher);
}

// recovery: bot is off the left edge, below the stage, with its air jump
for (const id of ORDER) {
  const sim = new MW.Sim(MW.ARENA, [C.tank, C[id]]);
  for (let t = 0; t < 120; t++) sim.step([IDLE(), IDLE()]);
  const bot = MW.Bots.create("aggressive");
  const f = sim.fighters[1];
  f.x = 190; f.y = 480; f.vx = 0; f.vy = 0; f.grounded = false; f.airJumpsLeft = 1; f.invuln = 0;
  let back = false;
  for (let t = 0; t < 240 && !back; t++) {
    sim.step([IDLE(), bot(sim, 1)]);
    if (f.grounded) back = true;
  }
  check(id + ": bot recovers to the stage after being knocked off the left edge", back && f.respawns === 0, "respawns " + f.respawns);
}

// spacing bot stays near its preferred distance and does not walk off the main stage
{
  const sim = settled(C.tank, C.fighter);
  const bot = MW.Bots.create("spacing");
  let offs = 0;
  for (let t = 0; t < 1200; t++) {
    sim.step([IDLE(), bot(sim, 1)]);
    if (sim.fighters[1].respawns > 0) offs++;
  }
  check("spacing bot does not throw itself off the stage", offs === 0);
}

// full bot-vs-bot matches: no crashes, no NaN, rounds keep resetting
{
  let bad = 0, totalKills = 0, rows = [];
  for (const a of ORDER) for (const b of ORDER) {
    const sim = new MW.Sim(MW.ARENA, [C[a], C[b]]);
    const ba = MW.Bots.create("aggressive", 7), bb = MW.Bots.create("spacing", 7);
    for (let t = 0; t < 3600; t++) sim.step([ba(sim, 0), bb(sim, 1)]);
    for (const f of sim.fighters) if (![f.x, f.y, f.hp, f.vx, f.vy].every(Number.isFinite)) bad++;
    totalKills += sim.kills[0] + sim.kills[1];
    rows.push(a + " v " + b + ": " + sim.kills.join("-"));
  }
  check("25 aggressive-vs-spacing matches (1 min each) run clean", bad === 0);
  check("matches produce KOs (the round loop keeps going)", totalKills > 25, "total KOs " + totalKills);
}

// speed cap: a bot never runs faster than speedScale x runSpeed (plus one tick of acceleration)
for (const id of ORDER) {
  const sim = new MW.Sim(MW.ARENA, [C.tank, C[id]]);
  for (let t = 0; t < 120; t++) sim.step([IDLE(), IDLE()]);
  const f = sim.fighters[1]; f.invuln = 0; sim.fighters[0].invuln = 0;
  f.x = 260; f.y = 560 - C[id].height; f.vx = 0; sim.fighters[0].x = 1000; sim.fighters[0].y = 560 - C.tank.height;
  const bot = MW.Bots.create("aggressive");
  let maxV = 0;
  for (let t = 0; t < 200; t++) { sim.step([IDLE(), bot(sim, 1)]); if (f.grounded && f.state === S.RUN) maxV = Math.max(maxV, Math.abs(f.vx)); }
  const cap = MW.CONFIG.bots.speedScale * C[id].runSpeed + MW.MOVEMENT_DEFAULTS.groundAccel;
  check(id + ": bot run speed stays under speedScale x runSpeed", maxV <= cap && maxV > 0.4 * C[id].runSpeed, "max " + maxV.toFixed(2) + ", cap " + cap.toFixed(2));
}

// ---------- select screen logic ----------
{
  const roster = ORDER.map((id) => C[id]);
  const sc = new MW.SelectScreen(null, { roster, kinds: MW.Bots.KINDS });
  check("select screen starts with P1/P2 on the first fighter, AI aggressive", sc.p1 === 0 && sc.p2 === 0 && MW.Bots.KINDS[sc.ai] === "aggressive");
  sc.nav("right"); sc.nav("right");
  check("right moves the P1 pick", sc.p1 === 2);
  sc.nav("left"); sc.nav("left"); sc.nav("left");
  check("left wraps around", sc.p1 === 4);
  sc.nav("down"); sc.nav("right");
  check("down switches to the P2 row", sc.focus === 1 && sc.p2 === 1 && sc.p1 === 4);
  sc.nav("down"); sc.nav("right");
  check("third row changes the AI and wraps", sc.focus === 2 && MW.Bots.KINDS[sc.ai] === "spacing");
  sc.nav("down");
  check("focus stops at the last row", sc.focus === 2);
  sc.pick(0, 3); sc.pick(1, 4);
  check("number-key picks set P1 and P2", sc.p1 === 3 && sc.p2 === 4);
  sc.pick(0, 9);
  check("out-of-range picks are ignored", sc.p1 === 3);
  check("nothing starts until confirm", sc.consumeStart() === null);
  sc.nav("confirm");
  const go = sc.consumeStart();
  check("confirm starts with the chosen setup", go && go.p1 === 3 && go.p2 === 4 && go.ai === sc.ai);
  check("start is consumed once", sc.consumeStart() === null);

  // taps
  const sc2 = new MW.SelectScreen(null, { roster, kinds: MW.Bots.KINDS });
  const R = sc2.rects;
  const mid = (r) => [r.x + r.w / 2, r.y + r.h / 2];
  sc2.tap(...mid(R.cards[0][2]));
  sc2.tap(...mid(R.cards[1][4]));
  sc2.tap(...mid(R.ai[0]));
  check("tapping cards and AI buttons selects them", sc2.p1 === 2 && sc2.p2 === 4 && sc2.ai === 0);
  sc2.tap(5, 5);
  check("tapping empty space does nothing", sc2.p1 === 2 && sc2.consumeStart() === null);
  sc2.tap(...mid(R.start));
  const go2 = sc2.consumeStart();
  check("tapping START starts the match", go2 && go2.p1 === 2 && go2.p2 === 4 && go2.ai === 0);
  // all layout rects are on the canvas and do not overlap each other
  const all = [...R.cards[0], ...R.cards[1], ...R.ai, R.start];
  const onScreen = all.every((r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= 1600 && r.y + r.h <= 900);
  let overlap = false;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) overlap = true;
  }
  check("select layout fits the 1600x900 canvas with no overlaps", onScreen && !overlap);
  // comes back from the arena with choices kept
  sc2.open({ p1: 1, p2: 3, ai: 2 });
  check("open() restores the previous choices", sc2.p1 === 1 && sc2.p2 === 3 && sc2.ai === 2 && sc2.active);

  // drawing runs without errors (fake canvas context)
  const calls = [];
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => calls.push(k)), set: (t, k, v) => ((t[k] = v), true) });
  let drew = true;
  try { sc2.draw(ctx); } catch (e) { drew = false; console.log(e); }
  check("select screen draws", drew && calls.length > 50, calls.length + " draw calls");
}

console.log(failures === 0 ? "\nAll Stage 5 checks passed." : "\n" + failures + " check(s) FAILED.");
process.exit(failures === 0 ? 0 : 1);