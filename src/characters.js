// Mechanic Wars - character definitions. DATA ONLY: no logic lives here.
// All characters share one movement/combat system (fighter.js); they differ only by these numbers.
//
// Units: distances in px, speeds in px per tick (60 ticks/sec), times in ticks (frames).
// Fighter is the baseline; the others are balanced around it.
// Combat values (hp, armor, weight, attack) are defined now but first used in Stage 3+,
// and will be tuned from balance-sim results.
(function (g) {
  const MW = (g.MW = g.MW || {});

  function define(overrides) {
    return Object.assign({}, MW.MOVEMENT_DEFAULTS, overrides);
  }

  MW.CHARACTERS = {
    // Balanced melee baseline.
    fighter: define({
      id: "fighter",
      name: "Fighter",
      color: "#4aa3ff",
      look: "headband",
      width: 52,
      height: 88,
      maxHP: 100,
      armor: 20,
      weight: 100,
      runSpeed: 5.2,
      jumpStrength: 12.8,
      airJumpStrength: 11.5,
      // 3-hit chain: tap attack again during a swing to continue. The base numbers are hit 1;
      // chain[i] overrides them for hit i+1. Light hits barely push the target (so the next
      // hit connects); the finisher launches. "advance" = forward step-in speed while swinging.
      attack: {
        type: "melee", damage: 7, startup: 6, active: 4, recovery: 4, knockback: 2.5, range: 60, advance: 2.5,
        chain: [
          {},
          { startup: 3 },
          { damage: 10, startup: 6, active: 5, recovery: 20, knockback: 9, range: 70 },
        ],
      },
    }),

    // Fragile ranged spacer. Slow basic attack on purpose: the Mage will rely on skills later,
    // not on normal hits. Bolt is still the longest-range, fastest-flying projectile.
    mage: define({
      id: "mage",
      name: "Mage",
      color: "#b06cff",
      look: "hat",
      width: 34,
      height: 76,
      maxHP: 82,
      armor: 10,
      weight: 85,
      runSpeed: 4.8,
      jumpStrength: 12.8,
      airJumpStrength: 11.5,
      attack: {
        type: "projectile",
        damage: 7,
        startup: 20,
        recovery: 26,
        knockback: 4,
        projectile: { speed: 11, range: 700, size: 12, style: "arcane" },
      },
    }),

    // Fast and fragile: many weak hits, best mobility.
    assassin: define({
      id: "assassin",
      name: "Assassin",
      color: "#ff3355", // crimson: slash arcs, select card, chips
      look: "scarf",
      width: 32,
      height: 70,
      maxHP: 75,
      armor: 7,
      weight: 84,
      runSpeed: 6.8,
      jumpStrength: 13.8,
      airJumpStrength: 12.2,
      attack: { type: "melee", damage: 5.2, startup: 3, active: 3, recovery: 3, knockback: 3.2, range: 54, fxStyle: "blood" },
    }),

    // Gunslinger: quick draw, fast straight bullets, lighter and quicker than the Fighter
    // (but slower than the Assassin). Bullets fly faster than the Mage bolt but die sooner.
    // (internal id stays "hitter" so saved references and tools keep working)
    hitter: define({
      id: "hitter",
      name: "Gunner",
      color: "#ff7a3d",
      look: "gun",
      width: 36,
      height: 74,
      maxHP: 76,
      armor: 8,
      weight: 86,
      runSpeed: 5.8,
      jumpStrength: 13.0,
      airJumpStrength: 11.6,
      attack: {
        type: "projectile",
        damage: 5.6,
        startup: 5,
        recovery: 28,
        knockback: 3.8,
        projectile: { speed: 13, range: 420, size: 10, style: "bullet" },
      },
    }),

    // Durable and slow: wins by surviving and holding space, not by damage.
    // Armor kept modest on purpose; weight carries the knockback resistance.
    tank: define({
      id: "tank",
      name: "Tank",
      color: "#8a96a8",
      look: "helmet",
      width: 60,
      height: 92,
      maxHP: 170,
      armor: 30,
      weight: 150,
      runSpeed: 3.8,
      jumpStrength: 12.6,
      airJumpStrength: 11.2,
      attack: { type: "melee", damage: 10, startup: 9, active: 5, recovery: 16, knockback: 6, range: 74 },
    }),
  };

  MW.CHARACTER_ORDER = ["fighter", "mage", "assassin", "hitter", "tank"];
})(globalThis);