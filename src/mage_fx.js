// Mechanic Wars - Void Mage effects. VISUAL ONLY: the sim never reads this file.
// Gravity wells, dark liquid and dimensional energy: a dark underlay (so it reads on bright
// stages) with electric-purple light on top. All sizes and timings are in the TUNE block below.
//
// What it draws:
//   - aura:    obsidian shards orbit the Mage, smoke and drips dissolve off the body and claws,
//              gravity rings are drawn into the chest singularity
//   - cast:    a spinning gravity vortex opens where the bolt will appear; energy is sucked in
//   - fire:    inward-collapsing ring + flash, dark drops thrown forward
//   - bolt:    a black singularity with a tilted accretion ring, lensing arcs and a liquid tail
//   - impact:  collapse then burst: dark blob, contracting + expanding rings, sparks, drops
//   - fizzle:  the singularity folds in on itself
(function (g) {
  const MW = (g.MW = g.MW || {});
  const TAU = Math.PI * 2;

  const TUNE = {
    maxParticles: 260,
    circleRadius: 30, // magic circle radius at full charge (px)
    shardCount: 3, // obsidian shards orbiting the Mage
    tailLength: 70, // bolt comet tail (px)
    helixLength: 58,
    impactSparks: 16,
  };

  const LIGHT = "#e6bcff";
  const MID = "#b44bff"; // electric purple
  const DEEP = "#14082b"; // obsidian violet (dark underlays)
  const GOLD = "#f1dcff"; // pale violet-white accent (name kept from the old palette)
  const WHITE = "#ffffff";

  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const nowSec = () => (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;

  // ─── tiny shape helpers ───────────────────────────────────────────
  function starPath(ctx, x, y, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = rot + (i * Math.PI) / 4;
      const rr = i % 2 ? r * 0.22 : r;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  // Three little rune glyphs (kind 0, 1, 2). Stroked, so they stay thin and clean.
  function runePath(ctx, s, kind) {
    ctx.beginPath();
    if (kind === 0) {
      ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.7, 0); ctx.closePath();
      ctx.moveTo(0, -s * 0.45); ctx.lineTo(0, s * 0.45);
    } else if (kind === 1) {
      ctx.moveTo(0, -s); ctx.lineTo(s * 0.9, s * 0.7); ctx.lineTo(-s * 0.9, s * 0.7); ctx.closePath();
      ctx.moveTo(s * 0.18, 0); ctx.arc(0, 0, s * 0.18, 0, TAU);
    } else {
      ctx.arc(0, 0, s * 0.8, 0, TAU);
      ctx.moveTo(-s * 0.8, 0); ctx.lineTo(s * 0.8, 0);
      ctx.moveTo(0, -s * 0.8); ctx.lineTo(0, s * 0.8);
    }
  }

  function drawRune(ctx, x, y, s, kind, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    runePath(ctx, s, kind);
    ctx.stroke();
    ctx.restore();
  }

  function glow(ctx, x, y, r, inner, outer) {
    const rr = Math.max(0.5, r);
    const gr = ctx.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, inner);
    gr.addColorStop(1, outer);
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, TAU);
    ctx.fill();
  }

  // ─── particle pool (additive) ─────────────────────────────────────
  // kinds: dot | star | ring | rune | flash
  const pool = [];
  function add(p) {
    if (pool.length >= TUNE.maxParticles) pool.shift();
    p.max = p.life;
    p.rot = p.rot || 0;
    p.vr = p.vr || 0;
    p.drag = p.drag === undefined ? 0.95 : p.drag;
    p.g = p.g || 0;
    p.grow = p.grow || 0;
    pool.push(p);
  }
  const dot = (x, y, vx, vy, life, size, color, o) => add(Object.assign({ kind: "dot", x, y, vx, vy, life, size, color }, o));

  function tick() {
    for (let i = pool.length - 1; i >= 0; i--) {
      const p = pool[i];
      p.x += p.vx; p.y += p.vy;
      p.vx *= p.drag; p.vy *= p.drag;
      p.vy += p.g;
      p.rot += p.vr;
      p.size += p.grow;
      if (--p.life <= 0) pool.splice(i, 1);
    }
  }

  function draw(ctx) {
    if (!pool.length) return;
    ctx.save();
    ctx.lineCap = "round";
    for (const p of pool) {
      const a = clamp(p.life / p.max, 0, 1);
      if (p.kind === "dot") {
        ctx.globalAlpha = a * 0.35; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 2 * a + 0.5, 0, TAU); ctx.fill();
        ctx.globalAlpha = a * 0.95;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a + 0.3, 0, TAU); ctx.fill();
      } else if (p.kind === "star") {
        ctx.globalAlpha = a; ctx.fillStyle = p.color;
        starPath(ctx, p.x, p.y, p.size * (0.4 + 0.6 * a), p.rot); ctx.fill();
      } else if (p.kind === "ring") {
        ctx.globalAlpha = a * 0.9; ctx.strokeStyle = p.color; ctx.lineWidth = 0.8 + 3 * a;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, p.size), 0, TAU); ctx.stroke();
      } else if (p.kind === "void") { // a drop / wisp of dark liquid with a violet rim
        ctx.globalAlpha = a;
        ctx.fillStyle = "#07040f"; ctx.strokeStyle = "rgba(160,80,255,0.6)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * a) + 0.6, 0, TAU); ctx.fill(); ctx.stroke();
      } else if (p.kind === "blob") { // soft dark mass (collapse before an impact bursts)
        ctx.globalAlpha = a * 0.9;
        glow(ctx, p.x, p.y, Math.max(1, p.size), "rgba(8,3,20,0.95)", "rgba(50,16,110,0)");
      } else if (p.kind === "rune") {
        ctx.globalAlpha = a * 0.9; ctx.strokeStyle = p.color; ctx.lineWidth = 1.6;
        drawRune(ctx, p.x, p.y, p.size, p.glyph || 0, p.rot);
      } else if (p.kind === "flash") {
        ctx.globalAlpha = a * 0.6; ctx.fillStyle = DEEP; // dark halo so the flash shows on bright stages
        glow(ctx, p.x, p.y, p.size * 0.9 * a + 1, "rgba(110,60,210,0.8)", "rgba(75,42,150,0)");
        ctx.globalAlpha = a; ctx.fillStyle = p.color;
        starPath(ctx, p.x, p.y, p.size * (0.5 + 0.5 * a), p.rot); ctx.fill();
        ctx.globalCompositeOperation = "lighter";
        glow(ctx, p.x, p.y, p.size * 0.8 * a + 1, "rgba(255,255,255,0.9)", "rgba(190,150,255,0)");
        ctx.globalCompositeOperation = "source-over";
      }
    }
    ctx.restore();
  }

  // ─── events from the sim (sim.fx) ─────────────────────────────────
  const inward = (x, y, n, r0, r1, life, color) => { // motes pulled into a point
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, r = rnd(r0, r1);
      dot(x + Math.cos(a) * r, y + Math.sin(a) * r, (-Math.cos(a) * r) / life, (-Math.sin(a) * r) / life, life, rnd(1.4, 2.6), color(i), { drag: 1 });
    }
  };
  const drops = (x, y, n, vx0, vx1, vy0, vy1) => {
    for (let i = 0; i < n; i++) add({ kind: "void", x, y, vx: rnd(vx0, vx1), vy: rnd(vy0, vy1), life: 20 + (Math.random() * 16 | 0), size: rnd(1.8, 3.4), g: 0.12, drag: 0.95 });
  };
  function event(ev) {
    if (!ev || ev.style !== "arcane") return;
    const { x, y, dir } = ev;
    if (ev.type === "fire") {
      add({ kind: "blob", x, y, vx: 0, vy: 0, life: 12, size: 14, grow: 1.2, drag: 1 });
      add({ kind: "ring", x, y, vx: 0, vy: 0, life: 12, size: 30, grow: -2.3, color: LIGHT, drag: 1 }); // gravity pulls in
      add({ kind: "flash", x, y, vx: 0, vy: 0, life: 7, size: 22, color: WHITE, rot: Math.PI / 8, drag: 1 });
      inward(x, y, 8, 26, 42, 12, (i) => (i % 3 ? MID : LIGHT));
      drops(x, y, 6, dir * 2, dir * 6, -2, 1);
    } else if (ev.type === "hit") {
      add({ kind: "blob", x, y, vx: 0, vy: 0, life: 16, size: 12, grow: 2.2, drag: 1 });
      add({ kind: "ring", x, y, vx: 0, vy: 0, life: 12, size: 38, grow: -2.8, color: LIGHT, drag: 1 }); // collapse...
      add({ kind: "ring", x, y, vx: 0, vy: 0, life: 18, size: 6, grow: 3.8, color: MID, drag: 1 }); // ...then burst
      add({ kind: "flash", x, y, vx: 0, vy: 0, life: 9, size: 34, color: WHITE, rot: Math.PI / 8, drag: 1 });
      for (let i = 0; i < TUNE.impactSparks; i++) {
        const a = (i / TUNE.impactSparks) * TAU + rnd(-0.2, 0.2), sp = rnd(2, 7);
        dot(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 18 + (Math.random() * 14 | 0), rnd(1.6, 3.2), i % 3 ? MID : LIGHT, { drag: 0.92, g: 0.04 });
      }
      drops(x, y, 8, -3, 3, -4, -0.5);
      for (let i = 0; i < 3; i++) add({ kind: "star", x: x + rnd(-10, 10), y: y + rnd(-10, 10), vx: rnd(-1, 1), vy: rnd(-1.4, -0.3), life: 28, size: rnd(4, 7), color: i % 2 ? GOLD : MID, vr: rnd(-0.12, 0.12), drag: 0.97 });
    } else if (ev.type === "fizzle") {
      add({ kind: "ring", x, y, vx: 0, vy: 0, life: 14, size: 16, grow: -1.1, color: MID, drag: 1 });
      add({ kind: "blob", x, y, vx: 0, vy: 0, life: 12, size: 10, grow: -0.5, drag: 1 });
      inward(x, y, 8, 12, 22, 14, (i) => (i % 2 ? LIGHT : MID));
      drops(x, y, 3, -1, 1, -1, 1);
    }
  }

  // ─── bolt ─────────────────────────────────────────────────────────
  // A singularity: black sphere, tilted accretion ring (back half behind it, front half over it),
  // lensing arcs and a tail of dark liquid. Drawn at the projectile position (p.x, p.y).
  function drawBolt(ctx, p) {
    const t = nowSec();
    const dir = p.dir, x = p.x, y = p.y;
    const R = (p.size / 2) * 1.5; // drawn a bit bigger than the hitbox on purpose
    const pulse = 0.5 + 0.5 * Math.sin(t * 14);
    const L = TUNE.tailLength;
    const tilt = 0.45 * dir + Math.sin(t * 2.6) * 0.12;
    const rx = R * 2.15, ry = R * 0.62;

    ctx.save();
    ctx.lineCap = "round";

    // 1) dark liquid tail (normal blending: stays visible on bright stages)
    const N = 12, top = [], bot = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, px = x - dir * u * L, w = R * (1.0 * (1 - u) + 0.12), wob = Math.sin(t * 14 - u * 7) * R * 0.4 * u;
      top.push([px, y - w + wob]); bot.push([px, y + w + wob]);
    }
    ctx.beginPath();
    ctx.moveTo(top[0][0], top[0][1]);
    for (let i = 1; i <= N; i++) ctx.lineTo(top[i][0], top[i][1]);
    for (let i = N; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
    ctx.closePath();
    const tg = ctx.createLinearGradient(x, 0, x - dir * L, 0);
    tg.addColorStop(0, "rgba(10,4,24,0.95)");
    tg.addColorStop(1, "rgba(40,14,90,0)");
    ctx.fillStyle = tg;
    ctx.fill();

    // 2) gravity halo
    glow(ctx, x, y, R * 3.2, "rgba(30,10,70,0.8)", "rgba(60,20,130,0)");

    // 3) additive light: lensing arcs + back half of the accretion ring
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = MID;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      const a0 = t * (3 + i) * dir + i * 2.1, rr = R * (1.75 + 0.38 * i) + pulse * 1.2;
      ctx.globalAlpha = 0.5 - i * 0.1;
      ctx.beginPath(); ctx.arc(x, y, rr, a0, a0 + 1.1); ctx.stroke();
    }
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = MID;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, tilt, Math.PI, TAU); ctx.stroke();
    ctx.globalCompositeOperation = "source-over";

    // 4) the black sphere with a thin bright rim (the event horizon)
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#020106";
    ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = LIGHT; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();

    // 5) front half of the accretion ring, bright, crossing over the sphere
    ctx.globalCompositeOperation = "lighter";
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? WHITE : MID;
      ctx.lineWidth = pass ? 1.2 : 3.4;
      ctx.globalAlpha = pass ? 0.95 : 0.8;
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, tilt, 0, Math.PI); ctx.stroke();
    }
    ctx.globalAlpha = 0.5 + 0.25 * pulse;
    glow(ctx, x, y, R * 2.6 + pulse * 2, "rgba(170,80,255,0.45)", "rgba(130,50,255,0)");
    ctx.restore();

    // trailing dark drops + violet motes, and the odd mote being pulled in
    if (Math.random() < 0.7) {
      if (Math.random() < 0.45) add({ kind: "void", x: x - dir * rnd(4, 16), y: y + rnd(-6, 6), vx: -dir * rnd(0.2, 1), vy: rnd(-0.2, 0.6), life: 20, size: rnd(1.4, 2.6), g: 0.05, drag: 0.96 });
      else dot(x - dir * rnd(4, 14), y + rnd(-6, 6), -dir * rnd(0.3, 1.4), rnd(-0.5, 0.5), 18 + (Math.random() * 10 | 0), rnd(1.2, 2.2), Math.random() < 0.5 ? MID : LIGHT, { drag: 0.95 });
    }
    if (Math.random() < 0.25) {
      const a = Math.random() * TAU, r = R * 3.4;
      dot(x + Math.cos(a) * r, y + Math.sin(a) * r, -Math.cos(a) * 0.9 + (p.vx || 0) * 0, -Math.sin(a) * 0.9, 8, rnd(1.2, 2), LIGHT, { drag: 1 });
    }
  }

  // ─── gravity vortex (replaces the old magic circle) ───────────────
  function drawCircle(ctx, x, y, R, rot, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineCap = "round";
    // dark well
    ctx.globalAlpha = 0.9 * alpha;
    glow(ctx, 0, 0, R * 1.15, "rgba(6,2,14,0.95)", "rgba(50,16,110,0)");
    // three spiral arms: dark underlay first, bright line on top
    for (let pass = 0; pass < 2; pass++) {
      if (pass) ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = pass ? MID : DEEP;
      ctx.lineWidth = pass ? 1.8 : 3.6;
      ctx.globalAlpha = (pass ? 1 : 0.7) * alpha;
      for (let arm = 0; arm < 3; arm++) {
        ctx.beginPath();
        for (let st = 0; st <= 14; st++) {
          const u = st / 14, r = R * (1 - u * 0.88), a = rot * 1.4 + (arm * TAU) / 3 + u * 2.8;
          if (st === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.stroke();
      }
    }
    // rim + inward ticks
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = LIGHT; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1.3;
    for (let i = 0; i < 6; i++) {
      const a = -rot * 0.6 + (i * TAU) / 6;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 1.18, Math.sin(a) * R * 1.18); ctx.lineTo(Math.cos(a) * R * 0.98, Math.sin(a) * R * 0.98); ctx.stroke();
    }
    // black core
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#020106";
    ctx.beginPath(); ctx.arc(0, 0, R * 0.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = LIGHT; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.2, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  // ─── per-fighter effects (aura, hand glow, cast vortex) ───────────
  // Called once per frame inside the fighter's interpolation transform.
  function drawFighter(ctx, f) {
    const S = MW.STATE;
    const s = f.stats;
    if (f.state === S.KO) return;
    const t = nowSec();
    const cx = f.x + s.width / 2, cy = f.y + s.height * 0.5;
    const casting = f.state === S.ATTACK_STARTUP && f.hit && f.hit.type === "projectile";
    const windU = casting ? clamp(1 - f.stateTimer / Math.max(1, f.hit.startup), 0, 1) : 0;
    const stunned = f.state === S.HITSTUN;
    const power = stunned ? 0.15 : 0.35 + 0.65 * windU; // how strong the aura is right now

    // spawn point of the bolt (same rule as projectiles.js) = where the vortex opens
    const px = f.facing > 0 ? f.x + s.width + 18 : f.x - 18;
    const py = f.y + s.height * 0.4;
    const orb = (f._art && f._art.orb) || [cx + f.facing * (s.width * 0.6), f.y + s.height * 0.2];
    const core = (f._art && f._art.core) || [cx, f.y + s.height * 0.45];

    // glow around the casting hand (additive)
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const pulse = 0.5 + 0.5 * Math.sin(t * 6 + f.id);
    ctx.globalAlpha = 0.3 + 0.55 * windU;
    glow(ctx, orb[0], orb[1], 9 + 16 * windU + 2 * pulse, "rgba(214,160,255,0.9)", "rgba(140,50,255,0)");
    ctx.restore();

    // obsidian shards orbiting the body (normal blending, violet rim)
    ctx.save();
    ctx.lineWidth = 1.2;
    const speed = 1.0 + 3.0 * windU;
    const rx = s.width * 0.95 - 8 * windU, ry = s.height * 0.44;
    for (let i = 0; i < TUNE.shardCount; i++) {
      const a = t * speed + (i * TAU) / TUNE.shardCount;
      const z = Math.sin(a); // front (+) or behind (-)
      const sz = 2.6 + 1.1 * z + 1.6 * windU;
      const sx = cx + Math.cos(a) * rx, sy = cy + (i - 1) * ry * 0.5 + z * 7;
      ctx.save();
      ctx.translate(sx, sy); ctx.rotate(t * 1.5 + i);
      ctx.globalAlpha = clamp((0.35 + 0.5 * (z * 0.5 + 0.5)) * power * 1.6, 0, 0.95);
      ctx.fillStyle = "#0c0a14"; ctx.strokeStyle = MID;
      ctx.beginPath(); ctx.moveTo(0, -sz * 1.5); ctx.lineTo(sz, 0); ctx.lineTo(0, sz * 1.5); ctx.lineTo(-sz, 0); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // gravity rings drawn into the chest singularity
    if (!stunned && Math.random() < 0.02 + 0.08 * windU) add({ kind: "ring", x: core[0], y: core[1], vx: 0, vy: 0, life: 16, size: 20, grow: -1.15, color: MID, drag: 1 });

    // smoke dissolving off the body, violet motes, drips from the claws
    if (!stunned && Math.random() < 0.12 + 0.3 * windU) {
      const r = Math.random();
      const bx = cx + rnd(-s.width * 0.6, s.width * 0.4) - f.facing * 3, by = f.y + rnd(s.height * 0.2, s.height * 0.95);
      if (r < 0.5) add({ kind: "void", x: bx, y: by, vx: -f.facing * rnd(0.1, 0.6), vy: rnd(-0.7, -0.2), life: 26 + (Math.random() * 14 | 0), size: rnd(1.0, 2.0), drag: 0.97 });
      else if (r < 0.8) dot(bx, by, -f.facing * rnd(0.1, 0.5), rnd(-0.9, -0.3), 24 + (Math.random() * 12 | 0), rnd(1.2, 2.2), Math.random() < 0.5 ? MID : LIGHT, { drag: 0.97 });
      else add({ kind: "void", x: orb[0] + rnd(-3, 3), y: orb[1] + rnd(0, 4), vx: rnd(-0.2, 0.2), vy: rnd(0.2, 0.8), life: 26, size: rnd(1.4, 2.4), g: 0.12, drag: 0.98 });
    }

    if (casting) {
      // spinning gravity vortex that opens where the bolt will appear
      const e = 1 - Math.pow(1 - windU, 2);
      drawCircle(ctx, px, py, 6 + (TUNE.circleRadius - 6) * e, t * 3 + windU * 4, 0.35 + 0.6 * windU);
      // energy is sucked into the vortex
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * TAU, d = rnd(34, 62);
        const sx = px + Math.cos(a) * d, sy = py + Math.sin(a) * d;
        dot(sx, sy, (px - sx) / 13, (py - sy) / 13, 13, rnd(1.4, 2.6), Math.random() < 0.3 ? GOLD : MID, { drag: 1 });
      }
    }
  }

  MW.MageFx = { TUNE, tick, draw, event, drawBolt, drawFighter, _pool: pool };
})(globalThis);
