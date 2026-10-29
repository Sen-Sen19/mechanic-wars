// Mechanic Wars - character definitions. DATA ONLY: no logic lives here.
// All characters share one movement/combat system (fighter.js); they differ only by these numbers.
//
// Units: distances in px, speeds in px per tick (60 ticks/sec), times in ticks (frames).
// Brawler (id "fighter") is the movement baseline; the others are balanced around it.
// Combat values (hp, armor, weight, attack) are defined now but first used in Stage 3+,
// and will be tuned from balance-sim results.
(function (g) {
  const MW = (g.MW = g.MW || {});

  function define(overrides) {
    // skills: 4 slots (touch pad / keys U I O L). null = empty. Filled per character later,
    // e.g. skills: [{ name: "Dash", cooldown: 180 }, null, null, null].
    return Object.assign({ skills: [null, null, null, null] }, MW.MOVEMENT_DEFAULTS, overrides);
  }

  MW.CHARACTERS = {
    // BRAWLER (internal id stays "fighter"): close-range combo specialist.
    // Fast short-reach jab > hook > uppercut. The uppercut launches straight UP (launchH small,
    // launchV big), which sets up follow-ups and punishes jumpers. Low reach is the trade-off.
    fighter: define({
      id: "fighter",
      name: "Brawler",
      color: "#4aa3ff",
      look: "boxer",
      width: 52,
      height: 88,
      maxHP: 100,
      armor: 20,
      weight: 100,
      // PASSIVE - Combat Momentum: every hit you LAND adds 1 momentum (whiffs add nothing).
      // At max, the next momentumBonus skill spends it all for +bonus damage (once).
      // Momentum fades after decayDelay ticks without landing a hit (then 1 per decayStep ticks)
      // and hurtLoss is lost every time the Fighter takes a hit.
      passive: { type: "momentum", max: 5, decayDelay: 150, decayStep: 60, hurtLoss: 2, bonus: 0.5 },
      skills: [
        // SKILL 1 - Power Strike: slow heavy punch, big damage + stagger (fixed stun, little launch).
        // Cooldown in ticks (60 = 1 s). Punishable on a miss: long startup + recovery.
        {
          id: "power_strike", name: "Power", icon: "PWR", cooldown: 240,
          attack: {
            type: "melee", isSkill: true, momentumBonus: true, fxShape: "power", pose: 3,
            damage: 24, startup: 16, active: 5, recovery: 30,
            knockback: 3.5, launchH: 0.35, launchV: 0.2, stun: 34, // stagger, not a launch
            range: 66, boxH: 0.85, advance: 1.6, manaGain: 18,
          },
        },
        // SKILL 2 - Fist Rush: short explosive dash (the startup), then a straight punch.
        // The dash stops early when the punch reaches an enemy. Shorter and slower than a charge/dash-slash.
        {
          id: "fist_rush", name: "Rush", icon: "RSH", cooldown: 300,
          attack: {
            type: "melee", isSkill: true, momentumBonus: true, fxShape: "rush", pose: 4,
            damage: 14, startup: 10, active: 4, recovery: 26, // startup = the dash itself
            dashSpeed: 9, // px per tick while dashing (about 90 px total)
            knockback: 4, launchH: 0.6, launchV: 0.2, stun: 20, // brief hit-stun
            range: 56, advance: 3, manaGain: 12,
          },
        },
        null, null,
      ],
      runSpeed: 5.2,
      jumpStrength: 12.8,
      airJumpStrength: 11.5,
      attack: {
        type: "melee", damage: 6, startup: 4, active: 4, recovery: 4, knockback: 2.5, range: 52, advance: 2.5, fxShape: "jab",
        chain: [
          {},
          { startup: 3, damage: 7, fxShape: "hook" },
          { damage: 10, startup: 7, active: 5, recovery: 20, knockback: 9, range: 58, launchH: 0.15, launchV: 1.7, fxShape: "upper", boxH: 0.9, lift: 12 },
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

    // BULWARK (internal id stays "tank"): immovable shield-bearer.
    // One slow shield bash with SUPER ARMOR while winding up and swinging: hits still hurt him,
    // but cannot interrupt or launch him (lethal hits still KO). A miss is very punishable.
    tank: define({
      id: "tank",
      name: "Bulwark",
      color: "#8a96a8",
      look: "shield",
      width: 60,
      height: 92,
      maxHP: 130,
      armor: 22,
      weight: 150,
      runSpeed: 3.8,
      jumpStrength: 12.6,
      airJumpStrength: 11.2,
      attack: { type: "melee", damage: 10, startup: 18, active: 6, recovery: 34, knockback: 10, range: 70, advance: 1.4, superArmor: true, fxShape: "slam", boxH: 0.85 },
    }),
  };

  MW.CHARACTER_ORDER = ["fighter", "mage", "assassin", "hitter", "tank"];
})(globalThis);