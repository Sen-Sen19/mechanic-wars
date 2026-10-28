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
      this.lastHit = null; // readout of the last hit taken (see takeHit)
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
      this.chainIndex = 0;
      this.comboQueued = false;
      this.hitTargets = new Set(); // fighter ids already hit by the current swing
      this.pendingProjectile = null; // attack data to fire this tick (Sim turns it into a Projectile)
      this.swingFx = false; // set on the first active tick of a melee swing (visual events only)
      this.flash = 0;
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
      this.respawn(arena);
    }

    // --- attacks ---
    chainLength() {
      const c = this.stats.attack.chain;
      return c ? c.length : 1;
    }

    startAttack(index) {
      const a = this.stats.attack;
      this.chainIndex = index;
      this.hit = a.chain && a.chain[index] ? Object.assign({}, a, a.chain[index]) : a;
      this.state = STATE.ATTACK_STARTUP;
      this.stateTimer = this.hit.startup;
      this.comboQueued = false;
      this.hitTargets = new Set();
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
      switch (this.state) {
        case STATE.ATTACK_STARTUP:
          if (--this.stateTimer <= 0) {
            this.state = STATE.ATTACK_ACTIVE;
            this.stateTimer = this.hit.active || 1;
            if (this.hit.type === "projectile") this.pendingProjectile = this.hit;
            else if (this.hit.fxStyle) this.swingFx = true;
          }
          break;
        case STATE.ATTACK_ACTIVE:
          if (--this.stateTimer <= 0) {
            this.state = STATE.ATTACK_RECOVERY;
            this.stateTimer = this.hit.recovery;
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

    // Melee hitbox: a box in front of the fighter, `range` long.
    meleeBox() {
      const s = this.stats;
      const h = s.height * MW.CONFIG.combat.meleeBoxHeight;
      return {
        x: this.facing > 0 ? this.x + s.width : this.x - this.hit.range,
        y: this.y + (s.height - h) / 2,
        w: this.hit.range,
        h: h,
      };
    }

    // Apply one hit: armor -> HP -> knockback (weight, fraction of max HP lost) -> hitstun.
    // dir = launch direction (+1 right / -1 left); melee uses the attacker's facing, projectiles their travel direction.
    takeHit(attacker, hit, dir) {
      const s = this.stats;
      const C = MW.CONFIG.combat;
      const dmg = Combat.damageTaken(hit.damage, s.armor);
      this.hp = Math.max(0, this.hp - dmg);
      const lost = 1 - this.hp / s.maxHP;
      const kb = Combat.knockback(hit.knockback, lost, s.weight);
      const stun = Combat.hitstun(kb);
      if (dir === undefined) dir = attacker.facing;

      this.vx = dir * kb * C.launchHorizontal;
      this.vy = -kb * C.launchVertical;
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
      return this.lastHit;
    }

    step(intent, arena) {
      const s = this.stats;
      const P = MW.CONFIG.physics;
      const wasGrounded = this.grounded;

      this.px = this.x;
      this.py = this.y;
      // Direction held this tick. A new swing (including the next hit of a chain started
      // by buffered/spammed presses) turns to face it, so reversing the stick mid-spam works.
      this.heldDir = (intent.right ? 1 : 0) - (intent.left ? 1 : 0);
      this.advanceState();

      // Early presses are remembered for a few ticks so they are not lost to a lockout.
      const B = MW.CONFIG.inputBufferFrames;
      if (intent.jumpPressed) this.jumpBuf = B;
      if (intent.attackPressed) this.atkBuf = B;

      // Attack: starts a swing from any locomotion state (ground or air),
      // or queues the next chain hit while already swinging.
      if (this.atkBuf > 0) {
        if (LOCOMOTION.has(this.state)) {
          const m = (intent.right ? 1 : 0) - (intent.left ? 1 : 0);
          if (m !== 0) this.facing = m;
          this.startAttack(0);
          this.atkBuf = 0;
        } else if (ATTACKING.has(this.state)) {
          this.comboQueued = true;
          this.atkBuf = 0;
        }
      }

      // Only locomotion states accept full input. Attacks in the air still allow
      // steering (air drift); hitstun and ko ignore everything.
      const canAct = LOCOMOTION.has(this.state);
      if (!canAct) {
        const drift = ATTACKING.has(this.state) && !wasGrounded;
        intent = drift ? { left: intent.left, right: intent.right } : MW.IDLE_INTENT;
      }

      if (this.invuln > 0) this.invuln--;
      if (this.dropTimer > 0) this.dropTimer--;

      // --- horizontal movement ---
      const move = (intent.right ? 1 : 0) - (intent.left ? 1 : 0);
      if (move !== 0) {
        if (canAct) this.facing = move;
        this.vx = approach(this.vx, move * s.runSpeed, wasGrounded ? s.groundAccel : s.airAccel);
      } else {
        this.vx = approach(this.vx, 0, wasGrounded ? s.groundFriction : s.airDrag);
      }
      // Step-in while swinging (attack data: advance).
      if ((this.state === STATE.ATTACK_STARTUP || this.state === STATE.ATTACK_ACTIVE) && this.hit.advance) {
        this.vx = this.facing * this.hit.advance;
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

      if (this.jumpBuf > 0) this.jumpBuf--;
      if (this.atkBuf > 0) this.atkBuf--;
    }
  }

  MW.STATE = STATE;
  MW.Combat = Combat;
  MW.Fighter = Fighter;
})(globalThis);
