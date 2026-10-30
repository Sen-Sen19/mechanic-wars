// Mechanic Wars - Brawler "impact" effects. VISUAL ONLY: the sim never reads this file.
// Fed by sim events: strike (every Brawler melee hit), cast (skill start), impact / block (existing).
//
// What it adds (all numbers are in the TUNE block):
//   - impact:   star flash + shock ring + comic speed lines + sparks / dust / debris, per punch type
//   - words:    POW! / BAM! / RISING! pop on the heavy skills
//   - combo:    "N HITS" counter above the Brawler with a damage total
//   - hit-stop: the game freezes a few ticks on heavy hits and the victim trembles (feel of weight)
//   - ghosts:   blue afterimages during Fist Rush and the Meteor charge
//   - heat:     gloves glow and shed embers as Combat Momentum builds; "OVERDRIVE" burst at max
(function (g) {
  const MW = (g.MW = g.MW || {});
  const TAU = Math.PI * 2;

  const TUNE = {
    maxParticles: 260,
    // hit-stop in sim ticks (60 = 1 s). Only the Brawler's own hits freeze the game.
    hitStop: { jab: 0, hook: 2, upper: 4, power: 6, rush: 4, rising: 6, meteor: 14, slam: 2, charged: 6, hundred: 0, ko: 14 },
    jitter: 3.2, // px the victim trembles during hit-stop
    comboWindow: 80, // frames after the last landed hit that the counter stays up
    comboMin: 2, // counter appears from this many hits
    ghostLife: 12,
    ghostGap: 2, // frames between afterimages
    ghostMax: 20,
    dashGhostSpeed: 6.5, // px per tick: running faster than this also leaves ghosts
    words: true,
  };

  // two palettes: normal punches are blue/white/gold, empowered ones (full momentum / guard bonus) are hot
  const COOL = { core: "#ffffff", mid: "#7cc4ff", edge: "#2f7bff", gold: "#ffd479", dark: "rgba(8,16,48,0.85)" };
  const HOT = { core: "#fff3d0", mid: "#ff9a3c", edge: "#ff3a2a", gold: "#ffe08a", dark: "rgba(48,8,4,0.85)" };

  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const parts = []; // sparks, dust, chunks, embers
  const stars = []; // impact flashes
  const rings = []; // shock rings
  const rays = []; // comic speed-line bursts
  const beams = []; // vertical streaks (uppercut / rising)
  const words = []; // POW! BAM!
  const ghosts = []; // afterimages
  const cracks = []; // ground cracks left by Fist Rush
  const fistTrail = []; // fist afterimages during Hundred Fists
  const giants = []; // spectral fist of Meteor Fist (rebuilt every frame)
  const combo = {}; // owner id -> { n, dmg, last, pop }
  const pos = {}; // fighter id -> { x, y } (for the combo text)
  const jit = {}; // victim id -> { n, max }
  const momPrev = {}; // fighter id -> last seen momentum
  let frame = 0;
  let hundredN = 0; // punches landed by the barrage (throttles its effects)
  let freeze = 0;
  let koSeen = false;

  function add(p) {
    if (parts.length >= TUNE.maxParticles) parts.shift();
    p.max = p.life;
    p.vx = p.vx || 0; p.vy = p.vy || 0; p.g = p.g || 0; p.drag = p.drag === undefined ? 0.95 : p.drag;
    p.rot = p.rot || 0; p.vr = p.vr || 0;
    parts.push(p);
  }
  const pal = (emp) => (emp ? HOT : COOL);

  function stop(n) { if (n > freeze) freeze = Math.min(n, 16); }

  // ─── building blocks ──────────────────────────────────────────────
  function flash(x, y, R, P, life) {
    stars.push({ x, y, R, rot: rnd(0, TAU), life: life || 9, max: life || 9, P });
    if (stars.length > 16) stars.shift();
  }
  // shock ring, squashed into a vertical ellipse for side hits (sy > 1) or flat on the floor (sy < 1)
  function ring(x, y, r0, r1, sy, life, color, lw, dir, shift) {
    rings.push({ x, y, r0, r1, sy, life, max: life, color, lw, dir: dir || 0, shift: shift || 0 });
    if (rings.length > 30) rings.shift();
  }
  function burstRays(x, y, n, len, P, life, dir, flat) {
    const a = [];
    for (let i = 0; i < n; i++) {
      let ang = (i / n) * TAU + rnd(-0.18, 0.18);
      if (flat) ang = ang * 0.35 + (dir < 0 ? Math.PI : 0) + rnd(-0.5, 0.5); // fan forward along the punch
      a.push({ ang, len: len * rnd(0.55, 1), w: rnd(1.6, 3.6) });
    }
    rays.push({ x, y, a, P, life, max: life });
    if (rays.length > 10) rays.shift();
  }
  function word(text, x, y, size, P, dir) {
    if (!TUNE.words) return;
    words.push({ text, x, y, size, P, rot: -0.12 * (dir || 1), life: 34, max: 34 });
    if (words.length > 6) words.shift();
  }
  function sparks(x, y, dir, n, P, speed, spread) {
    for (let i = 0; i < n; i++) {
      const a = rnd(-spread, spread);
      const sp = rnd(speed * 0.4, speed);
      add({ kind: "spark", x, y, vx: Math.cos(a) * sp * dir, vy: Math.sin(a) * sp - 0.5, life: 10 + (Math.random() * 10 | 0), size: rnd(1.6, 3), g: 0.18, drag: 0.93, col: Math.random() < 0.5 ? P.core : P.mid });
    }
  }
  function dust(x, y, n, dir, spread) {
    for (let i = 0; i < n; i++) {
      add({ kind: "dust", x: x + rnd(-spread, spread), y: y - rnd(0, 4), vx: rnd(-1.6, 1.6) + dir * rnd(0, 1.4), vy: rnd(-1.4, -0.2), life: 18 + (Math.random() * 12 | 0), size: rnd(5, 11), g: -0.01, drag: 0.94 });
    }
  }
  function chunks(x, y, n, P) {
    for (let i = 0; i < n; i++) {
      add({ kind: "chunk", x, y, vx: rnd(-4, 4), vy: rnd(-7, -2), life: 26 + (Math.random() * 14 | 0), size: rnd(2.5, 5), g: 0.32, drag: 0.98, rot: rnd(0, TAU), vr: rnd(-0.4, 0.4), col: Math.random() < 0.5 ? "#6b5a4a" : P.gold });
    }
  }

  // jagged crack in the floor (drawn behind the fighters)
  function crack(x, y, dir) {
    const lines = [];
    const n = 3 + (Math.random() * 2 | 0);
    for (let i = 0; i < n; i++) {
      let px = x, py = y;
      const pts = [[px, py]];
      const ang = rnd(-0.35, 0.35) + (i % 2 ? Math.PI : 0) * 0 + (Math.random() < 0.5 ? 0 : Math.PI);
      const segs = 3 + (Math.random() * 3 | 0);
      for (let j = 0; j < segs; j++) {
        px += Math.cos(ang) * rnd(8, 16) + rnd(-3, 3);
        py += Math.abs(Math.sin(ang)) * rnd(-1, 4) + rnd(-1.5, 1.5);
        pts.push([px, py]);
      }
      lines.push(pts);
    }
    cracks.push({ lines, life: 46, max: 46 });
    if (cracks.length > 14) cracks.shift();
  }

  // ─── events ───────────────────────────────────────────────────────
  function strike(ev) {
    const P = pal(ev.empowered);
    const x = ev.x, y = ev.y, dir = ev.dir;
    const shape = ev.shape;
    const k = clamp((ev.dmg || 6) / 18, 0.55, 1.7); // bigger hit -> bigger effect
    const light = ev.blocked;

    // combo counter (not for blocked punches)
    if (!light) {
      const c = combo[ev.ownerId];
      if (c && frame - c.last <= TUNE.comboWindow) { c.n++; c.dmg += ev.dmg || 0; } else combo[ev.ownerId] = { n: 1, dmg: ev.dmg || 0, last: frame, pop: 0 };
      const cc = combo[ev.ownerId];
      cc.last = frame; cc.pop = 1;
    }

    // victim trembles while the game is frozen
    const hs = ev.ko ? TUNE.hitStop.ko : (TUNE.hitStop[shape] || 0) + (ev.empowered && !light ? 2 : 0);
    if (hs > 0 && !light) { stop(hs); jit[ev.targetId] = { n: hs + 4, max: hs + 4 }; }

    if (light) { // blocked: a few white sparks only (the shield effect is drawn by the guard code)
      sparks(x, y, dir, 6, P, 6, 0.9);
      return;
    }

    if (shape === "jab") {
      flash(x, y, 26 * k, P, 7);
      ring(x, y, 4, 30 * k, 1.4, 9, P.mid, 2.5, dir, 4);
      sparks(x, y, dir, 6, P, 7, 0.8);
    } else if (shape === "hook") {
      flash(x, y, 36 * k, P, 8);
      ring(x, y, 5, 42 * k, 1.5, 11, P.mid, 3, dir, 6);
      burstRays(x, y, 7, 46 * k, P, 8, dir, true);
      sparks(x, y, dir, 10, P, 9, 0.9);
    } else if (shape === "upper") { // combo finisher: vertical streak
      flash(x, y, 50 * k, P, 10);
      ring(x, y, 6, 60 * k, 1.5, 13, P.mid, 3.5, dir, 4);
      ring(x, y + 18, 6, 70, 0.3, 14, P.gold, 3, 0, 0);
      beams.push({ x, y, h: 130 * k, w: 22, P, life: 12, max: 12 });
      for (let i = 0; i < 12; i++) add({ kind: "spark", x: x + rnd(-10, 10), y, vx: rnd(-1.5, 1.5), vy: rnd(-9, -3), life: 16 + (Math.random() * 10 | 0), size: rnd(1.8, 3.2), g: 0.12, drag: 0.95, col: Math.random() < 0.5 ? P.core : P.gold });
      sparks(x, y, dir, 6, P, 7, 1.1);
    } else if (shape === "power") { // Power Strike
      flash(x, y, 46 * k, P, 12);
      ring(x, y, 6, 84 * k, 1.35, 15, P.mid, 5, dir, 8);
      ring(x, y, 4, 56 * k, 1.35, 12, P.core, 3, dir, 4);
      burstRays(x, y, 14, 90 * k, P, 12, dir, false);
      sparks(x, y, dir, 16, P, 12, 1.2);
      chunks(x, y + 10, 8, P);
      // localized ground shockwave (bigger when empowered)
      ring(x, y + 36, 8, 130 * k * (ev.empowered ? 1.4 : 1), 0.22, 18, P.gold, 4, 0, 0);
      dust(x, y + 38, ev.empowered ? 10 : 6, dir, 20);
      word(ev.empowered ? "POW!!" : "POW!", x - dir * 4, y - 36, ev.empowered ? 40 : 32, P, dir);
    } else if (shape === "rush") { // Fist Rush
      flash(x, y, 40 * k, P, 10);
      ring(x, y, 5, 56 * k, 1.5, 12, P.mid, 4, dir, 6);
      burstRays(x - dir * 10, y, 10, 100 * k, P, 11, dir, true);
      sparks(x, y, dir, 14, P, 13, 0.7);
      dust(x - dir * 24, y + 40, 5, -dir, 14);
      word(ev.empowered ? "BAM!!" : "BAM!", x - dir * 2, y - 34, ev.empowered ? 36 : 28, P, dir);
    } else if (shape === "rising") { // Rising Fist (the big flame pillar is drawn by render.js)
      flash(x, y, 44 * k, P, 12);
      beams.push({ x, y, h: 190, w: 30, P, life: 16, max: 16 });
      burstRays(x, y, 12, 80 * k, P, 11, dir, false);
      sparks(x, y, dir, 12, P, 9, 1.3);
      word(ev.empowered ? "RISING!!" : "RISING!", x, y - 52, ev.empowered ? 36 : 28, P, dir);
    } else if (shape.indexOf("bz_") === 0) { // one punch of the barrage: small and cheap, ~10 per second
      hundredN++;
      const yy = y + rnd(-6, 6);
      if (shape === "bz_upper") { // rising punch: little vertical streak
        flash(x, y, 26 * k + 12, P, 7);
        beams.push({ x, y, h: 70, w: 14, P, life: 8, max: 8 });
        sparks(x, y, dir * 0.4, 5, P, 8, 1.6);
      } else if (shape === "bz_hook") { // wide swing: fan of lines along the arc
        flash(x, yy, 24 * k + 12, P, 7);
        burstRays(x, yy, 6, 54, P, 7, dir, true);
        sparks(x, y, dir, 5, P, 9, 1);
      } else if (shape === "bz_body") { // low punch: dust kicks up
        flash(x, y + 6, 22 * k + 12, P, 6);
        dust(x, y + 30, 2, dir, 10);
        sparks(x, y + 6, dir, 4, P, 7, 0.9);
      } else { // jab / cross
        flash(x + rnd(-6, 6), yy, 20 * k + 12, P, 6);
        sparks(x, y, dir, 4, P, 8, 1.1);
      }
      if (hundredN % 4 === 0) ring(x, y, 4, 38, 1.4, 8, P.mid, 2.5, dir, 4);
      if (hundredN % 12 === 0) word("WHAM!", x, y - 40, 24, P, dir);
    } else if (shape === "charged") { // charged punch
      flash(x, y, 44 * k, P, 11);
      ring(x, y, 6, 78 * k, 1.35, 14, P.mid, 5, dir, 8);
      burstRays(x, y, 12, 80 * k, P, 11, dir, false);
      sparks(x, y, dir, 14, P, 12, 1.2);
      chunks(x, y + 10, 6, P);
      word("CRUSH!", x - dir * 4, y - 36, 30, P, dir);
    } else if (shape === "meteor") {
      flash(x, y, 80, P, 16);
      burstRays(x, y, 18, 140, P, 14, dir, false);
      sparks(x, y, dir, 22, P, 14, 1.4);
      ring(x, y + 30, 10, 260, 0.22, 26, P.gold, 6, 0, 0); // huge ground shockwave
      ring(x, y, 10, 200, 1, 20, P.mid, 5, dir, 20);
      chunks(x, y + 10, 14, P);
      word("METEOR FIST!", x, y - 70, 40, HOT, dir);
    } else { // anything else (slam etc.): a small generic impact
      flash(x, y, 26 * k, P, 8);
      sparks(x, y, dir, 8, P, 8, 1);
    }

    // knock-out blow: extra everything
    if (ev.ko) {
      flash(x, y, 120, P, 20);
      ring(x, y, 8, 170, 1.2, 22, P.core, 6, dir, 0);
      burstRays(x, y, 22, 170, P, 18, dir, false);
      sparks(x, y, dir, 24, P, 15, TAU / 2);
    }
  }

  function cast(ev) {
    const P = COOL;
    if (ev.id === "power_strike") {
      dust(ev.x + ev.dir * 12, ev.fy, 6, ev.dir, 16);
      ring(ev.x, ev.fy - 2, 6, 54, 0.25, 14, "#e8dcc0", 3, 0, 0);
    } else if (ev.id === "fist_rush") {
      dust(ev.x - ev.dir * 16, ev.fy, 8, -ev.dir, 12);
      burstRays(ev.x, ev.y, 8, 70, P, 9, -ev.dir, true);
    } else if (ev.id === "rising_fist") {
      dust(ev.x, ev.fy, 6, 0, 18);
    } else if (ev.id === "hundred_fists") {
      dust(ev.x, ev.fy, 8, 0, 20);
      ring(ev.x, ev.fy - 2, 6, 60, 0.25, 14, "#e8dcc0", 3, 0, 0);
    } else if (ev.id === "meteor_fist") {
      ring(ev.x, ev.fy - 2, 8, 110, 0.25, 22, HOT.gold, 4, 0, 0);
      dust(ev.x, ev.fy, 10, 0, 24);
    }
  }

  function impact(ev) { // existing impact events (counter shockwave) get a word
    if (ev.fx === "counter") word(ev.empowered ? "SMASH!" : "COUNTER!", ev.x, ev.y - 50, 28, ev.empowered ? HOT : COOL, ev.dir);
  }

  function event(ev) {
    if (!ev) return;
    if (ev.type === "strike") strike(ev);
    else if (ev.type === "cast") cast(ev);
    else if (ev.type === "impact") impact(ev);
  }

  // ─── per frame ────────────────────────────────────────────────────
  function fistPoints(f) {
    const A = f._art;
    const out = [];
    if (A && A.fist) out.push(A.fist);
    if (A && A.fistB) out.push(A.fistB);
    return out;
  }

  function update(sim) {
    frame++;
    giants.length = 0;
    if (sim.koTimer > 0) koSeen = true;
    else if (koSeen) { koSeen = false; for (const k in combo) delete combo[k]; } // new round: counters off
    for (const f of sim.fighters) {
      pos[f.id] = { x: f.x + f.stats.width / 2, y: f.y };
      if (f.state === MW.STATE.KO) { delete combo[f.id]; }
      if (f.stats.id !== "fighter") continue;
      const P = f.stats.passive;
      const max = (P && P.max) || 5;
      f._heat = (f._heat || 0) + ((f.momentum || 0) / max - (f._heat || 0)) * 0.18;

      // momentum pips: a little pop on every gain, a burst when it fills
      const prev = momPrev[f.id] === undefined ? f.momentum : momPrev[f.id];
      if (f.momentum > prev) {
        const full = f.momentum >= max && prev < max;
        for (const p of fistPoints(f)) {
          ring(p[0], p[1], 3, full ? 40 : 20, 1, full ? 14 : 9, full ? HOT.gold : COOL.mid, full ? 4 : 2.5, 0, 0);
          sparks(p[0], p[1], f.facing, full ? 8 : 3, full ? HOT : COOL, 4, TAU / 2);
        }
        if (full) {
          const cx = f.x + f.stats.width / 2;
          ring(cx, f.y + f.stats.height - 2, 10, 90, 0.25, 22, HOT.mid, 4, 0, 0);
          ring(cx, f.y + f.stats.height * 0.5, 8, 80, 1, 14, HOT.gold, 3, 0, 0);
          word("OVERDRIVE", cx, f.y - 76, 22, HOT, 1);
          for (let i = 0; i < 14; i++) add({ kind: "ember", x: cx + rnd(-16, 16), y: f.y + f.stats.height * rnd(0.3, 1), vx: rnd(-1, 1), vy: rnd(-4, -1.5), life: 24 + (Math.random() * 14 | 0), size: rnd(2, 4), g: -0.03, drag: 0.97, col: Math.random() < 0.5 ? HOT.mid : HOT.gold });
        }
      }
      momPrev[f.id] = f.momentum;

      // afterimages: Fist Rush dash, Meteor charge, or just moving very fast
      const S = MW.STATE;
      const dashing = f.state === S.ATTACK_STARTUP && f.hit && f.hit.dashSpeed;
      const meteor = f.hit && f.hit.stopOnContact && !f.advanceStopped && (f.state === S.ATTACK_STARTUP || f.state === S.ATTACK_ACTIVE);
      const fast = Math.abs(f.x - f.px) > TUNE.dashGhostSpeed;
      if ((dashing || meteor || fast) && frame % TUNE.ghostGap === 0) {
        ghosts.push({ x: f.x, y: f.y, w: f.stats.width, h: f.stats.height, d: f.facing < 0 ? -1 : 1, life: TUNE.ghostLife, hot: !!(f.hit && f.hit.empowered) || meteor || f.momentumFull(), fist: f._art && f._art.fist ? [f._art.fist[0], f._art.fist[1]] : null });
        if (ghosts.length > TUNE.ghostMax) ghosts.shift();
      }

      // Fist Rush: dust and cracks in the floor behind the dash
      if (dashing && frame % 2 === 0) {
        const fy = f.y + f.stats.height, bx = f.x + f.stats.width / 2 - f.facing * 14;
        dust(bx, fy, 3, -f.facing, 10);
        crack(bx, fy, f.facing);
      }

      // Hundred Fists: fist afterimages + a bit of dust
      if (f.hit && f.hit.id === "hundred_fists" && f.state === S.ATTACK_ACTIVE) {
        if (frame % 2 === 0) for (const p of fistPoints(f)) fistTrail.push({ x: p[0], y: p[1], life: 7, max: 7, hot: !!f.hit.empowered });
        if (fistTrail.length > 60) fistTrail.splice(0, fistTrail.length - 60);
        if (frame % 6 === 0) dust(f.x + f.stats.width / 2 + f.facing * 20, f.y + f.stats.height, 2, f.facing, 12);
      }

      // charge-up: Charged Punch (while the button is held) and the Meteor Fist wind-up
      const chargeHold = !!(f.hit && f.hit.chargeHold && f.state === S.ATTACK_STARTUP && !f.chargeReleased);
      const meteorCharge = !!(f.hit && f.hit.id === "meteor_fist" && f.state === S.ATTACK_STARTUP);
      if (chargeHold || meteorCharge) {
        const prog = chargeHold ? f.chargeTicks / f.hit.chargeTime : 1 - f.stateTimer / Math.max(1, f.hit.startup);
        const pts = fistPoints(f);
        if (pts.length && frame % 2 === 0) { // energy sucked into the gauntlet
          const p = pts[0], a = rnd(0, TAU), r = rnd(28, 62) * (meteorCharge ? 1.5 : 1) * (1.15 - 0.5 * prog);
          add({ kind: "spark", x: p[0] + Math.cos(a) * r, y: p[1] + Math.sin(a) * r, vx: -Math.cos(a) * r * 0.14, vy: -Math.sin(a) * r * 0.14, life: 8, size: rnd(1.6, 2.8), g: 0, drag: 1, col: prog >= 1 || meteorCharge ? HOT.gold : COOL.mid });
        }
        if (meteorCharge && frame % 10 === 0 && pts.length) ring(pts[0][0], pts[0][1], 40 + 30 * prog, 6, 1, 10, HOT.mid, 3, 0, 0);
        if (chargeHold && f.chargeTicks >= f.hit.chargeTime) {
          if (!f._chargeReady) { // ready: pop once, then keep glowing
            f._chargeReady = true;
            if (pts.length) { ring(pts[0][0], pts[0][1], 4, 54, 1, 14, HOT.gold, 4, 0, 0); flash(pts[0][0], pts[0][1], 40, HOT, 10); }
          }
          if (pts.length && frame % 3 === 0) add({ kind: "ember", x: pts[0][0] + rnd(-6, 6), y: pts[0][1] + rnd(-6, 6), vx: rnd(-0.5, 0.5), vy: rnd(-2.4, -0.8), life: 14, size: rnd(2, 3.4), g: -0.02, drag: 0.97, col: HOT.gold });
        }
      }
      if (!chargeHold) f._chargeReady = false;

      // Meteor Fist: the enormous spectral fist, drawn in draw()
      if (f.hit && f.hit.id === "meteor_fist" && f.state === S.ATTACK_ACTIVE) {
        giants.push({ x: f.facing > 0 ? f.x + f.stats.width : f.x, y: f.y + f.stats.height * 0.4, d: f.facing < 0 ? -1 : 1, prog: 1 - f.stateTimer / Math.max(1, f.hit.active) });
      }
    }
  }

  function tick() {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx; p.y += p.vy; p.vx *= p.drag; p.vy *= p.drag; p.vy += p.g; p.rot += p.vr;
      if (--p.life <= 0) parts.splice(i, 1);
    }
    for (const arr of [stars, rings, rays, beams, words, ghosts, cracks, fistTrail]) {
      for (let i = arr.length - 1; i >= 0; i--) if (--arr[i].life <= 0) arr.splice(i, 1);
    }
    for (const id in jit) if (--jit[id].n <= 0) delete jit[id];
    for (const id in combo) {
      const c = combo[id];
      c.pop *= 0.82;
      if (frame - c.last > TUNE.comboWindow) delete combo[id];
    }
  }

  // The game loop calls this once per tick: true = skip the sim step this tick (hit-stop).
  function freezeStep() {
    if (freeze > 0) { freeze--; return true; }
    return false;
  }
  function jitter(f) {
    const j = jit[f.id];
    if (!j || j.n <= 0) return null;
    const m = TUNE.jitter * (j.n / j.max);
    return [rnd(-m, m), rnd(-m * 0.5, m * 0.5)];
  }

  // ─── drawing ──────────────────────────────────────────────────────
  function starPath(ctx, x, y, R, rot, points) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const a = rot + (i * Math.PI) / points;
      const r = i % 2 ? R * 0.42 : R;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  // blue afterimages behind the fighters: a simple boxer silhouette with a leading glove
  function drawBehind(ctx) {
    if (!ghosts.length && !cracks.length) return;
    ctx.save();
    for (const c of cracks) { // cracks in the floor (Fist Rush)
      const a = clamp(c.life / (c.max * 0.6), 0, 1);
      for (const pass of [[5, "rgba(20,12,6," + (0.45 * a).toFixed(3) + ")"], [2, "rgba(255,226,170," + (0.55 * a).toFixed(3) + ")"]]) {
        ctx.lineWidth = pass[0]; ctx.strokeStyle = pass[1]; ctx.globalAlpha = 1;
        for (const pts of c.lines) {
          ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
          ctx.stroke();
        }
      }
    }
    for (const gh of ghosts) {
      const a = clamp(gh.life / TUNE.ghostLife, 0, 1);
      const P = gh.hot ? HOT : COOL;
      ctx.globalAlpha = a * 0.42;
      ctx.fillStyle = P.edge;
      const cx = gh.x + gh.w / 2, top = gh.y, H = gh.h, W = gh.w;
      ctx.beginPath(); ctx.arc(cx + gh.d * 4, top + H * 0.16, H * 0.1, 0, TAU); ctx.fill(); // head
      ctx.beginPath(); // leaning torso
      ctx.moveTo(cx - W * 0.4 - gh.d * 5, top + H * 0.26);
      ctx.lineTo(cx + W * 0.4 - gh.d * 5, top + H * 0.26);
      ctx.lineTo(cx + W * 0.3 + gh.d * 4, top + H * 0.6);
      ctx.lineTo(cx - W * 0.3 + gh.d * 4, top + H * 0.6);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(cx - W * 0.28 + gh.d * 4, top + H * 0.58, W * 0.56, H * 0.42); // legs
      ctx.fillStyle = P.mid; // lead glove
      const gx = gh.fist ? gh.fist[0] : cx + gh.d * W * 0.7, gy = gh.fist ? gh.fist[1] : top + H * 0.38;
      ctx.beginPath(); ctx.arc(gx, gy, H * 0.1, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // Behind the body: a flame aura that replaces the old static glow. Tongues lean against the run
  // direction, flicker out of phase, and flare while he is attacking. Strength follows momentum.
  function drawAura(ctx, f) {
    const heat = f._heat || 0;
    if (heat < 0.12 || f.state === MW.STATE.KO) return;
    const S = MW.STATE, s = f.stats;
    const cx = f.x + s.width / 2;
    const sp = clamp(f.x - f.px, -8, 8);
    const full = f.momentumFull && f.momentumFull();
    const atk = f.state === S.ATTACK_STARTUP || f.state === S.ATTACK_ACTIVE;
    const flare = (atk ? 1.35 : 1) * (full ? 1 : 0.65 + 0.35 * heat);
    const t = frame;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const gx = cx - sp * 2.2, gy = f.y + s.height * 0.58;
    const gr0 = s.height * (0.34 + 0.2 * heat) * (0.94 + 0.06 * Math.sin(t * 0.4)) * (atk ? 1.2 : 1);
    const gl = ctx.createRadialGradient(gx, gy, 2, gx, gy, gr0);
    gl.addColorStop(0, "rgba(255,200,110," + (0.3 * heat).toFixed(3) + ")");
    gl.addColorStop(1, "rgba(255,90,20,0)");
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(gx, gy, gr0, 0, TAU); ctx.fill();
    const n = 3 + Math.round(4 * heat);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n - 0.5;
      const bx = cx + u * s.width * 1.15 - sp * 1.5, by = f.y + s.height * 0.8 - Math.abs(u) * 12;
      const h = s.height * (0.32 + 0.24 * heat) * flare * (0.7 + 0.3 * Math.sin(t * 0.31 + i * 1.9) + 0.15 * Math.sin(t * 0.77 + i * 3.1));
      const lean = -sp * 2.6 + Math.sin(t * 0.22 + i * 1.3) * 5 + u * 16;
      const w = 8 + 6 * heat;
      const tg = ctx.createLinearGradient(bx, by, bx + lean, by - h);
      tg.addColorStop(0, "rgba(255,140,40," + (0.5 * heat).toFixed(3) + ")");
      tg.addColorStop(0.6, "rgba(255,200,90," + (0.28 * heat).toFixed(3) + ")");
      tg.addColorStop(1, "rgba(255,240,180,0)");
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.moveTo(bx - w, by);
      ctx.quadraticCurveTo(bx - w * 0.5 + lean * 0.4, by - h * 0.55, bx + lean, by - h);
      ctx.quadraticCurveTo(bx + w * 0.5 + lean * 0.4, by - h * 0.55, bx + w, by);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    if (Math.abs(sp) > 2 && Math.random() < 0.5 * heat) { // trail of embers behind a running Brawler
      add({ kind: "ember", x: cx - Math.sign(sp) * s.width * 0.5, y: f.y + s.height * rnd(0.3, 0.9), vx: -sp * 0.15, vy: rnd(-1.4, -0.3), life: 16 + (Math.random() * 10 | 0), size: rnd(1.6, 3), g: -0.02, drag: 0.97, col: Math.random() < 0.5 ? HOT.mid : HOT.gold });
    }
  }

  // Inside the fighter's transform, after the body: glowing gloves and the overdrive ring.
  function drawFighter(ctx, f) {
    const heat = f._heat || 0;
    if (f.state === MW.STATE.KO) return;
    const full = f.momentumFull && f.momentumFull();
    const pulse = 0.7 + 0.3 * Math.sin(frame * 0.35);
    if (heat > 0.25) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const p of fistPoints(f)) {
        const r = 11 + 14 * heat + (full ? 4 * pulse : 0);
        const gr = ctx.createRadialGradient(p[0], p[1], 1, p[0], p[1], r);
        gr.addColorStop(0, "rgba(255,225,160," + (0.38 * heat).toFixed(3) + ")");
        gr.addColorStop(0.55, "rgba(255,140,50," + (0.3 * heat).toFixed(3) + ")");
        gr.addColorStop(1, "rgba(255,80,20,0)");
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU); ctx.fill();
      }
      ctx.restore();
      if (Math.random() < 0.15 + 0.55 * heat) {
        const pts = fistPoints(f);
        if (pts.length) {
          const p = pts[Math.random() * pts.length | 0];
          add({ kind: "ember", x: p[0] + rnd(-4, 4), y: p[1] + rnd(-4, 4), vx: rnd(-0.4, 0.4), vy: rnd(-2, -0.6), life: 14 + (Math.random() * 10 | 0), size: rnd(1.6, 3), g: -0.02, drag: 0.97, col: Math.random() < 0.5 ? HOT.mid : HOT.gold });
        }
      }
    }
    if (full) { // overdrive: pulsing gold ring on the floor
      const cx = f.x + f.stats.width / 2, fy = f.y + f.stats.height;
      ctx.save();
      ctx.globalAlpha = 0.5 * pulse;
      ctx.strokeStyle = HOT.gold; ctx.lineWidth = 3; ctx.shadowColor = HOT.mid; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.ellipse(cx, fy - 1, 30 + 6 * pulse, 7 + 1.5 * pulse, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }

  function drawComboText(ctx) {
    for (const id in combo) {
      const c = combo[id];
      const p = pos[id];
      if (!p || c.n < TUNE.comboMin) continue;
      const age = frame - c.last;
      const fade = clamp((TUNE.comboWindow - age) / 20, 0, 1);
      const tier = c.n >= 6 ? HOT : c.n >= 4 ? { core: "#fff3d0", mid: HOT.gold, dark: COOL.dark } : COOL;
      const sc = 1 + 0.45 * c.pop;
      const x = p.x, y = Math.max(50, p.y - 110);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(x, y);
      ctx.rotate(-0.06);
      ctx.scale(sc, sc);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "italic 900 " + (24 + Math.min(10, c.n * 1.5)) + "px Impact, 'Arial Black', monospace";
      ctx.lineJoin = "round";
      ctx.lineWidth = 6; ctx.strokeStyle = tier.dark;
      const label = c.n + (c.n === 1 ? " HIT" : " HITS");
      ctx.strokeText(label, 0, 0);
      ctx.fillStyle = tier.core; ctx.shadowColor = tier.mid; ctx.shadowBlur = 10;
      ctx.fillText(label, 0, 0);
      ctx.shadowBlur = 0;
      ctx.font = "bold 13px monospace";
      ctx.lineWidth = 4; ctx.strokeStyle = tier.dark;
      const sub = Math.round(c.dmg) + " DMG";
      ctx.strokeText(sub, 0, 20);
      ctx.fillStyle = tier.mid; ctx.fillText(sub, 0, 20);
      ctx.restore();
    }
  }

  function draw(ctx) {
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";

    // beams (uppercut / rising streaks)
    for (const b of beams) {
      const k = 1 - b.life / b.max;
      const h = b.h * clamp(k * 3.5, 0, 1), w = b.w * (1 - 0.6 * k);
      ctx.globalAlpha = clamp(b.life / (b.max * 0.7), 0, 1);
      for (const [ww, col] of [[w, b.P.mid], [w * 0.45, b.P.core]]) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(b.x - ww / 2, b.y + 14);
        ctx.quadraticCurveTo(b.x - ww * 0.3, b.y - h * 0.5, b.x, b.y - h);
        ctx.quadraticCurveTo(b.x + ww * 0.3, b.y - h * 0.5, b.x + ww / 2, b.y + 14);
        ctx.closePath(); ctx.fill();
      }
    }

    // shock rings
    for (const r of rings) {
      const k = 1 - r.life / r.max;
      const e = 1 - (1 - k) * (1 - k);
      const rad = r.r0 + (r.r1 - r.r0) * e;
      ctx.globalAlpha = clamp(r.life / (r.max * 0.65), 0, 1);
      ctx.strokeStyle = r.color; ctx.lineWidth = Math.max(1, r.lw * (1 - k * 0.6));
      ctx.shadowColor = r.color; ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.ellipse(r.x + r.dir * r.shift * e, r.y, Math.max(1, rad * (r.sy > 1 ? 0.55 : 1)), Math.max(1, rad * (r.sy > 1 ? r.sy * 0.8 : r.sy)), 0, 0, TAU);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // comic speed lines
    for (const R of rays) {
      const k = 1 - R.life / R.max;
      const grow = clamp(k * 4, 0, 1);
      ctx.globalAlpha = clamp(R.life / (R.max * 0.6), 0, 1);
      for (const a of R.a) {
        const r0 = a.len * 0.28 * (0.6 + k), r1 = a.len * (0.45 + 0.55 * grow);
        const x0 = R.x + Math.cos(a.ang) * r0, y0 = R.y + Math.sin(a.ang) * r0;
        const x1 = R.x + Math.cos(a.ang) * r1, y1 = R.y + Math.sin(a.ang) * r1;
        ctx.strokeStyle = R.P.dark; ctx.lineWidth = a.w + 3;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.strokeStyle = R.P.core; ctx.lineWidth = a.w;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
    }

    // impact stars: outlined comic flash, colour ring behind, white core in front
    for (const s of stars) {
      const k = 1 - s.life / s.max;
      const grow = clamp(k * 5, 0, 1);
      const R = s.R * (0.45 + 0.55 * grow) * (1 - 0.25 * k);
      ctx.globalAlpha = clamp(s.life / (s.max * 0.55), 0, 1);
      starPath(ctx, s.x, s.y, R * 1.25, s.rot, 8); ctx.fillStyle = s.P.edge; ctx.fill();
      starPath(ctx, s.x, s.y, R, s.rot + 0.2, 8); ctx.lineWidth = 3; ctx.strokeStyle = s.P.dark; ctx.stroke();
      ctx.fillStyle = s.P.mid; ctx.fill();
      starPath(ctx, s.x, s.y, R * 0.6, s.rot + 0.4, 8); ctx.fillStyle = s.P.core; ctx.fill();
    }
    ctx.shadowBlur = 0;

    // particles
    for (const p of parts) {
      const a = clamp(p.life / p.max, 0, 1);
      if (p.kind === "spark") {
        ctx.globalAlpha = a;
        ctx.strokeStyle = p.col; ctx.lineWidth = p.size + 1;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 2, p.y - p.vy * 2); ctx.stroke();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(0.8, p.size - 1);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 1.2, p.y - p.vy * 1.2); ctx.stroke();
      } else if (p.kind === "dust") {
        ctx.globalAlpha = a * 0.5;
        ctx.fillStyle = "#d8cfbd";
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.5 - a * 0.6), 0, TAU); ctx.fill();
      } else if (p.kind === "chunk") {
        ctx.globalAlpha = Math.min(1, a * 1.5);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.col; ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2);
        ctx.restore();
      } else if (p.kind === "ember") {
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * a), 0, TAU); ctx.fill();
      }
    }

    // Hundred Fists afterimages
    for (const t of fistTrail) {
      const a = clamp(t.life / t.max, 0, 1);
      ctx.globalAlpha = a * 0.55; ctx.fillStyle = t.hot ? HOT.mid : COOL.mid;
      ctx.beginPath(); ctx.arc(t.x, t.y, 11 * (0.6 + 0.4 * a), 0, TAU); ctx.fill();
      ctx.globalAlpha = a * 0.5; ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(t.x, t.y, 5, 0, TAU); ctx.fill();
    }

    // Meteor Fist: enormous spectral gauntlet punching forward from his own fist
   
    // Meteor Fist: COLOSSAL SPECTRAL ARM
    for (const G of giants) {
      const k = clamp(G.prog, 0, 1);
      const e = 1 - (1 - k) * (1 - k);

      const len = 1800 + 1200 * e;
      const hh = 900 + 600 * e;
      const armH = hh * 0.72;

      ctx.save();
      ctx.translate(G.x, G.y);
      ctx.scale(G.d, 1);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.95 - 0.2 * k;

      // Long, massive forearm
      const armGrad = ctx.createLinearGradient(0, 0, len, 0);
      armGrad.addColorStop(0, "rgba(255,90,20,0)");
      armGrad.addColorStop(0.2, "rgba(255,100,30,0.65)");
      armGrad.addColorStop(0.75, "rgba(255,150,50,0.9)");
      armGrad.addColorStop(1, "rgba(255,230,180,0.95)");

      ctx.fillStyle = armGrad;
      ctx.beginPath();
      ctx.moveTo(0, -armH * 0.28);
      ctx.lineTo(len * 0.72, -armH * 0.35);
      ctx.lineTo(len * 0.86, -hh * 0.34);
      ctx.lineTo(len, -hh * 0.25);
      ctx.lineTo(len * 1.08, 0);
      ctx.lineTo(len, hh * 0.25);
      ctx.lineTo(len * 0.86, hh * 0.34);
      ctx.lineTo(len * 0.72, armH * 0.35);
      ctx.lineTo(0, armH * 0.28);
      ctx.closePath();
      ctx.fill();

      // Huge fist silhouette
      const fx = len * 0.88;
      const fy = 0;
      const fistW = len * 0.34;
      const fistH = hh * 0.85;

      const fistGrad = ctx.createRadialGradient(
        fx, fy, 10,
        fx, fy, fistW
      );
      fistGrad.addColorStop(0, "#ffffff");
      fistGrad.addColorStop(0.3, "#fff0c0");
      fistGrad.addColorStop(0.65, "#ff9b42");
      fistGrad.addColorStop(1, "#ff3825");

      ctx.fillStyle = fistGrad;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 18;
      ctx.shadowColor = "#ff8a32";
      ctx.shadowBlur = 65;

      ctx.beginPath();
      ctx.ellipse(fx, fy, fistW, fistH * 0.5, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();

      // Four enormous knuckles
      ctx.shadowBlur = 35;
      for (let i = 0; i < 4; i++) {
        const ny = (i - 1.5) * fistH * 0.2;
        ctx.fillStyle = "#fff4d8";
        ctx.beginPath();
        ctx.ellipse(
          len * 1.05,
          ny,
          fistW * 0.28,
          fistH * 0.115,
          0,
          0,
          TAU
        );
        ctx.fill();
      }

      // Bright energy outline
      ctx.shadowBlur = 80;
      ctx.strokeStyle = "rgba(255,240,200,0.8)";
      ctx.lineWidth = 28;
      ctx.beginPath();
      ctx.ellipse(fx, fy, fistW * 1.08, fistH * 0.56, 0, -1.2, 1.2);
      ctx.stroke();

      ctx.restore();
    }


    // words
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    for (const w of words) {
      const k = 1 - w.life / w.max;
      const pop = k < 0.2 ? 1.7 - (k / 0.2) * 0.7 : 1;
      ctx.save();
      ctx.globalAlpha = clamp(w.life / 14, 0, 1);
      ctx.translate(w.x, w.y - k * 22);
      ctx.rotate(w.rot);
      ctx.scale(pop, pop);
      ctx.font = "italic 900 " + w.size + "px Impact, 'Arial Black', monospace";
      ctx.lineWidth = 7; ctx.strokeStyle = w.P.dark;
      ctx.strokeText(w.text, 0, 0);
      ctx.fillStyle = w.P.core; ctx.shadowColor = w.P.mid; ctx.shadowBlur = 12;
      ctx.fillText(w.text, 0, 0);
      ctx.restore();
    }

    ctx.restore();
    drawComboText(ctx);
  }

  MW.BrawlerFx = { TUNE, event, update, tick, drawBehind, drawAura, drawFighter, draw, freezeStep, jitter, _parts: parts, _stars: stars, _rings: rings, _combo: combo, _ghosts: ghosts, _words: words, get _freeze() { return freeze; }, reset() { freeze = 0; for (const k in combo) delete combo[k]; for (const k in jit) delete jit[k]; } };
})(globalThis);