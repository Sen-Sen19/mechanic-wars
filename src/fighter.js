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
      this.momentumIdle = 0; // ticks since the last landed hit
      this.cooldowns = [0, 0, 0, 0]; // skill cooldowns (ticks left)
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
      this.momentumIdle = 0;
      this.cooldowns = [0, 0, 0, 0];
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
      if (this.armorHit > 0) this.armorHit--;
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
      this.addMana(hit);
      const P = this.stats.passive;
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

    // Ultimate button. Needs a full meter. Placeholder until each character gets `ultimate` data
    // in characters.js: with none defined nothing happens and the meter stays full.
    useUltimate() {
      if (!this.manaReady() || !this.stats.ultimate) return false;
      this.mana = 0;
      return true; // TODO: run this.stats.ultimate here
    }

    // Skill slots 0..3 (touch pad / U I O L). Returns true when the skill started.
    // Melee skills (def.attack) run through the normal startup -> active -> recovery states.
    useSkill(slot) {
      const def = this.stats.skills && this.stats.skills[slot];
      if (!def || !def.attack || this.cooldowns[slot] > 0) return false;
      this.cooldowns[slot] = def.cooldown || 0;
      let hit = def.attack;
      const P = this.stats.passive;
      if (hit.momentumBonus && P && P.type === "momentum" && this.momentum >= P.max) {
        // empowered: spend all momentum for bonus damage on this one use
        this.momentum = 0;
        this.momentumIdle = 0;
        hit = Object.assign({}, hit, { damage: hit.damage * (1 + P.bonus), empowered: true });
      }
      this.startSkill(slot, hit);
      return true;
    }

    startSkill(slot, hit) {
      this.chainIndex = 0;
      this.hit = hit;
      this.skillSlot = slot;
      this.state = STATE.ATTACK_STARTUP;
      this.stateTimer = hit.startup;
      this.comboQueued = false;
      this.hitTargets = new Set();
      this.atkBuf = 0;
      if (this.heldDir) this.facing = this.heldDir;
    }

    // Apply one hit: armor -> HP -> knockback (weight, fraction of max HP lost) -> hitstun.
    // dir = launch direction (+1 right / -1 left); melee uses the attacker's facing, projectiles their travel direction.
    takeHit(attacker, hit, dir) {
      const s = this.stats;
      const C = MW.CONFIG.combat;
      const P = s.passive;
      if (P && P.type === "momentum") this.momentum = Math.max(0, this.momentum - (P.hurtLoss || 0));
      const dmg = Combat.damageTaken(hit.damage, s.armor);
      this.hp = Math.max(0, this.hp - dmg);
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

      // Only locomotion states accept full input. Attacks in the air still allow
      // steering (air drift); hitstun and ko ignore everything.
      const canAct = LOCOMOTION.has(this.state);
      if (!canAct) {
        const drift = ATTACKING.has(this.state) && !wasGrounded;
        intent = drift ? { left: intent.left, right: intent.right } : MW.IDLE_INTENT;
      }

      // cooldowns tick down; passive momentum fades while no hit lands
      for (let i = 0; i < 4; i++) if (this.cooldowns[i] > 0) this.cooldowns[i]--;
      const PM = s.passive;
      if (PM && PM.type === "momentum" && this.momentum > 0 && ++this.momentumIdle >= PM.decayDelay) {
        this.momentum--;
        this.momentumIdle = PM.decayDelay - PM.decayStep;
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
      if (this.state === STATE.ATTACK_STARTUP && this.hit.dashSpeed) {
        this.vx = this.facing * this.hit.dashSpeed; // skill dash (Fist Rush)
      } else if ((this.state === STATE.ATTACK_STARTUP || this.state === STATE.ATTACK_ACTIVE) && this.hit.advance) {
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
