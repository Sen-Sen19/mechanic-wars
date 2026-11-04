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
  const recoils = []; // chains whipping back to the hand after the hook lets go (persistent, aged in tick())
  const seals = []; // ground sigils (Death Sentence circle under the victim, small rune circle while the ult charges) - rebuilt every frame
  const dims = []; // spotlight dimming of the arena (Death Sentence) - rebuilt every frame
  const moons = []; // the blood moon behind the sentence - rebuilt every frame
  const bands = []; // glowing restraint bands around the victim - rebuilt every frame
  const reticles = []; // lock-on reticle on the enemy while the ultimate charges - rebuilt every frame
  const rends = []; // huge finishing slashes (persistent)
  const stamps = []; // the sentence seal stamped over the victim at the finish (persistent)
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
    seals.length = 0;
    dims.length = 0;
    moons.length = 0;
    bands.length = 0;
    reticles.length = 0;
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
    hookFx(f);
    ultFx(f);
  }

  // ═════════════ Chained Scythe (skill 1) ═════════════
  // What you see follows what the sim does: startup = the head is whirled round the hand; active = the head FLIES out at hook.speed
  // (the hit lands the instant it touches the enemy); on a hit it bites in and the taut chain drags him; the bomb ticks, blows, and the
  // chain whips back. A miss: the head reaches its full length, then the chain is reeled in. Nothing extends past the enemy once he is hit.
  function handOf(f) {
    const dd = f.facing < 0 ? -1 : 1;
    return { dd, x: f.x + f.stats.width / 2 + dd * f.stats.width * 0.4, y: f.y + f.stats.height * 0.42 };
  }
  const shake = (n) => { if (MW.fxShake) MW.fxShake(n); };
  const flash = (a, c) => { if (MW.fxFlash) MW.fxFlash(a, c); };
  function ringFx(x, y, r0, r1, life, col, lw, sy) { add({ kind: "ring", x, y, r0, r1, life, col, lw: lw || 3, sy: sy === undefined ? 1 : sy, drag: 1 }); }

  function hookImpact(x, y, dd) { // the blade bites into the enemy
    add({ kind: "flare", x, y, life: 8, size: 58, drag: 1 });
    ringFx(x, y, 6, 64, 11, HOT, 3);
    ringFx(x, y, 4, 96, 16, RED, 4);
    for (let i = 0; i < 12; i++) add({ kind: "spark", x, y, vx: -dd * rnd(1.5, 8), vy: rnd(-4, 3), life: 12 + (Math.random() * 8 | 0), size: rnd(1.6, 2.8), g: 0.18, drag: 0.93 });
    for (const k of [0, 1]) add({ kind: "gash", x, y, ang: (k ? 0.8 : -0.8) + rnd(-0.3, 0.3), len: 40, life: 14, drag: 1 });
    for (let i = 0; i < 5; i++) add({ kind: "drop", x, y, vx: -dd * rnd(0.5, 3) + rnd(-1, 1), vy: rnd(-4, -0.5), life: 24, size: rnd(2, 3.6), g: 0.28, drag: 0.97 });
    shake(5);
  }

  function hookFx(f) {
    const hk = !!(f.hit && f.hit.id === "chained_scythe");
    const H = handOf(f), dd = H.dd, W = f.stats.width, ST = MW.STATE;
    if (!hk || f.state === ST.ATTACK_STARTUP) { f._hookHit = false; f._fh = null; }
    const sy = f.scythe;
    if (sy && hk) {
      const v = sy.target, C = sy.cfg;
      const vx = v.x + v.stats.width / 2, vy = v.y + v.stats.height * 0.45;
      if (!f._sy) { f._sy = { x: vx, y: vy, b: 0 }; f._hookHit = true; hookImpact(vx, vy, dd); }
      const b = f._sy.b = Math.min(1, f._sy.b + 0.34); // the head settles from where it flew to the middle of the enemy (no pop)
      const fh = f._fh || { x: vx, y: vy };
      const hx = fh.x + (vx - fh.x) * b, hy = fh.y + (vy - fh.y) * b;
      f._sy.x = hx; f._sy.y = hy;
      const pull = sy.phase === "pull";
      chains.push({ x0: H.x, y0: H.y, x1: hx, y1: hy, ang: Math.atan2(hy - H.y, hx - H.x), slack: 0, taut: true, beads: pull ? 5 : 2, glow: pull ? 0.6 : 0.35, bomb: sy.phase === "bomb" ? sy.t / Math.max(1, C.bombDelay) : -1 });
      if (pull) { // the dragged enemy kicks up dust and speed lines
        if (frame % 2 === 0) add({ kind: "smoke", x: vx + dd * 12, y: v.y + v.stats.height - 4, vx: dd * rnd(0.4, 1.8), vy: rnd(-0.8, -0.1), life: 18, size: rnd(5, 8), drag: 0.95 });
        add({ kind: "spark", x: vx + dd * 18, y: vy + rnd(-22, 22), vx: dd * rnd(5, 9), vy: 0, life: 6, size: 1.6, drag: 1 });
      } else if (frame % 2 === 0) { // bomb fuse sparks
        add({ kind: "spark", x: vx + 6, y: vy - 22, vx: rnd(-1.5, 1.5), vy: rnd(-3, -1), life: 8, size: 1.6, g: 0.1, drag: 0.95 });
      }
    } else {
      if (f._sy) { // the chain lets go (bomb went off, he slipped away or the Wraith was hit): it whips back to the hand
        recoils.push({ f, x: f._sy.x, y: f._sy.y, t: 0, life: 9 });
        if (recoils.length > 8) recoils.shift();
        f._sy = null;
      }
      if (hk && f.state === ST.ATTACK_STARTUP) { // whirl: the head spins round the hand and the circle grows
        const p = clamp(1 - f.stateTimer / Math.max(1, f.hit.startup), 0, 1);
        const r = 12 + 30 * p, th = frame * 0.62 * dd, cx = H.x - dd * 8, cy = H.y - 3;
        const hx = cx + Math.cos(th) * r, hy = cy + Math.sin(th) * r * 0.85;
        chains.push({ x0: H.x, y0: H.y, x1: hx, y1: hy, ang: th + dd * Math.PI / 2, slack: 2.5, phase: frame * 0.5, scale: 0.8 + 0.2 * p, whirl: { x: cx, y: cy, r, th, dd, a: 0.25 + 0.4 * p } });
      } else if (hk && f.state === ST.ATTACK_ACTIVE && !f._hookHit) { // flying head
        const reach = f.hookReach(), front = f.x + (dd > 0 ? W : 0);
        const hx = front + dd * reach, hy = H.y;
        f._fh = { x: hx, y: hy };
        chains.push({ x0: H.x, y0: H.y, x1: hx, y1: hy, ang: dd > 0 ? 0 : Math.PI, slack: 5, phase: frame * 0.9, spin: frame * 0.75, trail: Math.min(110, reach + 20), glow: 0.3 });
        add({ kind: "spark", x: hx, y: hy, vx: -dd * rnd(1, 3.5), vy: rnd(-1.2, 1.2), life: 7, size: 1.7, drag: 0.9 });
        if (frame % 3 === 0) add({ kind: "smoke", x: hx - dd * 8, y: hy + rnd(-4, 4), vx: -dd * rnd(0.2, 0.8), vy: rnd(-0.4, 0.2), life: 14, size: rnd(3, 5), drag: 0.95 });
      } else if (hk && f.state === ST.ATTACK_RECOVERY && !f._hookHit) { // a miss: the chain is reeled back in
        const total = Math.max(1, f.hit.recovery), p = clamp((total - f.stateTimer) / (total * 0.55), 0, 1);
        if (p < 1) {
          const front = f.x + (dd > 0 ? W : 0), e = p * p, hx = front + dd * f.hit.range * (1 - e), hy = H.y;
          chains.push({ x0: H.x, y0: H.y, x1: hx, y1: hy, ang: dd > 0 ? 0 : Math.PI, slack: 16 * Math.sin(p * Math.PI) + 3, phase: frame * 0.7, spin: frame * 0.4 * (1 - p), glow: 0.15 });
        }
      }
    }
    if (f.blastFx) { // bomb explosion
      const bx = f.blastFx.x, by = f.blastFx.y; f.blastFx = null;
      add({ kind: "flare", x: bx, y: by, life: 11, size: 84, drag: 1 });
      ringFx(bx, by, 8, 80, 12, HOT, 4);
      ringFx(bx, by, 6, 150, 20, RED, 5);
      ringFx(bx, by + 24, 10, 170, 20, BLOOD, 4, 0.3);
      for (let i = 0; i < 24; i++) add({ kind: "spark", x: bx, y: by, vx: rnd(-10, 10), vy: rnd(-10, 5), life: 14 + (Math.random() * 10 | 0), size: rnd(1.8, 3.4), g: 0.2, drag: 0.93 });
      for (let i = 0; i < 8; i++) add({ kind: "smoke", x: bx + rnd(-12, 12), y: by + rnd(-12, 12), vx: rnd(-1.8, 1.8), vy: rnd(-1.8, 0), life: 28, size: rnd(9, 14), drag: 0.95 });
      for (let i = 0; i < 6; i++) add({ kind: "shard", x: bx, y: by, vx: rnd(-6, 6), vy: rnd(-7, -1), g: 0.3, rot: rnd(0, TAU), vr: rnd(-0.4, 0.4), life: 22, size: rnd(5, 9), drag: 0.97 });
      for (const k of [0, 1]) add({ kind: "gash", x: bx, y: by, ang: (k ? 0.9 : -0.9), len: 56, life: 16, drag: 1 });
      shake(10); flash(0.16, "#ffd0d8");
    }
  }

  // ═════════════ Death Sentence (ultimate) ═════════════
  // 1 CHARGE   blood-red power spirals into the raised hand, a rune circle opens at his feet, a lock-on reticle closes on the enemy
  //            (grey = out of range, red = it will lock).
  // 2 SEAL     the lock lands: flash, shake, a blood moon rises and the arena goes dark except around the victim. A huge sigil
  //            burns under him, glowing bands clamp his body, four illusions fade in and hook him with chains.
  // 3 EXECUTE  each illusion throws a shuriken (impact burst + cuts on every hit); then all four close in as the light goes white-hot...
  // 4 VERDICT  ...and the finishing blow: white flash, a double slash across the whole arena, shockwaves, blood, shattering illusions and
  //            the sentence seal stamped on the victim.
  function ultFx(f) {
    const s = f.stats, W = s.width, H = s.height, ST = MW.STATE;
    const h = f.hit, ult = !!(h && h.id === "death_sentence");
    // ── 1 CHARGE
    f._ultLv = 0;
    if (ult && f.state === ST.ATTACK_STARTUP) {
      const p = clamp(1 - f.stateTimer / Math.max(1, h.startup), 0, 1);
      f._ultLv = p;
      const dd = f.facing < 0 ? -1 : 1, cx = f.x + W / 2, hx = cx + dd * W * 0.1, hy = f.y - 4;
      const fl = f.y + H - 2;
      seals.push({ x: cx, y: fl, R: 28 + 42 * p, a: 0.35 + 0.55 * p, rot: frame * 0.05, small: true });
      if (frame % 2 === 0) { // spiral: motes fly in from a shrinking ring to the raised hand
        const a = rnd(0, TAU), r = (1 - p) * 70 + 26;
        add({ kind: "spark", x: hx + Math.cos(a) * r, y: hy + Math.sin(a) * r, vx: -Math.cos(a) * r * 0.16, vy: -Math.sin(a) * r * 0.16, life: 8, size: rnd(1.6, 2.6), drag: 1 });
      }
      if (frame % 3 === 0) add({ kind: "ember", x: cx + rnd(-W * 0.7, W * 0.7), y: fl - rnd(0, H * 0.5), vx: rnd(-0.3, 0.3), vy: rnd(-2.6, -1), g: -0.03, life: 20, size: rnd(2, 3.8), hot: true, drag: 0.98 });
      if (p > 0.55 && frame % 6 === 0) add({ kind: "flare", x: hx, y: hy, life: 7, size: 30 + 40 * p, drag: 1 });
      const foe = f.foe;
      if (foe && foe.state !== ST.KO) {
        const fx = foe.x + foe.stats.width / 2, fy = foe.y + foe.stats.height * 0.5;
        const L = h.lockOn, dx = fx - cx;
        const ok = !L || (Math.abs(dx) <= L.range && ((dx >= 0 ? 1 : -1) === f.facing || Math.abs(dx) < W));
        reticles.push({ x: fx, y: fy, p, ok, x0: hx, y0: f.y + H * 0.42 });
        dims.push({ a: 0.34 * p, x: fx, y: fy, r: 560 });
      }
    }
    // ── 2-4 the sentence itself
    const S = f.sentence;
    if (S) {
      const v = S.target, C = S.cfg;
      const vcx = v.x + v.stats.width / 2, vfeet = v.y + v.stats.height, vcy = v.y + v.stats.height * 0.45;
      const fadeIn = clamp(S.t / 10, 0, 1), fadeOut = S.done ? clamp(S.fade / (C.fadeTicks || 12), 0, 1) : 1;
      const a = fadeIn * fadeOut;
      let last = 0; for (const il of S.ills) last = Math.max(last, il.hitAt);
      const conv = S.done ? 1 : clamp((S.t - last) / Math.max(1, C.finishDelay), 0, 1), ease = conv * conv; // illusions close in before the verdict
      if (!f._senWas) { // the lock lands
        f._senWas = true; f._senDone = false;
        add({ kind: "flare", x: vcx, y: vcy, life: 12, size: 150, drag: 1 });
        ringFx(vcx, vcy, 10, 120, 14, "#ffffff", 5);
        ringFx(vcx, vfeet, 10, 240, 26, RED, 6, 0.3);
        ringFx(vcx, vfeet, 10, 170, 20, HOT, 3, 0.3);
        for (let i = 0; i < 26; i++) { const ang = rnd(0, TAU), sp = rnd(3, 10); add({ kind: "spark", x: vcx, y: vcy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 14 + (Math.random() * 8 | 0), size: rnd(1.8, 3), g: 0.1, drag: 0.93 }); }
        shake(13); flash(0.5, "#ffd0d8");
      }
      f._senDone = S.done;
      moons.push({ x: vcx, y: vfeet, a: a });
      dims.push({ a: Math.min(0.78, 0.6 * a + 0.12 * ease * a), x: vcx, y: vcy, r: 470 - 150 * ease });
      seals.push({ x: vcx, y: vfeet - 1, R: 150, a: a, rot: frame * 0.028, pulse: ease });
      if (!S.done) bands.push({ x: vcx, y: vfeet, w: v.stats.width, h: v.stats.height, a: fadeIn });
      if (!S.done && frame % 2 === 0) add({ kind: "ember", x: vcx + rnd(-90, 90), y: vfeet - rnd(0, 6), vx: rnd(-0.3, 0.3), vy: rnd(-3.4, -1.4), g: -0.03, life: 26, size: rnd(2, 4), hot: true, drag: 0.98 });
      const pts = [];
      S.ills.forEach((il, i) => {
        const k = 1 - 0.88 * ease;
        const ix = vcx + il.dx * k - W / 2, iy = vfeet - H + il.dy * k;
        const thrown = S.t >= il.throwAt, since = S.t - il.throwAt;
        let state = MW.STATE.ATTACK_STARTUP, hit = { pose: il.pose, startup: C.bindTicks, active: 8, recovery: 10 }, stateTimer = Math.max(1, C.bindTicks - S.t);
        if (thrown) { state = since < 8 ? MW.STATE.ATTACK_ACTIVE : MW.STATE.ATTACK_RECOVERY; stateTimer = since < 8 ? Math.max(1, 8 - since) : Math.max(1, 10 - (since - 8)); }
        if (S.t >= last + 2) { state = MW.STATE.ATTACK_ACTIVE; hit = { pose: il.pose, startup: 1, active: 14, recovery: 10 }; stateTimer = 9; } // winding up for the verdict
        const dir = il.dx <= 0 ? 1 : -1;
        clones.push({ f, key: f.id + ":ill" + i, x: ix, y: iy, vx: 0, vy: 0, facing: dir, state, grounded: true, hit, stateTimer, alpha: SENT_ALPHA * a, tint: true });
        const hx = ix + W / 2 + dir * W * 0.35, hy = iy + H * 0.42;
        pts.push({ x: ix + W / 2, y: iy + H * 0.5 });
        if (!S.done) {
          const reach = 1 - Math.pow(1 - clamp(S.t / 10, 0, 1), 3); // the hook flies out when the illusion appears, then the chain pulls taut
          const tx = vcx - dir * 5, ty = vcy + (il.dy ? -16 : 8);
          binds.push({ x0: hx, y0: hy, x1: hx + (tx - hx) * reach, y1: hy + (ty - hy) * reach, flying: reach < 1, a, i });
        }
        if (frame % 3 === 0 && !S.done) add({ kind: "smoke", x: ix + W / 2 + rnd(-8, 8), y: iy + H * rnd(0.5, 1), vx: rnd(-0.4, 0.4), vy: rnd(-1.4, -0.3), life: 22, size: rnd(5, 9), drag: 0.96 });
        if (thrown && !il.done && since <= C.flight) { // shuriken in flight: from the illusion to the victim
          const u = clamp(since / Math.max(1, C.flight), 0, 1), px = hx + (vcx - hx) * u, py = hy + (vcy - hy) * u;
          const u0 = Math.max(0, u - 0.4);
          stars.push({ x: px, y: py, x0: hx + (vcx - hx) * u0, y0: hy + (vcy - hy) * u0, rot: frame * 0.7 });
        }
        if (il.done && !il._fx) { // shuriken lands: cuts, blood, a small shockwave
          il._fx = true;
          const ang = il.dx <= 0 ? 1 : -1;
          slashBurst(vcx, vcy, ang, false);
          for (const q of [0, 1]) add({ kind: "gash", x: vcx + rnd(-8, 8), y: vcy + rnd(-18, 18), ang: (q ? 0.9 : -0.9) + rnd(-0.4, 0.4), len: 34, life: 16, drag: 1 });
          ringFx(vcx, vcy, 4, 52, 10, HOT, 3);
          for (let q = 0; q < 6; q++) add({ kind: "drop", x: vcx, y: vcy, vx: -ang * rnd(0.5, 4) + rnd(-1, 1), vy: rnd(-5, -0.5), life: 26, size: rnd(2, 4), g: 0.28, drag: 0.97 });
          shake(4);
        }
      });
      f._senPts = pts; f._senV = { x: vcx, y: vcy, feet: vfeet };
      if (S.done && !S._fx) { // ── 4 VERDICT
        S._fx = true;
        flash(0.9, "#ffffff"); shake(28);
        rends.push({ x: vcx, y: vcy, ang: -0.52, len: 1200, w: 34, age: -0, life: 24 });
        rends.push({ x: vcx, y: vcy, ang: 0.5, len: 1200, w: 26, age: -4, life: 24 });
        stamps.push({ x: vcx, y: vcy, age: 0, life: 46 });
        add({ kind: "flare", x: vcx, y: vcy, life: 14, size: 210, drag: 1 });
        ringFx(vcx, vcy, 10, 190, 16, "#ffffff", 8);
        ringFx(vcx, vcy, 10, 320, 24, RED, 7);
        ringFx(vcx, vfeet, 10, 420, 30, BLOOD, 6, 0.28);
        for (let i = 0; i < 46; i++) { const ang = rnd(0, TAU), sp = rnd(4, 14); add({ kind: "spark", x: vcx, y: vcy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 16 + (Math.random() * 10 | 0), size: rnd(1.8, 3.4), g: 0.12, drag: 0.94 }); }
        for (let i = 0; i < 34; i++) add({ kind: "drop", x: vcx + rnd(-14, 14), y: vcy + rnd(-30, 30), vx: rnd(-7, 7), vy: rnd(-9, -1), life: 34, size: rnd(2, 5), g: 0.3, drag: 0.97 });
        for (let i = 0; i < 6; i++) add({ kind: "gash", x: vcx + rnd(-14, 14), y: vcy + rnd(-34, 34), ang: rnd(-1.2, 1.2), len: rnd(40, 70), life: 24, drag: 1 });
        for (const q of pts) for (let i = 0; i < 12; i++) add({ kind: "shard", x: q.x, y: q.y + rnd(-26, 26), vx: rnd(-6, 6), vy: rnd(-7, 1), g: 0.25, rot: rnd(0, TAU), vr: rnd(-0.5, 0.5), life: 26, size: rnd(4, 9), drag: 0.97 });
      }
    } else if (f._senWas) { // the sequence ended (or was broken): leftover illusions dissolve
      f._senWas = false;
      if (!f._senDone && f._senPts) for (const q of f._senPts) { smoke(q.x, q.y, 6); for (let i = 0; i < 6; i++) add({ kind: "shard", x: q.x, y: q.y, vx: rnd(-4, 4), vy: rnd(-5, 0), g: 0.25, rot: rnd(0, TAU), vr: rnd(-0.4, 0.4), life: 20, size: rnd(4, 7), drag: 0.97 }); }
      f._senPts = null;
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

  function tick() {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx; p.y += p.vy; p.vx *= p.drag; p.vy *= p.drag; p.vy += p.g;
      if (p.vr) p.rot += p.vr;
      if (--p.life <= 0) parts.splice(i, 1);
    }
    for (let i = recoils.length - 1; i >= 0; i--) if (++recoils[i].t > recoils[i].life) recoils.splice(i, 1);
    for (let i = rends.length - 1; i >= 0; i--) if (++rends[i].age >= rends[i].life) rends.splice(i, 1);
    for (let i = stamps.length - 1; i >= 0; i--) if (++stamps[i].age >= stamps[i].life) stamps.splice(i, 1);
    for (let i = slashes.length - 1; i >= 0; i--) if (++slashes[i].age >= slashes[i].life) slashes.splice(i, 1);
    for (let i = ghosts.length - 1; i >= 0; i--) if (--ghosts[i].life <= 0) ghosts.splice(i, 1);
    for (let i = trails.length - 1; i >= 0; i--) if (!trails[i].live && --trails[i].life <= 0) trails.splice(i, 1);
  }

  // ─── drawing ──────────────────────────────────────────────────────
  // Red afterimages (drawn behind the fighters): the crouched Bloodlust silhouette with swept hair and a torn sash.
  function drawBehind(ctx) {
    if (dims.length || moons.length || seals.length) { // Death Sentence set dressing: dark arena, blood moon, rune circles on the floor
      ctx.save();
      drawDims(ctx);
      for (const m of moons) drawMoon(ctx, m);
      for (const sl of seals) drawSeal(ctx, sl);
      ctx.restore();
    }
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

  // ═════════════ chain / blade drawing ═════════════
  const STEEL = "#aeb4c2", IRON = "#30333c";
  // A chain of interlocking links from (x0,y0) to (x1,y1). o.slack = height (px) of a travelling wave (0 = taut, o.taut adds a faint
  // tremble), o.beads = energy beads running back toward the hand, o.glow = strength of the red glow underneath.
  function chainLine(ctx, x0, y0, x1, y1, o) {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    if (len < 3) return;
    const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    const n = Math.max(2, Math.round(len / 8.5)), slack = o.slack || 0, ph = o.phase || 0;
    const X = new Array(n + 1), Y = new Array(n + 1);
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      let w = slack ? Math.sin(u * Math.PI) * slack * Math.sin(u * 8 - ph) : 0;
      if (o.taut && i > 0 && i < n) w += Math.sin(frame * 2.1 + i * 1.7) * 0.8;
      X[i] = x0 + dx * u + nx * w; Y[i] = y0 + dy * u + ny * w;
    }
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (o.glow) { // red glow under the whole chain
      ctx.globalAlpha = o.glow * (o.a === undefined ? 1 : o.a); ctx.strokeStyle = RED; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(X[0], Y[0]); for (let i = 1; i <= n; i++) ctx.lineTo(X[i], Y[i]); ctx.stroke();
      ctx.lineWidth = 4; ctx.strokeStyle = HOT; ctx.globalAlpha *= 0.55;
      ctx.beginPath(); ctx.moveTo(X[0], Y[0]); for (let i = 1; i <= n; i++) ctx.lineTo(X[i], Y[i]); ctx.stroke();
    }
    ctx.globalAlpha = o.a === undefined ? 1 : o.a;
    for (let i = 1; i <= n; i++) { // alternating links: a flat ring, then one seen edge-on
      const px = X[i - 1], py = Y[i - 1], qx = X[i], qy = Y[i];
      const mx = (px + qx) / 2, my = (py + qy) / 2, ang = Math.atan2(qy - py, qx - px), L = Math.hypot(qx - px, qy - py);
      if (i % 2) {
        ctx.strokeStyle = IRON; ctx.lineWidth = 3.6; ctx.beginPath(); ctx.ellipse(mx, my, L * 0.78, 3.3, ang, 0, TAU); ctx.stroke();
        ctx.strokeStyle = STEEL; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(mx, my, L * 0.78, 3.3, ang, 0, TAU); ctx.stroke();
      } else {
        const ex = Math.cos(ang) * L * 0.5, ey = Math.sin(ang) * L * 0.5;
        ctx.strokeStyle = IRON; ctx.lineWidth = 4.4; ctx.beginPath(); ctx.moveTo(mx - ex, my - ey); ctx.lineTo(mx + ex, my + ey); ctx.stroke();
        ctx.strokeStyle = "#d9dde6"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(mx - ex, my - ey); ctx.lineTo(mx + ex, my + ey); ctx.stroke();
      }
    }
    if (o.beads) { // energy runs along the taut chain, victim -> hand
      for (let b = 0; b < o.beads; b++) {
        const u = 1 - ((frame * 0.07 + b / o.beads) % 1), i = Math.min(n, Math.round(u * n));
        ctx.globalAlpha = 0.9; ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(X[i], Y[i], 4.2, 0, TAU); ctx.fill();
        ctx.fillStyle = HOT; ctx.beginPath(); ctx.arc(X[i], Y[i], 2, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

  // The sickle head (kusarigama). Points along +x by `ang`; the blade always curves upward on screen. spin flips it edge-on while flying.
  function drawSickle(ctx, x, y, ang, scale, spin) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    if (Math.cos(ang) < 0) ctx.scale(1, -1);
    ctx.scale(scale || 1, (scale || 1) * (spin ? (0.35 + 0.65 * Math.abs(Math.cos(spin))) : 1));
    ctx.lineJoin = "round";
    ctx.strokeStyle = STEEL; ctx.lineWidth = 2.6; // chain ring
    ctx.beginPath(); ctx.arc(-5, 0, 4.4, 0, TAU); ctx.stroke();
    ctx.fillStyle = "#2b2e37"; ctx.strokeStyle = DARK; ctx.lineWidth = 2; // shaft
    ctx.beginPath(); ctx.rect(-1, -3, 14, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = RED; ctx.fillRect(4, -3, 2.4, 6);
    ctx.beginPath(); // blade
    ctx.moveTo(12, 1.5); ctx.quadraticCurveTo(36, 2, 29, -27); ctx.quadraticCurveTo(22, -12, 10, -5); ctx.closePath();
    ctx.fillStyle = "#d4d9e3"; ctx.fill(); ctx.strokeStyle = DARK; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = RED; ctx.lineWidth = 1.8; // glowing edge
    ctx.beginPath(); ctx.moveTo(14, 0.5); ctx.quadraticCurveTo(34, 1, 28, -25); ctx.stroke();
    ctx.fillStyle = "#e8ecf3"; ctx.beginPath(); ctx.moveTo(11, 3); ctx.lineTo(3, 9); ctx.lineTo(9, -1); ctx.closePath(); ctx.fill(); ctx.stroke(); // rear spike
    ctx.restore();
  }

  function drawBomb(ctx, x, y, t) { // the bomb stuck to the enemy: countdown ring closes in, blinks faster as it is about to go
    const blink = Math.sin(frame * (0.5 + 1.6 * t)) > 0;
    ctx.save();
    ctx.translate(x, y - 6);
    ctx.globalAlpha = 0.85; ctx.strokeStyle = RED; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.arc(0, 0, 40 - 24 * t, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#16161c"; ctx.strokeStyle = blink ? RED : "#555"; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = blink ? HOT : RED; ctx.beginPath(); ctx.arc(0, 0, 3.8, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#caa"; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.quadraticCurveTo(6, -18, 11, -15); ctx.stroke();
    ctx.restore();
  }

  function drawChain(ctx, c) {
    const len = Math.hypot(c.x1 - c.x0, c.y1 - c.y0);
    if (len < 3) return;
    if (c.whirl) { // faint circle the head has just swept
      const w = c.whirl;
      ctx.save(); ctx.globalAlpha = w.a; ctx.strokeStyle = RED; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.ellipse(w.x, w.y, w.r, w.r * 0.85, 0, w.th - w.dd * 1.9, w.th, w.dd < 0); ctx.stroke(); ctx.restore();
    }
    if (c.trail) { // streak behind the flying head
      const ux = (c.x0 - c.x1) / len, uy = (c.y0 - c.y1) / len, L = Math.min(c.trail, len), nx = -uy, ny = ux;
      ctx.save();
      ctx.fillStyle = "rgba(255,30,60,0.42)";
      ctx.beginPath(); ctx.moveTo(c.x1, c.y1 - ny * 9); ctx.lineTo(c.x1 + ux * L, c.y1 + uy * L); ctx.lineTo(c.x1 + nx * 9, c.y1 + ny * 9); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(255,225,230,0.8)"; ctx.lineWidth = 2; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(c.x1, c.y1); ctx.lineTo(c.x1 + ux * L * 0.7, c.y1 + uy * L * 0.7); ctx.stroke();
      ctx.restore();
    }
    chainLine(ctx, c.x0, c.y0, c.x1, c.y1, c);
    drawSickle(ctx, c.x1, c.y1, c.ang, c.scale, c.spin);
    if (c.bomb >= 0) drawBomb(ctx, c.x1, c.y1, c.bomb);
  }

  function drawRecoil(ctx, r) { // the chain whips back to the hand
    const f = r.f, H = handOf(f), u = clamp(r.t / r.life, 0, 1), e = u * u;
    const x = r.x + (H.x - r.x) * e, y = r.y + (H.y - r.y) * e;
    const ang = Math.atan2(y - H.y, x - H.x);
    ctx.save(); ctx.globalAlpha = 1 - u * 0.4;
    chainLine(ctx, H.x, H.y, x, y, { slack: 16 * (1 - u), phase: frame * 0.8, glow: 0.25 });
    drawSickle(ctx, x, y, ang, 1, frame * 0.5 * (1 - u));
    ctx.restore();
  }

  function drawBind(ctx, b) { // Death Sentence: an illusion's hook chain, flying out then taut
    if (Math.hypot(b.x1 - b.x0, b.y1 - b.y0) < 4) return;
    chainLine(ctx, b.x0, b.y0, b.x1, b.y1, { slack: b.flying ? 6 : 0, taut: !b.flying, phase: frame * 0.9, beads: b.flying ? 0 : 3, glow: 0.35, a: b.a });
    ctx.save(); ctx.globalAlpha = b.a;
    drawSickle(ctx, b.x1, b.y1, Math.atan2(b.y1 - b.y0, b.x1 - b.x0), 0.72, b.flying ? frame * 0.8 : 0);
    ctx.restore();
  }

  function drawStar(ctx, s) { // big glowing shuriken with a streak behind it
    const dx = s.x - s.x0, dy = s.y - s.y0, len = Math.hypot(dx, dy);
    if (len > 2) {
      const nx = -dy / len, ny = dx / len;
      ctx.save(); ctx.fillStyle = "rgba(255,30,60,0.5)";
      ctx.beginPath(); ctx.moveTo(s.x + nx * 6, s.y + ny * 6); ctx.lineTo(s.x0, s.y0); ctx.lineTo(s.x - nx * 6, s.y - ny * 6); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    ctx.save();
    ctx.translate(s.x, s.y); ctx.rotate(s.rot);
    ctx.fillStyle = "#d9dde6"; ctx.strokeStyle = DARK; ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const r = i % 2 ? 5 : 15, a = (i / 8) * TAU; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ═════════════ ultimate: world dressing ═════════════
  function drawDims(ctx) {
    for (const d of dims) {
      if (d.a <= 0.003) continue;
      const gr = ctx.createRadialGradient(d.x, d.y, d.r * 0.22, d.x, d.y, d.r);
      gr.addColorStop(0, "rgba(14,0,8,0)"); gr.addColorStop(1, "rgba(14,0,8," + d.a.toFixed(3) + ")");
      ctx.fillStyle = gr; ctx.fillRect(-3000, -3000, 8000, 8000);
    }
  }
  function drawMoon(ctx, m) { // "execution cage": a dark beam over the victim and chains falling from the sky around the sigil
    if (m.a <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = m.a * 0.5;
    const beam = ctx.createLinearGradient(m.x, m.y - 900, m.x, m.y);
    beam.addColorStop(0, "rgba(255,40,70,0)"); beam.addColorStop(1, "rgba(255,40,70,0.28)");
    ctx.fillStyle = beam; ctx.fillRect(m.x - 85, m.y - 900, 170, 900);
    ctx.restore();
    const drop = 1 - Math.pow(1 - clamp(m.a, 0, 1), 3), top = m.y - 120 - 800 * drop;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * TAU + frame * 0.004, px = m.x + Math.cos(ang) * 135, py = m.y + Math.sin(ang) * 135 * 0.3;
      chainLine(ctx, px, top, px, py, { a: m.a * (0.55 + 0.35 * Math.sin(ang)), taut: true, glow: 0.18 });
    }
  }
  function drawSeal(ctx, s) { // rune circle lying on the floor (squashed into perspective)
    if (s.a <= 0.01) return;
    const R = s.R, pulse = 1 + (s.pulse || 0) * 0.08 * Math.sin(frame * 0.6);
    ctx.save();
    ctx.translate(s.x, s.y); ctx.scale(1, 0.3); ctx.rotate(s.rot);
    ctx.globalAlpha = s.a; ctx.lineCap = "round"; ctx.strokeStyle = RED;
    ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, R * pulse, 0, TAU); ctx.stroke();
    ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(0, 0, R * 0.86 * pulse, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, R * 0.55, 0, TAU); ctx.stroke();
    if (!s.small) {
      for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.88, Math.sin(a) * R * 0.88); ctx.lineTo(Math.cos(a) * R * (i % 2 ? 0.97 : 1.0), Math.sin(a) * R * (i % 2 ? 0.97 : 1.0)); ctx.stroke(); }
      for (const off of [0, Math.PI / 6]) { // two triangles = six-pointed star
        ctx.beginPath();
        for (let k = 0; k < 3; k++) { const a = off + k * TAU / 3 - Math.PI / 2; ctx.lineTo(Math.cos(a) * R * 0.82, Math.sin(a) * R * 0.82); }
        ctx.closePath(); ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,30,60,0.22)"; ctx.beginPath(); ctx.arc(0, 0, R * 0.55, 0, TAU); ctx.fill();
    } else {
      for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + Math.PI / 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.2, Math.sin(a) * R * 0.2); ctx.lineTo(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95); ctx.stroke(); }
    }
    ctx.restore();
  }
  function drawBands(ctx, b) { // glowing restraint bands clamped around the victim
    ctx.save();
    ctx.globalAlpha = b.a; ctx.lineCap = "round";
    const rows = [[b.y - 7, 0.82], [b.y - b.h * 0.5, 0.95], [b.y - b.h * 0.86, 0.75]];
    rows.forEach((r, i) => {
      const rx = b.w * r[1] + 4 + 2 * Math.sin(frame * 0.2 + i), ry = 6;
      ctx.strokeStyle = BLOOD; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(b.x, r[0], rx, ry, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = RED; ctx.lineWidth = 2.6; ctx.setLineDash([9, 6]); ctx.lineDashOffset = -frame * (i % 2 ? 1.6 : -1.6);
      ctx.beginPath(); ctx.ellipse(b.x, r[0], rx, ry, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    });
    ctx.restore();
  }
  function drawReticle(ctx, r) { // lock-on while the ultimate charges: red = will lock, grey = out of range
    const col = r.ok ? RED : "#8a7a80", R = 74 - 40 * r.p;
    ctx.save();
    ctx.globalAlpha = 0.25 + 0.6 * r.p; ctx.strokeStyle = col; ctx.lineCap = "round";
    ctx.setLineDash([8, 7]); ctx.lineWidth = 1.6; // line from the Wraith's hand to the enemy
    ctx.beginPath(); ctx.moveTo(r.x0, r.y0); ctx.lineTo(r.x, r.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.translate(r.x, r.y); ctx.rotate(frame * (r.ok ? 0.08 : 0.02));
    ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    ctx.lineWidth = 3.4;
    for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(R - 5, 0); ctx.lineTo(R + 13, 0); ctx.stroke(); }
    if (r.ok && r.p > 0.85) { ctx.globalAlpha = (r.p - 0.85) / 0.15 * 0.6; ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(0, 0, R * 0.5, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  function drawRend(ctx, r) { // the verdict: a razor-thin slash that cuts across the whole arena, then fades
    const age = r.age; if (age < 0) return;
    const sweep = clamp((age + 1) / 3, 0, 1), fade = age < 4 ? 1 : clamp(1 - (age - 4) / (r.life - 4), 0, 1);
    if (fade <= 0.01) return;
    const dx = Math.cos(r.ang), dy = Math.sin(r.ang), half = r.len / 2, N = 16;
    const x0 = r.x - dx * half, y0 = r.y - dy * half;
    ctx.save();
    for (const layer of [[1, "rgba(255,20,50,0.85)"], [0.4, "#ffffff"]]) {
      ctx.fillStyle = layer[1]; ctx.globalAlpha = fade;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) { const u = i / N, w = r.w * layer[0] * Math.pow(Math.sin(Math.PI * u), 0.7) * (1 - 0.3 * (age / r.life)); ctx.lineTo(x0 + dx * r.len * u * sweep - dy * w / 2, y0 + dy * r.len * u * sweep + dx * w / 2); }
      for (let i = N; i >= 0; i--) { const u = i / N, w = r.w * layer[0] * Math.pow(Math.sin(Math.PI * u), 0.7) * (1 - 0.3 * (age / r.life)); ctx.lineTo(x0 + dx * r.len * u * sweep + dy * w / 2, y0 + dy * r.len * u * sweep - dx * w / 2); }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function drawStamp(ctx, st) { // the sentence seal stamped over the victim
    const k = st.age / st.life, pop = st.age < 5 ? 1.7 - 0.7 * (st.age / 5) : 1, fade = k < 0.55 ? 1 : clamp(1 - (k - 0.55) / 0.45, 0, 1);
    ctx.save();
    ctx.translate(st.x, st.y); ctx.scale(pop, pop); ctx.globalAlpha = fade * 0.9; ctx.lineCap = "round";
    ctx.strokeStyle = RED; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, 64, 0, TAU); ctx.stroke();
    ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(0, 0, 52, 0, TAU); ctx.stroke();
    ctx.rotate(-0.5); ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(-74, 0); ctx.lineTo(74, 0); ctx.stroke();
    ctx.strokeStyle = HOT; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(-74, 0); ctx.lineTo(74, 0); ctx.stroke();
    ctx.restore();
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
    for (const b of bands) drawBands(ctx, b);
    for (const r of recoils) drawRecoil(ctx, r);
    for (const c of chains) drawChain(ctx, c);
    for (const s of stars) drawStar(ctx, s);
    for (const r of reticles) drawReticle(ctx, r);
    for (const m of marks) drawMark(ctx, m);
    for (const s of slashes) drawSlash(ctx, s);
    for (const r of rends) drawRend(ctx, r);
    for (const st of stamps) drawStamp(ctx, st);
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
      } else if (p.kind === "ring") { // expanding shockwave ring (sy squashes it into a floor ellipse)
        const k = 1 - a, e = 1 - (1 - k) * (1 - k), r = p.r0 + (p.r1 - p.r0) * e;
        ctx.globalAlpha = a; ctx.strokeStyle = p.col; ctx.lineWidth = Math.max(0.8, p.lw * a);
        ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * p.sy, 0, 0, TAU); ctx.stroke();
      } else if (p.kind === "shard") { // spinning crimson / white splinter
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, a * 1.5);
        ctx.fillStyle = p.size > 6 ? RED : HOT; ctx.strokeStyle = DARK; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(p.size, 0); ctx.lineTo(-p.size * 0.5, p.size * 0.35); ctx.lineTo(-p.size * 0.3, -p.size * 0.4); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
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
    const v = Math.max(f._frenzy || 0, f._chargeLv || 0, f._ultLv || 0);
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

  MW.AssassinFx = { TUNE, event, update, tick, drawBehind, draw, drawAura, frenzyOf: (id) => frenzy[id] || 0, _parts: parts, _slashes: slashes, _ghosts: ghosts, _recoils: recoils, _rends: rends, _stamps: stamps };
})(globalThis);