// Mechanic Wars - simulation. No DOM, no rendering: runs identically in the
// browser and headless in Node (used by tools/ for smoke tests and balance runs).
(function (g) {
  const MW = (g.MW = g.MW || {});

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // Seeded random generator (mulberry32): Abyssal Transit destinations are random but repeatable for the balance sim.
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Current height of one Abyssal Spike (0 .. sp.h) at zone tick z.t. Shared with void fx so drawing matches the hitbox.
  // Phases: wait (delay) -> erupt (rise to full height, held eruptTicks) -> shrink to the short hazard height -> dissolve at the end.
  MW.voidSpikeHeight = function (z, sp) {
    const C = z.cfg;
    const t = z.t - sp.delay;
    if (t < 0) return 0;
    const rise = Math.min(1, t / C.rise);
    let h = sp.h * (1 - Math.pow(1 - rise, 3));
    if (t > C.eruptTicks) h = Math.min(h, sp.h + (C.zoneHeight - sp.h) * Math.min(1, (t - C.eruptTicks) / 8));
    const left = z.life - z.t;
    if (left < C.dissolve) h *= Math.max(0, left / C.dissolve);
    return h;
  };

  class Sim {
    constructor(arena, statsList) {
      this.rng = makeRng(MW.CONFIG.rngSeed === undefined ? 7331 : MW.CONFIG.rngSeed);
      this.arena = arena;
      this.fighters = statsList.map((stats, i) => new MW.Fighter(i, stats, arena));
      this.kills = statsList.map(() => 0);
      this.projectiles = [];
      this.fx = null; // visual events (fire / hit / fizzle / swing). The renderer sets this to [] and drains it; headless runs leave it null.
      this.koTimer = 0; // >0 while the KO pause is running
      this.tick = 0;
    }

    step(intents) {
      for (const f of this.fighters) {
        f.foe = this.fighters.find((o) => o !== f) || null; // opponent reference (Phantom Decoy chases it)
        f.rand = this.rng;
      }
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
      this.spawnZones();
      this.stepGunnerBombs();
      for (const f of this.fighters) { // visual one-shots queued by the Void Mage (always drained, so headless runs never grow them)
        for (const ev of f.fxOut) this.emitFx(Object.assign({ type: "void", style: "arcane", ownerId: f.id, x: f.x + f.stats.width / 2, y: f.y + f.stats.height * 0.45 }, ev));
        f.fxOut.length = 0;
      }
      if (this.koTimer > 0) {
        this.stepProjectiles(false);
        if (--this.koTimer === 0) this.newRound();
      } else {
        this.resolveHits();
        this.resolveGunnerUltimates();
        this.stepProjectiles(true);
        this.stepZones();
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
          if (t === a || t.state === S.KO || t.invuln > 0 || t.untargetable || a.hitTargets.has(t.id)) continue;
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
          const hit = f.pendingProjectile, cfg = hit.projectile || {}, count = Math.max(1, cfg.pellets || 1);
          // Perfect Aim commits to the opponent's position at release, not at the start of its charge.
          if (hit.gunnerAim && f.foe && f.foe.state !== MW.STATE.KO) {
            f.facing = f.foe.x + f.foe.stats.width / 2 >= f.x + f.stats.width / 2 ? 1 : -1;
          }
          if (hit.gunnerBarrage) { // a rapid sequence: one bullet every cfg.gap ticks (stepGunnerBurst fires them)
            f.gunnerBurst = { hit: hit, left: cfg.shots, timer: 0, batch: { type: "barrage", remaining: cfg.shots, hits: 0, owner: f } };
            f.pendingProjectile = null;
            continue;
          }
          const batch = count > 1 ? { type: "shotgun", remaining: count, hits: 0, owner: f, maxLaunch: hit.maxLaunch } : null;
          for (let i = 0; i < count; i++) {
            // shotgun: a cone (angle per pellet), so far-away targets are missed by the outer pellets
            const angle = count === 1 ? 0 : (i - (count - 1) / 2) * (cfg.angleStep || 0);
            const h = count === 1 ? hit : Object.assign({}, hit, { projectile: Object.assign({}, cfg, { angle: angle }) });
            const p = new MW.Projectile(f, h);
            if (hit.gunnerAim && f.foe && f.foe.state !== MW.STATE.KO) {
              p.y = f.foe.y + f.foe.stats.height / 2;
              p.py = p.y;
            }
            p.batch = batch;
            this.projectiles.push(p);
            this.emit("fire", p);
          }
        }
        f.pendingProjectile = null;
      }
      for (const f of this.fighters) this.stepGunnerBurst(f);
    }

    // Five-Shot Barrage: fire the next bullet when its timer runs out. Being interrupted stops the burst;
    // bullets that were never fired count as misses for the passive.
    stepGunnerBurst(f) {
      const b = f.gunnerBurst;
      if (!b) return;
      if (f.state !== MW.STATE.ATTACK_ACTIVE || !f.hit || !f.hit.gunnerBarrage) {
        b.batch.remaining -= b.left;
        b.left = 0;
        f.gunnerBurst = null;
        this.finishGunnerBatch(b.batch);
        return;
      }
      if (b.timer > 0) { b.timer--; return; }
      const p = new MW.Projectile(f, b.hit);
      p.batch = b.batch;
      this.projectiles.push(p);
      this.emit("fire", p);
      b.left--;
      b.timer = b.hit.projectile.gap - 1;
      if (b.left <= 0) f.gunnerBurst = null;
    }

    finishGunnerBatch(batch) {
      if (!batch || batch.remaining > 0 || batch.done) return;
      batch.done = true;
      const owner = batch.owner;
      if (batch.type === "barrage") {
        if (batch.hits === 5) owner.gunnerStacks = Math.min(owner.stats.passive.max, owner.gunnerStacks + 1);
        else if (batch.hits === 0) owner.gunnerStacks = Math.max(0, owner.gunnerStacks - owner.stats.passive.barrageMissLoss);
      }
    }

    stepGunnerBombs() {
      for (const f of this.fighters) {
        const b = f.gunnerBomb;
        if (!b) continue;
        b.t++;
        if (!b.detonate && b.t < b.cfg.duration) continue;
        const C = b.cfg;
        if (!b.detonate && !C.explodeOnExpire) { // time ran out: the bomb disarms, nothing happens
          f.gunnerBomb = null;
          f.cooldowns[0] = f.stats.skills[0].cooldown;
          continue;
        }
        for (const target of this.fighters) {
          if (target === f || target.state === MW.STATE.KO || target.untargetable) continue;
          const dx = target.x + target.stats.width / 2 - b.x;
          const dy = target.y + target.stats.height / 2 - b.y;
          if (dx * dx + dy * dy > C.radius * C.radius) continue;
          const dir = dx >= 0 ? 1 : -1;
          target.takeHit(f, { id: "remote_detonation", isSkill: true, damage: C.damage, knockback: C.knockback, launchH: C.launchH, launchV: C.launchV, stun: C.stun }, dir);
          f.onHitLanded({ manaGain: C.manaGain !== undefined ? C.manaGain : 10 });
          this.emitFx({ type: "impact", fx: "explosion", x: target.x + target.stats.width / 2, y: target.y + target.stats.height / 2, radius: C.radius, ownerId: f.id });
        }
        this.emitFx({ type: "impact", fx: "explosion", x: b.x, y: b.y, radius: C.radius, ownerId: f.id });
        f.gunnerBomb = null;
        f.cooldowns[0] = f.stats.skills[0].cooldown;
      }
    }

    resolveGunnerUltimates() {
      for (const f of this.fighters) {
        const h = f.hit;
        if (!h || !h.selfDestruct || f.state !== MW.STATE.ATTACK_ACTIVE || h._resolved) continue;
        h._resolved = true;
        for (const target of this.fighters) {
          if (target === f || target.state === MW.STATE.KO || target.invuln > 0 || target.untargetable) continue;
          const dx = target.x + target.stats.width / 2 - (f.x + f.stats.width / 2);
          const dy = target.y + target.stats.height / 2 - (f.y + f.stats.height / 2);
          if (dx * dx + dy * dy > h.radius * h.radius) continue;
          target.takeHit(f, h, dx >= 0 ? 1 : -1);
          f.onHitLanded(h);
        }
        this.emitFx({ type: "impact", fx: "self_destruct", black: !!h.black, x: f.x + f.stats.width / 2, y: f.y + f.stats.height / 2, radius: h.radius, ownerId: f.id });
      }
    }

    // Move projectiles; when canHit, a projectile that touches a valid target hits it once and is used up.
    // (Invulnerable targets are passed through. Platforms do not stop projectiles.)
    stepProjectiles(canHit) {
      for (const p of this.projectiles) {
        const owner = this.fighters[p.ownerId];
        if (p.hit && p.hit.gunnerAim && owner && owner.foe && owner.foe.state !== MW.STATE.KO) {
          p.y = owner.foe.y + owner.foe.stats.height / 2;
          p.py = p.y; // locked sightline follows the target until the piercing shot connects
        }
        if (canHit && owner) {
          const box = p.box();
          for (const t of this.fighters) {
            if (t.id === p.ownerId || p.hitTargets.has(t.id) || t.state === MW.STATE.KO || t.invuln > 0 || t.untargetable) continue;
            const swept = { x: Math.min(p.px, p.x) - p.size / 2, y: p.y - p.size / 2, w: Math.abs(p.x - p.px) + p.size, h: p.size };
            if (overlap(p.hit && p.hit.piercing ? swept : box, t.rect())) {
              const before = p.batch && t.gunnerBatch === p.batch ? { vx: t.vx, vy: t.vy } : null;
              t.takeHit(owner, p.hit, p.dir);
              if (p.batch && t.state === MW.STATE.HITSTUN) { // every bullet of a barrage / shotgun blast adds its knockback (capped)
                t.gunnerBatch = p.batch;
                if (before) {
                  const cap = p.hit.maxLaunch || 14;
                  t.vx = Math.max(-cap, Math.min(cap, before.vx + t.vx));
                  t.vy = Math.max(-cap, Math.min(cap, before.vy + t.vy));
                }
              }
              if (p.batch && p.batch.type === "barrage") owner.addMana(p.hit);
              else owner.onHitLanded(p.hit);
              if (p.batch) { p.batch.hits++; p.batch.remaining--; this.finishGunnerBatch(p.batch); }
              p.hitTargets.add(t.id);
              this.projectileExtras(owner, t, p);
              if (!p.hit.piercing) p.alive = false;
              this.emit("hit", p);
              break;
            }
          }
        }
        if (p.alive) {
          p.step(this.arena);
          if (!p.alive) {
            this.emit("fizzle", p); // ran out of range / left the arena
            if (p.batch && p.batch.remaining > 0) { p.batch.remaining--; this.finishGunnerBatch(p.batch); }
            else if (owner && owner.stats.id === "hitter" && p.hit && p.hit.gunnerBasic) owner.gunnerStacks = Math.max(0, owner.gunnerStacks - owner.stats.passive.missLoss);
          }
        }
      }
      this.projectiles = this.projectiles.filter((p) => p.alive);
    }

    // Void Mage projectile riders: the Singularity briefly pulls the target toward its centre,
    // the empowered gravity orb starts the lift-and-slam on the victim.
    projectileExtras(owner, t, p) {
      if (t.state === MW.STATE.KO) return;
      const pr = p.hit.projectile;
      if (pr && pr.pull) {
        const tcx = t.x + t.stats.width / 2, ocx = owner.x + owner.stats.width / 2;
        const toward = ocx >= tcx ? 1 : -1;
        const room = Math.max(0, Math.abs(ocx - tcx) - (t.stats.width + owner.stats.width) / 2 - 10);
        owner.zones.push({ kind: "pull", cfg: pr.pull, by: owner, target: t, goalX: tcx + toward * Math.min(pr.pull.distance, room), t: 0, life: pr.pull.ticks });
      }
      if (p.hit.slam) owner.beginGravSlam(t, p.hit.slam);
    }

    // Zone skills (Abyssal Spikes / Abyssal Grasp): the fighter asked for one this tick, build it on the ground under him.
    spawnZones() {
      for (const f of this.fighters) {
        const req = f.pendingZone;
        if (!req) continue;
        f.pendingZone = null;
        const p = this.groundUnder(f);
        if (!p || f.state === MW.STATE.KO) continue;
        const C = req.cfg, cx = f.x + f.stats.width / 2;
        if (req.type === "spikes") {
          const x0 = Math.max(p.x + 4, cx - C.radius), x1 = Math.min(p.x + p.w - 4, cx + C.radius);
          const spikes = [];
          for (let i = 0; i < C.count; i++) {
            const x = x0 + ((x1 - x0) * (i + 0.5)) / C.count;
            spikes.push({
              x: x, w: C.width, h: C.height * (0.78 + 0.22 * Math.abs(Math.sin(i * 12.9898))),
              delay: C.warn + Math.floor((Math.abs(x - cx) / Math.max(1, C.radius)) * C.spread),
              lean: ((i * 37) % 7 - 3) * 0.05,
            });
          }
          f.zones.push({ kind: "spikes", cfg: C, by: f, y: p.y, cx: cx, x0: x0, x1: x1, spikes: spikes, t: 0, life: C.warn + C.spread + C.eruptTicks + C.duration, hit: new Set(), dot: new Map() });
          f.fxPush({ kind: "spikes", x: cx, y: p.y, x0: x0, x1: x1 });
        } else if (req.type === "grasp") {
          f.zones.push({ kind: "grasp", cfg: C, by: f, y: p.y, cx: cx, xMin: p.x, xMax: p.x + p.w, rad: 0, t: 0, life: C.duration, holding: new Set() });
          f.fxPush({ kind: "grasp", x: cx, y: p.y });
        }
      }
    }

    // The platform a zone grows on: the one he stands on, or the nearest one below him.
    groundUnder(f) {
      if (f.grounded && f.standingOn) return f.standingOn;
      const cx = f.x + f.stats.width / 2, feet = f.y + f.stats.height;
      let best = null;
      for (const p of this.arena.platforms) {
        if (cx < p.x || cx > p.x + p.w || p.y < feet - 8) continue;
        if (!best || p.y < best.y) best = p;
      }
      return best;
    }

    // Step every zone owned by every fighter: spike eruption + hazard ticks, grasp slow, singularity pull.
    stepZones() {
      const S = MW.STATE;
      for (const f of this.fighters) {
        if (!f.zones.length) continue;
        const foes = this.fighters.filter((o) => o !== f && o.state !== S.KO && !o.untouchable());
        for (const z of f.zones) {
          z.t++;
          if (z.kind === "spikes") this.stepSpikes(f, z, foes);
          else if (z.kind === "grasp") this.stepGrasp(f, z, foes);
          else if (z.kind === "pull") this.stepPull(z);
        }
        f.zones = f.zones.filter((z) => z.t < z.life);
      }
    }

    stepSpikes(f, z, foes) {
      const C = z.cfg;
      for (const sp of z.spikes) {
        const t = z.t - sp.delay;
        if (t < 0) continue;
        const h = MW.voidSpikeHeight(z, sp);
        if (h < 4) continue;
        const box = { x: sp.x - sp.w * 0.7, y: z.y - h, w: sp.w * 1.4, h: h };
        for (const o of foes) {
          if (!overlap(box, o.rect())) continue;
          if (t <= C.eruptTicks) { // the eruption itself: one hit per enemy
            if (z.hit.has(o.id)) continue;
            z.hit.add(o.id);
            const dir = o.x + o.stats.width / 2 >= z.cx ? 1 : -1;
            o.takeHit(f, { id: "abyssal_spikes", isSkill: true, noMark: true, damage: C.eruptDamage, knockback: C.knockback, launchH: C.launchH, launchV: C.launchV, stun: C.stun, manaGain: C.manaGain }, dir);
            f.onHitLanded({ manaGain: C.manaGain });
            this.emitFx({ type: "void", style: "arcane", kind: "spike_hit", x: o.x + o.stats.width / 2, y: o.y + o.stats.height * 0.8, ownerId: f.id });
          } else if (z.t - (z.dot.get(o.id) === undefined ? -1e9 : z.dot.get(o.id)) >= C.zoneEvery) { // the leftover spikes: a damage tick, no stun
            z.dot.set(o.id, z.t);
            o.dotHit(f, C.zoneDamage, "spikes");
          }
        }
      }
    }

    stepGrasp(f, z, foes) {
      const C = z.cfg;
      z.rad = C.radius * Math.min(1, z.t / C.spread);
      const x0 = Math.max(z.xMin, z.cx - z.rad), x1 = Math.min(z.xMax, z.cx + z.rad);
      z.holding.clear();
      for (const o of foes) {
        const feet = o.y + o.stats.height, ocx = o.x + o.stats.width / 2;
        if (o.x + o.stats.width < x0 || o.x > x1 || feet < z.y - C.zoneHeight || feet > z.y + 14 || ocx < z.xMin - 20 || ocx > z.xMax + 20) continue;
        o.slow = { left: 1, mul: C.slowMul, noJump: C.noJump !== false };
        z.holding.add(o.id);
      }
    }

    stepPull(z) {
      const o = z.target;
      if (!o || o.state === MW.STATE.KO || o.untouchable()) { z.t = z.life; return; }
      const dx = z.goalX - (o.x + o.stats.width / 2);
      if (Math.abs(dx) < 3) return;
      o.ctl = { vx: Math.max(-z.cfg.speed, Math.min(z.cfg.speed, dx * 0.35)), vy: o.grounded ? 0 : o.vy * 0.6, left: 2 };
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
        if (!t || f.state === S.KO || t.state === S.KO || t.invuln > 0 || t.untargetable) continue;
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
      this.fx.push({ type: type, style: st, kind: p.hit && p.hit.projectile ? p.hit.projectile.kind : undefined, x: p.x + lead, y: p.y, dir: p.dir, ownerId: p.ownerId, aim: !!(p.hit && p.hit.gunnerAim) });
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