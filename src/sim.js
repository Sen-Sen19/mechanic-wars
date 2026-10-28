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
      this.koTimer = 0; // >0 while the KO pause is running
      this.tick = 0;
    }

    step(intents) {
      for (let i = 0; i < this.fighters.length; i++) {
        this.fighters[i].step(intents[i] || MW.IDLE_INTENT, this.arena);
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
          }
        }
      }
    }

    // Fighters whose projectile attack just went active fire one projectile.
    spawnProjectiles() {
      for (const f of this.fighters) {
        if (f.pendingProjectile && f.state === MW.STATE.ATTACK_ACTIVE) {
          this.projectiles.push(new MW.Projectile(f, f.pendingProjectile));
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
              break;
            }
          }
        }
        if (p.alive) p.step(this.arena);
      }
      this.projectiles = this.projectiles.filter((p) => p.alive);
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
