// Mechanic Wars - character definitions. DATA ONLY: no logic lives here.
// All characters share one movement/combat system (fighter.js); they differ only by these numbers.
//
// Units: distances in px, speeds in px per tick (60 ticks/sec), times in ticks (frames).
// Vanguard (id "fighter") is the movement baseline; the others are balanced around it.
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
    // VANGUARD (internal id stays "fighter"; was "Brawler"): bare-chested gauntlet fighter, close-range combo specialist.
    // Fast short-reach jab > hook > uppercut. The uppercut launches straight UP (launchH small,
    // launchV big), which sets up follow-ups and punishes jumpers. Low reach is the trade-off.
    fighter: define({
      id: "fighter",
      name: "Vanguard",
      color: "#c98a3a", // dark bronze: select card, chips, HUD
      look: "gauntlet",
      hitFx: "brawler", // sim sends "strike" events for every landed punch (visual only, see brawler_fx.js)
      width: 52,
      height: 88,
      maxHP: 300,
      armor: 20,
      weight: 100,
      // PASSIVE - Combat Momentum: every hit you LAND adds 1 momentum (whiffs add nothing).
      // At max, the next momentumBonus skill spends it all for +bonus damage AND +bonusKnockback (once).
      // Momentum fades after decayDelay ticks without landing a hit (then 1 per decayStep ticks),
      // hurtLoss is lost every time the Vanguard takes a hit, whiffLoss when a melee swing hits nothing.
      passive: { type: "momentum", max: 5, decayDelay: 150, decayStep: 60, hurtLoss: 2, whiffLoss: 1, bonus: 0.5, bonusKnockback: 1.35 },
      skills: [
        // SKILL 1 - Power Strike: plants his feet, pulls the fist back, then a crushing punch.
        // High damage + brief stagger, ground shockwave on impact (bigger when empowered).
        // Noticeable startup + recovery: punishable if dodged. Combo finisher / punish tool.
        {
          id: "power_strike", name: "Power", icon: "PWR", cooldown: 240,
          attack: {
            id: "power_strike", type: "melee", isSkill: true, momentumBonus: true, fxShape: "power", pose: 3,
            damage: 24, startup: 18, active: 5, recovery: 32,
            knockback: 3.5, launchH: 0.35, launchV: 0.2, stun: 34, // stagger, not a launch
            range: 66, boxH: 0.85, advance: 1.6, manaGain: 18,
          },
        },
        // SKILL 2 - Fist Rush: short explosive dash (the startup) leaving ground cracks + dust, then a straight punch.
        // Strong hit-stun on contact. Shorter than a charge / dash-slash. A miss = full recovery.
        {
          id: "fist_rush", name: "Rush", icon: "RSH", cooldown: 300,
          attack: {
            id: "fist_rush", type: "melee", isSkill: true, momentumBonus: true, fxShape: "rush", pose: 4,
            damage: 14, startup: 10, active: 4, recovery: 26, // startup = the dash itself
            dashSpeed: 9, // px per tick while dashing (about 90 px total)
            knockback: 4, launchH: 0.6, launchV: 0.2, stun: 30, // strong hit-stun
            range: 56, advance: 3, manaGain: 12,
          },
        },
        // SKILL 3 - Rising Fist: slight crouch, then a devastating upward punch that launches the target.
        // Limited vertical hit area (still catches jumpers); startup + recovery = not a guaranteed hit.
        // Empowered: launches higher (see passive.bonusKnockback). impactFx = flame pillar + shake.
        {
          id: "rising_fist", name: "Rising", icon: "RIS", cooldown: 300,
          attack: {
            id: "rising_fist", type: "melee", isSkill: true, momentumBonus: true, fxShape: "rising", pose: 5,
            impactFx: "rising",
            damage: 22, startup: 14, active: 6, recovery: 28,
            knockback: 8, launchH: 0.25, launchV: 2.0, stun: 40, // sends them straight up
            range: 66, boxH: 1.25, lift: 24, advance: 1.5, manaGain: 15,
          },
        },
        // SKILL 4 - Hundred Fists: ~3 seconds of rapid punches thrown from DIFFERENT ANGLES, rooted in place (advance 0).
        //   active = barrage length in ticks (180 = 3 s), multiHit = ticks between punches (6 = 10 punches/s).
        //   sequence = the punches in order, repeating: each beat swaps in its own hit shape, height and pose
        //   (hand: 0 = lead fist, 1 = rear fist; kb = knockback multiplier; lift / boxH / range / launch* override the hitbox).
        //   Damage is PER punch. Targets that leave the range stop being hit. No super armor: getting hit interrupts it.
        //   Empowered: every punch hits harder. momentumGain 0 so the barrage does not instantly refill Momentum.
        {
          id: "hundred_fists", name: "Hundred", icon: "HND", cooldown: 900,
          attack: {
            id: "hundred_fists", type: "melee", isSkill: true, momentumBonus: true, fxShape: "bz_jab", pose: 8, punch: "jab", hand: 0, // (first tick before the sequence starts)
            damage: 1.4, startup: 10, active: 180, recovery: 26, multiHit: 6,
            knockback: 1.2, launchH: 0.4, launchV: 0, stun: 9, // light stagger on every punch
            range: 62, boxH: 0.9, advance: 0, manaGain: 2, momentumGain: 0,
            superArmor: false,
            sequence: [
              { punch: "jab",   hand: 0, fxShape: "bz_jab",   range: 64 },
              { punch: "cross", hand: 1, fxShape: "bz_jab",   range: 66, kb: 1.2 },
              { punch: "hook",  hand: 0, fxShape: "bz_hook",  range: 58, boxH: 1.0, kb: 1.4, launchH: 0.7 },
              { punch: "body",  hand: 1, fxShape: "bz_body",  range: 60, boxH: 0.6, lift: -22, kb: 1.1 },
              { punch: "upper", hand: 0, fxShape: "bz_upper", range: 54, boxH: 1.1, lift: 16, kb: 1.8, launchH: 0.2, launchV: 0.7 },
              { punch: "cross", hand: 1, fxShape: "bz_jab",   range: 66, kb: 1.2 },
            ],
          },
        },
      ],
      // ULTIMATE - Meteor Fist: needs a full mana bar. Long, visible charge (startup, pose 7) while he can be INTERRUPTED,
      // then one colossal spectral-fist punch. LOCK-ON: if an enemy is within lockOn.range at the moment the punch is released
      // it cannot be dodged by moving or jumping (it keeps hitting anyone within lockOn.follow during the swing).
      // Nobody in range = a pure miss and a long recovery. Huge damage + knockback (ring-out threat).
      ultimate: {
        id: "meteor_fist", name: "Meteor Fist", icon: "ULT",
        attack: {
          id: "meteor_fist", type: "melee", isSkill: true, fxShape: "meteor", pose: 7,
          impactFx: "meteor",
          damage: 60, startup: 54, active: 8, recovery: 60,
          knockback: 15, launchH: 1.5, launchV: 0.35,
          range: 110, boxH: 1.2, lockOn: { range: 300, follow: 420 },
          superArmor: false, // can be interrupted while charging
          manaGain: 0, momentumGain: 0, // the ultimate does not refill mana or build momentum
        },
      },
      // BASIC ATTACK - CHARGED PUNCH: after the tap / jab, keep the attack button held. After holdStart ticks the
      // charge begins; at `time` ticks it is ready (glow + ring). Releasing when ready throws the heavy punch,
      // releasing early cancels it. Being hit while charging cancels it. Needs "attackHeld" in the intent (input.js).
      charge: {
        holdStart: 14, // ticks the button must be held before charging begins (a tap never charges)
        time: 60, // ticks of charging to be ready (60 = 1 s)
        attack: {
          id: "charged_punch", type: "melee", isSkill: true, fxShape: "charged", pose: 9,
          damage: 22, startup: 5, active: 5, recovery: 26, // startup = the short swing after release
          knockback: 9, launchH: 1.1, launchV: 0.35, stun: 34,
          range: 64, boxH: 0.9, advance: 2.2, manaGain: 14,
        },
      },
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

    // VOID MAGE (internal id "mage"; was Arbiter): dark-magic controller. Gravity, dimensional rifts and living shadows:
    // restrict movement, control areas, escape bad fights, then punish with burst. Fragile, and punishable when skills miss.
    // EVERY number below is tunable: damage, cooldowns (ticks, 60 = 1 s), durations, distances, hitboxes, speeds, timings.
    // Art: void_mage_art.js (body) + mage_fx.js (all effects). Logic: fighter.js ("VOID MAGE" block) and sim.js (zones, projectile riders).
    mage: define({
      id: "mage",
      name: "Void Mage",
      color: "#b44bff",
      look: "hat",
      width: 34,
      height: 76,
      maxHP: 220,
      armor: 10,
      weight: 85,
      runSpeed: 4.8,
      jumpStrength: 12.8,
      airJumpStrength: 11.5,

      // PASSIVE - Void Overload: every `hits` successful hits against the enemy charge the next basic attack. That attack input fires the
      // empowered gravity orb (replacing the Void Shard AND the Singularity). The orb envelops the enemy, lifts it (liftSpeed x liftTicks px),
      // holds it `hang` ticks, then slams it into the ground for heavy damage. The charge is spent when the orb is FIRED (even on a miss)
      // and the hit counter resets. idleReset = ticks without landing a hit before the counter resets (0 = never).
      // Spike eruptions, shards, singularities and orb hits count; zone ticks, the slam and the ultimate do not (noOverload).
      passive: {
        type: "voidoverload", hits: 3, idleReset: 0,
        orb: {
          id: "void_orb", type: "projectile", isSkill: true, overloadOrb: true,
          damage: 3, startup: 16, recovery: 30, knockback: 2, stun: 20, manaGain: 8,
          projectile: { speed: 8, range: 620, size: 28, style: "arcane", kind: "orb" },
          slam: { liftSpeed: 7, liftTicks: 14, hang: 8, slamSpeed: 22, maxTicks: 90, damage: 22, knockback: 9, launchH: 0.5, launchV: 0.2, stun: 36, manaGain: 12 },
        },
      },

      skills: [
        // SKILL 1 - Void bound Wraiths: a rift opens and two small shadow wraiths chase the enemy for `pursuit` ticks (300 = 5 s).
        // One latches onto the legs, the other hovers at the head. If BOTH catch it, the enemy cannot move, jump or attack for `restrain` ticks
        // (240 = 4 s) and the wraiths vanish when it ends. Pursuit runs out without both catching = they vanish. speed (px/tick) vs the
        // enemy's run speed is what makes them escapable; catchRadius is how close a wraith must get to its anchor.
        {
          id: "void_wraiths", name: "Wraiths", icon: "WRA", cooldown: 720,
          attack: {
            id: "void_wraiths", type: "melee", isSkill: true, utility: true, pose: 0,
            damage: 0, startup: 20, active: 2, recovery: 18, knockback: 0, range: 1, advance: 0, manaGain: 0,
            wraiths: { pursuit: 300, restrain: 240, speed: 4.6, turn: 0.1, catchRadius: 20, legOffset: 8, headOffset: 14, fadeTicks: 14 },
          },
        },
        // SKILL 2 - Singularity: he hurls a miniature black hole (was the charged basic; the hold key is now Void Step). On impact: heavy damage,
        // and the enemy is dragged `pull.distance` px toward the Mage over `pull.ticks` ticks (speed = max px/tick). A burst skill AND a setup:
        // the pull puts the target where Spikes / shards / the empowered orb finish it. A miss is punishable (recovery).
        {
          id: "singularity", name: "Singularity", icon: "SNG", cooldown: 420,
          attack: {
            id: "singularity", type: "projectile", isSkill: true, pose: 0,
            damage: 24, startup: 14, recovery: 26, knockback: 5, launchH: 0.3, launchV: 0, manaGain: 14,
            projectile: { speed: 9, range: 640, size: 22, style: "arcane", kind: "singularity", pull: { distance: 100, speed: 8, ticks: 14 } },
          },
        },
        // SKILL 3 - Rift Spikes (BURST): after a short cast, `count` huge spikes erupt in a tight cluster (radius px) UNDER THE ENEMY (its position
        // when the cast completes; the platform below it, within `reach` px of the Mage; too far = they erupt at the edge of his reach) after a
        // `warn` tick ground-crack telegraph. Each enemy is hit once (eruptDamage, launched up). If the target is SET UP (restrained by the
        // Wraiths, slowed in Grasp, or just dragged in by a Singularity) the hit deals setupMul x the damage. Then the spikes shrink to `zoneHeight` px and
        // stay `duration` ticks as a weaker hazard: zoneDamage every `zoneEvery` ticks to anyone touching them. `dissolve` ticks of fade at the end.
        {
          id: "abyssal_spikes", name: "Spikes", icon: "SPK", cooldown: 480,
          attack: {
            id: "abyssal_spikes", type: "melee", isSkill: true, utility: true, pose: 0,
            damage: 0, startup: 16, active: 2, recovery: 22, knockback: 0, range: 1, advance: 0, manaGain: 0,
            spikes: { atEnemy: true, reach: 520, count: 5, radius: 80, width: 26, height: 120, warn: 12, spread: 8, rise: 6, eruptTicks: 14, eruptDamage: 20, setupMul: 1.6, knockback: 5, launchH: 0.3, launchV: 1.1, stun: 22, manaGain: 10, zoneHeight: 40, zoneDamage: 1.5, zoneEvery: 24, duration: 150, dissolve: 24 },
          },
        },
        // SKILL 4 - Abyssal Grasp (SLOW, then BURST): a wave of black liquid spreads over the platform around him (radius px, `spread` ticks to full
        // size) for `duration` ticks (120 = 2 s). Enemies standing in it (feet within `zoneHeight` px of the surface) get their speed cut to slowMul and
        // cannot jump (air jumps included). Then the pool COLLAPSES: for `collapse.warn` ticks it shrinks to `shrink` x its radius and drags everyone
        // inside toward the centre (pullSpeed px/tick); when it closes, everyone still inside takes `damage` + a stun and is launched up (setup for
        // Spikes / orb / shards). Leave the pool before it finishes closing to avoid the blast. `linger` = ticks the empty pool takes to fade after.
        {
          id: "abyssal_grasp", name: "Grasp", icon: "GRP", cooldown: 600,
          attack: {
            id: "abyssal_grasp", type: "melee", isSkill: true, utility: true, pose: 0,
            damage: 0, startup: 22, active: 2, recovery: 18, knockback: 0, range: 1, advance: 0, manaGain: 0,
            grasp: {
              radius: 210, spread: 22, duration: 120, zoneHeight: 80, slowMul: 0.3, noJump: true,
              collapse: { warn: 18, shrink: 0.55, pullSpeed: 3, damage: 18, knockback: 6, launchH: 0.2, launchV: 1.0, stun: 30, manaGain: 12, linger: 12 },
            },
          },
        },
      ],

      // ULTIMATE - EVENT HORIZON (internal id stays "void_execution"): he levitates and charges for `startup` ticks (60 = 1 s, he can be
      // interrupted). If an enemy is within `range` px a rift opens at ITS position and a colossal shadow rises (`openTicks`). If the enemy is
      // still inside the grab zone (grabRX px sideways, grabRY px vertically from the rift) when it finishes opening, it is seized and lifted
      // (liftTicks), then pierced `impales` times (impaleDamage each, one per impaleGap ticks, so every strike can be read), the entity pulls it
      // back (`windup` ticks) and slams it down (slamDamage = the biggest hit + big knockback = ring-out threat at an edge). Then it lets go and
      // dissolves (sinkTicks). Total damage = impales x impaleDamage + slamDamage = 5 x 8 + 40 = 80 before armor (about 66 on a Fighter). The slam knockback is moderate: he is driven into the floor and stays down (slamStun), a ring-out only happens near an edge. Moving out of the zone during openTicks makes
      // it a miss (sinkTicks, then missRecovery, no damage). Nobody in range at all = a pure miss with the plain recovery below. Needs a full mana bar.
      ultimate: {
        id: "void_execution", name: "Event Horizon", icon: "ULT",
        attack: {
          id: "void_execution", type: "melee", isSkill: true, utility: true, pose: 0, superArmor: false,
          damage: 0, startup: 60, active: 1, recovery: 60, knockback: 0, range: 1, advance: 0, manaGain: 0,
          execution: {
            range: 520, openTicks: 44, grabRX: 80, grabRY: 120, liftSpeed: 4, liftTicks: 22,
            impales: 5, impaleGap: 16, impaleDamage: 8, impaleStun: 14, settle: 14,
            windup: 18, windupRise: 2.2,
            slamSpeed: 22, slamDamage: 40, slamKnockback: 8, slamLaunchH: 0.9, slamLaunchV: 0.25, slamStun: 40,
            sinkTicks: 40, endRecovery: 40, missRecovery: 60,
          },
        },
      },

      // BASIC ATTACK - Void Shard: a quick compressed-dark-energy projectile. Reliable repeated ranged pressure.
  attack: {
    type: "projectile",
    damage: 4.5,
    startup: 9,
    recovery:60, // increased from 22
    knockback: 2.2,
    projectile: { speed: 13, range: 620, size: 10, style: "arcane", kind: "shard" },
},
      // HOLD KEY - Void Step (no skill slot): TAP the attack button = Void Shard, HOLD it `holdStart` ticks (60 = 1 s, on the ground) = he melts
      // into a black pool (`startup` = the melt, still hittable and interruptible), is UNTARGETABLE once fully dissolved for `hide` ticks, then
      // reforms at a random platform top (`edgeMargin` px from the edges, at least `minEnemyDist` px from the enemy when possible, `tries` samples).
      // `reform` = ticks to rebuild the body (the first `reformSafe` are still untargetable). `cooldown` = ticks before the hold works again
      // (during it a hold is just a normal tap). Never reappears outside the arena (only platform tops are valid). Release the button to use it again.
      hold: {
        holdStart: 14, cooldown: 360,
        attack: {
          id: "abyssal_transit", name: "Void Step", type: "melee", isSkill: true, utility: true, pose: 0,
          damage: 0, startup: 20, active: 1, recovery: 12, knockback: 0, range: 1, advance: 0, manaGain: 0,
          transit: { hide: 40, reform: 22, reformSafe: 6, edgeMargin: 30, minEnemyDist: 220, tries: 12 },
        },
      },
    }),

    // WRAITH class (internal id "assassin") - character "BLOODLUST": aggressive hunter, fast and fragile,
    // many weak hits, best mobility. Look: obsidian suit, crimson sash, curved fang blades, blood-red energy
    // (art in character_art.js, effects in assassin_fx.js). Stats unchanged by the redesign.
    assassin: define({
      id: "assassin",
      name: "Wraith", // class name shown on the select card (was "Assassin")
      epithet: "Bloodlust", // the character's own name
      color: "#e01a3c", // blood red: slash arcs, select card, chips
      look: "fangs",
      // PASSIVE - Death Mark: consecutive landed hits stack on the target (a miss or stackWindow ticks without a hit resets them).
      // At max stacks the target is MARKED for `duration` ticks: the next skill (markBonus) deals +bonus damage, then the mark is spent.
      passive: { type: "deathmark", max: 4, stackWindow: 180, duration: 420, bonus: 0.6 },
      skills: [
        // SKILL 1 - Chained Scythe: throws a chained scythe along a thin line (range). On a hit: initial damage, the enemy is
        // dragged to close range, a bomb is attached and explodes for extra damage, then he jumps away automatically in the
        // direction held on the stick (left / right; straight back if none). A miss is punishable (recovery).
        {
          id: "chained_scythe", name: "Scythe", icon: "SCY", cooldown: 480,
          attack: {
            id: "chained_scythe", type: "melee", isSkill: true, markBonus: true, fxShape: "scythe", pose: 4,
            damage: 7, startup: 10, active: 10, recovery: 22,
            knockback: 0, launchH: 0, launchV: 0, stun: 90, // the pull holds the target; this is only a safety timeout
            range: 340, boxH: 0.55, manaGain: 12,
            // The hook is a REAL flying head now: it leaves the hand at `speed` px per tick and the hit lands the moment it touches
            // the enemy (a close enemy is hit sooner). `active` is the flight time (range / speed, rounded up). A miss: the head
            // reaches `range`, then the chain is reeled back during the recovery.
            hook: { speed: 36 },
            scythe: {
              pullSpeed: 15, // px per tick the target is dragged
              closeRange: 44, // px gap at which the bomb is attached
              maxTicks: 40, // longest pull
              bombDelay: 14, // ticks between attaching the bomb and the explosion
              bombDamage: 14, bombKnockback: 6, bombLaunchH: 1.2, bombLaunchV: 0.5, bombStun: 30, bombMana: 10,
              jumpVx: 9, jumpVy: 11, // the escape jump
              endRecovery: 10, // ticks of recovery after the jump starts
            },
          },
        },
        // SKILL 2 - Phantom Decoy: a smoke puff, an illusion stays where he stood and runs at the enemy on its own (hops now and
        // then, never walks off a platform) for `duration` ticks, while the real Assassin is cloaked for `cloak` ticks (cloakAlpha =
        // how visible he is: 0 = gone; the UI keeps a faint outline so the owner can see himself). Repositioning is free; attacking
        // (basic, skill, ultimate, charge) ends the cloak early, and so does being hit (revealOnHit). The illusion cannot be hit.
        // Needs the enemy (f.foe, set by Sim.step) to chase; without one it walks in its facing direction.
        {
          id: "phantom_decoy", name: "Decoy", icon: "DCY", cooldown: 600,
          attack: {
            id: "phantom_decoy", type: "melee", isSkill: true, utility: true, pose: 8, // utility: never hits, never counts as a whiff
            damage: 0, startup: 6, active: 2, recovery: 8, knockback: 0, range: 1, advance: 0, manaGain: 0,
            decoy: {
              duration: 120, // illusion lifetime (120 = 2 s)
              cloak: 120, cloakAlpha: 0.1, revealOnHit: true, // real Assassin invisibility
              speed: 4.8, // px per tick the illusion runs (his own runSpeed is 6.8)
              stopGap: 70, // the illusion stops this far from the enemy (px)
              jumpEvery: 55, jumpV: 11, // hops every N ticks (0 = never)
              edgeSafe: true, chase: true,
            },
          },
        },
        // SKILL 3 - Rupture: a wide slash (markBonus). It also opens a wound: every dotEvery ticks the victim loses dotDamage, and
        // while MOVING he loses up to moveDamage per tick (scaled by speed: full run = moveDamage, a slow walk less, standing = 0).
        // After standing still stillAfter ticks the ticks drop to stillMul of dotDamage. Lasts `duration` ticks (300 = 5 s).
        // Bleed ignores armor when ignoreArmor is true; stagger from other hits does not count as movement (countWhileStunned).
        {
          id: "rupture", name: "Rupture", icon: "RUP", cooldown: 420,
          attack: {
            id: "rupture", type: "melee", isSkill: true, markBonus: true, fxStyle: "blood", pose: 5,
            damage: 9, startup: 8, active: 4, recovery: 20,
            knockback: 3, launchH: 0.6, launchV: 0, stun: 16,
            range: 74, boxH: 0.95, advance: 1.5, manaGain: 10,
            rupture: { duration: 300, dotDamage: 1.0, dotEvery: 30, moveDamage: 0.04, stillAfter: 20, stillMul: 0.5, stillSpeed: 0.2, ignoreArmor: false, countWhileStunned: false, manaPerTick: 0 },
          },
        },
        // SKILL 4 - Phantom Onslaught: a short rooted slash that must CONNECT (range = the "enemy within range" check). Then the
        // victim is held while he vanishes and reappears around them from each beat's angle, striking every time, ending with a
        // heavy finisher that knocks them away (final: true). beats: dx/dy = offset from the victim's feet-level centre (dx < 0 =
        // left of them), vanish = ticks hidden before the strike, show = ticks visible after it, damage (per beat, before markBonus),
        // knockback / launchH / launchV / stun, pose = ATK.assassin index. A miss = the full recovery below; so is the end of the
        // sequence (endRecovery). Getting hit before the finisher breaks it.
        {
          id: "phantom_onslaught", name: "Onslaught", icon: "ONS", cooldown: 720,
          attack: {
            id: "phantom_onslaught", type: "melee", isSkill: true, markBonus: true, fxStyle: "blood", pose: 6,
            damage: 5, startup: 12, active: 4, recovery: 34,
            knockback: 0, launchH: 0, launchV: 0, stun: 40, // the sequence holds the target; this is only a safety timeout
            range: 150, boxH: 0.9, advance: 0, manaGain: 8,
            onslaught: {
              stun: 20, manaGain: 3, endRecovery: 44,
              beats: [
                { dx: -70, dy: 0, vanish: 7, show: 5, damage: 3, pose: 6 },
                { dx: 80, dy: -10, vanish: 6, show: 5, damage: 3, pose: 1 },
                { dx: 0, dy: -110, vanish: 6, show: 5, damage: 3, pose: 5 },
                { dx: -85, dy: 0, vanish: 6, show: 5, damage: 3, pose: 0 },
                { dx: 75, dy: -20, vanish: 6, show: 5, damage: 3.5, pose: 2 },
                { dx: -60, dy: 0, vanish: 14, show: 16, damage: 14, knockback: 11, launchH: 1.2, launchV: 0.5, stun: 34, pose: 3, final: true },
              ],
            },
          },
        },
      ],
      // ULTIMATE - Death Sentence: needs a full mana bar. A long, readable startup (pose 7), then a LOCK-ON initiating hit (like Meteor Fist:
      // if the enemy is within lockOn.range when it is released it cannot be dodged; nobody in range = a clean miss and a long recovery).
      // Then four illusions (illusions: dx/dy offsets from the victim, pose) surround and chain him for bindTicks; each throws shuriken
      // (throwGap ticks apart, flight ticks in the air, shurikenDamage each), then after finishDelay the finishing hit lands and they vanish.
      ultimate: {
        id: "death_sentence", name: "Death Sentence", icon: "ULT",
        attack: {
          id: "death_sentence", type: "melee", isSkill: true, pose: 7,
          damage: 6, startup: 50, active: 6, recovery: 30,
          knockback: 0, launchH: 0, launchV: 0, stun: 40, // the sequence holds the target; this is only a safety timeout
          range: 60, boxH: 1.2, advance: 0, lockOn: { range: 280, follow: 420 },
          superArmor: false, manaGain: 0,
          sentence: {
            bindTicks: 40, // illusions appear and chain the target
            illusions: [
              { dx: -110, dy: 0, pose: 5 }, { dx: 110, dy: 0, pose: 6 },
              { dx: -60, dy: -120, pose: 7 }, { dx: 60, dy: -120, pose: 7 },
            ],
            throwGap: 14, flight: 8, // ticks between throws / shuriken flight time
            shurikenDamage: 7, shurikenStun: 14,
            finishDelay: 10, fadeTicks: 14, endRecovery: 40, // endRecovery = punishable cooldown after the finish
            finish: { damage: 18, knockback: 12, launchH: 1.2, launchV: 0.5, stun: 36 },
          },
        },
      },
      width: 32,
      height: 70,
      maxHP: 260,
      armor: 7,
      weight: 84,
      runSpeed: 6.8,
      jumpStrength: 13.8,
      airJumpStrength: 12.2,
      // BASIC ATTACK - Quick Blade Combo: three fast slashes (the third is a heavier finisher that knocks back).
      attack: {
        type: "melee", damage: 5.2, startup: 3, active: 3, recovery: 3, knockback: 3.2, range: 54, fxStyle: "blood",
        chain: [
          {},
          { startup: 2, damage: 5.6, knockback: 3.6 },
          { startup: 5, active: 4, recovery: 12, damage: 8.5, knockback: 7, range: 60 },
        ],
      },
      // CHARGED DASH SLASH: after the tap / jab keep the attack button held (up to `time` ticks, 180 = 3 s).
      // Releasing at ANY moment fires it: he dashes forward and slashes whatever he passes through. The longer the charge,
      // the longer the dash and the harder the hit (scale: dist px [short charge, full charge], damage [short, full]).
      // speed = px per tick of the dash; he passes straight through enemies (the slash hits the first time the blade touches them)
      // and stops dead at the end of the dash.
      // Being hit while charging cancels it. Needs "attackHeld" in the intent (input.js).
      charge: {
        holdStart: 14, // ticks the button must be held before charging begins (a tap never charges)
        time: 180, // ticks of charging for the maximum dash
        scale: { dist: [90, 420], speed: 22, damage: [9, 20] },
        attack: {
          id: "charged_slash", type: "melee", isSkill: true, fxStyle: "blood", pose: 3, // no stopOnContact: he dashes THROUGH the enemy and ends up behind them
          damage: 9, startup: 2, active: 6, recovery: 24, // active is overwritten by the dash length on release
          knockback: 7, range: 70, boxH: 0.95, manaGain: 14,
        },
      },
    }),

    // Artillerist: elite arcane weapons specialist (obsidian split coat, bronze trim, arcane rifle). Quick draw, fast straight bullets, lighter and quicker than the Vanguard
    // (but slower than the Wraith). Bullets fly faster than the Arbiter bolt but die sooner.
    // (internal id stays "hitter" so saved references and tools keep working)
    hitter: define({
      id: "hitter",
      name: "Artillerist", // was "Gunner"
      color: "#3fa0ff", // arcane blue: select card, chips, HUD
      look: "gun",
      width: 36,
      height: 74,
      maxHP: 230,
      armor: 8,
      weight: 86,
      runSpeed: 5.8,
      jumpStrength: 13.0,
      airJumpStrength: 11.6,
      // PASSIVE - Bullet Evolution. Each normal bullet hit adds a stack; a missed bullet removes one.
      // The five visual tiers are derived from stacks in render.js. All values remain tunable here.
      // tiers = stack counts where the bullet look changes (yellow, orange, red, black); tierColors has one more colour (the plain bullet first).
      // ultKnockbackPerStack = Self-Destruct knockback gain per stack; ultBlackRadiusMul = blast size at max stacks (the black detonation).
      passive: {
        type: "bulletevolution", max: 10, damagePerStack: 0.08, missLoss: 1, barrageMissLoss: 2,
        tiers: [3, 5, 7, 10], tierColors: ["#e8eef8", "#ffe04a", "#ff8b24", "#f02d45", "#21162e"],
        ultKnockbackPerStack: 0.06, ultBlackRadiusMul: 1.3,
      },
      attack: {
        type: "projectile", gunnerBasic: true,
        damage: 5.6, startup: 5, recovery: 28, knockback: 3.8,
        projectile: { speed: 13, range: 420, size: 10, style: "bullet" },
      },
      // Hold normal attack to charge a five-round burst. The burst resolves each bullet independently.
      charge: {
        holdStart: 14, time: 42,
        // A rapid sequence: `shots` bullets, one every `gap` ticks, while he stands and fires (active is computed from shots + gap).
        // stun keeps the target staggered between shots. Knockback of every hit adds up, capped by maxLaunch (px per tick).
        attack: { id: "five_shot_barrage", type: "projectile", gunnerBarrage: true, isSkill: true,
          damage: 2.8, startup: 2, active: 1, recovery: 34, knockback: 2.2, launchH: 1, launchV: 0.1, stun: 12, manaGain: 2, maxLaunch: 14,
          projectile: { speed: 15, range: 440, size: 7, style: "bullet", shots: 5, gap: 4 } },
      },
      skills: [
        // Plant at your feet; press Skill 1 again to remotely detonate. One device at a time.
        { id: "remote_detonation", name: "Bomb", icon: "BMB", cooldown: 300,
          attack: { id: "remote_detonation", gunnerBomb: true, damage: 22, radius: 112, stun: 28, knockback: 8, launchH: 0.8, launchV: 0.9, duration: 360,
            manaGain: 10, explodeOnExpire: false, // false = an undetonated bomb just disarms when its time runs out; true = it blows up
          } },
        // Directional hop is a mobility action and deals no damage.
        { id: "combat_hop", name: "Hop", icon: "HOP", cooldown: 240,
          attack: { id: "combat_hop", gunnerHop: true, distance: 118, vertical: 5.8, duration: 10 } },
        // Seven pellets in a cone: angleStep = radians between neighbours. Close up they all hit; far away the outer ones fly past.
        // The knockback of every pellet that hits adds up (capped by maxLaunch).
        { id: "point_blank_blast", name: "Blast", icon: "SG", cooldown: 360,
          attack: { id: "point_blank_blast", type: "projectile", gunnerShotgun: true, isSkill: true,
            damage: 4.2, startup: 8, active: 1, recovery: 42, knockback: 1.6, launchH: 1.2, launchV: 0.4, stun: 10, manaGain: 1.5, maxLaunch: 16,
            projectile: { speed: 12, range: 170, size: 8, style: "bullet", pellets: 7, angleStep: 0.16 } } },
        // Two-second stationary charge; interruption cancels it. The fired shot is extremely fast.
        { id: "perfect_aim", name: "Aim", icon: "AIM", cooldown: 900,
          attack: { id: "perfect_aim", type: "projectile", isSkill: true, gunnerAim: true,
            damage: 42, startup: 120, active: 1, recovery: 54, knockback: 14, stun: 30, piercing: true,
            projectile: { speed: 58, range: 1400, size: 36, style: "bullet" } } },
      ],
      // Self-Destruct is a radial blast around the Gunner. He survives but has a long recovery.
      ultimate: { id: "self_destruct", name: "Self-Destruct", icon: "ULT",
        attack: { id: "self_destruct", type: "melee", isSkill: true, selfDestruct: true,
          damage: 54, radius: 245, startup: 72, active: 1, recovery: 78,
          knockback: 18, launchH: 1.3, launchV: 1.1, stun: 42, manaGain: 0 } },
    }),

    // BULWARK (internal id stays "tank"): immovable shield-bearer.
    // BASIC ATTACK: tap = Shield Slam (slow bash with SUPER ARMOR while winding up and swinging: hits still hurt him,
    // but cannot interrupt or launch him; lethal hits still KO; a miss is very punishable).
    // HOLD the attack button = Holy Guard (see `guard` below).
    tank: define({
      id: "tank",
      name: "Bulwark",
      color: "#a9b2c2", // weathered silver: select card, chips, HUD
      look: "shield",
      width: 60,
      height: 92,
      maxHP: 600,
      armor: 50,
      weight: 150,
      runSpeed: 3.8,
      jumpStrength: 12.6,
      airJumpStrength: 11.2,
      // PASSIVE - Holy Deflection: auto-deflects projectiles back to source, or activates a Holy Shield
      // for 97% damage reduction (3% passes through) on non-projectile hits.
      // Has an internal cooldown to prevent repeated activation.
      passive: {
        type: "holy_deflection",
        projectileDeflect: true, // a projectile that strikes him is sent back at whoever fired it (no damage to him)
        deflectSpeedMul: 1.15,   // the returned projectile flies this much faster than it arrived
        deflectDamageMul: 0.7,   // share of the original damage the returned projectile deals to its shooter
        damageReduction: 0.6,    // 60% damage reduction for non-projectiles (40% passes through; was 97%, which made him untouchable)
        cooldown: 180,           // internal cooldown in ticks (180 = 3 s; was 90), shared by both halves of the passive
        manaOnProc: 8,           // ultimate meter gained each time the passive triggers (he can charge the ult by defending)
        // While Holy Guard is standing it handles the FRONT, so the passive does not fire. Hits from BEHIND land normally
        // (that is the guard's weakness). Set true to let the passive still soften hits from behind while he guards.
        coversBackWhileGuarding: false,
      },
      attack: {
        type: "melee",
        damage: 7,     // was 10: the basic bash hurts less
        startup: 17,   // was 12: slower wind-up
        active: 7,     // was 9
        recovery: 36,  // was 24: heavy and punishable (60 ticks per swing, was 45)
        knockback: 3,  // was 5: the enemy is not shoved out of reach, so the next slam can still connect
        range: 88,     // was 70
        advance: 2.0,  // was 1.4: he steps into the swing, so it tracks a retreating enemy
        stopOnContact: true, // the step stops as soon as the enemy is in reach, so he never slides through them (was the cause of 'the enemy is a ghost')

        superArmor: true,
        fxShape: "slam",
        boxH: 1.05,    // was 0.85: taller hit shape, so a jumping or short enemy is not missed
      },
      // BASIC ATTACK (HOLD) - HOLY GUARD: keep the attack button held for `holdStart` ticks (a shorter press is the Shield Slam).
      // He plants the shield (startup = 42 ticks = 0.7 s, he can be hit and interrupted meanwhile), then the barrier stands for
      // `active` ticks (120 = 2 s). While it stands he cannot walk, jump or turn; hits and projectiles from the FRONT are blocked
      // (damage x frontMul, no flinch, no launch). Hits from BEHIND hurt normally. Ground only.
      //   releaseCancel: ticks of recovery when the button is let go before the barrier is up (the stance just drops)
      //   endOnRelease: true = letting go also drops an established barrier (default: it lasts its full duration)
      guard: {
        holdStart: 20, // ticks the button must be held before the stance starts (60 = 1 s). Was 10: normal taps (esp. on a phone) were turning into the stationary Holy Guard
        attack: {
          id: "holy_guard", type: "melee", isSkill: true, utility: true, holyGuard: true, pose: 1,
          startup: 42, active: 120, recovery: 16,
          frontMul: 0.05, // share of the damage that gets through from the front
          releaseCancel: 10, endOnRelease: false,
          blockMana: 8, // mana gained for every blocked hit (blocking charges the ultimate)
          advance: 0,
        },
      },
      skills: [
        // SKILL 1 (slot U) - GROUNDBREAKER: plants his feet, raises the shield, slams it into the ground. A SMALL circular shockwave
        // (radius px, measured from his body centre) damages and staggers everyone inside. It does NOT launch anyone up
        // (launchV 0), only a short push away. Short startup / recovery: an interrupt / punish tool, not a big knockback skill.
        // Everything below is tunable; no super armor by default (set superArmor: true if it should be uninterruptible).
        {
          id: "groundbreaker", name: "Break", icon: "GRB", cooldown: 240,
          attack: {
            id: "groundbreaker", type: "melee", isSkill: true, shockwave: true, pose: 2,
            radius: 118,
            damage: 18, startup: 14, active: 3, recovery: 20,
            knockback: 3.2, launchH: 0.9, launchV: 0, stun: 28, // stagger, not a launch
            advance: 0, manaGain: 12, superArmor: false,
          },
        },
        // SKILL 2 (slot I) - DIVINE RESTORATION: channels holy energy through his shield, instantly restoring
        // `heal` HP (cannot exceed maxHP). Simple self-heal with a cooldown. Long recovery = punishable.
        {
          id: "divine_restoration", name: "Restore", icon: "RST", cooldown: 600,
          attack: {
            id: "divine_restoration", type: "melee", isSkill: true, utility: true, pose: 0,
            damage: 0, startup: 18, active: 2, recovery: 34, knockback: 0, range: 1, advance: 0, manaGain: 0,
            heal: 50, // flat HP restored (tunable; 50 per the design)
            healPct: 0, // > 0 = restore this share of max HP instead (e.g. 0.08), so it scales with maxHP
          },
        },
        // SKILL 3 (slot O) - UNRELENTING WRATH: FIVE slow, heavy shield slams, each with its own animation (overhead / side hook /
        // two-handed crush / diagonal hammer), then a FINALE: he leaps and drives the shield into the ground with a big shockwave.
        //   multiHit: ticks per slam (36 = 0.6 s: slow, the shield is heavy). active must be 5 x multiHit (the 5th beat is the finale).
        //   hitWindow: ticks after each slam lands during which it can still connect (the slow raise in between cannot hit)
        //   finale: riseTicks / riseSpeed (px per tick, fades out) / hang (ticks at the top) / dropSpeed / drift (forward px per tick)
        //           damage + radius + knockback + launchH / launchV + stun = the landing shockwave; recovery = ticks of recovery after landing
        {
          id: "unrelenting_wrath", name: "Wrath", icon: "WTH", cooldown: 720,
          attack: {
            id: "unrelenting_wrath", type: "melee", isSkill: true, fxShape: "slam", pose: 2,
            damage: 6, startup: 30, active: 180, recovery: 48, multiHit: 36, hitWindow: 4,
            knockback: 3.2, launchH: 0.5, launchV: 0, stun: 30,
            range: 76, boxH: 0.95, advance: 0, manaGain: 3, momentumGain: 0,
            superArmor: true, // committed to the sequence; not easily interrupted
            sequence: [
              { variant: 0, fxShape: "slam", range: 76, kb: 1,   damage: 5 },   // overhead
              { variant: 1, fxShape: "slam", range: 80, kb: 1.1, damage: 5.5 }, // wide side hook
              { variant: 2, fxShape: "slam", range: 78, boxH: 1.05, kb: 1.3, damage: 6 }, // two-handed crush
              { variant: 3, fxShape: "slam", range: 84, kb: 1.5, damage: 6.5 }, // diagonal hammer
              { variant: 4, finaleBeat: true },                                   // leap + ground pound
            ],
            finale: {
              riseTicks: 20, riseSpeed: 10, hang: 5, dropSpeed: 30, drift: 2.4,
              damage: 22, radius: 190, directRange: 90, waveMul: 0.6,
              knockback: 14, launchH: 1.7, launchV: 0.9, stun: 60, recovery: 70,
            },
          },
        },
        // SKILL 4 (slot L) - DIVINE TAUNT: a radial divine taunt. Enemies inside `radius` lose control and are forced to
        // basic-attack him for `duration` ticks; the hits instead damage themselves (redirectMul = share of the
        // damage reflected back). Forced actions are basic attacks only, not skills/ultimates.
        {
          id: "divine_taunt", name: "Taunt", icon: "TNT", cooldown: 900,
          attack: {
            id: "divine_taunt", type: "melee", isSkill: true, utility: true, pose: 0,
            damage: 0, startup: 16, active: 2, recovery: 30, knockback: 0, range: 1, advance: 0, manaGain: 0,
            taunt: {
              radius: 230, duration: 120, // 120 ticks = 2 s of forced basic attacks
              redirectMul: 1.0, // share of forced-attack damage reflected back at the attacker
            },
          },
        },
      ],
      // ULTIMATE - DIVINE JUDGMENT: summons a colossal spectral shield above a targeted enemy position.
      // The enemy is locked while aiming; the shield falls at that spot after `fallDelay` ticks with a
      // telegraph indicator (impactFx shows the marker + crash). Direct hit = huge damage + stun; the
      // shockwave (radius px) pushes anyone nearby out and away (ring-out threat).
      ultimate: {
        id: "divine_judgment", name: "Divine Judgment", icon: "ULT",
        attack: {
          id: "divine_judgment", type: "melee", isSkill: true, utility: true, pose: 0,
          damage: 55, startup: 14, active: 2, recovery: 60, knockback: 0, range: 1, advance: 0, manaGain: 0,
          judgment: {
            range: 520,        // how far away he can target
            fallDelay: 42,     // telegraph ticks before the shield lands
            radius: 150,       // shockwave radius from the impact point
            directDamage: 55,  // damage to enemies directly under the shield
            directStun: 50,    // stun / knockdown on the direct hit
            waveKnockback: 14, // knockback applied by the shockwave to nearby enemies
            waveDamage: 30,    // damage to enemies caught in the outer shockwave
            waveLaunchH: 1.5, waveLaunchV: 0.4, // outward + slight up = ring-out threat
          },
        },
      },
    }),
  };

  MW.CHARACTER_ORDER = ["fighter", "mage", "assassin", "hitter", "tank"];
})(globalThis);