// Smoke test for the Brawler (uppercut launch) and Bulwark (super armor). Run: node src/smoke_redesign.js
require("../src/config.js");
require("../src/characters.js");
require("../src/arena.js");
require("../src/fighter.js");
require("../src/projectiles.js");
require("../src/sim.js");
const MW = globalThis.MW;
const S = MW.STATE;
let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  (" + detail + ")" : ""));
  if (!ok) failures++;
}
const C = MW.CHARACTERS;
const arena = MW.makeArena ? MW.makeArena(() => 0.5) : MW.ARENA;

function duel(a, b, gap) {
  const sim = new MW.Sim(arena, [C[a], C[b]]);
  const [A, B] = sim.fighters;
  for (const f of sim.fighters) f.invuln = 0;
  B.x = A.x + A.stats.width + (gap === undefined ? 10 : gap);
  B.y = A.y; A.facing = 1; B.facing = -1;
  return { sim, A, B };
}
const press = { ...MW.IDLE_INTENT, attackPressed: true };

// names / roles
check("fighter is the Brawler", C.fighter.name === "Brawler");
check("tank is the Bulwark", C.tank.name === "Bulwark");
check("Brawler starts faster than the old Fighter (4 < 6 ticks)", C.fighter.attack.startup === 4);

// Brawler: uppercut finisher launches up, not out
{
  const { sim, A, B } = duel("fighter", "tank", 6);
  B.hp = B.stats.maxHP; // fresh target
  let hit3 = false;
  A.chainIndex = 2;
  A.startAttack(2);
  for (let i = 0; i < 40 && !B.lastHit; i++) sim.step([MW.IDLE_INTENT, MW.IDLE_INTENT]);
  check("uppercut connects", !!B.lastHit);
  check("uppercut launches mostly up", B.vy < 0 && Math.abs(B.vy) > Math.abs(B.vx) * 2, "vx=" + B.vx.toFixed(2) + " vy=" + B.vy.toFixed(2));
}
{
  const { sim, A, B } = duel("fighter", "mage", 6);
  A.startAttack(0);
  for (let i = 0; i < 20 && !B.lastHit; i++) sim.step([MW.IDLE_INTENT, MW.IDLE_INTENT]);
  check("jab still launches sideways", B.lastHit && Math.abs(B.vx) > 0.5 * Math.abs(B.vy));
}

// Bulwark: super armor absorbs hits during startup/active but still deals damage
{
  const { sim, A, B } = duel("hitter", "tank", 4);
  B.startAttack(0);
  for (let i = 0; i < 4; i++) sim.step([MW.IDLE_INTENT, MW.IDLE_INTENT]);
  const hpBefore = B.hp, stBefore = B.state;
  B.takeHit(A, C.fighter.attack);
  check("armored hit still deals damage", B.hp < hpBefore);
  check("armored hit does not interrupt", B.state === stBefore && B.hit !== null, "state=" + B.state);
  check("armored hit does not launch", B.vx === 0 || Math.abs(B.vx) < 1.5);
}
// Armor is off during recovery
{
  const { A, B } = duel("fighter", "tank", 4);
  B.startAttack(0);
  B.state = S.ATTACK_RECOVERY; B.stateTimer = 10;
  B.takeHit(A, C.fighter.attack);
  check("no armor during recovery (hit launches him)", B.state === S.HITSTUN);
}
// Lethal hits are never absorbed
{
  const { A, B } = duel("fighter", "tank", 4);
  B.startAttack(0);
  B.hp = 0.5;
  B.takeHit(A, C.fighter.attack);
  check("super armor never stops a KO", B.state === S.KO);
}
// Bash is slow and punishable
{
  const a = C.tank.attack;
  check("bash is slow (startup 18, recovery 34)", a.startup === 18 && a.recovery === 34);
  check("bash has super armor flag", a.superArmor === true);
}

console.log(failures ? "\n" + failures + " failed" : "\nAll redesign checks passed.");
process.exit(failures ? 1 : 0);
