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
      this.guardEmpowered = false; // after blocking with Iron Guard: next basic punch is stronger
      this.guardEmpowerLeft = 0; // ticks left to use it
      this.guardEmpowerCfg = null;
      this.counterTarget = null; // set when Iron Guard blocks a hit: the Sim answers with a counter shockwave
      this.blockFx = null; // visual event for a blocked hit (the Sim turns it into an effect)
      this.castFx = null; // visual event for a skill that just started
      this.advanceStopped = false;
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
      this.attackHeld = false; // attack button held this tick (charged punch)
      this.atkHeldTicks = 0;
      this.chargeLock = false; // one charge per button press
      this.chargeTicks = 0;
      this.chargeReleased = true;
      this.swingHit = false; // did the current swing land anything? (Momentum whiff loss)
      this.lockState = null; // Meteor Fist lock-on: null = not decided yet, true / false once the swing is committed
      this.scythe = null; // Assassin Chained Scythe in progress: { target, phase: "pull" | "bomb", t, cfg, mul }
      this.blastFx = null; // visual one-shot (bomb explosion), read by assassin_fx.js
      this.mark = { target: null, stacks: 0, idle: 0, marked: false, left: 0 }; // Assassin passive: Death Mark on the enemy
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
      this.guardEmpowered = false;
      this.guardEmpowerLeft = 0;
      this.counterTarget = null;
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
            if (this.hit.type === "projectile") this.pendingProjectile = this.hit;
            else if (this.hit.fxStyle) this.swingFx = true;
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

    // Momentum passive: a melee swing that landed nothing costs whiffLoss momentum.
    whiffCheck() {
      const P = this.stats.passive;
      if (P && P.type === "deathmark" && !this.swingHit && this.hit && this.hit.type === "melee" && !this.mark.marked) this.mark.stacks = 0; // a miss breaks the chain
      if (P && P.type === "momentum" && P.whiffLoss && !this.swingHit && this.hit && this.hit.type === "melee" && this.momentum > 0) {
        this.momentum = Math.max(0, this.momentum - P.whiffLoss);
      }
    }

    // Charged punch (stats.charge): wind up while the attack button is held.
    startCharge(cfg) {
      this.chargeLock = true; // one charge per press: release the button to charge again
      this.startSkill(-2, Object.assign({}, cfg.attack, { chargeHold: true, chargeTime: cfg.time, chargeScale: cfg.scale || null }));
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
      this.startSkill(-1, this.stats.ultimate.attack);
      return true;
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
      this.attackHeld = !!intent.attackHeld;
      if (this.attackHeld) this.atkHeldTicks++;
      else { this.atkHeldTicks = 0; this.chargeLock = false; }
      this.advanceState();
      if (this.scythe) this.scytheStep();
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
      if (CH && this.attackHeld && !this.chargeLock && this.atkHeldTicks >= CH.holdStart && LOCOMOTION.has(this.state)) {
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
      if (move !== 0) {
        if (canAct) this.facing = move;
        this.vx = approach(this.vx, move * s.runSpeed, wasGrounded ? s.groundAccel : s.airAccel);
      } else {
        this.vx = approach(this.vx, 0, wasGrounded ? s.groundFriction : s.airDrag);
      }
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