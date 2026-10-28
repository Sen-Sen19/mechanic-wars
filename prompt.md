# Project: Mechanic Wars — 1v1 Platform Fighter, Five Basic Characters

Folder: mechanic_wars
Phase 1 goal: a fun, testable five-character combat foundation, not a finished game.
Focus ONLY on the five playable character types and their basic attacks. No skills or special abilities yet.

## 1. Game Concept
- A competitive 1v1 platform fighter.
- Developed and tested on PC and on a phone (Chrome). On-screen touch controls already exist: virtual joystick, JUMP, RESET, FULL (fullscreen). An ATTACK button joins them in Stage 3.
- Fighters battle on an arena with multiple platforms at different heights.
- Characters can run, jump, fall, attack, take damage, and experience knockback.
- The game uses HP. A fighter is KO'd when HP reaches zero. HP zero is the only KO.
- Blast zones: falling or being launched out of bounds costs a large fixed HP penalty (25% of max HP) and respawns the fighter on a platform with about one second of invulnerability.
- Early prototype. Prioritize functional gameplay over polished graphics.

## 2. Five Character Types

Each character has a distinct combat identity. All have a single attack button, usable on the ground and in the air.

### Fighter
- Balanced melee combatant and the baseline for balancing the others.
- The big body: the largest non-Tank character.
- Reliable 3-hit basic attack chain (combo potential).
- Moderate HP, armor, movement speed, damage, and weight.

### Mage
- Ranged basic attack: a long-range magical bolt with a SLOW attack (long startup and recovery), because the Mage will rely on skills later, not normal hits.
- Lower durability than the Fighter.
- Relies on spacing and positioning.
- Basic projectile only; no spells.

### Assassin
- High movement speed and fast basic attacks.
- Low HP, armor, and weight.
- Low damage per hit; advantage is attack frequency and mobility.
- Vulnerable when caught by heavy attacks.

### Hitter
- Quick striker in a lighter, smaller body than the Fighter: faster than the Fighter, but slower than the Assassin.
- Fast basic attack speed and a longer-range shockwave projectile than before (still shorter-range than the Mage's bolt).
- Hits harder than the Assassin with strong knockback, but not overwhelmingly so; balance in Stage 6.

### Tank
- High HP, moderate armor, high weight.
- Slow movement and attack speed.
- Lower basic attack damage.
- Survives and controls space through positioning, not skills.

## 3. Stats and Balance

Every character has configurable stats, all in one data file:
- Maximum HP
- Armor
- Weight (knockback resistance)
- Basic attack damage
- Attack startup time
- Attack recovery time
- Movement speed
- Jump strength
- Knockback strength
- Attack range
- Projectile speed and range, where applicable

Formulas (shared by every character):
- Damage taken = base damage x 100 / (100 + armor)
  Armor has diminishing returns and never reaches immunity.
- Knockback = base knockback x (1 + k x fraction of max HP lost) / target weight
  Scaling uses the FRACTION of max HP lost, so a high-HP fighter is not permanently heavy.
- Hitstun scales with knockback.

Balance rules:
- Armor must not make the Tank nearly impossible to defeat.
- Attack speed, damage, or mobility must not dominate every other stat.
- The Tank has three durability levers (HP, armor, weight); keep armor modest and let weight carry knockback resistance.
- Use the Fighter as the baseline. Keep all stats easy to modify and test.

## 4. Basic Combat Only

Implement:
- Running, jump plus one air jump, fast-fall, and platform drop-through (same for every character).
- Gravity and falling.
- One attack button: melee for Fighter, Assassin, and Tank; projectile for Mage and Hitter, both using one shared projectile system.
- Hit detection and damage.
- Armor, knockback (with weight), hit reactions, and brief hitstun.
- HP display for both fighters.
- Blast zones with HP penalty and respawn.

No skills, ability slots, energy systems, cooldowns, class-specific defensive abilities, unlocks, or progression.

## 5. Visuals and Assets
- Simple shapes or procedural 2D graphics only, no purchased assets or complex animations.
- Distinguish the five characters by silhouette, proportions, and color.
- Readable attacks, hit reactions, knockback, and positions.
- Minimal, reusable effects.
Blast zones: a fixed 25% max-HP penalty, then respawn on a platform with 1 second of invulnerability.
Bots: an aggressive and a spacing bot for P2 in bots.js, seeded so they’re repeatable for the Stage 6 balance sim.
Character select: a new screen before the arena, with touch and keyboard support, plus a MENU button and key to get back to it. The in-arena picker stays as a test tool and also cycles the dummy/aggressive/spacing opponent.


## 6. Technical Requirements
- Fresh project. Stack: vanilla JS + Canvas, no build step (open index.html).
- Fixed-timestep (60 Hz) simulation kept separate from rendering, so the same sim can run headless for balance testing.
- Character definitions are data only (characters.js); shared movement and combat logic lives in one state machine (idle, run, air, attack startup/active/recovery, hitstun, KO).
- No duplicated combat system per character. No hardcoded stats outside the data file.
- Easy to extend later with skills, new characters, and mobile touch controls.

Planned structure:
  index.html
  src/  main.js, sim.js, fighter.js, characters.js, projectiles.js, arena.js, input.js, touch.js, render.js, bots.js (dummy in Stage 3, bots in Stage 5)
  tools/  balance_sim.js

## 7. Testing Mode and Controls
- Endless sandbox: when a fighter is KO'd, both reset automatically and a kill counter increments. A manual reset key also exists.
- P1 is human (keyboard or touch, same intent shape). P2 is a training dummy from Stage 3 and a simple bot from Stage 5.
- Training dummy (Stage 3): stands still, takes hits, and is a real fighter (any of the five characters, same HP/armor/weight/knockback/hitstun rules). It shows an HP bar and the result of the last hit (raw damage, damage after armor, knockback) so formulas can be checked by eye. On KO it respawns at full HP.
- Character selection for testing: in-arena picker (touch chips, keys 1-5) for P1, and a way to choose the dummy's character too (touch: P1/P2 toggle above the chips; keyboard: a second key row). Any of the five can face any other.
- Final game flow (Stage 5): a character select screen BEFORE entering the arena. The in-arena picker stays as a test-only tool.

## 8. Balance Verification
Headless script (tools/balance_sim.js) runs all 25 matchups with simple bots using two behaviors (aggressive and spacing), and reports win rate and time-to-kill per matchup.

Verify:
- All five characters can move, jump, and attack.
- Attacks correctly apply damage, armor reduction, hitstun, and knockback.
- The Mage's bolt and the Hitter's shockwave can hit the opponent.
- Characters have meaningfully different strengths and weaknesses.
- No character has an obvious overwhelming advantage (check Assassin vs Tank and Tank durability first).
- HP reaches zero correctly and the sandbox resets.

## 9. Build Stages
Explain the intended implementation briefly before each major change. Work in small, testable stages.
1. [DONE] Foundation: fixed-timestep loop, multi-height platform arena, input (keyboard + touch), placeholder fighter that runs, jumps, air-jumps, fast-falls, drops through platforms, and respawns out of bounds.
2. [DONE] Character data file (characters.js, all five) and shared state machine (idle, run, rising, falling; attack/hitstun/ko declared). In-arena character picker for testing and distinct silhouettes.
3. [DONE] Melee combat + training dummy:
   - P2 slot as a training dummy (stands still, selectable character, HP bar, last-hit readout, respawns at full HP on KO).
   - HP for both fighters, with HP bars.
   - Attack button (keyboard key + touch ATTACK button) usable on the ground and in the air.
   - Attack state flow: startup, active, recovery, driven by the character's attack data.
   - Melee hit detection with the damage formula, armor, knockback (fraction of max HP lost, weight), and hitstun.
   - Fighter 3-hit chain; Assassin and Tank use the same melee code with their own numbers.
   - Hit reactions: knockback launch, hitstun lockout, hit flash.
   - Tests: all three melee characters hit the dummy; damage, knockback, and hitstun match the formulas.
4. [DONE] Projectiles: shared projectile system, Mage bolt and Hitter shockwave, tested against the dummy.
5. [DONE] Match loop: bot opponent for P2 (aggressive and spacing behaviors), blast-zone HP penalty (25% of max HP) with respawn and invulnerability, kill counter, reset, and the pre-arena character select screen.
6. [DONE] Balance report: headless 25-matchup run using the same bots (tools/balance_sim.js), tuning stats so all 5 characters have viable win rates and distinct identities.
7. [DONE] Polish & verification: complete clean smoke test passes across all suites (feel, stage 1-5, balance), temporary dev buttons cleaned up, and responsive canvas/touch support.

Do not build future skill systems prematurely.