// Artillerist / Gunner kit smoke test. Run: node tools/smoke_gunner.js
require("../src/config.js");
require("../src/characters.js");
require("../src/arena.js");
require("../src/fighter.js");
require("../src/projectiles.js");
require("../src/sim.js");
const MW = globalThis.MW, C = MW.CHARACTERS, I = MW.IDLE_INTENT;
const intent = (x) => Object.assign({}, I, x);
let failures = 0;
function check(name, ok) { console.log((ok ? "PASS " : "FAIL ") + name); if (!ok) failures++; }
function setup() {
  const sim = new MW.Sim(MW.ARENA, [C.hitter, C.tank]);
  for (let i = 0; i < 120; i++) sim.step([I, I]);
  const [gunner, target] = sim.fighters;
  gunner.invuln = target.invuln = 0;
  gunner.x = 500; target.x = 580; gunner.facing = 1; target.facing = -1;
  return { sim, gunner, target };
}
{
  const { sim, gunner, target } = setup();
  const hp = target.hp;
  sim.step([intent({ attackPressed: true }), I]);
  for (let i = 0; i < 35; i++) sim.step([I, I]);
  check("normal bullet hit adds one Bullet Evolution stack", gunner.gunnerStacks === 1 && target.hp < hp);
}
{
  const { sim, gunner, target } = setup();
  gunner.gunnerStacks = 2; target.x = 1150;
  sim.step([intent({ attackPressed: true }), I]);
  for (let i = 0; i < 70; i++) sim.step([I, I]);
  check("missed normal bullet removes one stack", gunner.gunnerStacks === 1);
}
{
  const { sim, gunner, target } = setup();
  const hp = target.hp;
  for (let i = 0; i < 100; i++) sim.step([intent({ attackPressed: i === 0, attackHeld: true }), I]);
  sim.step([I, I]);
  for (let i = 0; i < 30; i++) sim.step([I, I]);
  check("five-shot barrage fires multiple pellets and grants a stack when all connect", target.hp < hp && gunner.gunnerStacks >= 1);
}
{
  // the barrage is a rapid SEQUENCE over time, not one volley
  const { sim, gunner } = setup();
  let sawMid = false;
  for (let i = 0; i < 100; i++) sim.step([intent({ attackPressed: i === 0, attackHeld: true }), I]);
  for (let i = 0; i < 40; i++) { sim.step([I, I]); const b = gunner.gunnerBurst; if (b && b.left > 0 && b.left < 5) sawMid = true; }
  check("barrage fires its five bullets one after another", sawMid);
}
{
  // interrupted barrage: unfired bullets count as misses (stacks do not go up)
  const { sim, gunner, target } = setup();
  gunner.gunnerStacks = 4;
  for (let i = 0; i < 100; i++) sim.step([intent({ attackPressed: i === 0, attackHeld: true }), I]);
  for (let i = 0; i < 60 && !gunner.gunnerBurst; i++) sim.step([I, I]);
  gunner.takeHit(target, { damage: 3, knockback: 2, stun: 20 }, 1);
  for (let i = 0; i < 60; i++) sim.step([I, I]);
  check("interrupting the barrage never gives a stack", gunner.gunnerStacks <= 4);
}
{
  const { sim, gunner, target } = setup();
  const hp = target.hp;
  sim.step([intent({ skillPressed: [true, false, false, false] }), I]);
  const planted = !!gunner.gunnerBomb;
  sim.step([intent({ skillPressed: [true, false, false, false] }), I]);
  check("Remote Detonation plants then remotely detonates one bomb", planted && !gunner.gunnerBomb && target.hp < hp);
}
{
  const { sim, gunner } = setup();
  const x = gunner.x;
  sim.step([intent({ skillPressed: [false, true, false, false], right: true }), I]);
  check("Combat Hop moves in the held direction and jumps", gunner.x > x && gunner.vy < 0);
}
{
  const { sim, gunner, target } = setup();
  const hp = target.hp;
  sim.step([intent({ skillPressed: [false, false, true, false] }), I]);
  for (let i = 0; i < 30; i++) sim.step([I, I]);
  check("Point-Blank Blast resolves individual shotgun pellets", target.hp < hp);
}
{
  const { sim, gunner, target } = setup();
  const hp = target.hp;
  sim.step([intent({ skillPressed: [false, false, false, true] }), I]);
  for (let i = 0; i < 140; i++) sim.step([I, I]);
  check("Perfect Aim charges then fires a fast piercing shot", target.hp < hp);
}
{
  const { sim, gunner, target } = setup();
  gunner.mana = MW.CONFIG.combat.maxMana;
  const hp = target.hp;
  sim.step([intent({ ultPressed: true }), I]);
  for (let i = 0; i < 80; i++) sim.step([I, I]);
  check("Self-Destruct damages nearby opponents without damaging its owner", target.hp < hp && gunner.hp === gunner.stats.maxHP);
}
{
  const { sim, gunner } = setup();
  sim.step([intent({ skillPressed: [false, true, false, false] }), I]);
  check("backward Combat Hop (no input) keeps him facing the enemy", gunner.x < 500 && gunner.facing === 1);
}
{
  const { sim, gunner } = setup();
  gunner.y -= 220; // in the air
  sim.step([intent({ skillPressed: [true, false, false, false] }), I]);
  check("Remote Detonation cannot be planted in mid-air (and costs no cooldown)", !gunner.gunnerBomb && gunner.cooldowns[0] === 0);
}
{
  const { sim, gunner, target } = setup();
  const hp = target.hp;
  sim.step([intent({ skillPressed: [true, false, false, false] }), I]);
  for (let i = 0; i < gunner.stats.skills[0].attack.duration + 5; i++) sim.step([I, I]);
  check("an undetonated bomb disarms when its duration ends (explodeOnExpire: false)", !gunner.gunnerBomb && target.hp === hp);
}
{
  // shotgun cone: point-blank hits more pellets than long range
  const close = setup(), far = setup();
  close.target.x = 545; far.target.x = 686;
  const hpC = close.target.hp, hpF = far.target.hp;
  close.sim.step([intent({ skillPressed: [false, false, true, false] }), I]);
  far.sim.step([intent({ skillPressed: [false, false, true, false] }), I]);
  for (let i = 0; i < 40; i++) { close.sim.step([I, I]); far.sim.step([I, I]); }
  const lossC = hpC - close.target.hp, lossF = hpF - far.target.hp;
  check("Point-Blank Blast: close range deals more than long range", lossC > 0 && lossC > lossF);
}
{
  // Perfect Aim: an enemy hit during the charge cancels it
  const { sim, gunner, target } = setup();
  const hp = target.hp;
  sim.step([intent({ skillPressed: [false, false, false, true] }), I]);
  for (let i = 0; i < 30; i++) sim.step([I, I]);
  gunner.takeHit(target, { damage: 5, knockback: 2, stun: 20 }, 1);
  for (let i = 0; i < 160; i++) sim.step([I, I]);
  check("Perfect Aim is cancelled when the Gunner is hit during the charge", target.hp === hp);
}
{
  // Self-Destruct: damage AND knockback grow with stacks; max stacks = black, bigger blast
  const a = setup(), b = setup();
  a.gunner.mana = b.gunner.mana = MW.CONFIG.combat.maxMana;
  b.gunner.gunnerStacks = 10;
  a.sim.step([intent({ ultPressed: true }), I]);
  b.sim.step([intent({ ultPressed: true }), I]);
  check("Self-Destruct damage, knockback and size grow with stacks (black at max)",
    b.gunner.hit.damage > a.gunner.hit.damage && b.gunner.hit.knockback > a.gunner.hit.knockback &&
    b.gunner.hit.radius > a.gunner.hit.radius && b.gunner.hit.black === true && !a.gunner.hit.black);
}
{
  const P = C.hitter.passive;
  check("Bullet Evolution tiers come from the passive config (3 / 5 / 7 / 10)",
    MW.gunnerTier(2, P) === 0 && MW.gunnerTier(3, P) === 1 && MW.gunnerTier(5, P) === 2 && MW.gunnerTier(7, P) === 3 && MW.gunnerTier(10, P) === 4);
}
console.log(failures ? `${failures} Gunner check(s) failed.` : "All Gunner checks passed.");
process.exit(failures ? 1 : 0);