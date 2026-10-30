// Mechanic Wars - Wraith / "Bloodlust" effects (internal id "assassin"). VISUAL ONLY: the sim never reads this file.
// Fed by sim events (style "blood"): swing -> slash arc, hit -> cut marks + red sparks.
// Frenzy (0..1) rises with every hit and fades over about 2 seconds. It makes the eyes brighter
// and adds a red aura, embers and more dash ghosts. Being hit cuts it in half.
// All numbers are in the TUNE block.
(function (g) {
  const MW = (g.MW = g.MW || {});
  const TAU = Math.PI * 2;

  const TUNE = {
    maxParticles: 260,
    frenzyPerHit: 0.25, // 4 hits = full frenzy
    frenzyDecay: 0.007, // per rendered frame (about 2.4 s from full to empty at 60 fps)
    frenzyHurtMult: 0.5, // frenzy left after the Assassin takes a hit
    ghostSpeed: 3.2, // px per tick: faster than this leaves ghosts
    ghostLife: 9, // frames (more with frenzy)
    slashLife: 10,
    smokeChance: 0.5, // chance per update of a crimson smoke puff while he is fast or frenzied
  };

  const RED = "#ff1e3c";
  const HOT = "#ffd0d8";
  const BLOOD = "#a80e28";
  const DARK = "#26030c";

  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const parts = []; // sparks, drops, gashes, embers
  const slashes = [];
  const ghosts = [];
  const frenzy = {}; // fighter id -> 0..1
  const swingCount = {}; // fighter id -> swings so far (alternates slash direction)
  const byId = {}; // fighter id -> fighter
  const trails = []; // dash-slash streaks
  const guides = []; // dash distance preview while charging (rebuilt every frame)
  const chains = []; // chained scythe lines (rebuilt every frame)
  const marks = []; // Death Mark indicators over the target (rebuilt every frame)
  const clones = []; // Phantom Decoy illusion + Death Sentence illusions drawn as faint copies of the Assassin (rebuilt every frame)
  const binds = []; // Death Sentence chains from each illusion to the victim (rebuilt every frame)
  const stars = []; // Death Sentence shuriken in flight (rebuilt every frame)
  const cloneArt = {}; // per-clone animation state (key -> art state), so each illusion animates on its own
  let frame = 0;

  function add(p) {
    if (parts.length >= TUNE.maxParticles) parts.shift();
    p.max = p.life;
    p.vx = p.vx || 0; p.vy = p.vy || 0; p.g = p.g || 0; p.drag = p.drag === undefined ? 0.96 : p.drag;
    parts.push(p);
  }

  // ─── events ───────────────────────────────────────────────────────
  function event(ev) {
    if (!ev || ev.style !== "blood") return;
    const owner = byId[ev.ownerId];
    if (ev.type === "swing" && owner && owner.hit && owner.hit.id === "charged_slash") return; // dash slash draws its own arcs
    if (ev.type === "swing") {
      const n = (swingCount[ev.ownerId] = (swingCount[ev.ownerId] || 0) + 1);
      slashes.push({ x: ev.x, y: ev.y, dir: ev.dir, range: ev.range || 54, up: n % 2 === 0, age: 0, life: TUNE.slashLife });
      if (slashes.length > 12) slashes.shift();
    } else if (ev.type === "hit") {
      const { x, y, dir } = ev;
      frenzy[ev.ownerId] = Math.min(1, (frenzy[ev.ownerId] || 0) + TUNE.frenzyPerHit);
      if (frenzy[ev.targetId]) frenzy[ev.targetId] *= TUNE.frenzyHurtMult;
      // cut marks: two crossing gashes
      const a = rnd(-0.5, 0.5);
      for (const k of [0, 1]) {
        const ang = (k ? 0.9 : -0.9) + a;
        add({ kind: "gash", x, y, ang, len: 30 + k * 8, life: 14, drag: 1 });
      }
      add({ kind: "flare", x, y, life: 7, size: 26, drag: 1 });
      for (let i = 0; i < 3; i++) add({ kind: "smoke", x, y, vx: dir * rnd(0.3, 1.6), vy: rnd(-1.2, -0.2), life: 22 + (Math.random() * 10 | 0), size: rnd(5, 8), drag: 0.95 });
      // red sparks (streaks) fly forward, droplets fall
      for (let i = 0; i < 9; i++) add({ kind: "spark", x, y, vx: dir * rnd(2, 9), vy: rnd(-4, 1.5), life: 12 + (Math.random() * 8 | 0), size: rnd(1.6, 2.8), g: 0.2, drag: 0.93 });
      for (let i = 0; i < 8; i++) add({ kind: "drop", x, y, vx: dir * rnd(0.5, 4.5) + rnd(-1, 1), vy: rnd(-4.5, -0.5), life: 22 + (Math.random() * 14 | 0), size: rnd(2, 4), g: 0.28, drag: 0.97 });
    }
  }

  // ─── per frame ────────────────────────────────────────────────────
  // Spawns dash ghosts and keeps each assassin's frenzy level on the fighter (f._frenzy) for the art to read.
  function update(sim) {
    frame++;
    guides.length = 0;
    chains.length = 0;
    marks.length = 0;
    clones.length = 0;
    binds.length = 0;
    stars.length = 0;
    for (const f of sim.fighters) bleedFx(f);
    for (const f of sim.fighters) {
      byId[f.id] = f;
      if (f.stats.id !== "assassin") continue;
      const v = Math.max(0, (frenzy[f.id] || 0) - TUNE.frenzyDecay);
      frenzy[f.id] = v;
      f._frenzy = v;
      skillFx(f);
      if (f.state === MW.STATE.KO) { frenzy[f.id] = 0; continue; }
      const speed = Math.abs(f.x - f.px);

      // Charged dash slash: energy gathers on the blades, aura grows, a faint line previews the dash distance
      const ch = !!(f.hit && f.hit.chargeHold && f.state === MW.STATE.ATTACK_STARTUP && !f.chargeReleased);
      const prog = ch ? clamp(f.chargeTicks / f.hit.chargeTime, 0, 1) : 0;
      f._chargeLv = ch ? prog : Math.max(0, (f._chargeLv || 0) - 0.08);
      const dd0 = f.facing < 0 ? -1 : 1;
      if (ch) {
        const bx = f.x + f.stats.width / 2 + dd0 * f.stats.width * 0.45, by = f.y + f.stats.height * 0.45;
        if (frame % 2 === 0) {
          const a = rnd(0, TAU), r = rnd(26, 56) * (1.15 - 0.5 * prog);
          add({ kind: "spark", x: bx + Math.cos(a) * r, y: by + Math.sin(a) * r, vx: -Math.cos(a) * r * 0.14, vy: -Math.sin(a) * r * 0.14, life: 8, size: rnd(1.6, 2.6), drag: 1 });
        }
        const cs = f.hit.chargeScale;
        if (cs) guides.push({ x: f.x + f.stats.width / 2, y: f.y + f.stats.height - 2, d: dd0, len: cs.dist[0] + (cs.dist[1] - cs.dist[0]) * prog, p: prog });
        const tier = Math.floor(f.chargeTicks / 60); // a small pulse every second of charge, a big one at full
        if (tier > (f._chargeTier || 0)) { f._chargeTier = tier; add({ kind: "flare", x: bx, y: by, life: 9, size: tier >= 3 ? 52 : 30, drag: 1 }); }
        if (f.chargeTicks >= f.hit.chargeTime && frame % 3 === 0) add({ kind: "ember", x: bx + rnd(-6, 6), y: by + rnd(-8, 8), vx: rnd(-0.4, 0.4), vy: rnd(-2.2, -0.8), g: -0.02, life: 16, size: rnd(2, 3.4), hot: true, drag: 0.98 });
      } else f._chargeTier = 0;

      // The dash itself: streak behind him, arcs along the path, a big finishing slash on the last tick
      if (f.hit && f.hit.id === "charged_slash" && f.state === MW.STATE.ATTACK_ACTIVE) {
        const sx = f.x + f.stats.width / 2, sy = f.y + f.stats.height * 0.5;
        if (!f._dash) { f._dash = { x0: sx, y: sy, tr: { x0: sx, x1: sx, y: sy, d: dd0, life: 18, max: 18, live: true } }; trails.push(f._dash.tr); if (trails.length > 6) trails.shift(); }
        f._dash.tr.x1 = sx; f._dash.tr.life = f._dash.tr.max;
        ghosts.push({ x: f.x, y: f.y, w: f.stats.width, h: f.stats.height, d: dd0, life: TUNE.ghostLife + 3 });
        if (ghosts.length > 24) ghosts.shift();
        const front = f.x + (dd0 > 0 ? f.stats.width : 0);
        if (frame % 3 === 0) slashes.push({ x: front, y: sy - 4, dir: dd0, range: 56, up: (frame / 3 | 0) % 2 === 0, age: 0, life: 8 });
        if (f.stateTimer === 1) slashes.push({ x: front, y: sy - 6, dir: dd0, range: 96, up: false, age: 0, life: 15 });
        if (slashes.length > 12) slashes.shift();
        if (frame % 2 === 0) add({ kind: "smoke", x: sx - dd0 * 6, y: f.y + f.stats.height * rnd(0.4, 0.95), vx: -dd0 * rnd(0.2, 1), vy: rnd(-0.6, 0), life: 20, size: rnd(5, 8), drag: 0.96 });
      } else if (f._dash) { f._dash.tr.live = false; f._dash = null; }
      // Death Mark: pips above the target, a spinning sigil once it is marked
      const mk = f.mark;
      if (mk && mk.target && (mk.stacks > 0 || mk.marked) && mk.target.state !== MW.STATE.KO) {
        marks.push({ x: mk.target.x + mk.target.stats.width / 2, y: mk.target.y - 24, n: mk.stacks, max: (f.stats.passive && f.stats.passive.max) || 4, marked: mk.marked });
      }
      // Chained Scythe: the chain flies out, drags the enemy in, a bomb blinks on them, then it blows
      if (f.hit && f.hit.id === "chained_scythe") {
        const dd = f.facing < 0 ? -1 : 1, hx = f.x + f.stats.width / 2 + dd * f.stats.width * 0.4, hy = f.y + f.stats.height * 0.42;
        if (f.scythe) {
          const v = f.scythe.target;
          chains.push({ x0: hx, y0: hy, x1: v.x + v.stats.width / 2, y1: v.y + v.stats.height * 0.45, bomb: f.scythe.phase === "bomb" ? f.scythe.t / Math.max(1, f.scythe.cfg.bombDelay) : -1 });
        } else if (f.state === MW.STATE.ATTACK_ACTIVE) {
          const p = 1 - f.stateTimer / Math.max(1, f.hit.active);
          chains.push({ x0: hx, y0: hy, x1: hx + dd * f.hit.range * clamp(p * 1.7, 0.1, 1), y1: hy, bomb: -1 });
        } else if (f.state === MW.STATE.ATTACK_RECOVERY) { // a missed throw: the chain snaps back
          const p = clamp(f.stateTimer / Math.max(1, f.hit.recovery) * 2 - 1, 0, 1);
          if (p > 0.02) chains.push({ x0: hx, y0: hy, x1: hx + dd * f.hit.range * p, y1: hy, bomb: -1 });
        }
      }
      if (f.blastFx) { // bomb explosion
        const b = f.blastFx; f.blastFx = null;
        add({ kind: "flare", x: b.x, y: b.y, life: 12, size: 90, drag: 1 });
        for (let i = 0; i < 18; i++) add({ kind: "spark", x: b.x, y: b.y, vx: rnd(-9, 9), vy: rnd(-9, 5), life: 14 + (Math.random() * 8 | 0), size: rnd(1.8, 3.2), g: 0.2, drag: 0.93 });
        for (let i = 0; i < 6; i++) add({ kind: "smoke", x: b.x + rnd(-10, 10), y: b.y + rnd(-10, 10), vx: rnd(-1.5, 1.5), vy: rnd(-1.5, 0), life: 26, size: rnd(8, 13), drag: 0.95 });
      }
      const lunging = f.state === MW.STATE.ATTACK_STARTUP || f.state === MW.STATE.ATTACK_ACTIVE;
      // silhouette frays into dark crimson smoke while he is fast or frenzied
      const cloaked = f.fade !== undefined && f.fade < 0.5; // hidden from the opponent: no smoke / ghost trail to give him away
      if (!cloaked && (speed > TUNE.ghostSpeed || v > 0.5) && Math.random() < TUNE.smokeChance * (0.5 + v)) {
        const dd = f.facing < 0 ? -1 : 1;
        add({ kind: "smoke", x: f.x + f.stats.width / 2 - dd * 4, y: f.y + f.stats.height * rnd(0.35, 0.95), vx: -dd * rnd(0.2, 1.2), vy: rnd(-0.7, -0.1), life: 24 + (Math.random() * 12 | 0), size: rnd(5, 9), drag: 0.96, g: -0.01 });
      }
      if (!cloaked && (speed > TUNE.ghostSpeed || (lunging && speed > 1.5)) && frame % 2 === 0) {
        ghosts.push({ x: f.x, y: f.y, w: f.stats.width, h: f.stats.height, d: f.facing < 0 ? -1 : 1, life: TUNE.ghostLife + Math.round(5 * v) });
        if (ghosts.length > 24) ghosts.shift();
      }
    }
  }

  // ─── skills 2-4 + ultimate: visuals only, read from fighter fields ───
  const SENT_ALPHA = 0.8;
  function smoke(x, y, n) {
    add({ kind: "flare", x, y, life: 8, size: 46, drag: 1 });
    for (let i = 0; i < n; i++) add({ kind: "smoke", x: x + rnd(-10, 10), y: y + rnd(-22, 22), vx: rnd(-1.8, 1.8), vy: rnd(-1.6, 0.4), life: 26 + (Math.random() * 10 | 0), size: rnd(8, 14), drag: 0.95 });
  }
  function slashBurst(x, y, dir, big) {
    slashes.push({ x: x - dir * 10, y, dir, range: big ? 100 : 62, up: Math.random() < 0.5, age: 0, life: big ? 15 : 9 });
    if (slashes.length > 12) slashes.shift();
    add({ kind: "flare", x, y, life: 8, size: big ? 60 : 30, drag: 1 });
    const n = big ? 16 : 6;
    for (let i = 0; i < n; i++) add({ kind: "spark", x, y, vx: dir * rnd(1, 9), vy: rnd(-5, 2), life: 12 + (Math.random() * 8 | 0), size: rnd(1.6, 2.8), g: 0.2, drag: 0.93 });
  }

  // Rupture: red drips off the bleeding fighter, more while he moves; a small gash flash on every damage tick.
  function bleedFx(f) {
    if (!f.bleed) return;
    const moved = Math.abs(f.x - f.px);
    const cx = f.x + f.stats.width / 2;
    if (frame % 5 === 0 || moved > 3) add({ kind: "drop", x: cx + rnd(-8, 8), y: f.y + rnd(f.stats.height * 0.25, f.stats.height * 0.8), vx: rnd(-0.6, 0.6) - Math.sign(f.x - f.px) * 0.5, vy: rnd(-1, 0.4), life: 20 + (Math.random() * 12 | 0), size: rnd(1.8, 3.2), g: 0.28, drag: 0.97 });
    if (f.bleedPulse === 5) add({ kind: "gash", x: cx, y: f.y + f.stats.height * 0.45, ang: rnd(-0.8, 0.8), len: 22, life: 10, drag: 1 });
  }

  function skillFx(f) {
    const s = f.stats, W = s.width, H = s.height;
    while (f.poofs && f.poofs.length) { const p = f.poofs.shift(); smoke(p.x, p.y, 6); }
    if (f.slashFx) { const q = f.slashFx; f.slashFx = null; slashBurst(q.x, q.y, q.dir, q.big); }
    // Phantom Decoy: the illusion is a full copy of the Assassin that runs on its own
    if (f.decoy) {
      const d = f.decoy;
      clones.push({ f, key: f.id + ":decoy", x: d.x, y: d.y, vx: d.vx, vy: d.vy, facing: d.facing, state: d.state, grounded: d.grounded, alpha: d.left < 18 ? d.left / 18 : 1 });
    }
    // Death Sentence: four illusions fade in around the victim, chain him, throw shuriken, then vanish
    const S = f.sentence;
    if (S) {
      const v = S.target, C = S.cfg;
      const vcx = v.x + v.stats.width / 2, vfeet = v.y + v.stats.height, vcy = v.y + v.stats.height * 0.45;
      const fadeIn = clamp(S.t / 10, 0, 1), fadeOut = S.done ? clamp(S.fade / (C.fadeTicks || 12), 0, 1) : 1;
      S.ills.forEach((il, i) => {
        const ix = vcx + il.dx - W / 2, iy = vfeet - H + il.dy;
        const thrown = S.t >= il.throwAt, since = S.t - il.throwAt;
        let state = MW.STATE.ATTACK_STARTUP, hit = { pose: il.pose, startup: C.bindTicks, active: 8, recovery: 10 }, stateTimer = Math.max(1, C.bindTicks - S.t);
        if (thrown) { state = since < 8 ? MW.STATE.ATTACK_ACTIVE : MW.STATE.ATTACK_RECOVERY; stateTimer = since < 8 ? Math.max(1, 8 - since) : Math.max(1, 10 - (since - 8)); }
        clones.push({ f, key: f.id + ":ill" + i, x: ix, y: iy, vx: 0, vy: 0, facing: il.dx <= 0 ? 1 : -1, state, grounded: true, hit, stateTimer, alpha: SENT_ALPHA * fadeIn * fadeOut, tint: true });
        const hx = ix + W / 2, hy = iy + H * 0.42;
        binds.push({ x0: hx, y0: hy, x1: vcx, y1: vcy, a: fadeIn * fadeOut, t: S.t });
        if (thrown && !il.done && since <= C.flight) { // shuriken in flight: from the illusion to the victim
          const u = clamp(since / Math.max(1, C.flight), 0, 1);
          stars.push({ x: hx + (vcx - hx) * u, y: hy + (vcy - hy) * u, rot: frame * 0.6, a: 1 });
        }
        if (il.done && S.t - il.hitAt === 0) slashBurst(vcx, vcy, il.dx <= 0 ? 1 : -1, false);
      });
    }
  }

  function drawClone(ctx, c) {
    if (!MW.CharacterArt || c.alpha <= 0.01) return;
    const p = Object.create(c.f); // inherits stats / palette / frenzy; every field the art reads is overridden below
    p.x = c.x; p.y = c.y; p.px = c.x; p.py = c.y; p.vx = c.vx; p.vy = c.vy;
    p.facing = c.facing; p.state = c.state; p.grounded = c.grounded;
    p.hit = c.hit || null; p.stateTimer = c.stateTimer || 0; p.flash = 0; p.chargeReleased = true;
    p._art = cloneArt[c.key] || null; // null: the art creates its own state on the clone
    ctx.save();
    ctx.globalAlpha = c.alpha;
    MW.CharacterArt.draw(ctx, p, false, null);
    ctx.restore();
    cloneArt[c.key] = p._art;
  }

  function drawBind(ctx, b) {
    const dx = b.x1 - b.x0, dy = b.y1 - b.y0, len = Math.hypot(dx, dy);
    if (len < 4) return;
    const n = Math.max(2, Math.floor(len / 9)), reach = clamp(b.t / 10, 0, 1);
    ctx.save();
    ctx.lineCap = "round";
    ctx.globalAlpha = b.a;
    for (let i = 0; i < n * reach; i++) {
      const u0 = i / n, u1 = (i + 0.62) / n;
      ctx.strokeStyle = i % 2 ? "#8a8f9a" : "#3a3d46"; ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.moveTo(b.x0 + dx * u0, b.y0 + dy * u0); ctx.lineTo(b.x0 + dx * u1, b.y0 + dy * u1); ctx.stroke();
    }
    ctx.restore();
  }

  function drawStar(ctx, s) {
    ctx.save();
    ctx.translate(s.x, s.y); ctx.rotate(s.rot);
    ctx.fillStyle = "#c9ced8"; ctx.strokeStyle = DARK; ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const r = i % 2 ? 4 : 11, a = (i / 8) * TAU; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function tick() {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx; p.y += p.vy; p.vx *= p.drag; p.vy *= p.drag; p.vy += p.g;
      if (--p.life <= 0) parts.splice(i, 1);
    }
    for (let i = slashes.length - 1; i >= 0; i--) if (++slashes[i].age >= slashes[i].life) slashes.splice(i, 1);
    for (let i = ghosts.length - 1; i >= 0; i--) if (--ghosts[i].life <= 0) ghosts.splice(i, 1);
    for (let i = trails.length - 1; i >= 0; i--) if (!trails[i].live && --trails[i].life <= 0) trails.splice(i, 1);
  }

  // ─── drawing ──────────────────────────────────────────────────────
  // Red afterimages (drawn behind the fighters): the crouched Bloodlust silhouette with swept hair and a torn sash.
  function drawBehind(ctx) {
    if (!ghosts.length && !guides.length && !trails.length) return;
    ctx.save();
    for (const gd of guides) { // dash preview: dashed line on the floor that grows with the charge, arrow at the end
      const x1 = gd.x + gd.d * gd.len;
      ctx.globalAlpha = 0.3 + 0.4 * gd.p;
      ctx.strokeStyle = RED; ctx.lineWidth = 2; ctx.setLineDash([8, 7]);
      ctx.beginPath(); ctx.moveTo(gd.x + gd.d * 18, gd.y); ctx.lineTo(x1, gd.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = RED;
      ctx.beginPath(); ctx.moveTo(x1 + gd.d * 10, gd.y); ctx.lineTo(x1 - gd.d * 4, gd.y - 7); ctx.lineTo(x1 - gd.d * 4, gd.y + 7); ctx.closePath(); ctx.fill();
    }
    for (const t of trails) { // tapered crimson streak along the dash path
      const a = t.live ? 1 : clamp(t.life / t.max, 0, 1);
      const xa = Math.min(t.x0, t.x1), xb = Math.max(t.x0, t.x1);
      if (xb - xa < 2) continue;
      const hh = 16 * a;
      ctx.globalAlpha = a * 0.7; ctx.fillStyle = RED;
      ctx.beginPath(); ctx.moveTo(t.x0, t.y); ctx.lineTo(t.x1 - t.d * 4, t.y - hh); ctx.lineTo(t.x1, t.y); ctx.lineTo(t.x1 - t.d * 4, t.y + hh); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = a * 0.9; ctx.strokeStyle = HOT; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(t.x0, t.y); ctx.lineTo(t.x1, t.y); ctx.stroke();
    }
    for (const gh of ghosts) {
      const a = clamp(gh.life / TUNE.ghostLife, 0, 1);
      ctx.globalAlpha = a * 0.4;
      ctx.fillStyle = BLOOD;
      const cx = gh.x + gh.w / 2, top = gh.y, H = gh.h, W = gh.w, d = gh.d;
      ctx.beginPath(); ctx.arc(cx + d * 5, top + H * 0.22, H * 0.095, 0, TAU); ctx.fill(); // head, thrown forward
      ctx.beginPath(); // swept-back hair spikes
      ctx.moveTo(cx + d * 2, top + H * 0.15); ctx.lineTo(cx - d * 13, top + H * 0.13); ctx.lineTo(cx - d * 5, top + H * 0.21); ctx.lineTo(cx - d * 12, top + H * 0.27); ctx.lineTo(cx, top + H * 0.26);
      ctx.closePath(); ctx.fill();
      ctx.beginPath(); // low, leaning torso
      ctx.moveTo(cx - W * 0.34 - d * 2, top + H * 0.34);
      ctx.lineTo(cx + W * 0.36 + d * 4, top + H * 0.32);
      ctx.lineTo(cx + W * 0.2 + d * 5, top + H * 0.62);
      ctx.lineTo(cx - W * 0.2 + d * 1, top + H * 0.62);
      ctx.closePath(); ctx.fill();
      ctx.beginPath(); // torn sash streaming back
      ctx.moveTo(cx - d * 2, top + H * 0.56); ctx.lineTo(cx - d * 24, top + H * 0.66); ctx.lineTo(cx - d * 14, top + H * 0.6); ctx.lineTo(cx - d * 20, top + H * 0.5); ctx.lineTo(cx - d * 4, top + H * 0.5);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(cx - W * 0.24 + d * 3, top + H * 0.6, W * 0.48, H * 0.4); // legs
    }
    ctx.restore();
  }

  // Crescent slash: sweeps in 3 frames, then fades.
  function drawSlash(ctx, s) {
    const age = s.age;
    const sweep = clamp((age + 1) / 3, 0, 1);
    const fade = age < 3 ? 1 : clamp(1 - (age - 3) / (s.life - 3), 0, 1);
    const R = s.range + 8;
    const a0 = s.up ? 1.05 : -1.15, a1 = s.up ? -0.75 : 0.6;
    const head = sweep;
    const tail = Math.min(head, clamp((age - 1) / 7, 0, 1) * 0.85);
    if (head - tail < 0.02) return;
    const cx = s.x - s.dir * R * 0.3, cy = s.y;
    const N = 14, outer = [], inner = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const th = a0 + (a1 - a0) * (tail + (head - tail) * u);
      const thick = 16 * Math.sin(Math.PI * u) + 1;
      outer.push([cx + s.dir * Math.cos(th) * R, cy + Math.sin(th) * R]);
      inner.push([cx + s.dir * Math.cos(th) * (R - thick), cy + Math.sin(th) * (R - thick)]);
    }
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(outer[0][0], outer[0][1]);
    for (let i = 1; i <= N; i++) ctx.lineTo(outer[i][0], outer[i][1]);
    for (let i = N; i >= 0; i--) ctx.lineTo(inner[i][0], inner[i][1]);
    ctx.closePath();
    ctx.fillStyle = "rgba(214,20,48,0.92)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = DARK;
    ctx.stroke();
    // white-hot edge
    ctx.beginPath();
    ctx.moveTo(outer[0][0], outer[0][1]);
    for (let i = 1; i <= N; i++) ctx.lineTo(outer[i][0], outer[i][1]);
    ctx.strokeStyle = HOT;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
    // sparks fly off the leading tip while it sweeps
    if (age < 3 && Math.random() < 0.9) {
      const tip = outer[N];
      add({ kind: "spark", x: tip[0], y: tip[1], vx: s.dir * rnd(0.5, 3), vy: rnd(-2, 2), life: 10, size: 1.8, g: 0.1, drag: 0.93 });
    }
  }

  // chain of links ending in a curved scythe blade (and a blinking bomb when one is attached)
  function drawChain(ctx, c) {
    const dx = c.x1 - c.x0, dy = c.y1 - c.y0, len = Math.hypot(dx, dy);
    if (len < 4) return;
    const ang = Math.atan2(dy, dx), n = Math.max(2, Math.floor(len / 9));
    ctx.save();
    ctx.lineCap = "round";
    for (let i = 0; i < n; i++) { // links: alternating dark and bright
      const u0 = i / n, u1 = (i + 0.62) / n;
      ctx.strokeStyle = i % 2 ? "#8a8f9a" : "#3a3d46"; ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.moveTo(c.x0 + dx * u0, c.y0 + dy * u0); ctx.lineTo(c.x0 + dx * u1, c.y0 + dy * u1); ctx.stroke();
    }
    ctx.translate(c.x1, c.y1); ctx.rotate(ang); // scythe head: a crescent blade
    ctx.fillStyle = "#c9ced8"; ctx.strokeStyle = DARK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.quadraticCurveTo(10, -22, 24, -4); ctx.quadraticCurveTo(10, -13, 2, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, TAU); ctx.fill();
    ctx.restore();
    if (c.bomb >= 0) { // bomb: blinks faster as it is about to go off
      const blink = Math.sin(frame * (0.5 + 1.6 * c.bomb)) > 0;
      ctx.save();
      ctx.translate(c.x1, c.y1 - 6);
      ctx.fillStyle = "#16161c"; ctx.strokeStyle = blink ? RED : "#555"; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = blink ? HOT : RED; ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#caa"; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.quadraticCurveTo(5, -15, 9, -13); ctx.stroke();
      ctx.restore();
    }
  }

  function drawMark(ctx, m) {
    ctx.save();
    ctx.translate(m.x, m.y);
    if (m.marked) { // spinning crimson sigil
      ctx.rotate(frame * 0.06);
      ctx.strokeStyle = RED; ctx.lineWidth = 2.4; ctx.shadowColor = RED; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.stroke();
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(22, 0); ctx.stroke(); }
      ctx.rotate(-frame * 0.06);
      ctx.fillStyle = HOT; ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, TAU); ctx.fill();
    } else { // stack pips
      for (let i = 0; i < m.max; i++) {
        const x = (i - (m.max - 1) / 2) * 12;
        ctx.beginPath(); ctx.moveTo(x, -6); ctx.lineTo(x + 5, 0); ctx.lineTo(x, 6); ctx.lineTo(x - 5, 0); ctx.closePath();
        ctx.fillStyle = i < m.n ? RED : "rgba(0,0,0,0.35)"; ctx.fill();
        ctx.strokeStyle = i < m.n ? HOT : "rgba(255,255,255,0.35)"; ctx.lineWidth = 1.4; ctx.stroke();
      }
    }
    ctx.restore();
  }

  function draw(ctx) {
    for (const c of clones) drawClone(ctx, c);
    for (const b of binds) drawBind(ctx, b);
    for (const c of chains) drawChain(ctx, c);
    for (const s of stars) drawStar(ctx, s);
    for (const m of marks) drawMark(ctx, m);
    for (const s of slashes) drawSlash(ctx, s);
    if (!parts.length) return;
    ctx.save();
    ctx.lineCap = "round";
    for (const p of parts) {
      const a = clamp(p.life / p.max, 0, 1);
      if (p.kind === "spark") {
        ctx.globalAlpha = a;
        ctx.strokeStyle = RED; ctx.lineWidth = p.size + 1.5;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2); ctx.stroke();
        ctx.strokeStyle = HOT; ctx.lineWidth = Math.max(0.8, p.size - 0.6);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 1.4, p.y - p.vy * 1.4); ctx.stroke();
      } else if (p.kind === "drop") {
        ctx.globalAlpha = Math.min(1, a * 1.4);
        ctx.fillStyle = BLOOD;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
        ctx.fillStyle = "rgba(255,160,175,0.7)";
        ctx.beginPath(); ctx.arc(p.x - p.size * 0.3, p.y - p.size * 0.3, p.size * 0.35, 0, TAU); ctx.fill();
      } else if (p.kind === "gash") {
        const grow = clamp((1 - a) * 5, 0, 1); // draws out in the first frames, then fades
        const L = p.len * (0.35 + 0.65 * grow) / 2;
        const dx = Math.cos(p.ang) * L, dy = Math.sin(p.ang) * L;
        ctx.globalAlpha = a;
        ctx.strokeStyle = DARK; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(p.x - dx, p.y - dy); ctx.lineTo(p.x + dx, p.y + dy); ctx.stroke();
        ctx.strokeStyle = RED; ctx.lineWidth = 3.6;
        ctx.beginPath(); ctx.moveTo(p.x - dx, p.y - dy); ctx.lineTo(p.x + dx, p.y + dy); ctx.stroke();
        ctx.strokeStyle = HOT; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(p.x - dx * 0.8, p.y - dy * 0.8); ctx.lineTo(p.x + dx * 0.8, p.y + dy * 0.8); ctx.stroke();
      } else if (p.kind === "flare") {
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a * 0.5, 0, TAU); ctx.fill();
        ctx.fillStyle = RED;
        ctx.globalAlpha = a * 0.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.2 - a * 0.5), 0, TAU); ctx.fill();
      } else if (p.kind === "smoke") {
        const grow = 1 + (1 - a) * 1.6;
        ctx.globalAlpha = a * 0.34;
        ctx.fillStyle = "#4a0716";
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * grow, 0, TAU); ctx.fill();
        ctx.globalAlpha = a * 0.22;
        ctx.fillStyle = "#10020a";
        ctx.beginPath(); ctx.arc(p.x + p.size * 0.2, p.y + p.size * 0.1, p.size * grow * 0.6, 0, TAU); ctx.fill();
      } else if (p.kind === "ember") {
        ctx.globalAlpha = a * 0.85;
        ctx.fillStyle = p.hot ? RED : BLOOD;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * a), 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

  // Red aura and rising embers around a frenzied Assassin. Drawn BEHIND the body, inside the fighter's transform.
  function drawAura(ctx, f) {
    const v = Math.max(f._frenzy || 0, f._chargeLv || 0);
    if (v < 0.03 || f.state === MW.STATE.KO || (f.fade !== undefined && f.fade < 0.5)) return;
    const s = f.stats;
    const cx = f.x + s.width / 2, cy = f.y + s.height * 0.5;
    const r = s.height * (0.55 + 0.25 * v);
    ctx.save();
    const gr = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
    gr.addColorStop(0, "rgba(190,14,40," + (0.35 * v).toFixed(3) + ")");
    gr.addColorStop(1, "rgba(90,0,20,0)");
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.8, r, 0, 0, TAU); ctx.fill();
    ctx.restore();
    if (Math.random() < 0.15 + 0.6 * v) {
      add({ kind: "ember", x: cx + rnd(-s.width * 0.6, s.width * 0.6), y: f.y + rnd(s.height * 0.3, s.height), vx: rnd(-0.3, 0.3), vy: rnd(-2.2, -0.8), g: -0.02, life: 18 + (Math.random() * 14 | 0), size: rnd(1.8, 3.6), hot: Math.random() < 0.5, drag: 0.98 });
    }
  }

  MW.AssassinFx = { TUNE, event, update, tick, drawBehind, draw, drawAura, frenzyOf: (id) => frenzy[id] || 0, _parts: parts, _slashes: slashes, _ghosts: ghosts };
})(globalThis);