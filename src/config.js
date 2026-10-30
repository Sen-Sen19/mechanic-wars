// Mechanic Wars - shared configuration.
// Plain scripts (no ES modules) so the game runs by opening index.html from disk,
// and the same files load in Node for the headless balance/smoke tools.
(function (g) {
  const MW = (g.MW = g.MW || {});

  MW.CONFIG = {
    tickRate: 60, // fixed simulation rate (Hz)
    rngSeed: 7331, // seeded randomness for the sim (Abyssal Transit destinations): same seed -> same match
    physics: {
      gravity: 0.55, // px / tick^2
    },
    // Shared combat tuning (same for every character; per-character numbers live in characters.js).
    combat: {
      knockbackScaling: 1.5, // k in: knockback = base x (1 + k x fractionOfMaxHpLost) / (weight / weightUnit)
      weightUnit: 100, // weight value that counts as "1.0" (Fighter)
      launchHorizontal: 1, // launch vx = knockback x this, away from the attacker
      launchVertical: 0.6, // launch vy = -knockback x this (lifts grounded targets)
      hitstunBase: 10, // hitstun ticks = base + perKnockback x knockback (capped)
      hitstunPerKnockback: 2.5,
      hitstunMax: 45,
      hitFlashFrames: 6,
      meleeBoxHeight: 0.7, // melee hitbox height as a fraction of the attacker's height
      maxMana: 100, // ultimate meter size
      manaPerHit: 10, // mana gained for every hit you LAND (an attack may override with manaGain)
      koFrames: 45, // pause after a KO before both fighters reset
      blastPenalty: 0.25, // fraction of MAX HP lost when leaving the arena (fixed, armor does not apply)
    },
    // Bot tuning (behaviour only; the bots use each character's own attack data).
    bots: {
      speedScale: 0.75, // bots never run faster than this fraction of their character's run speed. 1 = full speed
      reactionTicks: 14, // bots aim at where you were this many ticks ago (60 ticks = 1 s). 0 = perfect aim
      startDelay: 20, // ticks a bot waits after each spawn before it moves
      seed: 1337, // same seed -> same bot behaviour every run (needed for the Stage 6 balance sim)
      aggressiveAttackChance: 0.6, // chance per tick to press attack while the target is in reach
      spacingAttackChance: 0.35,
      spacingIdealFactor: 0.85, // preferred gap = this x own attack reach
      spacingBackoffMargin: 25, // spacing bot backs off when an enemy wind-up could reach it (+ this many px)
      spacingReaction: 0.7, // chance per tick that the spacing bot reacts to an enemy wind-up
      jumpCooldown: 12, // ticks between bot jump presses
      dropCooldown: 20, // ticks between bot drop-through presses
    },
    inputBufferFrames: 6, // jump/attack presses made too early are remembered this many ticks
    respawnInvulnFrames: 60,
  };

  // Movement values every character starts from. A character in characters.js
  // only lists what differs, so a missing field never silently becomes 0.
  MW.MOVEMENT_DEFAULTS = {
    groundAccel: 0.9,
    groundFriction: 0.8,
    airAccel: 0.45,
    airDrag: 0.08,
    maxAirJumps: 1,
    maxFallSpeed: 13,
    fastFallSpeed: 20,
    dropThroughFrames: 10,
  };
})(globalThis);