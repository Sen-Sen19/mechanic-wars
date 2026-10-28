// Mechanic Wars - fighter brains. A brain is a function (sim, index) -> intent, the same
// intent shape a human produces. Bots read only public fighter state and each character's own
// attack data, so every character works with every bot.
//
// Make one with MW.Bots.create(kind, seed). Same kind + same seed + same sim = same behaviour,
// which the Stage 6 balance sim relies on. Tuning numbers live in config.js (MW.CONFIG.bots).
(function (g) {
  const MW = (g.MW = g.MW || {});

  const KINDS = ["dummy", "aggressive", "spacing"];
  const LABELS = { dummy: "DUMMY", aggressive: "AGGRESSIVE", spacing: "SPACING" };

  // Small seeded random generator (mulberry32). Returns numbers in [0, 1).
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const I = (o) => Object.assign({}, MW.IDLE_INTENT, o);
  const other = (sim, idx) => sim.fighters[idx === 0 ? 1 : 0];
  const lowestPlatform = (arena) => arena.platforms.reduce((a, b) => (b.y > a.y ? b : a));

  // Longest distance one of this character's attacks can reach.
  function reachOf(stats) {
    const a = stats.attack;
    if (a.type === "projectile") return a.projectile.range;
    let r = a.range;
    if (a.chain) for (const c of a.chain) if (c.range && c.range > r) r = c.range;
    return r;
  }

  // How far the bot can be (edge to edge) and still start a swing that connects.
  function startReach(stats, factor = 1) {
    const a = stats.attack;
    return a.type === "projectile" ? a.projectile.range * 0.9 * factor : a.range * factor;
  }

  // Distances between me and the target.
  function geometry(me, t) {
    const mcx = me.x + me.stats.width / 2;
    const tcx = t.x + t.stats.width / 2;
    const dxc = tcx - mcx;
    return {
      mcx,
      tcx,
      dxc,
      dir: dxc >= 0 ? 1 : -1,
      gap: Math.max(0, Math.abs(dxc) - (me.stats.width + t.stats.width) / 2), // edge to edge
      rise: me.y + me.stats.height - (t.y + t.stats.height), // > 0: target's feet are higher than mine
    };
  }

  // Would my attack line up vertically with the target if I fired now?
  function lined(me, t) {
    const s = me.stats;
    const a = s.attack;
    let y0, y1;
    if (a.type === "projectile") {
      const cy = me.y + s.height * 0.4;
      y0 = cy - a.projectile.size / 2;
      y1 = cy + a.projectile.size / 2;
    } else {
      const bh = s.height * MW.CONFIG.combat.meleeBoxHeight;
      y0 = me.y + (s.height - bh) / 2;
      y1 = y0 + bh;
    }
    return y1 > t.y && y0 < t.y + t.stats.height;
  }

  // Do not walk off the open edge of the main stage on purpose.
  function guardEdge(me, arena, move) {
    const main = lowestPlatform(arena);
    if (!me.grounded || me.standingOn !== main) return move;
    const cx = me.x + me.stats.width / 2;
    if (move < 0 && cx < main.x + 24) return 0;
    if (move > 0 && cx > main.x + main.w - 24) return 0;
    return move;
  }

  // Off the stage and falling: steer back to the middle and use the air jump.
  // Returns an intent, or null when the bot is not in trouble.
  function recoverIntent(me, arena, st) {
    if (me.grounded) return null;
    const main = lowestPlatform(arena);
    const cx = me.x + me.stats.width / 2;
    const feet = me.y + me.stats.height;
    const outside = cx < main.x - 10 || cx > main.x + main.w + 10;
    if (!outside) return null;
    const mid = main.x + main.w / 2;
    const move = Math.abs(mid - cx) < 20 ? 0 : mid > cx ? 1 : -1;
    // Steer back right away; save the air jump until the bot is near stage height.
    const jump = feet > main.y - 40 && me.vy > 0 && me.airJumpsLeft > 0 && st.jumpCd === 0;
    if (jump) st.jumpCd = MW.CONFIG.bots.jumpCooldown;
    return I({ left: move < 0, right: move > 0, jumpPressed: jump });
  }

  // Get toward the target, changing platform height when needed.
  // Returns { move: -1|0|1, jump, down }.
  function navigate(me, t, arena, st) {
    const s = me.stats;
    const cfg = MW.CONFIG.bots;
    const d = geometry(me, t);
    // Never chase a target past the edge of the main stage (it may have been launched off).
    const main = lowestPlatform(arena);
    const aimX = clamp(d.tcx, main.x + 30, main.x + main.w - 30);
    if (aimX !== d.tcx) {
      d.tcx = aimX;
      d.dxc = aimX - d.mcx;
      d.dir = d.dxc >= 0 ? 1 : -1;
    }
    const feet = me.y + s.height;
    const tFeet = t.y + t.stats.height;
    const grav = MW.CONFIG.physics.gravity;
    const oneJump = (s.jumpStrength * s.jumpStrength) / (2 * grav);
    const airJump = (s.airJumpStrength * s.airJumpStrength) / (2 * grav);
    const maxRise = oneJump + 0.8 * airJump * s.maxAirJumps;

    let move = d.dir;
    let jump = false;
    let down = false;

    if (d.rise > 50) {
      // Target is higher: pick the reachable platform closest to it and go there.
      let best = null;
      let bestDist = Infinity;
      for (const p of arena.platforms) {
        const up = feet - p.y;
        if (up < 20 || up > maxRise) continue; // not above me, or too high to reach
        if (p.y < tFeet - 30) continue; // higher than the target: overshoot
        const dist = Math.max(0, p.x - d.tcx, d.tcx - (p.x + p.w));
        if (dist < bestDist - 1 || (Math.abs(dist - bestDist) <= 1 && best && p.y < best.y)) {
          best = p;
          bestDist = dist;
        }
      }
      if (best) {
        const wantX = clamp(d.tcx, best.x + 14, best.x + best.w - 14);
        move = Math.abs(wantX - d.mcx) < 12 ? 0 : wantX > d.mcx ? 1 : -1;
        const under = d.mcx > best.x + 10 && d.mcx < best.x + best.w - 10;
        if (st.jumpCd === 0) {
          if (me.grounded && under) jump = true;
          else if (!me.grounded && me.vy > 0 && me.airJumpsLeft > 0 && d.mcx > best.x - 20 && d.mcx < best.x + best.w + 20) jump = true;
        }
      } else if (me.grounded && Math.abs(d.dxc) < 140 && st.jumpCd === 0) {
        jump = true; // target is in the air right above: jump up at it
      }
    } else if (d.rise < -60 && me.grounded && me.standingOn && me.standingOn.oneWay && st.dropCd === 0) {
      down = true; // target is lower: drop through
    }

    move = guardEdge(me, arena, move);
    if (jump) st.jumpCd = cfg.jumpCooldown;
    if (down) st.dropCd = cfg.dropCooldown;
    return { move, jump, down };
  }

  // Slow a bot down on purpose: it lets go of the run key once it is at speedScale x its run speed.
  // (The Stage 6 balance sim should set MW.CONFIG.bots.speedScale = 1 for full-speed bots.)
  function throttle(me, intent) {
    const cap = MW.CONFIG.bots.speedScale * me.stats.runSpeed;
    if (!intent.attackPressed && ((intent.right && me.vx >= cap) || (intent.left && me.vx <= -cap))) {
      intent.left = false;
      intent.right = false;
    }
    return intent;
  }

  // Reaction time: the bot does not see the target right now, it sees where the target was
  // `reactionTicks` ago. Fast runners and jumpers can get away; standing still targets get hit.
  function watch(st, real) {
    st.hist.push({
      x: real.x, y: real.y, vx: real.vx, vy: real.vy,
      state: real.state, stats: real.stats, grounded: real.grounded, standingOn: real.standingOn,
    });
    while (st.hist.length > MW.CONFIG.bots.reactionTicks + 1) st.hist.shift();
    return st.hist[0];
  }

  // Shared start of every brain tick. Returns an intent when the bot should not think any further.
  function prelude(me, t, arena, st) {
    const S = MW.STATE;
    if (st.jumpCd > 0) st.jumpCd--;
    if (st.dropCd > 0) st.dropCd--;
    const rec = recoverIntent(me, arena, st);
    if (rec) return rec;
    if (me.invuln > st.lastInvuln) st.wait = MW.CONFIG.bots.startDelay; // just respawned
    st.lastInvuln = me.invuln;
    if (st.wait > 0) {
      st.wait--;
      return MW.IDLE_INTENT;
    }
    if (me.state === S.HITSTUN || me.state === S.KO || t.state === S.KO) return MW.IDLE_INTENT;
    return null;
  }

  // Rushes the target down and swings whenever it is in reach.
  function aggressiveBrain(st, rng) {
    return function (sim, idx) {
      const me = sim.fighters[idx];
      const real = other(sim, idx);
      const t = watch(st, real);
      const early = prelude(me, real, sim.arena, st);
      if (early) return early;

      const cfg = MW.CONFIG.bots;
      const nav = navigate(me, t, sim.arena, st);
      const d = geometry(me, t);
      const intent = I({ left: nav.move < 0, right: nav.move > 0, jumpPressed: nav.jump, downPressed: nav.down });
      if (d.gap <= startReach(me.stats) && lined(me, t) && rng() < cfg.aggressiveAttackChance) {
        intent.attackPressed = true;
        intent.left = d.dir < 0; // face the target when the swing starts
        intent.right = d.dir > 0;
      }
      return throttle(me, intent);
    };
  }

  // Holds a preferred distance, backs off when an enemy winds up, pokes from just inside its own reach.
  function spacingBrain(st, rng) {
    return function (sim, idx) {
      const me = sim.fighters[idx];
      const real = other(sim, idx);
      const t = watch(st, real);
      const early = prelude(me, real, sim.arena, st);
      if (early) return early;

      const S = MW.STATE;
      const cfg = MW.CONFIG.bots;
      const d = geometry(me, t);
      let move = 0;
      let jump = false;
      let down = false;

      if (!lined(me, t)) {
        // Wrong height: use the shared navigation to change platform.
        const nav = navigate(me, t, sim.arena, st);
        move = nav.move;
        jump = nav.jump;
        down = nav.down;
      } else {
        const ideal = startReach(me.stats, cfg.spacingIdealFactor);
        const enemyReach = reachOf(t.stats);
        // The "hold" zone must stay inside the bot's own reach, or it would stand still and never swing.
        if (d.gap > ideal + 6) move = d.dir;
        else if (d.gap < ideal - 20) move = -d.dir;
        const winding = real.state === S.ATTACK_STARTUP || real.state === S.ATTACK_ACTIVE;
        if (winding && d.gap <= enemyReach + cfg.spacingBackoffMargin && rng() < cfg.spacingReaction) move = -d.dir;

        const guarded = guardEdge(me, sim.arena, move);
        if (move === -d.dir && guarded === 0 && me.grounded && st.jumpCd === 0 && d.gap < enemyReach + cfg.spacingBackoffMargin && rng() < 0.3) {
          jump = true; // cornered at the edge: hop over the enemy
          st.jumpCd = cfg.jumpCooldown;
          move = d.dir;
        } else {
          move = guarded;
        }
      }

      const intent = I({ left: move < 0, right: move > 0, jumpPressed: jump, downPressed: down });
      const free = me.state === S.IDLE || me.state === S.RUN || me.state === S.RISING || me.state === S.FALLING;
      if (free && d.gap <= startReach(me.stats) && lined(me, t) && rng() < cfg.spacingAttackChance) {
        intent.attackPressed = true;
        intent.left = d.dir < 0;
        intent.right = d.dir > 0;
      }
      return throttle(me, intent);
    };
  }

  function create(kind, seed) {
    const rng = mulberry32(seed === undefined ? MW.CONFIG.bots.seed : seed);
    const st = { jumpCd: 0, dropCd: 0, hist: [], wait: MW.CONFIG.bots.startDelay, lastInvuln: 0 };
    if (kind === "aggressive") return aggressiveBrain(st, rng);
    if (kind === "spacing") return spacingBrain(st, rng);
    return () => MW.IDLE_INTENT; // dummy
  }

  MW.Bots = {
    KINDS,
    LABELS,
    create,
    // Stands still and takes hits (Stage 3 training dummy). Kept for the older tests.
    dummy() {
      return MW.IDLE_INTENT;
    },
  };
})(globalThis);