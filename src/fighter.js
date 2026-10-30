// Mechanic Wars - shared fighter logic and state machine.
// One class serves every character; stats come in as data (characters.js).
(function (g) {
  const MW = (g.MW = g.MW || {});
  const EPS = 0.01;

  const STATE = Object.freeze({
    IDLE: "idle",
    RUN: "run",
    RISING: "rising",
    FALLING: "falling",
    ATTACK_STARTUP: "attack_startup",
    ATTACK_ACTIVE: "attack_active",
    ATTACK_RECOVERY: "attack_recovery",
    HITSTUN: "hitstun",
    KO: "ko",
  });

  // Locomotion states: the player is free to steer, jump and start an attack.
  const LOCOMOTION = new Set([STATE.IDLE, STATE.RUN, STATE.RISING, STATE.FALLING]);
  const ATTACKING = new Set([STATE.ATTACK_STARTUP, STATE.ATTACK_ACTIVE, STATE.ATTACK_RECOVERY]);

  // Shared combat formulas (pure functions, used by the sim and by the tests).
  const Combat = {
    // Armor has diminishing returns and never reaches immunity.
    damageTaken(base, armor) {
      return (base * 100) / (100 + armor);
    },
    // lostFraction = fraction of the target's MAX HP already lost (0..1), after this hit's damage.
    knockback(base, lostFraction, weight) {
      const C = MW.CONFIG.combat;
      return (base * (1 + C.knockbackScaling * lostFraction)) / (weight / C.weightUnit);
    },
    hitstun(knockback) {
      const C = MW.CONFIG.combat;
      return Math.min(C.hitstunMax, Math.round(C.hitstunBase + C.hitstunPerKnockback * knockback));
    },
  };

  function approach(value, target, step) {
    if (value < target) return Math.min(value + step, target);
    if (value > target) return Math.max(value - step, target);
    return value;
  }

  class Fighter {
    constructor(id, stats, arena) {
      this.id = id;
      this.stats = stats;
      this.respawns = 0;
      this.hp = stats.maxHP;
      this.mana = 0; // fills by landing hits; full = ultimate ready
      this.momentum = 0; // passive (Fighter): consecutive landed hits
      this.gunnerStacks = 0; // Artillerist: Bullet Evolution (0..10)
      this.gunnerBomb = null; // Artillerist remote explosive
      this.gunnerHop = null;
      this.gunnerBurst = null; // Artillerist Five-Shot Barrage in progress: { hit, left, timer, batch } (the Sim fires it)
      this.momentumIdle = 0; // ticks since the last landed hit
      this.cooldowns = [0, 0, 0, 0]; // skill cooldowns (ticks left)
      this.guardEmpowered = false; // after blocking with Iron Guard: next basic punch is stronger
      this.guardEmpowerLeft = 0; // ticks left to use it
      this.guardEmpowerCfg = null;
      this.counterTarget = null; // set when Iron Guard blocks a hit: the Sim answers with a counter shockwave
      this.blockFx = null; // visual event for a blocked hit (the Sim turns it into an effect)
      this.castFx = null; // visual event for a skill that just started
      this.advanceStopped = false;
      this.lastHit = null; // readout of the last hit taken (see takeHit)
      this.zones = []; // Void Mage: spike fields / grasp pools / pulls this fighter owns (the Sim steps them, void fx draws them)
      this.overload = false; // Void Mage passive: next basic attack is the empowered gravity orb
      this.overloadHits = 0; // successful hits counted towards Void Overload
      this.overloadIdle = 0;
      this.rand = null; // seeded random function, set by Sim.step (Abyssal Transit destination)
      this.respawn(arena);
      this.invuln = 0; // no blink on the very first spawn
    }

    // Put the fighter back on its spawn point. Does not touch HP.
    respawn(arena) {
      const spawn = arena.spawns[this.id % arena.spawns.length];
      this.x = spawn.x - this.stats.width / 2;
      this.y = spawn.y;
      this.vx = 0;
      this.vy = 0;
      this.facing = spawn.facing || 1;
      this.grounded = false;
      this.standingOn = null;
      this.airJumpsLeft = this.stats.maxAirJumps;
      this.dropTimer = 0;
      this.invuln = MW.CONFIG.respawnInvulnFrames;
      this.state = STATE.FALLING;
      this.stateTimer = 0; // ticks left in the current timed state (attack phase / hitstun)
      this.hit = null; // attack data of the swing in progress
      if (this.stats.id === "hitter") { this.gunnerBomb = null; this.gunnerHop = null; this.gunnerBurst = null; }
      this.attackHeld = false; // attack button held this tick (charged punch)
      this.atkHeldTicks = 0;
      this.chargeLock = false; // one charge per button press
      this.chargeTicks = 0;
      this.chargeReleased = true;
      this.swingHit = false; // did the current swing land anything? (Momentum whiff loss)
      this.lockState = null; // Meteor Fist lock-on: null = not decided yet, true / false once the swing is committed
      this.scythe = null; // Assassin Chained Scythe in progress: { target, phase: "pull" | "bomb", t, cfg, mul }
      this.blastFx = null; // visual one-shot (bomb explosion), read by assassin_fx.js
      // Assassin skills 2-4 + ultimate (see the "ASSASSIN SKILLS" block below). All visual-only fields are read and cleared by assassin_fx.js.
      this.cloak = null; // Phantom Decoy invisibility: { left, alpha, revealOnHit }
      this.vanished = false; // true on ticks the Assassin is hidden mid-Onslaught
      this.fade = 1; // render opacity of the body (0 hidden .. 1 normal); set at the end of step()
      this.decoy = null; // Phantom Decoy illusion: independent moving clone (render-only entity)
      this.onslaught = null; // Phantom Onslaught in progress: { target, i, ph, t, beats, cfg, mul }
      this.sentence = null; // Death Sentence in progress: { target, t, ills, cfg, mul, done }
      this.bleed = null; // Rupture on THIS fighter (as the victim): { by, cfg, left, t, still, total, mul }
      this.bleedPulse = 0; // visual: ticks since the last bleed damage (fx)
      this.poofs = []; // visual one-shots: smoke puffs { x, y } (capped, so headless runs never grow it)
      this.slashFx = null; // visual one-shot: { x, y, dir, big } extra slash arcs for Onslaught / Death Sentence
      this.foe = this.foe || null; // the opponent (set by Sim.step); only used by the Decoy illusion to chase
      this.mark = { target: null, stacks: 0, idle: 0, marked: false, left: 0 }; // Assassin passive: Death Mark on the enemy
      this.chainIndex = 0;
      this.comboQueued = false;
      this.hitTargets = new Set(); // fighter ids already hit by the current swing
      this.pendingProjectile = null; // attack data to fire this tick (Sim turns it into a Projectile)
      // Void Mage state (everything transient: cleared on every respawn)
      this.root = null; // restrained by Void bound Wraiths: { left } (refreshed every tick by the caster)
      this.slow = null; // inside Abyssal Grasp: { left, mul, noJump }
      this.ctl = null; // forced velocity from another fighter's skill: { vx, vy, left }
      this.wraiths = null; // Void bound Wraiths in progress (caster side)
      this.transit = null; // Abyssal Transit in progress
      this.gravSlam = null; // Void Overload orb: lift + slam of the victim (caster side)
      this.execution = null; // Void Execution ultimate in progress (caster side)
      this.untargetable = false; // true while dissolved into the void: nothing can hit this fighter
      this.pendingZone = null; // zone skill to create this tick (the Sim turns it into f.zones entries)
      this.fxOut = []; // visual one-shots for the Sim to forward (capped, drained every tick)
      this.swingFx = false; // set on the first active tick of a melee swing (visual events only)
      this.flash = 0;
      this.armorHit = 0;
      this.heldDir = 0;
      this.jumpBuf = 0; // buffered jump / attack presses (ticks left)
      this.atkBuf = 0;
      this.px = this.x; // previous-tick position, for render interpolation
      this.py = this.y;
    }

    // Left the arena: lose a fixed share of MAX HP (armor does not apply), then come back on the
    // spawn point with invulnerability. If that empties the HP bar it is a KO: the fighter still
    // returns to the spawn point but stays KO'd until the round resets (HP zero is the only KO).
    leaveArena(arena) {
      const penalty = this.stats.maxHP * MW.CONFIG.combat.blastPenalty;
      this.hp = Math.max(0, this.hp - penalty);
      this.respawns++;
      this.respawn(arena);
      this.lastHit = {
        by: "BLAST ZONE",
        combo: 0,
        raw: penalty,
        armor: 0,
        dmg: penalty,
        knockback: 0,
        stun: 0,
        lost: 1 - this.hp / this.stats.maxHP,
      };
      if (this.hp <= 0) {
        this.state = STATE.KO;
        this.invuln = 0;
      }
    }

    // Full HP + respawn (new round).
    fullReset(arena) {
      this.hp = this.stats.maxHP;
      this.mana = 0;
      this.momentum = 0;
      this.gunnerStacks = 0;
      this.gunnerBomb = null;
      this.gunnerHop = null;
      this.momentumIdle = 0;
      this.cooldowns = [0, 0, 0, 0];
      this.guardEmpowered = false;
      this.guardEmpowerLeft = 0;
      this.counterTarget = null;
      this.zones = [];
      this.gunnerStacks = 0;
      this.gunnerBomb = null;
      this.gunnerHop = null;
      this.overload = false;
      this.overloadHits = 0;
      this.overloadIdle = 0;
      this.respawn(arena);
    }

    // --- attacks ---
    chainLength() {
      const c = this.stats.attack.chain;
      return c ? c.length : 1;
    }

    startAttack(index) {
      this.breakCloak();
      const a = this.stats.attack;
      this.chainIndex = index;
      this.hit = a.chain && a.chain[index] ? Object.assign({}, a, a.chain[index]) : Object.assign({}, a);
      if (this.stats.id === "hitter" && this.hit.gunnerBasic) this.hit.damage *= 1 + this.gunnerStacks * this.stats.passive.damagePerStack;
      if (this.overload && this.overloadData()) this.hit = this.orbHit(); // Void Overload: the next attack input is the gravity orb
      if (this.guardEmpowered && index === 0) {
        // Iron Guard bonus: the next basic punch hits harder (numbers come from the guard's "empower" data)
        const E = this.guardEmpowerCfg || { damage: 2, knockback: 1.5, stun: 12 };
        this.guardEmpowered = false;
        this.guardEmpowerLeft = 0;
        this.hit = Object.assign({}, this.hit, {
          damage: this.hit.damage * E.damage,
          knockback: this.hit.knockback * E.knockback,
          stun: (this.hit.stun || 20) + E.stun,
          empowered: true,
          impactFx: "counter",
        });
      }
      this.advanceStopped = false;
      this.state = STATE.ATTACK_STARTUP;
      this.stateTimer = this.hit.startup;
      this.comboQueued = false;
      this.hitTargets = new Set();
      this.swingHit = false;
      if (this.heldDir) this.facing = this.heldDir;
    }

    endAttack() {
      if (this.comboQueued) {
        const next = this.chainIndex + 1;
        this.startAttack(next < this.chainLength() ? next : 0);
      } else {
        this.chainIndex = 0;
        this.hit = null;
        this.state = STATE.FALLING; // fixed to the right locomotion state at the end of step()
      }
    }

    // Advance timed states (attack phases, hitstun). Runs at the start of each tick.
    advanceState() {
      if (this.flash > 0) this.flash--;
      if (this.armorHit > 0) this.armorHit--;
      switch (this.state) {
        case STATE.ATTACK_STARTUP:
          if (this.hit && this.hit.chargeHold && !this.chargeReleased && this.overload && this.overloadData()) {
            // Void Overload became ready while charging: the empowered orb replaces the Singularity right away
            this.hit = this.orbHit();
            this.stateTimer = this.hit.startup;
            this.chargeReleased = true;
            this.chargeTicks = 0;
          }
          if (this.hit && this.hit.chargeHold && !this.chargeReleased) {
            // Charged punch: the swing waits while the button is held; letting go too early cancels it.
            if (this.attackHeld) {
              if (this.chargeTicks < this.hit.chargeTime) this.chargeTicks++;
              break;
            }
            const cs = this.hit.chargeScale;
            if (!cs && this.chargeTicks < this.hit.chargeTime) { // plain charge: must be full to fire
              this.hit = null;
              this.chargeTicks = 0;
              this.state = STATE.FALLING;
              break;
            }
            if (cs) {
              // Scaled charge (dash slash): fires at ANY charge level; distance and damage grow with the charge.
              const r = Math.max(0, Math.min(1, this.chargeTicks / this.hit.chargeTime));
              const dist = cs.dist[0] + (cs.dist[1] - cs.dist[0]) * r;
              const dmg = cs.damage ? cs.damage[0] + (cs.damage[1] - cs.damage[0]) * r : this.hit.damage;
              this.hit = Object.assign({}, this.hit, {
                advance: cs.speed, // px per tick, applied during startup + active
                active: Math.max(1, Math.round(dist / cs.speed) - this.hit.startup + 1), // the dash IS the active window (+1: the last tick switches state before moving)
                damage: dmg, chargeRatio: r, stopAtEnd: true,
              });
              this.stateTimer = this.hit.startup;
            }
            this.chargeReleased = true;
          }
          if (--this.stateTimer <= 0) {
            this.state = STATE.ATTACK_ACTIVE;
            this.stateTimer = this.hit.active || 1;
            if (this.hit.decoy) this.beginDecoy();
            if (this.hit.transit) this.beginTransit();
            if (this.hit.wraiths) this.beginWraiths();
            if (this.hit.spikes) this.pendingZone = { type: "spikes", cfg: this.hit.spikes };
            else if (this.hit.grasp) this.pendingZone = { type: "grasp", cfg: this.hit.grasp };
            if (this.hit.execution) this.beginExecution();
            if (this.hit.type === "projectile") {
              this.pendingProjectile = this.hit;
              if (this.hit.overloadOrb) this.consumeOverload(); // spent when fired, even if it misses
            } else if (this.hit.fxStyle) this.swingFx = true;
          }
          break;
        case STATE.ATTACK_ACTIVE:
          // barrage (Hundred Fists): every multiHit ticks the swing may hit the same target again
          if (this.hit.multiHit && this.stateTimer % this.hit.multiHit === 0) {
            this.hitTargets = new Set();
            const base = this.hitBase;
            if (base && base.sequence && base.sequence.length) { // each punch of the barrage has its own shape / angle
              const step = base.sequence[this.barrageBeat++ % base.sequence.length];
              this.hit = Object.assign({}, base, step, { knockback: base.knockback * (step.kb || 1) });
            }
          }
          if (--this.stateTimer <= 0) {
            this.state = STATE.ATTACK_RECOVERY;
            this.stateTimer = this.hit.recovery;
            if (this.hit.stopAtEnd) this.vx = 0; // a dash ends where it ends (no sliding on)
            this.whiffCheck();
          }
          break;
        case STATE.ATTACK_RECOVERY:
          if (--this.stateTimer <= 0) this.endAttack();
          break;
        case STATE.HITSTUN:
          if (--this.stateTimer <= 0) this.state = STATE.FALLING;
          break;
      }
    }

    rect() {
      return { x: this.x, y: this.y, w: this.stats.width, h: this.stats.height };
    }

    // ── Assassin passive: Death Mark. Called (from the victim's takeHit) for every hit this fighter lands.
    // Consecutive hits stack on the target; at max stacks the target is MARKED and the next skill (markBonus) deals bonus damage.
    addMark(victim, hit) {
      const P = this.stats.passive;
      if (!P || P.type !== "deathmark" || hit.noMark || hit.isCounter) return;
      const m = this.mark;
      if (m.target !== victim) { m.target = victim; m.stacks = 0; m.marked = false; m.left = 0; }
      if (m.marked) return; // already marked: waiting for a skill
      m.idle = 0;
      if (++m.stacks >= P.max) { m.stacks = P.max; m.marked = true; m.left = P.duration; }
    }

    clearMark() {
      this.mark = { target: null, stacks: 0, idle: 0, marked: false, left: 0 };
    }

    // ── Assassin skill 1: Chained Scythe. The hook itself is a long thin melee hit; when it lands the Fighter that
    // was hit calls this (from takeHit). The target is dragged in, a bomb is attached, it explodes, and he jumps away.
    beginScythe(victim, hit) {
      this.scythe = { target: victim, phase: "pull", t: 0, cfg: hit.scythe, mul: hit.markMul || 1 };
    }

    scytheStep() {
      const S = this.scythe;
      const v = S.target, C = S.cfg;
      if (!this.hit || this.hit.id !== "chained_scythe" || this.state === STATE.HITSTUN || this.state === STATE.KO || v.state === STATE.KO) {
        this.scythe = null; // interrupted: the chain drops
        return;
      }
      this.state = STATE.ATTACK_ACTIVE; // stay committed for the whole pull
      this.stateTimer = 3;
      const cx = this.x + this.stats.width / 2, vcx = v.x + v.stats.width / 2;
      const dir = vcx >= cx ? 1 : -1;
      this.facing = dir;
      const gap = Math.abs(vcx - cx) - (this.stats.width + v.stats.width) / 2;
      v.state = STATE.HITSTUN; // the target cannot act while chained
      v.stateTimer = Math.max(v.stateTimer, 3);
      S.t++;
      if (S.phase === "pull") {
        if (gap <= C.closeRange || S.t > C.maxTicks) {
          if (gap > C.closeRange * 2) { this.scythe = null; this.state = STATE.ATTACK_RECOVERY; this.stateTimer = C.endRecovery; return; } // chain slipped
          S.phase = "bomb"; S.t = 0; v.vx = 0;
        } else {
          v.vx = -dir * C.pullSpeed;
          v.vy = v.grounded ? 0 : Math.max(-10, Math.min(10, (this.y - v.y) * 0.2));
        }
      }
      if (S.phase === "bomb") {
        v.vx = 0;
        if (S.t >= C.bombDelay) {
          const bomb = { id: "scythe_bomb", isSkill: true, noMark: true, damage: C.bombDamage * S.mul, knockback: C.bombKnockback, launchH: C.bombLaunchH, launchV: C.bombLaunchV, stun: C.bombStun, manaGain: C.bombMana || 0, empowered: S.mul > 1 };
          v.takeHit(this, bomb, dir);
          this.onHitLanded(bomb);
          this.blastFx = { x: vcx, y: v.y + v.stats.height * 0.5 };
          // jump away: the direction held on the stick, or straight back from the enemy
          const j = this.heldDir || -dir;
          this.vx = j * C.jumpVx;
          this.vy = -C.jumpVy;
          this.grounded = false;
          this.standingOn = null;
          this.scythe = null;
          this.state = STATE.ATTACK_RECOVERY;
          this.stateTimer = C.endRecovery;
        }
      }
    }

    // ═════════════════════ ASSASSIN SKILLS 2-4 + ULTIMATE ═════════════════════
    // Everything here is driven by config blocks on the attack data in characters.js (decoy / rupture / onslaught / sentence).
    // The initiating swing is an ordinary melee hit that the Sim resolves; takeHit() then calls beginOnslaught / beginSentence /
    // startBleed, exactly like the Chained Scythe. Follow-up damage is applied by direct takeHit() calls (noMark, no hit events).

    breakCloak() {
      this.cloak = null;
    }

    // Visual smoke puff (capped, so a headless run without fx never grows the list).
    poof(x, y) {
      if (this.poofs.length >= 6) this.poofs.shift();
      this.poofs.push({ x: x, y: y });
    }

    // One follow-up hit applied directly to the victim (like the scythe bomb). Returns false if the victim can't be hit any more.
    strikeHit(v, spec, dir) {
      if (v.state === STATE.KO || v.invuln > 0 || v.untargetable) return false;
      v.takeHit(this, spec, dir);
      this.onHitLanded(spec);
      return true;
    }

    // Hold the victim in place (undodgeable while the sequence runs).
    holdVictim(v) {
      if (v.state === STATE.KO || v.hp <= 0) return; // never revive a victim the last hit killed
      v.state = STATE.HITSTUN;
      v.stateTimer = Math.max(v.stateTimer, 3);
      v.vx = 0;
      v.vy = 0;
    }

    // ── Skill 2: Phantom Decoy. At the end of the cast an illusion stays where he stood and moves on its own (it runs at the
    // enemy, hops now and then, never walks off a platform); the real Assassin is cloaked. Attacking (or being hit) ends the cloak.
    beginDecoy() {
      const C = this.hit.decoy, s = this.stats;
      this.poof(this.x + s.width / 2, this.y + s.height * 0.5);
      this.decoy = { x: this.x, y: this.y, px: this.x, py: this.y, vx: 0, vy: 0, facing: this.facing, dir: this.facing, grounded: this.grounded, standingOn: this.standingOn, state: STATE.IDLE, left: C.duration, t: 0, cfg: C };
      this.cloak = { left: C.cloak, alpha: C.cloakAlpha === undefined ? 0.1 : C.cloakAlpha, revealOnHit: C.revealOnHit !== false };
    }

    decoyStep(arena) {
      const d = this.decoy, C = d.cfg, s = this.stats, P = MW.CONFIG.physics;
      d.px = d.x;
      d.py = d.y;
      if (--d.left <= 0) { this.poof(d.x + s.width / 2, d.y + s.height * 0.5); this.decoy = null; return; }
      d.t++;
      let moving = true;
      if (this.foe && this.foe.state !== STATE.KO && C.chase !== false) {
        const gx = this.foe.x + this.foe.stats.width / 2 - (d.x + s.width / 2);
        d.dir = gx >= 0 ? 1 : -1;
        moving = Math.abs(gx) > (C.stopGap || 0);
      }
      d.vx = moving ? d.dir * C.speed : 0;
      if (d.grounded && C.jumpEvery && d.t % C.jumpEvery === 0) { d.vy = -(C.jumpV || 11); d.grounded = false; d.standingOn = null; }
      // never walk off the platform it stands on (turns around when the enemy is unknown)
      if (d.grounded && d.standingOn && C.edgeSafe !== false && d.vx !== 0) {
        const cx = d.x + s.width / 2 + d.vx, p = d.standingOn;
        if (cx < p.x || cx > p.x + p.w) { d.vx = 0; if (!this.foe) d.dir = -d.dir; }
      }
      d.vy = Math.min(d.vy + P.gravity, s.maxFallSpeed);
      const prevBottom = d.y + s.height;
      d.x += d.vx;
      d.y += d.vy;
      d.grounded = false;
      d.standingOn = null;
      if (d.vy >= 0) {
        let best = null;
        for (const p of arena.platforms) {
          if (d.x + s.width <= p.x || d.x >= p.x + p.w) continue;
          if (prevBottom <= p.y + EPS && d.y + s.height >= p.y && (!best || p.y < best.y)) best = p;
        }
        if (best) { d.y = best.y - s.height; d.vy = 0; d.grounded = true; d.standingOn = best; }
      }
      if (d.vx !== 0) d.facing = d.vx > 0 ? 1 : -1;
      else if (this.foe) d.facing = this.foe.x >= d.x ? 1 : -1;
      d.state = d.grounded ? (Math.abs(d.vx) > 0.1 ? STATE.RUN : STATE.IDLE) : (d.vy < 0 ? STATE.RISING : STATE.FALLING);
      const b = arena.blastZone;
      if (d.x + s.width < b.left || d.x > b.right || d.y > b.bottom) { this.poof(d.x + s.width / 2, d.y); this.decoy = null; }
    }

    // ── Skill 3: Rupture. The slash starts a bleed on the victim (this fighter): a damage tick every dotEvery ticks, plus
    // damage that scales with how fast the victim MOVES (full run speed = moveDamage per tick). Standing still: no movement
    // damage and the ticks are cut to stillMul after stillAfter ticks. Hit-stagger movement does not count (countWhileStunned).
    startBleed(attacker, hit) {
      this.bleed = { by: attacker, cfg: hit.rupture, left: hit.rupture.duration, t: 0, still: 0, total: 0, mul: hit.markMul || 1 };
    }

    bleedStep() {
      const B = this.bleed, C = B.cfg;
      if (this.state === STATE.KO || this.hp <= 0 || B.by.state === STATE.KO || --B.left <= 0) { this.bleed = null; return; }
      B.t++;
      const moved = Math.abs(this.x - this.px);
      let dmg = 0, tickHit = false;
      if (B.t % C.dotEvery === 0) {
        tickHit = true;
        dmg += C.dotDamage * B.mul * (B.still >= (C.stillAfter || 0) && moved < (C.stillSpeed || 0.2) ? (C.stillMul === undefined ? 1 : C.stillMul) : 1);
      }
      if (moved < (C.stillSpeed || 0.2)) B.still++;
      else {
        B.still = 0;
        if (this.state !== STATE.HITSTUN || C.countWhileStunned) dmg += C.moveDamage * B.mul * Math.min(1, moved / this.stats.runSpeed);
      }
      if (dmg <= 0) return;
      const taken = C.ignoreArmor ? dmg : Combat.damageTaken(dmg, this.stats.armor);
      this.hp = Math.max(0, this.hp - taken);
      B.total += taken;
      this.bleedPulse = 6;
      if (tickHit && C.manaPerTick) B.by.addMana({ manaGain: C.manaPerTick });
      this.lastHit = { by: B.by.stats.name + " (bleed)", combo: 0, raw: dmg, armor: C.ignoreArmor ? 0 : this.stats.armor, dmg: taken, knockback: 0, stun: 0, lost: 1 - this.hp / this.stats.maxHP, bleed: true };
      if (this.hp <= 0) { // bled out: a normal KO (the Sim's checkKO counts it)
        this.state = STATE.KO;
        this.stateTimer = 0;
        this.bleed = null;
      }
    }

    // ── Skill 4: Phantom Onslaught. The (short, rooted) first slash must connect; then the Assassin vanishes and reappears
    // around the victim from cfg.beats angles, striking each time, and ends with a heavy finisher that knocks the target away.
    // Beat fields: dx / dy (offset from the victim's feet-level centre; dx<0 = left of them), vanish (ticks hidden before the
    // strike), show (ticks visible after), damage, knockback, launchH / launchV, stun, pose, final (true = releases the victim).
    beginOnslaught(victim, hit) {
      this.onslaught = { id: hit.id, target: victim, i: 0, ph: "hide", t: 0, cfg: hit.onslaught, beats: hit.onslaught.beats, mul: hit.markMul || 1 };
      this.poof(this.x + this.stats.width / 2, this.y + this.stats.height * 0.5);
    }

    onslaughtStep(arena) {
      const S = this.onslaught, v = S.target, C = S.cfg, s = this.stats;
      if (!this.hit || this.hit.id !== S.id || this.state === STATE.HITSTUN || this.state === STATE.KO || v.state === STATE.KO || v.invuln > 0 || v.untargetable) {
        this.onslaught = null; // interrupted (or the target respawned): the sequence ends
        return;
      }
      this.state = STATE.ATTACK_ACTIVE; // stay committed
      this.stateTimer = 3;
      this.vx = 0;
      this.vy = 0;
      const b = S.beats[S.i];
      if (!(S.ph === "show" && b.final)) this.holdVictim(v);
      S.t++;
      if (S.ph === "hide") {
        this.vanished = true;
        if (S.t < b.vanish) return;
        // reappear around the victim and strike
        const vcx = v.x + v.stats.width / 2;
        this.poof(this.x + s.width / 2, this.y + s.height * 0.5);
        let ax = vcx + b.dx - s.width / 2;
        if (v.standingOn) ax = Math.max(v.standingOn.x, Math.min(v.standingOn.x + v.standingOn.w - s.width, ax));
        this.x = ax;
        this.y = v.y + v.stats.height - s.height + (b.dy || 0);
        this.px = this.x;
        this.py = this.y;
        this.facing = vcx + 0.5 >= ax + s.width / 2 ? 1 : -1;
        this.vanished = false;
        this.poof(this.x + s.width / 2, this.y + s.height * 0.5);
        const spec = { id: "phantom_onslaught", isSkill: true, noMark: true, damage: b.damage * S.mul, knockback: b.knockback || 0, launchH: b.launchH === undefined ? 0 : b.launchH, launchV: b.launchV === undefined ? 0 : b.launchV, stun: b.stun === undefined ? C.stun : b.stun, manaGain: b.manaGain === undefined ? C.manaGain : b.manaGain, empowered: S.mul > 1 };
        this.strikeHit(v, spec, this.facing);
        this.slashFx = { x: v.x + v.stats.width / 2, y: v.y + v.stats.height * 0.45, dir: this.facing, big: !!b.final };
        if (b.pose !== undefined) this.hit = Object.assign({}, this.hit, { pose: b.pose });
        S.ph = "show";
        S.t = 0;
      } else if (S.t >= b.show) {
        if (++S.i >= S.beats.length) { // finished: punishable recovery
          this.onslaught = null;
          this.state = STATE.ATTACK_RECOVERY;
          this.stateTimer = C.endRecovery;
          return;
        }
        S.ph = "hide";
        S.t = 0;
      }
    }

    // ── Ultimate: Death Sentence. The initiating hit (lockOn, long visible startup) must connect. Then cfg.illusions
    // appear around the victim, chain them in place, and each throws shuriken (damage lands hitAt ticks after bindTicks,
    // one illusion every throwGap). Then a finishing hit, the illusions vanish, and the Assassin recovers.
    beginSentence(victim, hit) {
      const C = hit.sentence;
      this.sentence = {
        id: hit.id, target: victim, t: 0, cfg: C, mul: hit.markMul || 1, done: false, fade: C.fadeTicks || 12,
        ills: C.illusions.map((c, i) => ({ dx: c.dx, dy: c.dy || 0, pose: c.pose, throwAt: C.bindTicks + i * C.throwGap, hitAt: C.bindTicks + i * C.throwGap + C.flight, done: false })),
      };
    }

    sentenceStep() {
      const S = this.sentence, v = S.target, C = S.cfg;
      if (S.done) { if (--S.fade <= 0) this.sentence = null; return; } // illusions fading out (visual only)
      if (!this.hit || this.hit.id !== S.id || this.state === STATE.HITSTUN || this.state === STATE.KO || v.state === STATE.KO || v.invuln > 0) {
        this.sentence = null;
        return;
      }
      this.state = STATE.ATTACK_ACTIVE;
      this.stateTimer = 3;
      this.vx = 0;
      this.holdVictim(v);
      S.t++;
      let last = 0;
      for (const il of S.ills) {
        last = Math.max(last, il.hitAt);
        if (il.done || S.t < il.hitAt) continue;
        il.done = true;
        const spec = { id: "death_sentence", isSkill: true, noMark: true, damage: C.shurikenDamage * S.mul, knockback: 0, launchH: 0, launchV: 0, stun: C.shurikenStun, manaGain: 0, empowered: S.mul > 1 };
        this.strikeHit(v, spec, il.dx <= 0 ? 1 : -1);
        this.holdVictim(v);
      }
      if (S.t >= last + C.finishDelay) { // the finishing blow, then everything fades
        const dir = v.x + v.stats.width / 2 >= this.x + this.stats.width / 2 ? 1 : -1, F = C.finish;
        const spec = { id: "death_sentence", isSkill: true, noMark: true, damage: F.damage * S.mul, knockback: F.knockback, launchH: F.launchH, launchV: F.launchV, stun: F.stun, manaGain: 0, empowered: S.mul > 1 };
        this.strikeHit(v, spec, dir);
        this.slashFx = { x: v.x + v.stats.width / 2, y: v.y + v.stats.height * 0.45, dir: dir, big: true };
        S.done = true;
        this.state = STATE.ATTACK_RECOVERY;
        this.stateTimer = C.endRecovery;
      }
    }

    // ═════════════════════ VOID MAGE ═════════════════════
    // Passive (Void Overload), four skills and the ultimate. Every number comes from characters.js (mage.passive / skills / ultimate / charge),
    // so balance changes never touch this file. Caster-side controllers (wraiths, gravSlam, execution) steer the victim through
    // victim.ctl / victim.root; ground effects live in this.zones and are stepped by the Sim (sim.js stepZones).

    // True while this fighter cannot be hit at all (respawn invulnerability or dissolved into the void).
    untouchable() {
      return this.invuln > 0 || this.untargetable;
    }

    overloadData() {
      const P = this.stats.passive;
      return P && P.type === "voidoverload" ? P : null;
    }

    // The empowered gravity orb, as attack data (replaces the basic attack / Singularity while Void Overload is ready).
    orbHit() {
      return Object.assign({}, this.stats.attack, this.stats.passive.orb);
    }

    consumeOverload() {
      this.overload = false;
      this.overloadHits = 0;
      this.overloadIdle = 0;
      this.fxOut.push({ kind: "overload_fire" });
    }

    // Damage over time / zone damage: armor applies, but no stun and no launch.
    dotHit(by, dmg, label) {
      if (this.state === STATE.KO || this.untouchable()) return;
      const taken = Combat.damageTaken(dmg, this.stats.armor);
      this.hp = Math.max(0, this.hp - taken);
      this.flash = Math.max(this.flash, 2);
      this.lastHit = { by: by.stats.name + (label ? " (" + label + ")" : ""), combo: 0, raw: dmg, armor: this.stats.armor, dmg: taken, knockback: 0, stun: 0, lost: 1 - this.hp / this.stats.maxHP };
      if (this.hp <= 0) {
        this.state = STATE.KO;
        this.stateTimer = 0;
      }
    }

    fxPush(ev) {
      if (this.fxOut.length < 12) this.fxOut.push(ev);
    }

    // ── Void Overload orb: the victim is enveloped, lifted, hangs for a moment, then is slammed into the ground.
    beginGravSlam(victim, cfg) {
      this.gravSlam = { target: victim, cfg: cfg, phase: "lift", p: 0, t: 0 };
    }

    gravSlamStep() {
      const G = this.gravSlam, v = G.target, C = G.cfg;
      if (v.state === STATE.KO || v.untouchable() || ++G.t > C.maxTicks) { this.gravSlam = null; v.ctl = null; return; }
      this.holdVictim(v);
      if (G.phase === "lift") {
        v.ctl = { vx: 0, vy: -C.liftSpeed, left: 2 };
        if (++G.p >= C.liftTicks) { G.phase = "hang"; G.p = 0; }
      } else if (G.phase === "hang") {
        v.ctl = { vx: 0, vy: 0, left: 2 };
        if (++G.p >= C.hang) { G.phase = "slam"; G.p = 0; }
      } else {
        v.ctl = { vx: 0, vy: C.slamSpeed, left: 2 };
        if (++G.p > 2 && v.grounded) {
          const dir = v.x + v.stats.width / 2 >= this.x + this.stats.width / 2 ? 1 : -1;
          v.ctl = null;
          this.strikeHit(v, { id: "void_slam", isSkill: true, noMark: true, noOverload: true, empowered: true, damage: C.damage, knockback: C.knockback, launchH: C.launchH, launchV: C.launchV, stun: C.stun, manaGain: C.manaGain || 0 }, dir);
          this.fxPush({ kind: "slam", x: v.x + v.stats.width / 2, y: v.y + v.stats.height, big: false });
          this.gravSlam = null;
        }
      }
    }

    // ── Skill 1: Void bound Wraiths. Two wraiths chase the enemy (one for the legs, one hovering at the head).
    // If BOTH catch it, it is restrained (no move / jump / attack) for cfg.restrain ticks. Pursuit ends after cfg.pursuit ticks.
    beginWraiths() {
      const C = this.hit.wraiths, s = this.stats;
      const cx = this.x + s.width / 2 + this.facing * 26, cy = this.y + s.height * 0.4;
      this.wraiths = {
        cfg: C, phase: "chase", t: 0, fade: 0,
        ws: [
          { role: "legs", x: cx, y: cy + 10, vx: this.facing * 2, vy: 1, latched: false },
          { role: "head", x: cx, y: cy - 10, vx: this.facing * 2, vy: -1, latched: false },
        ],
      };
      this.fxPush({ kind: "wraith_summon", x: cx, y: cy });
    }

    wraithStep() {
      const W = this.wraiths, C = W.cfg, v = this.foe;
      if (this.state === STATE.KO || !v || v.state === STATE.KO) { this.wraiths = null; return; }
      W.t++;
      const vcx = v.x + v.stats.width / 2;
      const anchor = (w) => (w.role === "legs" ? [vcx, v.y + v.stats.height - (C.legOffset || 8)] : [vcx, v.y - (C.headOffset || 14)]);
      if (W.phase === "chase") {
        if (W.t > C.pursuit) { W.phase = "fade"; W.t = 0; return; } // pursuit ran out without catching: they disappear
        for (const w of W.ws) {
          const a = anchor(w);
          if (w.latched) { w.x = a[0]; w.y = a[1]; continue; }
          const dx = a[0] - w.x, dy = a[1] - w.y, dist = Math.hypot(dx, dy) || 1;
          if (!v.untouchable() && dist <= C.catchRadius) { w.latched = true; this.fxPush({ kind: "wraith_latch", x: a[0], y: a[1] }); continue; }
          w.vx += ((dx / dist) * C.speed - w.vx) * C.turn;
          w.vy += ((dy / dist) * C.speed - w.vy) * C.turn;
          w.x += w.vx;
          w.y += w.vy;
        }
        if (W.ws.every((w) => w.latched)) { W.phase = "bound"; W.t = 0; }
      } else if (W.phase === "bound") {
        for (const w of W.ws) { const a = anchor(w); w.x = a[0]; w.y = a[1]; }
        if (W.t >= C.restrain || v.untouchable()) { this.wraiths = null; this.fxPush({ kind: "wraith_release", x: vcx, y: v.y + v.stats.height * 0.5 }); return; }
        v.root = { left: 2 };
      } else if (W.t >= (C.fadeTicks || 14)) {
        this.wraiths = null;
      }
    }

    // ── Skill 2: Abyssal Transit. The melt is the startup (still hittable); once fully dissolved he is untargetable for
    // cfg.hide ticks, then reforms at a random platform (never outside the arena, never right next to the enemy when avoidable).
    beginTransit() {
      const C = this.hit.transit, s = this.stats;
      const spot = this.pickTransitSpot(this.arenaRef, C);
      this.transit = { cfg: C, phase: "void", t: 0, fade: 0, from: { x: this.x + s.width / 2, y: this.y + s.height }, dest: spot };
      this.fxPush({ kind: "transit_out", x: this.x + s.width / 2, y: this.y + s.height });
    }

    pickTransitSpot(arena, C) {
      const s = this.stats;
      if (!arena) return null;
      const b = arena.blastZone, R = this.rand || Math.random;
      const foe = this.foe, fcx = foe ? foe.x + foe.stats.width / 2 : null;
      const plats = arena.platforms.filter((p) => p.w >= s.width && p.y - s.height > b.top && p.y < b.bottom && p.x >= b.left && p.x + p.w <= b.right);
      if (!plats.length) return null;
      const total = plats.reduce((a, p) => a + p.w, 0);
      let best = null, bestD = -1;
      for (let i = 0; i < (C.tries || 12); i++) {
        let r = R() * total, p = plats[plats.length - 1];
        for (const q of plats) { if ((r -= q.w) <= 0) { p = q; break; } }
        const m = Math.min(C.edgeMargin || 0, (p.w - s.width) / 2);
        const x = p.x + m + R() * (p.w - s.width - 2 * m);
        const d = fcx === null ? 1e9 : Math.abs(x + s.width / 2 - fcx) + Math.abs(p.y - (foe.y + foe.stats.height)) * 0.5;
        if (d >= (C.minEnemyDist || 0)) return { x: x, p: p };
        if (d > bestD) { best = { x: x, p: p }; bestD = d; }
      }
      return best;
    }

    transitStep() {
      const T = this.transit, C = T.cfg, s = this.stats;
      if (!this.hit || this.hit.id !== "abyssal_transit" || this.state === STATE.HITSTUN || this.state === STATE.KO) {
        this.transit = null; // interrupted while reforming
        this.untargetable = false;
        return;
      }
      this.state = STATE.ATTACK_ACTIVE;
      this.stateTimer = 3;
      this.ctl = { vx: 0, vy: 0, left: 2 }; // hangs where it is
      T.t++;
      if (T.phase === "void") {
        this.vanished = true;
        T.fade = 0;
        this.untargetable = true;
        if (T.t >= C.hide) {
          const d = T.dest;
          if (d) {
            this.x = d.x;
            this.y = d.p.y - s.height;
            this.px = this.x;
            this.py = this.y;
            this.grounded = true;
            this.standingOn = d.p;
            this.airJumpsLeft = s.maxAirJumps;
          }
          this.vx = 0;
          this.vy = 0;
          if (this.foe) this.facing = this.foe.x >= this.x ? 1 : -1;
          T.phase = "reform";
          T.t = 0;
          this.fxPush({ kind: "transit_in", x: this.x + s.width / 2, y: this.y + s.height });
        }
      } else {
        T.fade = Math.min(1, T.t / C.reform);
        this.untargetable = T.t <= (C.reformSafe || 0);
        if (T.t >= C.reform) {
          this.transit = null;
          this.untargetable = false;
          this.state = STATE.ATTACK_RECOVERY;
          this.stateTimer = this.hit.recovery;
        }
      }
    }

    // ── Ultimate: Void Execution. A visible startup, then a rift opens at the enemy's position. If the enemy is still inside the
    // grab zone when the rift finishes opening it is seized, lifted, impaled by tentacles and slammed. Leaving the zone = a clean miss.
    beginExecution() {
      const C = this.hit.execution, s = this.stats, v = this.foe;
      this.execution = null;
      if (!v || v.state === STATE.KO || v.untouchable()) return;
      const dx = v.x + v.stats.width / 2 - (this.x + s.width / 2), dy = v.y + v.stats.height / 2 - (this.y + s.height / 2);
      if (Math.hypot(dx, dy) > C.range) return; // nobody in range: a pure miss with the full recovery
      this.facing = dx >= 0 ? 1 : -1;
      this.execution = { id: this.hit.id, cfg: C, target: v, phase: "open", t: 0, p: 0, imp: 0, rx: v.x + v.stats.width / 2, ry: v.y + v.stats.height };
      this.fxPush({ kind: "rift_open", x: this.execution.rx, y: this.execution.ry });
    }

    executionStep() {
      const X = this.execution, C = X.cfg, v = X.target;
      const stop = (recovery) => {
        this.execution = null;
        if (v.ctl) v.ctl = null;
        this.state = STATE.ATTACK_RECOVERY;
        this.stateTimer = recovery;
      };
      if (!this.hit || this.hit.id !== X.id || this.state === STATE.HITSTUN || this.state === STATE.KO) { // the Mage was knocked out of it
        this.execution = null;
        if (v.ctl) v.ctl = null;
        return;
      }
      if (v.state === STATE.KO || (X.phase !== "open" && X.phase !== "retreat" && v.invuln > 0)) { stop(C.endRecovery); return; }
      this.state = STATE.ATTACK_ACTIVE;
      this.stateTimer = 3;
      this.vx = 0;
      X.t++;
      const vcx = v.x + v.stats.width / 2;
      if (X.phase === "open") {
        if (X.t >= C.openTicks) {
          const grabbed = !v.untouchable() && Math.abs(vcx - X.rx) <= C.grabRX && Math.abs(v.y + v.stats.height - X.ry) <= C.grabRY;
          X.phase = grabbed ? "lift" : "retreat";
          X.p = 0;
          this.fxPush({ kind: grabbed ? "grab" : "rift_miss", x: X.rx, y: X.ry });
        }
      } else if (X.phase === "retreat") {
        if (++X.p >= C.sinkTicks) stop(C.missRecovery);
      } else if (X.phase === "lift") {
        this.holdVictim(v);
        v.ctl = { vx: (X.rx - vcx) * 0.25, vy: -C.liftSpeed, left: 2 };
        if (++X.p >= C.liftTicks) { X.phase = "impale"; X.p = 0; }
      } else if (X.phase === "impale") {
        this.holdVictim(v);
        v.ctl = { vx: 0, vy: 0, left: 2 };
        X.p++;
        if (X.imp < C.impales && X.p % C.impaleGap === 0) {
          X.imp++;
          this.strikeHit(v, { id: "void_execution", isSkill: true, noMark: true, noOverload: true, damage: C.impaleDamage, knockback: 0, launchH: 0, launchV: 0, stun: C.impaleStun, manaGain: 0 }, this.facing);
          this.holdVictim(v);
          this.fxPush({ kind: "impale", x: vcx, y: v.y + v.stats.height * 0.5, n: X.imp });
        }
        if (X.imp >= C.impales && X.p >= C.impales * C.impaleGap + C.settle) { X.phase = "slam"; X.p = 0; }
      } else if (X.phase === "slam") {
        this.holdVictim(v);
        v.ctl = { vx: 0, vy: C.slamSpeed, left: 2 };
        if (++X.p > 2 && v.grounded) {
          v.ctl = null;
          const dir = vcx >= this.x + this.stats.width / 2 ? 1 : -1;
          this.strikeHit(v, { id: "void_execution", isSkill: true, noMark: true, noOverload: true, empowered: true, damage: C.slamDamage, knockback: C.slamKnockback, launchH: C.slamLaunchH, launchV: C.slamLaunchV, stun: C.slamStun, manaGain: 0 }, dir);
          this.fxPush({ kind: "slam", x: vcx, y: v.y + v.stats.height, big: true });
          X.phase = "sink";
          X.p = 0;
        }
      } else if (++X.p >= C.sinkTicks) { // sink
        stop(C.endRecovery);
      }
    }


    // Momentum passive: a melee swing that landed nothing costs whiffLoss momentum.
    whiffCheck() {
      if (this.hit && this.hit.utility) return; // a utility skill (Phantom Decoy) is not a swing
      const P = this.stats.passive;
      if (P && P.type === "deathmark" && !this.swingHit && this.hit && this.hit.type === "melee" && !this.mark.marked) this.mark.stacks = 0; // a miss breaks the chain
      if (P && P.type === "momentum" && P.whiffLoss && !this.swingHit && this.hit && this.hit.type === "melee" && this.momentum > 0) {
        this.momentum = Math.max(0, this.momentum - P.whiffLoss);
      }
    }

    // Charged punch (stats.charge): wind up while the attack button is held.
    startCharge(cfg) {
      this.chargeLock = true; // one charge per press: release the button to charge again
      const attack = Object.assign({}, cfg.attack, { chargeHold: true, chargeTime: cfg.time, chargeScale: cfg.scale || null });
      if (this.stats.id === "hitter" && attack.gunnerBarrage) {
        attack.damage *= 1 + this.gunnerStacks * this.stats.passive.damagePerStack;
        const pj = attack.projectile; // stay rooted in the active state until the last bullet has left
        attack.active = Math.max(1, (pj.shots - 1) * pj.gap + 1);
      }
      this.startSkill(-2, attack);
      this.chargeTicks = 0;
      this.chargeReleased = false;
    }

    // Melee hit shape: a half-ellipse in front of the fighter (no square corners).
    // cx/cy = centre (the fighter's front edge), rx = reach, ry = half height.
    // Per-attack data can tweak it: boxH (height factor, default meleeBoxHeight) and lift (px upward).
    meleeShape() {
      const s = this.stats;
      const h = s.height * (this.hit.boxH || MW.CONFIG.combat.meleeBoxHeight);
      return {
        cx: this.facing > 0 ? this.x + s.width : this.x,
        cy: this.y + s.height / 2 - (this.hit.lift || 0),
        rx: this.hit.range,
        ry: h / 2,
        dir: this.facing,
      };
    }

    // Bounding box of the melee shape (used by bots / debugging; hits use hitsRect).
    meleeBox() {
      const e = this.meleeShape();
      return {
        x: e.dir > 0 ? e.cx : e.cx - e.rx,
        y: e.cy - e.ry,
        w: e.rx,
        h: e.ry * 2,
      };
    }

    // Does the melee shape touch this rectangle? Only the front half of the ellipse counts.
    hitsRect(r) {
      if (this.hit && this.hit.utility) return false; // utility skills never hit anything
      // Lock-on (Meteor Fist): decided on the first active tick, i.e. when the punch is committed.
      // Locked = it cannot be dodged by moving or jumping; not locked = ordinary short reach (a miss).
      const L = this.hit && this.hit.lockOn;
      if (L && this.state === STATE.ATTACK_ACTIVE) {
        const dx = r.x + r.w / 2 - (this.x + this.stats.width / 2);
        if (this.lockState === null) {
          this.lockState = Math.abs(dx) <= L.range && ((dx >= 0 ? 1 : -1) === this.facing || Math.abs(dx) < this.stats.width);
        }
        if (this.lockState) return Math.abs(dx) <= (L.follow || L.range);
      }
      const e = this.meleeShape();
      // closest point of the rect to the ellipse centre, restricted to the front half
      const x0 = e.dir > 0 ? Math.max(r.x, e.cx) : r.x;
      const x1 = e.dir > 0 ? r.x + r.w : Math.min(r.x + r.w, e.cx);
      if (x0 > x1) return false;
      const px = Math.max(x0, Math.min(e.cx, x1));
      const py = Math.max(r.y, Math.min(e.cy, r.y + r.h));
      const nx = (px - e.cx) / e.rx;
      const ny = (py - e.cy) / e.ry;
      return nx * nx + ny * ny <= 1;
    }

    // Called by the sim whenever this fighter's attack connects.
    onHitLanded(hit) {
      this.swingHit = true;
      this.addMana(hit);
      const P = this.stats.passive;
      if (this.stats.id === "hitter" && hit && hit.gunnerBasic) this.gunnerStacks = Math.min(P.max, this.gunnerStacks + 1);
      if (P && P.type === "voidoverload" && !(hit && hit.noOverload) && !this.overload) { // Void Overload: every Nth landed hit charges the next basic attack
        this.overloadIdle = 0;
        if (++this.overloadHits >= P.hits) {
          this.overload = true;
          this.fxOut.push({ kind: "overload_ready" });
        }
      }
      if (P && P.type === "momentum") {
        this.momentum = Math.min(P.max, this.momentum + (hit && hit.momentumGain !== undefined ? hit.momentumGain : 1));
        this.momentumIdle = 0;
      }
    }

    momentumFull() {
      const P = this.stats.passive;
      return !!(P && P.type === "momentum" && this.momentum >= P.max);
    }

    // Mana: gained for each hit landed on an enemy. Full meter = ultimate ready.
    addMana(hit) {
      const C = MW.CONFIG.combat;
      this.mana = Math.min(C.maxMana, this.mana + (hit && hit.manaGain !== undefined ? hit.manaGain : C.manaPerHit));
    }

    manaReady() {
      return this.mana >= MW.CONFIG.combat.maxMana;
    }

    // Ultimate button. Needs a full meter.
    useUltimate() {
      if (!this.manaReady() || !this.stats.ultimate) return false;
      this.mana = 0;
      let ult = Object.assign({}, this.stats.ultimate.attack);
      if (this.stats.id === "hitter") {
        const PG = this.stats.passive;
        ult.damage *= 1 + this.gunnerStacks * PG.damagePerStack;
        ult.knockback *= 1 + this.gunnerStacks * (PG.ultKnockbackPerStack || 0);
        ult.black = this.gunnerStacks >= PG.max; // max stacks: the enormous black-energy detonation
        if (ult.black) ult.radius *= PG.ultBlackRadiusMul || 1;
      }
      this.startSkill(-1, ult);
      return true;
    }

    // Skill slots 0..3 (touch pad / U I O L). Returns true when the skill started.
    // Melee skills (def.attack) run through the normal startup -> active -> recovery states.
    useSkill(slot) {
      const def = this.stats.skills && this.stats.skills[slot];
      if (this.stats.id === "hitter") {
        if (slot === 0 && this.gunnerBomb) { this.gunnerBomb.detonate = true; return true; }
        if (slot === 0 && def && this.cooldowns[slot] <= 0) {
          if (!this.grounded || !this.standingOn) return false; // the bomb is planted ON a platform: no planting in mid-air
          this.gunnerBomb = { x: this.x + this.stats.width / 2, y: this.y + this.stats.height, t: 0, cfg: def.attack };
          this.fxOut.push({ kind: "gunner_bomb_plant", x: this.gunnerBomb.x, y: this.gunnerBomb.y });
          return true;
        }
        if (slot === 1 && def && this.cooldowns[slot] <= 0) {
          const C = def.attack, dir = this.heldDir || -this.facing;
          if (this.heldDir) this.facing = dir; // a backward hop keeps him facing the enemy
          this.vx = dir * (C.distance / C.duration);
          this.vy = -C.vertical;
          this.gunnerHop = { left: C.duration, vx: this.vx };
          this.cooldowns[slot] = def.cooldown || 0;
          this.fxOut.push({ kind: "gunner_hop", x: this.x + this.stats.width / 2, y: this.y + this.stats.height });
          return true;
        }
      }
      if (!def || !def.attack || this.cooldowns[slot] > 0) return false;
      this.cooldowns[slot] = def.cooldown || 0;
      let hit = Object.assign({}, def.attack);
      if (this.stats.id === "hitter" && hit.type === "projectile") hit.damage *= 1 + this.gunnerStacks * this.stats.passive.damagePerStack;
      const P = this.stats.passive;
      if (hit.momentumBonus && P && P.type === "momentum" && this.momentum >= P.max) {
        // empowered: spend all momentum for bonus damage on this one use
        this.momentum = 0;
        this.momentumIdle = 0;
        hit = Object.assign({}, hit, { damage: hit.damage * (1 + P.bonus), knockback: hit.knockback * (P.bonusKnockback || 1), empowered: true });
      }
      if (hit.markBonus && P && P.type === "deathmark" && this.mark.marked) {
        // marked target: this skill deals bonus damage (the scythe bomb too), then the mark is spent
        hit = Object.assign({}, hit, { damage: hit.damage * (1 + P.bonus), markMul: 1 + P.bonus, empowered: true });
        this.clearMark();
      }
      this.startSkill(slot, hit);
      return true;
    }

    startSkill(slot, hit) {
      if (!hit.decoy) this.breakCloak(); // attacking ends the invisibility early (casting the decoy itself does not)
      this.chainIndex = 0;
      this.hit = hit;
      this.skillSlot = slot;
      this.advanceStopped = false;
      this.castFx = { id: hit.id || "", slot: slot };
      this.state = STATE.ATTACK_STARTUP;
      this.stateTimer = hit.startup;
      this.comboQueued = false;
      this.hitTargets = new Set();
      this.hitBase = hit; // unmodified data of this skill (the barrage swaps this.hit every beat)
      this.barrageBeat = 0;
      this.swingHit = false;
      this.lockState = null;
      this.chargeTicks = 0;
      this.chargeReleased = true;
      this.atkBuf = 0;
      if (this.heldDir) this.facing = this.heldDir;
    }

    // Apply one hit: armor -> HP -> knockback (weight, fraction of max HP lost) -> hitstun.
    // dir = launch direction (+1 right / -1 left); melee uses the attacker's facing, projectiles their travel direction.
    takeHit(attacker, hit, dir) {
      const s = this.stats;
      const C = MW.CONFIG.combat;
      const P = s.passive;
      if (this.untargetable) return this.lastHit; // dissolved into the void: nothing lands
      if (attacker && attacker !== this && attacker.addMark) attacker.addMark(this, hit); // Death Mark stacks
      // Iron Guard is up while it winds up and while it is active.
      const guarding = !!(this.hit && this.hit.id === "iron_guard" &&
        (this.state === STATE.ATTACK_STARTUP || this.state === STATE.ATTACK_ACTIVE));
      // a blocked hit does not break Combat Momentum
      if (P && P.type === "momentum" && !guarding) this.momentum = Math.max(0, this.momentum - (P.hurtLoss || 0));
      const reduction = guarding ? (this.hit.damageReduction || 1) : 1;
      const dmg = Combat.damageTaken(hit.damage, s.armor) * reduction;
      if (guarding) {
        const G = this.hit;
        this.guardEmpowered = true;
        this.guardEmpowerCfg = G.empower || null;
        this.guardEmpowerLeft = (G.empower && G.empower.window) || 300;
        this.addMana({ manaGain: G.blockMana || 0 });
        this.blockFx = { dir: attacker.x > this.x ? 1 : -1 };
        // counter shockwave: only for attackers that are close, and never answers another counter
        if (G.counter && !hit.isCounter && attacker && attacker !== this) {
          const gap = Math.abs(attacker.x + attacker.stats.width / 2 - (this.x + s.width / 2)) - (attacker.stats.width + s.width) / 2;
          if (gap <= G.counter.range) this.counterTarget = attacker;
        }
      }

      this.hp = Math.max(0, this.hp - dmg);
      if (this.stats.id === "hitter") this.gunnerHop = null; // a hit interrupts the mobility burst
      if (this.cloak && this.cloak.revealOnHit) this.cloak = null; // getting hit reveals the cloaked Assassin
      if (hit.rupture && this.hp > 0 && attacker && attacker !== this) this.startBleed(attacker, hit); // Rupture: bleeding starts (also on armored targets)
      const lost = 1 - this.hp / s.maxHP;
      const kb = Combat.knockback(hit.knockback, lost, s.weight);
      const stun = hit.stun !== undefined ? hit.stun : Combat.hitstun(kb); // hit.stun = fixed stagger
      if (dir === undefined) dir = attacker.facing;

      // Super armor: while winding up / swinging an armored attack the hit still hurts but does
      // not interrupt or launch. A lethal hit is never absorbed.
      const armored = this.hp > 0 && this.hit && this.hit.superArmor &&
        (this.state === STATE.ATTACK_STARTUP || this.state === STATE.ATTACK_ACTIVE);
      if (armored) {
        this.flash = C.hitFlashFrames;
        this.armorHit = 8; // visual only: shield spark
        this.lastHit = { by: attacker.stats.name, combo: attacker.chainIndex + 1, raw: hit.damage, armor: s.armor, dmg: dmg, knockback: 0, stun: 0, lost: lost, absorbed: true };
        return this.lastHit;
      }

      // Per-attack launch shape: launchH / launchV scale the sideways / upward launch
      // (an uppercut uses a small launchH and a big launchV to send the target straight up).
      this.vx = dir * kb * C.launchHorizontal * (hit.launchH === undefined ? 1 : hit.launchH);
      this.vy = -kb * C.launchVertical * (hit.launchV === undefined ? 1 : hit.launchV);
      this.grounded = false;
      this.standingOn = null;
      this.facing = -dir;
      this.flash = C.hitFlashFrames;
      this.comboQueued = false;
      this.hit = null;
      this.pendingProjectile = null;
      if (this.hp <= 0) {
        this.state = STATE.KO;
        this.stateTimer = 0;
      } else {
        this.state = STATE.HITSTUN;
        this.stateTimer = stun;
      }
      this.lastHit = {
        by: attacker.stats.name,
        combo: attacker.chainIndex + 1,
        raw: hit.damage,
        armor: s.armor,
        dmg: dmg,
        knockback: kb,
        stun: stun,
        lost: lost,
      };
      if (hit.scythe && this.hp > 0 && attacker && attacker.beginScythe) attacker.beginScythe(this, hit); // chained: pull starts
      if (hit.onslaught && this.hp > 0 && attacker && attacker.beginOnslaught) attacker.beginOnslaught(this, hit); // Phantom Onslaught starts
      if (hit.sentence && this.hp > 0 && attacker && attacker.beginSentence) attacker.beginSentence(this, hit); // Death Sentence starts
      return this.lastHit;
    }

    step(intent, arena) {
      const s = this.stats;
      const P = MW.CONFIG.physics;
      const wasGrounded = this.grounded;
      this.arenaRef = arena; // Abyssal Transit needs the layout to pick where to reappear

      this.px = this.x;
      this.py = this.y;
      if (this.root) { // Void bound Wraiths: no movement, no jumping, no attacking
        intent = MW.IDLE_INTENT;
        this.jumpBuf = 0;
        this.atkBuf = 0;
      }
      // Direction held this tick. A new swing (including the next hit of a chain started
      // by buffered/spammed presses) turns to face it, so reversing the stick mid-spam works.
      this.heldDir = (intent.right ? 1 : 0) - (intent.left ? 1 : 0);
      this.attackHeld = !!intent.attackHeld;
      if (this.attackHeld) this.atkHeldTicks++;
      else { this.atkHeldTicks = 0; this.chargeLock = false; }
      this.advanceState();
      if (this.scythe) this.scytheStep();
      this.vanished = false;
      if (this.onslaught) this.onslaughtStep(arena);
      if (this.sentence) this.sentenceStep(arena);
      if (this.decoy) this.decoyStep(arena);
      if (this.transit) this.transitStep(arena);
      if (this.wraiths) this.wraithStep();
      if (this.gravSlam) this.gravSlamStep();
      if (this.execution) this.executionStep();
      const PV = this.stats.passive; // Void Overload: the hit counter fades if no hit lands for idleReset ticks (0 = never)
      if (PV && PV.type === "voidoverload" && !this.overload && this.overloadHits > 0 && PV.idleReset && ++this.overloadIdle >= PV.idleReset) this.overloadHits = 0;
      const DMK = this.stats.passive;
      if (DMK && DMK.type === "deathmark") { // stacks fade if the chain of hits stops; the mark runs out after its duration
        const m = this.mark;
        if (m.marked) { if (--m.left <= 0 || (m.target && m.target.state === STATE.KO)) this.clearMark(); }
        else if (m.stacks > 0 && ++m.idle >= DMK.stackWindow) m.stacks = 0;
      }

      // Early presses are remembered for a few ticks so they are not lost to a lockout.
      const B = MW.CONFIG.inputBufferFrames;
      if (intent.jumpPressed) this.jumpBuf = B;
      if (intent.attackPressed) this.atkBuf = B;
      if (this.slow && this.slow.noJump) this.jumpBuf = 0; // Abyssal Grasp: no jumping (air jumps included)

      // Skill slots (touch pad / U I O L). Only from locomotion states; nothing is assigned yet.
      if (intent.skillPressed && LOCOMOTION.has(this.state)) {
        for (let i = 0; i < intent.skillPressed.length; i++) if (intent.skillPressed[i]) this.useSkill(i);
      }

      if (intent.ultPressed && LOCOMOTION.has(this.state)) this.useUltimate();

      // Attack: starts a swing from any locomotion state (ground or air),
      // or queues the next chain hit while already swinging.
      if (this.atkBuf > 0) {
        if (LOCOMOTION.has(this.state)) {
          const m = (intent.right ? 1 : 0) - (intent.left ? 1 : 0);
          if (m !== 0) this.facing = m;
          this.startAttack(0);
          this.atkBuf = 0;
        } else if (ATTACKING.has(this.state) && !(this.hit && this.hit.isSkill)) {
          // (a skill cannot be chained into a basic attack)
          this.comboQueued = true;
          this.atkBuf = 0;
        }
      }

      // Hold the attack button (after the tap / jab) to charge the heavy punch.
      const CH = s.charge;
      if (CH && this.attackHeld && !this.chargeLock && !this.overload && this.atkHeldTicks >= CH.holdStart && LOCOMOTION.has(this.state)) {
        this.startCharge(CH);
      }

      // Only locomotion states accept full input. Attacks in the air still allow
      // steering (air drift); hitstun and ko ignore everything.
      const canAct = LOCOMOTION.has(this.state);
      if (!canAct) {
        const drift = ATTACKING.has(this.state) && !wasGrounded;
        intent = drift ? { left: intent.left, right: intent.right } : MW.IDLE_INTENT;
      }

      // cooldowns tick down; passive momentum fades while no hit lands
      for (let i = 0; i < 4; i++) if (this.cooldowns[i] > 0) this.cooldowns[i]--;
      if (this.guardEmpowered && --this.guardEmpowerLeft <= 0) this.guardEmpowered = false; // bonus runs out
      const PM = s.passive;
      if (PM && PM.type === "momentum" && this.momentum > 0 && ++this.momentumIdle >= PM.decayDelay) {
        this.momentum--;
        this.momentumIdle = PM.decayDelay - PM.decayStep;
      }

      if (this.invuln > 0) this.invuln--;
      if (this.dropTimer > 0) this.dropTimer--;

      // --- horizontal movement ---
      const move = (intent.right ? 1 : 0) - (intent.left ? 1 : 0);
      if (this.stats.id === "hitter" && this.hit && this.hit.gunnerAim && this.state === STATE.ATTACK_STARTUP) this.vx = 0;
      else if (move !== 0) {
        if (canAct) this.facing = move;
        this.vx = approach(this.vx, move * s.runSpeed, wasGrounded ? s.groundAccel : s.airAccel);
      } else {
        this.vx = approach(this.vx, 0, wasGrounded ? s.groundFriction : s.airDrag);
      }
      if (this.gunnerHop && this.gunnerHop.left > 0) {
        this.vx = this.gunnerHop.vx;
        if (--this.gunnerHop.left <= 0) this.gunnerHop = null;
      }
      if (this.slow && this.state !== STATE.HITSTUN) { // Abyssal Grasp: heavily reduced speed
        const cap = s.runSpeed * this.slow.mul;
        this.vx = Math.max(-cap, Math.min(cap, this.vx));
      }
      if (this.root && this.state !== STATE.HITSTUN) this.vx = 0; // restrained: knockback still works, walking does not
      // Step-in while swinging (attack data: advance).
      if (this.state === STATE.ATTACK_STARTUP && this.hit.dashSpeed) {
        this.vx = this.facing * this.hit.dashSpeed; // skill dash (Fist Rush)
      } else if ((this.state === STATE.ATTACK_STARTUP || this.state === STATE.ATTACK_ACTIVE) && this.hit.advance && !(this.hit.chargeHold && !this.chargeReleased)) {
        // stopOnContact (Meteor Breaker): the Sim sets advanceStopped when the enemy is in reach,
        // so the charge never runs THROUGH the enemy and whiffs.
        this.vx = this.advanceStopped ? 0 : this.facing * this.hit.advance;
      }

      // --- jump / air jump ---
      // A jump that can't happen yet (no air jumps left, or locked out) stays buffered.
      if (this.jumpBuf > 0 && canAct) {
        if (wasGrounded) {
          this.vy = -s.jumpStrength;
          this.jumpBuf = 0;
        } else if (this.airJumpsLeft > 0) {
          this.vy = -s.airJumpStrength;
          this.airJumpsLeft--;
          this.jumpBuf = 0;
        }
      }

      // --- drop through a one-way platform ---
      if (intent.downPressed && wasGrounded && this.standingOn && this.standingOn.oneWay) {
        this.dropTimer = s.dropThroughFrames;
      }

      // --- gravity / fast-fall ---
      this.vy += P.gravity;
      if (intent.downHeld && !wasGrounded && this.vy > 0) {
        this.vy = s.fastFallSpeed;
      } else if (this.vy > s.maxFallSpeed) {
        this.vy = s.maxFallSpeed;
      }
      if (this.stats.id === "hitter" && this.hit && this.hit.gunnerAim && this.state === STATE.ATTACK_STARTUP) {
        this.vx = 0;
        this.vy = 0;
      }

      if (this.ctl) { // another fighter's skill is steering this one (pull, lift, slam, hold)
        this.vx = this.ctl.vx;
        this.vy = this.ctl.vy;
        if (--this.ctl.left <= 0) this.ctl = null;
      }

      // --- integrate + platform collision (top surface, falling only) ---
      const prevBottom = this.y + s.height;
      this.x += this.vx;
      this.y += this.vy;
      this.grounded = false;
      this.standingOn = null;

      if (this.vy >= 0) {
        const left = this.x;
        const right = this.x + s.width;
        const bottom = this.y + s.height;
        let best = null;
        for (const p of arena.platforms) {
          if (p.oneWay && this.dropTimer > 0) continue;
          if (right <= p.x || left >= p.x + p.w) continue;
          if (prevBottom <= p.y + EPS && bottom >= p.y) {
            if (!best || p.y < best.y) best = p;
          }
        }
        if (best) {
          this.y = best.y - s.height;
          this.vy = 0;
          this.grounded = true;
          this.standingOn = best;
          this.airJumpsLeft = s.maxAirJumps;
        }
      }

      // --- state transitions (locomotion) ---
      if (LOCOMOTION.has(this.state)) {
        if (this.grounded) this.state = Math.abs(this.vx) > 0.1 ? STATE.RUN : STATE.IDLE;
        else this.state = this.vy < 0 ? STATE.RISING : STATE.FALLING;
      }

      // --- blast zone (a KO'd fighter waits for the round reset instead) ---
      const b = arena.blastZone;
      if (
        this.state !== STATE.KO &&
        (this.x + s.width < b.left || this.x > b.right || this.y + s.height < b.top || this.y > b.bottom)
      ) {
        this.leaveArena(arena);
      }

      if (this.bleed) this.bleedStep();
      if (this.bleedPulse > 0) this.bleedPulse--;
      if (this.cloak && --this.cloak.left <= 0) this.cloak = null;
      this.fade = this.vanished ? 0 : this.cloak ? this.cloak.alpha : 1;
      if (this.transit) this.fade = this.transit.fade; // Abyssal Transit: melting / reforming body opacity
      if (this.root && --this.root.left <= 0) this.root = null;
      if (this.slow && --this.slow.left <= 0) this.slow = null;
      if (this.fxOut.length > 12) this.fxOut.length = 12;

      if (this.jumpBuf > 0) this.jumpBuf--;
      if (this.atkBuf > 0) this.atkBuf--;
    }
  }

  MW.STATE = STATE;
  MW.Combat = Combat;
  MW.Fighter = Fighter;
})(globalThis);