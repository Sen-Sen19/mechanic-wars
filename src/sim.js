// Mechanic Wars - simulation. No DOM, no rendering: runs identically in the
// browser and headless in Node (used by tools/ for smoke tests and balance runs).
(function (g) {
  const MW = (g.MW = g.MW || {});

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  class Sim {
    constructor(arena, statsList) {
      this.arena = arena;
      this.fighters = statsList.map((stats, i) => new MW.Fighter(i, stats, arena));
      this.kills = statsList.map(() => 0);
      this.projectiles = [];
      this.fx = null; // visual events (fire / hit / fizzle / swing). The renderer sets this to [] and drains it; headless runs leave it null.
      this.koTimer = 0; // >0 while the KO pause is running
      this.tick = 0;
    }

    step(intents) {
      for (let i = 0; i < this.fighters.length; i++) {
        this.fighters[i].step(intents[i] || MW.IDLE_INTENT, this.arena);
      }
      // A dashing skill (Fist Rush) stops its dash as soon as the punch can reach an enemy,
      // so it never runs through them.
      for (const f of this.fighters) {
        if (f.state !== MW.STATE.ATTACK_STARTUP || !f.hit || !f.hit.dashSpeed || f.stateTimer <= 1) continue;
        for (const t of this.fighters) {
          if (t !== f && t.state !== MW.STATE.KO && f.hitsRect(t.rect())) { f.stateTimer = 1; f.vx = 0; break; }
        }
      }
      // stopOnContact attacks (Meteor Breaker): stop walking forward once an enemy is in reach.
      for (const f of this.fighters) {
        if (!f.hit || !f.hit.stopOnContact || f.advanceStopped) continue;
        if (f.state !== MW.STATE.ATTACK_STARTUP && f.state !== MW.STATE.ATTACK_ACTIVE) continue;
        for (const t of this.fighters) {
          if (t !== f && t.state !== MW.STATE.KO && f.hitsRect(t.rect())) { f.advanceStopped = true; f.vx = 0; break; }
        }
      }
      for (const f of this.fighters) {
        if (f.swingFx) { f.swingFx = false; this.emitMelee("swing", f, null); }
        if (f.castFx) { // a skill just started: tell the renderer (visual only)
          this.emitFx({ type: "cast", id: f.castFx.id, x: f.x + f.stats.width / 2, y: f.y + f.stats.height * 0.45, fy: f.y + f.stats.height, dir: f.facing, ownerId: f.id });
          f.castFx = null;
        }
      }
      this.spawnProjectiles();
      if (this.koTimer > 0) {
        this.stepProjectiles(false);
        if (--this.koTimer === 0) this.newRound();
      } else {
        this.resolveHits();
        this.stepProjectiles(true);
        this.resolveCounters();
        this.checkKO();
      }
      this.tick++;
    }

    // Melee hit detection. One swing hits each target at most once.
    // (Projectile hits join this in Stage 4.)
    resolveHits() {
      const S = MW.STATE;
      for (const a of this.fighters) {
        if (a.state !== S.ATTACK_ACTIVE || a.hit.type !== "melee") continue;
        for (const t of this.fighters) {
          if (t === a || t.state === S.KO || t.invuln > 0 || a.hitTargets.has(t.id)) continue;
          if (a.hitsRect(t.rect())) {
            a.hitTargets.add(t.id);
            t.takeHit(a, a.hit);
            a.onHitLanded(a.hit);
            this.emitMelee("hit", a, t);
            this.emitStrike(a, t);
            this.emitImpact(a.hit, a, t);
          }
        }
      }
    }

    // Fighters whose projectile attack just went active fire one projectile.
    spawnProjectiles() {
      for (const f of this.fighters) {
        if (f.pendingProjectile && f.state === MW.STATE.ATTACK_ACTIVE) {
          const p = new MW.Projectile(f, f.pendingProjectile);
          this.projectiles.push(p);
          this.emit("fire", p);
        }
        f.pendingProjectile = null;
      }
    }

    // Move projectiles; when canHit, a projectile that touches a valid target hits it once and is used up.
    // (Invulnerable targets are passed through. Platforms do not stop projectiles.)
    stepProjectiles(canHit) {
      for (const p of this.projectiles) {
        const owner = this.fighters[p.ownerId];
        if (canHit && owner) {
          const box = p.box();
          for (const t of this.fighters) {
            if (t.id === p.ownerId || t.state === MW.STATE.KO || t.invuln > 0) continue;
            if (overlap(box, t.rect())) {
              t.takeHit(owner, p.hit, p.dir);
              owner.onHitLanded(p.hit);
              p.alive = false;
              this.emit("hit", p);
              break;
            }
          }
        }
        if (p.alive) {
          p.step(this.arena);
          if (!p.alive) this.emit("fizzle", p); // ran out of range / left the arena
        }
      }
      this.projectiles = this.projectiles.filter((p) => p.alive);
    }

    // Iron Guard: every hit it blocked answers with a counter shockwave on the attacker (if close).
    // Also reports blocked hits to the renderer.
    resolveCounters() {
      const S = MW.STATE;
      for (const f of this.fighters) {
        if (f.blockFx) {
          this.emitFx({ type: "block", x: f.x + f.stats.width / 2, y: f.y + f.stats.height * 0.45, fy: f.y + f.stats.height, dir: f.blockFx.dir, ownerId: f.id });
          f.blockFx = null;
        }
        const t = f.counterTarget;
        f.counterTarget = null;
        if (!t || f.state === S.KO || t.state === S.KO || t.invuln > 0) continue;
        const c = f.hit && f.hit.counter;
        if (!c) continue;
        const hit = Object.assign({ isCounter: true }, c);
        t.takeHit(f, hit, t.x > f.x ? 1 : -1);
        f.addMana({ manaGain: 0 });
        this.emitImpact(hit, f, t);
      }
    }

    // Visual-only event for the renderer (any type). Does nothing unless sim.fx is an array.
    emitFx(ev) {
      if (!this.fx || this.fx.length > 100) return;
      this.fx.push(ev);
    }

    // Big-hit effect for attacks that carry impactFx (Rising Fist, Meteor Breaker, counters).
    emitImpact(hit, a, t) {
      if (!hit || !hit.impactFx) return;
      const info = t.lastHit || {};
      this.emitFx({
        type: "impact", fx: hit.impactFx, x: t.x + t.stats.width / 2, y: t.y + t.stats.height * 0.45, fy: t.y + t.stats.height,
        dir: a.x < t.x ? 1 : -1, ownerId: a.id, targetId: t.id, dmg: info.dmg || 0, empowered: !!hit.empowered,
      });
    }

    // Visual-only "strike" event for characters that ask for it (stats.hitFx = "brawler"):
    // every landed melee hit, with its punch shape, so brawler_fx.js can draw the impact.
    emitStrike(a, t) {
      if (!this.fx || this.fx.length > 100 || a.stats.hitFx !== "brawler" || !a.hit) return;
      const info = t.lastHit || {};
      this.fx.push({
        type: "strike", shape: a.hit.fxShape || "hook", chain: a.chainIndex, empowered: !!a.hit.empowered,
        x: a.facing > 0 ? t.x : t.x + t.stats.width, y: t.y + t.stats.height * 0.4, dir: a.facing,
        ownerId: a.id, targetId: t.id, dmg: info.dmg || 0, blocked: !!info.absorbed, ko: t.hp <= 0,
      });
    }

    // Visual-only event for the renderer. Does nothing unless sim.fx is an array.
    emit(type, p) {
      if (!this.fx || this.fx.length > 100) return;
      const st = p.hit && p.hit.projectile ? p.hit.projectile.style : undefined;
      // the cast circle opens 18px in front of the Mage, so the flash starts there
      const lead = type === "fire" ? p.dir * 18 : 0;
      this.fx.push({ type: type, style: st, x: p.x + lead, y: p.y, dir: p.dir, ownerId: p.ownerId });
    }

    // Visual-only melee event (swing / hit), only for attacks that carry an fxStyle.
    emitMelee(type, a, t) {
      if (!this.fx || this.fx.length > 100 || !a.hit || !a.hit.fxStyle) return;
      const s = a.stats;
      const x = type === "hit" ? (a.facing > 0 ? t.x : t.x + t.stats.width) : a.x + (a.facing > 0 ? s.width : 0);
      const y = type === "hit" ? t.y + t.stats.height * 0.4 : a.y + s.height * 0.42;
      this.fx.push({ type: type, style: a.hit.fxStyle, x: x, y: y, dir: a.facing, ownerId: a.id, targetId: t ? t.id : -1, range: a.hit.range });
    }

    // HP zero is the only KO: the other fighter scores, then a short pause and both reset.
    checkKO() {
      const n = this.fighters.length;
      if (n < 2) return;
      for (let i = 0; i < n; i++) {
        if (this.fighters[i].state === MW.STATE.KO) {
          this.kills[(i + 1) % n]++;
          this.koTimer = MW.CONFIG.combat.koFrames;
          return;
        }
      }
    }

    newRound() {
      for (const f of this.fighters) f.fullReset(this.arena);
      this.projectiles = [];
    }

    // Swap the character in a slot (respawns that fighter at its spawn point, full HP).
    setCharacter(slot, stats) {
      this.fighters[slot] = new MW.Fighter(slot, stats, this.arena);
      this.projectiles = this.projectiles.filter((p) => p.ownerId !== slot);
    }

    // Swap in a new layout and restart the match on it.
    setArena(arena) {
      this.arena = arena;
      this.reset();
    }

    // Manual reset: everything back to the start, counters cleared.
    reset() {
      for (const f of this.fighters) {
        f.respawns = 0;
        f.lastHit = null;
        f.fullReset(this.arena);
      }
      this.kills = this.fighters.map(() => 0);
      this.projectiles = [];
      this.koTimer = 0;
      this.tick = 0;
    }
  }

  // One intent object per fighter per tick. Humans, bots and touch controls all
  // produce this same shape.
  MW.IDLE_INTENT = Object.freeze({
    left: false,
    right: false,
    jumpPressed: false,
    downPressed: false,
    downHeld: false,
    attackPressed: false,
    ultPressed: false, // ultimate button (needs a full mana meter)
    skillPressed: Object.freeze([false, false, false, false]), // skill slots 1-4 (edge-triggered)
  });

  MW.Sim = Sim;
})(globalThis);
