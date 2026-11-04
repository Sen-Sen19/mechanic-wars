// Void Mage renderer smoke test (headless, mock canvas). Run: node tools/smoke_void_art.js
// Checks: no throws / undefined refs, no NaN or Infinity reaching the canvas, render never mutates sim state,
// hover lifts the body only visually, and fx anchors (A.core / A.orb) stay finite.
require("../src/config.js"); require("../src/characters.js"); require("../src/arena.js"); require("../src/fighter.js");
require("../src/projectiles.js"); require("../src/sim.js"); require("../src/void_mage_art.js"); require("../src/character_art.js");
const MW = globalThis.MW;
let failures = 0;
const check = (n, ok, d) => { console.log((ok ? "PASS" : "FAIL") + "  " + n + (d ? "  (" + d + ")" : "")); if (!ok) failures++; };

function mockCtx() {
  const log = { bad: [], calls: 0, ys: [] };
  const grad = { addColorStop() {} };
  const target = { canvas: {}, lineWidth: 1 };
  return { log, ctx: new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => grad;
      return (...a) => {
        log.calls++;
        a.forEach((v, i) => { if (typeof v === "number" && !Number.isFinite(v)) log.bad.push(String(k) + "[" + i + "]=" + v); });
        if (k === "translate") log.ys.push(a[1]);
      };
    },
    set(t, k, v) { t[k] = v; return true; },
  }) };
}
const snapshot = (f) => JSON.stringify(Object.fromEntries(Object.entries(f).filter(([k, v]) => k !== "_art" && typeof v !== "object" && typeof v !== "function")));

const mage = MW.CHARACTERS.mage;
const sim = new MW.Sim(MW.ARENA, [mage, MW.CHARACTERS.fighter]);
const I = (o) => Object.assign({}, MW.IDLE_INTENT, o);
for (let i = 0; i < 120; i++) sim.step([I({}), MW.IDLE_INTENT]);
const f = sim.fighters[0];
const S = MW.STATE;
const poses = [
  ["idle", {}], ["run", { state: S.RUN, vx: 5 }], ["airborne", { grounded: false, vy: -8 }], ["falling", { grounded: false, vy: 8 }],
  ["attack startup", { state: S.ATTACK_STARTUP }], ["attack active", { state: S.ATTACK_ACTIVE }],
  ["hitstun", { state: S.HITSTUN }], ["ko", { state: S.KO }],
];
for (const facing of [1, -1]) for (const [name, patch] of poses) for (const flash of [false, true]) {
  const sav = Object.assign({}, f); f.facing = facing; Object.assign(f, patch);
  const before = snapshot(f); const { ctx, log } = mockCtx();
  let err = null;
  try { for (let n = 0; n < 6; n++) MW.CharacterArt.draw(ctx, f, flash, null); } catch (e) { err = e; }
  const unchanged = snapshot(f) === before;
  const a = f._art || {};
  const fin = [a.core, a.orb].every((p) => !p || p.every(Number.isFinite));
  check(`render ${name} facing ${facing}${flash ? " (flash)" : ""}`, !err && !log.bad.length && unchanged && fin && log.calls > 50,
    err ? err.stack.split("\n")[1] : log.bad.slice(0, 3).join(",") || (unchanged ? "" : "sim state mutated"));
  Object.assign(f, sav);
}
// levitation: grounded idle is lifted, airborne eases back to no extra lift, nothing else changes
f.facing = 1; f.state = S.IDLE; f._art = undefined;
{ const { ctx, log } = mockCtx(); for (let n = 0; n < 40; n++) MW.CharacterArt.draw(ctx, f, false, null);
  check("grounded idle hovers above the floor", f._art.vmHover > 3, "hover=" + f._art.vmHover.toFixed(2)); }
{ f.grounded = false; f.vy = -6; const { ctx } = mockCtx(); for (let n = 0; n < 80; n++) MW.CharacterArt.draw(ctx, f, false, null);
  check("airborne: extra lift eases to ~0", f._art.vmHover < 0.5, "hover=" + f._art.vmHover.toFixed(2)); }
console.log(failures ? `\n${failures} failure(s)` : "\nAll void art checks passed.");
process.exit(failures ? 1 : 0);
