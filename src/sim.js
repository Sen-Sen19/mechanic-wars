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
      this.fx = null; // visual events (fire / hit / fizzle). The renderer sets this to [] and drains it; headless runs leave it null.
      this.koTimer = 0; // >0 while the KO pause is running
      this.tick = 0;
    }

    step(intents) {
      for (let i = 0; i < this.fighters.length; i++) {
        this.fighters[i].step(intents[i] || MW.IDLE_INTENT, this.arena);
      }
      for (const f of this.fighters) {
        if (f.swingFx) { f.swingFx = false; this.emitMelee("swing", f, null); }
      }
      this.spawnProjectiles();
      if (this.koTimer > 0) {
        this.stepProjectiles(false);
        if (--this.koTimer === 0) this.newRound();
      } else {
        this.resolveHits();
        this.stepProjectiles(true);
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
        const box = a.meleeBox();
        for (const t of this.fighters) {
          if (t === a || t.state === S.KO || t.invuln > 0 || a.hitTargets.has(t.id)) continue;
          if (overlap(box, t.rect())) {
            a.hitTargets.add(t.id);
            t.takeHit(a, a.hit);
            this.emitMelee("hit", a, t);
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
  });

  MW.Sim = Sim;
})(globalThis);
