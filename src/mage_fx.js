// Mechanic Wars - Void Mage effects. VISUAL ONLY: the sim never reads this file.
// (Skill effects - wraiths, transit, spikes, grasp, execution, overload pips, singularity charge - are in the VOID MAGE SKILL EFFECTS block.)
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
    if (ev.type === "void") return voidEvent(ev); // Void Mage skills / passive / ultimate one-shots (see the VOID MAGE SKILL EFFECTS block)
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
    const kind = p.kind || (p.hit && p.hit.projectile && p.hit.projectile.kind) || "shard"; // shard | singularity | orb
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

    if (kind === "singularity" || kind === "orb") { // heavier shots: contracting gravity rings (and, for the orb, orbiting shards + lightning)
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = LIGHT; ctx.lineWidth = 1.2;
      for (let i = 0; i < 2; i++) { const k = (t * 1.6 + i * 0.5) % 1; ctx.globalAlpha = 0.5 * (1 - k); ctx.beginPath(); ctx.arc(x, y, R * (3.6 - 2.4 * k), 0, TAU); ctx.stroke(); }
      if (kind === "orb") {
        ctx.fillStyle = LIGHT; ctx.strokeStyle = MID; ctx.lineWidth = 1;
        for (let i = 0; i < 6; i++) { const a = t * 4.5 * dir + (i * TAU) / 6, rr = R * 2.1; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8 - 3); ctx.lineTo(x + Math.cos(a) * rr + 3, y + Math.sin(a) * rr * 0.8); ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8 + 3); ctx.lineTo(x + Math.cos(a) * rr - 3, y + Math.sin(a) * rr * 0.8); ctx.closePath(); ctx.fill(); }
        ctx.globalAlpha = 0.8; ctx.lineWidth = 1.2; ctx.strokeStyle = WHITE;
        for (let i = 0; i < 2; i++) { const a = t * 9 + i * 3.1; let px = x + Math.cos(a) * R, py = y + Math.sin(a) * R; ctx.beginPath(); ctx.moveTo(px, py); for (let j = 1; j <= 3; j++) { px += Math.cos(a) * 7 + rnd(-4, 4); py += Math.sin(a) * 7 + rnd(-4, 4); ctx.lineTo(px, py); } ctx.stroke(); }
        ctx.globalAlpha = 0.5; glow(ctx, x, y, R * 3.8, "rgba(150,60,255,0.5)", "rgba(100,30,220,0)");
      }
      ctx.restore();
    }

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

  // ═════════════════════ VOID MAGE SKILL EFFECTS ═════════════════════
  // Everything below is VISUAL. It reads fighter state (f.zones, f.wraiths, f.transit, f.execution, f.overload ...) and sim.fx "void" events;
  // it never changes the sim. Sizes / counts live in TUNE2.
  const TUNE2 = { runesPerBand: 5, tentacleCount: 7, entityHeight: 250, handSpacing: 24, spikeGlow: 0.55 };
  const easeOutC = (u) => 1 - Math.pow(1 - clamp(u, 0, 1), 3);
  const INK = "#05030b";

  function inkRim(ctx, rim, lw, alpha) { // fill is set by the caller; this adds the violet rim
    ctx.strokeStyle = rim || "rgba(170,90,255,0.85)";
    ctx.lineWidth = lw || 1.4;
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  // Tapered curved limb / tentacle through a polyline of points (w0 -> w1), filled ink with a violet rim and optional glowing core line.
  function limb(ctx, pts, w0, w1, glowCore) {
    const n = pts.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, n - 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const w = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
      L.push([pts[i][0] - ty * w, pts[i][1] + tx * w]);
      R.push([pts[i][0] + ty * w, pts[i][1] - tx * w]);
    }
    const all = L.concat(R.reverse());
    ctx.beginPath(); ctx.moveTo(all[0][0], all[0][1]);
    for (let i = 1; i < all.length; i++) ctx.lineTo(all[i][0], all[i][1]);
    ctx.closePath();
    ctx.fillStyle = INK; ctx.fill();
    inkRim(ctx, "rgba(160,80,255,0.8)", 1.1);
    if (glowCore) {
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.5; ctx.strokeStyle = MID; ctx.lineWidth = 1; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(pts[1][0], pts[1][1]); for (let i = 2; i < n - 1; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); ctx.restore();
    }
  }
  // A writhing curve from a to b with sideways wave (used for tentacles, wisps and arms).
  function wave(a, b, n, amp, t, ph) {
    const pts = [], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    for (let i = 0; i <= n; i++) {
      const u = i / n, o = Math.sin(t * 3 + ph + u * 5) * amp * Math.sin(u * Math.PI);
      pts.push([a[0] + dx * u + nx * o, a[1] + dy * u + ny * o]);
    }
    return pts;
  }
  function blackHole(ctx, x, y, r, a) { // small black sphere with a bright rim and a tilted accretion ring
    const t = nowSec();
    ctx.save();
    ctx.globalAlpha = a === undefined ? 1 : a;
    glow(ctx, x, y, r * 2.4, "rgba(30,10,70,0.75)", "rgba(60,20,130,0)");
    ctx.fillStyle = "#020106"; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = LIGHT; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = MID; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(x, y, r * 2, r * 0.6, 0.4 + Math.sin(t * 2) * 0.15, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  // Flat black hole on the ground (Abyssal Transit pools). k = 0..1 opening.
  function groundHole(ctx, x, y, rx, k, a) {
    if (k <= 0.01) return;
    const t = nowSec(), r = rx * k;
    ctx.save();
    ctx.globalAlpha = a === undefined ? 1 : a;
    glow(ctx, x, y, r * 1.5, "rgba(120,50,220,0.35)", "rgba(60,20,140,0)");
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x, y, r, Math.max(2, r * 0.2), 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = LIGHT; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(x, y, r, Math.max(2, r * 0.2), 0, 0, TAU); ctx.stroke();
    ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = MID; ctx.lineWidth = 1.2;
    for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.ellipse(x, y, r * (0.7 - i * 0.28), Math.max(1.5, r * (0.14 - i * 0.04)), t * (2 + i) * (i ? -1 : 1) * 0.2, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }

  // ── Abyssal Spikes ──
  function drawSpikes(ctx, f, z) {
    const C = z.cfg;
    ctx.save();
    for (const sp of z.spikes) {
      const wait = sp.delay - z.t;
      if (wait > 0 && wait <= C.warn + 2) { // ground cracks glow before the eruption: the telegraph
        const k = 1 - wait / (C.warn + 2);
        ctx.globalAlpha = 0.35 + 0.6 * k; ctx.strokeStyle = MID; ctx.lineWidth = 1.8; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(sp.x - sp.w * 0.9 * k, z.y - 1); ctx.lineTo(sp.x - sp.w * 0.3, z.y + 2); ctx.lineTo(sp.x + sp.w * 0.2, z.y - 1); ctx.lineTo(sp.x + sp.w * 0.9 * k, z.y + 1); ctx.stroke();
        ctx.save(); ctx.globalCompositeOperation = "lighter"; glow(ctx, sp.x, z.y, sp.w * 1.2 * k, "rgba(180,75,255,0.6)", "rgba(130,50,255,0)"); ctx.restore();
      }
      const h = MW.voidSpikeHeight(z, sp);
      if (h < 2) continue;
      const tipx = sp.x + sp.lean * h, w = sp.w;
      ctx.globalAlpha = 1;
      const gr = ctx.createLinearGradient(0, z.y, 0, z.y - h);
      gr.addColorStop(0, "#04020a"); gr.addColorStop(0.7, "#150c2e"); gr.addColorStop(1, "#2c1860");
      ctx.beginPath();
      ctx.moveTo(sp.x - w / 2, z.y + 3);
      ctx.quadraticCurveTo(sp.x - w * 0.34, z.y - h * 0.55, tipx, z.y - h);
      ctx.quadraticCurveTo(sp.x + w * 0.4, z.y - h * 0.5, sp.x + w / 2, z.y + 3);
      ctx.closePath();
      ctx.fillStyle = gr; ctx.fill();
      inkRim(ctx, "rgba(170,90,255,0.9)", 1.5);
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = TUNE2.spikeGlow; ctx.strokeStyle = MID; ctx.lineWidth = 1; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(sp.x - w * 0.08, z.y); ctx.quadraticCurveTo(sp.x + sp.lean * h * 0.3, z.y - h * 0.5, tipx, z.y - h + 3); ctx.stroke();
      glow(ctx, tipx, z.y - h, 6, "rgba(230,190,255,0.8)", "rgba(180,75,255,0)");
      ctx.restore();
      if (z.life - z.t < C.dissolve && Math.random() < 0.5) dot(tipx + rnd(-4, 4), z.y - h * rnd(0.1, 1), rnd(-0.4, 0.4), rnd(-1.4, -0.4), 22, rnd(1.2, 2.4), Math.random() < 0.5 ? MID : LIGHT, { drag: 0.96 });
    }
    ctx.restore();
  }

  // ── Abyssal Grasp ──
  function drawGrasp(ctx, f, z) {
    const C = z.cfg, t = nowSec();
    const x0 = Math.max(z.xMin, z.cx - z.rad), x1 = Math.min(z.xMax, z.cx + z.rad);
    if (x1 - x0 < 2) return;
    const a = clamp((z.life - z.t) / 24, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.moveTo(x0, z.y + 5);
    for (let x = x0; x <= x1; x += 6) {
      const k = Math.min(1, (x - x0) / 26, (x1 - x) / 26);
      ctx.lineTo(x, z.y - 2 - k * (4 + 3 * Math.sin(t * 3 + x * 0.09)));
    }
    ctx.lineTo(x1, z.y + 5); ctx.closePath();
    const gr = ctx.createLinearGradient(0, z.y - 8, 0, z.y + 8);
    gr.addColorStop(0, "rgba(6,3,14,0.97)"); gr.addColorStop(1, "rgba(30,10,70,0.9)");
    ctx.fillStyle = gr; ctx.fill();
    ctx.strokeStyle = "rgba(170,90,255,0.75)"; ctx.lineWidth = 1.4; ctx.stroke();
    // slow ripples on the surface
    ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = MID; ctx.lineWidth = 0.9;
    for (let i = 0; i < 4; i++) {
      const rx = x0 + ((i * 0.27 + t * 0.12) % 1) * (x1 - x0), rr = 5 + ((t * 8 + i * 6) % 14);
      ctx.globalAlpha = a * 0.3 * (1 - rr / 19);
      ctx.beginPath(); ctx.ellipse(rx, z.y - 1, rr, rr * 0.2, 0, 0, TAU); ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    // hands: small ones everywhere, big ones around an enemy standing in the pool
    const foe = f.foe, holding = foe && z.holding.has(foe.id);
    const fcx = foe ? foe.x + foe.stats.width / 2 : 0;
    for (let x = x0 + 10; x < x1 - 8; x += TUNE2.handSpacing) {
      const near = holding ? clamp(1 - Math.abs(x - fcx) / (foe.stats.width * 1.3 + 12), 0, 1) : 0;
      const grow = clamp((z.t - 6) / 16, 0, 1);
      const reach = (9 + 7 * Math.sin(t * 2.2 + x * 0.3) + near * (foe ? foe.stats.height * 0.5 : 30)) * grow;
      if (reach < 3) continue;
      const lean = near ? clamp((fcx - x) * 0.5, -10, 10) : Math.sin(t * 1.7 + x) * 3;
      const tip = [x + lean, z.y - reach];
      ctx.globalAlpha = a;
      limb(ctx, [[x, z.y + 1], [x + lean * 0.3 + Math.sin(t * 3 + x) * 2, z.y - reach * 0.5], tip], 4.2, 2.2, false);
      for (let j = -1; j <= 1; j++) { // fingers
        ctx.strokeStyle = "rgba(170,90,255,0.85)"; ctx.lineWidth = 1.1; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(tip[0], tip[1]); ctx.lineTo(tip[0] + j * 2.6 + lean * 0.12, tip[1] - 3.2 - (near ? 2 : 0)); ctx.stroke();
      }
    }
    ctx.restore();
    if (holding && Math.random() < 0.3) add({ kind: "void", x: fcx + rnd(-12, 12), y: z.y - rnd(0, 20), vx: rnd(-0.3, 0.3), vy: rnd(0.2, 0.9), life: 22, size: rnd(1.2, 2.2), g: 0.06, drag: 0.97 });
  }

  // ── Singularity pull marker ──
  function drawPull(ctx, z) {
    const o = z.target;
    if (!o) return;
    const k = 1 - z.t / z.life, cy = o.y + o.stats.height * 0.5;
    blackHole(ctx, z.goalX, cy, 4 + 6 * k, k);
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = MID; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.6 * k;
    for (let i = 0; i < 2; i++) { const rr = 10 + ((z.t * 2.4 + i * 10) % 22); ctx.globalAlpha = 0.5 * k * (1 - rr / 34); ctx.beginPath(); ctx.arc(z.goalX, cy, 34 - rr, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }

  // ── Void bound Wraiths ──
  function drawWraith(ctx, w, W, t, foe) {
    const a = W.phase === "fade" ? 1 - W.t / (W.cfg.fadeTicks || 14) : clamp(W.t / 8, 0, 1);
    if (a <= 0.02) return;
    const sp = Math.hypot(w.vx, w.vy), ang = sp > 0.3 ? Math.atan2(w.vy, w.vx) : 0;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.save(); ctx.globalCompositeOperation = "lighter"; glow(ctx, w.x, w.y, 17, "rgba(150,60,255,0.45)", "rgba(100,30,220,0)"); ctx.restore();
    // trailing wisps
    for (let i = 0; i < 3; i++) {
      const o = (i - 1) * 4.5, ph = i * 2.1;
      const a0 = [w.x, w.y], b0 = [w.x - Math.cos(ang) * 16 - Math.sin(ang) * o, w.y - Math.sin(ang) * 16 + Math.cos(ang) * o + 4];
      limb(ctx, wave(a0, b0, 6, 3, t + ph, ph), 5, 0.6, false);
    }
    ctx.beginPath(); ctx.ellipse(w.x, w.y, 6.8, 7.8, 0, 0, TAU); ctx.fillStyle = INK; ctx.fill(); inkRim(ctx, "rgba(190,110,255,0.95)", 1.3);
    // hollow eyes looking at the target
    const lx = foe ? clamp(foe.x + foe.stats.width / 2 - w.x, -1, 1) * 1.6 : 0;
    ctx.fillStyle = "#ffffff"; ctx.shadowColor = MID; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(w.x - 2.3 + lx, w.y - 1.2, 1.3, 0, TAU); ctx.arc(w.x + 2.3 + lx, w.y - 1.2, 1.3, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawWraiths(ctx, f, W) {
    const t = nowSec(), foe = f.foe;
    for (const w of W.ws) drawWraith(ctx, w, W, t, foe);
    if (W.phase !== "bound" || !foe) return;
    // restraint: glowing bands around the legs, a rune halo over the head, chains between wraith and target
    const vcx = foe.x + foe.stats.width / 2, fy = foe.y + foe.stats.height, k = 0.75 + 0.25 * Math.sin(t * 8);
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const y = fy - 8 - i * 11, rx = foe.stats.width * (0.62 - i * 0.04);
      ctx.globalAlpha = 0.85 * k; ctx.strokeStyle = i ? MID : LIGHT; ctx.lineWidth = 2.4 - i * 0.5;
      ctx.beginPath(); ctx.ellipse(vcx, y, rx, 4, 0, 0, TAU); ctx.stroke();
    }
    const hy = foe.y - 14;
    ctx.globalAlpha = 0.9; ctx.strokeStyle = LIGHT; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(vcx, hy, 17, 4.5, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = MID; ctx.lineWidth = 1.3;
    for (let i = 0; i < TUNE2.runesPerBand; i++) { const a = t * 1.6 + (i * TAU) / TUNE2.runesPerBand; drawRune(ctx, vcx + Math.cos(a) * 17, hy + Math.sin(a) * 4.5, 3.2, i % 3, a); }
    ctx.globalAlpha = 0.45 * k; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(vcx, hy + 3); ctx.lineTo(vcx, foe.y + 6); ctx.stroke();
    ctx.restore();
    if (Math.random() < 0.3) dot(vcx + rnd(-10, 10), fy - rnd(2, 30), rnd(-0.4, 0.4), rnd(-1.2, -0.3), 20, rnd(1.2, 2), MID, { drag: 0.96 });
  }

  // ── Void Execution (ultimate): rift, colossal shadow entity, tentacles ──
  function drawExecution(ctx, f, X) {
    const C = X.cfg, t = nowSec(), v = X.target;
    const open = X.phase === "open", leaving = X.phase === "retreat" || X.phase === "sink";
    const rise = open ? easeOutC(X.t / C.openTicks) : leaving ? 1 - easeOutC(X.p / C.sinkTicks) : 1;
    const rs = open ? easeOutC(X.t / 14) : leaving ? Math.max(0.0, 1 - Math.max(0, X.p - C.sinkTicks * 0.4) / (C.sinkTicks * 0.6)) : 1; // rift scale
    const bx = X.rx, by = X.ry;
    ctx.save();
    // ground telegraph of the grab zone (only while the capture can still be dodged)
    if (open) {
      const al = 0.35 + 0.35 * Math.sin(t * 14);
      ctx.globalAlpha = al; ctx.strokeStyle = LIGHT; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.ellipse(bx, by, C.grabRX, 11, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "rgba(60,20,130,0.25)"; ctx.fill();
    }
    // the rift: a tall tear of void
    if (rs > 0.03) {
      const rh = 105 * rs, rw = 40 * rs, cy = by - rh * 0.55;
      ctx.globalAlpha = 1;
      glow(ctx, bx, cy, rh * 1.05, "rgba(110,40,210,0.55)", "rgba(60,20,140,0)");
      ctx.beginPath(); ctx.ellipse(bx, cy, rw, rh, 0, 0, TAU); ctx.fillStyle = "#020106"; ctx.fill();
      ctx.strokeStyle = LIGHT; ctx.lineWidth = 2; ctx.stroke();
      ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = MID; ctx.lineWidth = 1.3;
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + t; ctx.beginPath(); ctx.moveTo(bx + Math.cos(a) * rw, cy + Math.sin(a) * rh); ctx.lineTo(bx + Math.cos(a) * (rw + 12 + 8 * Math.sin(t * 6 + i)), cy + Math.sin(a) * (rh + 12)); ctx.stroke(); }
      ctx.globalCompositeOperation = "source-over";
    }
    // the colossal entity rises out of the rift
    if (rise > 0.04) {
      const Hh = TUNE2.entityHeight * rise, W0 = 46, sy = by - Hh * 0.8, hy = by - Hh * 0.98;
      const sh = [[bx - 52, sy], [bx + 52, sy]];
      // tentacles from the back / shoulders
      for (let i = 0; i < TUNE2.tentacleCount; i++) {
        const side = i % 2 ? 1 : -1, k = Math.floor(i / 2);
        const a = [bx + side * 22, sy + 14 + k * 12], b = [bx + side * (70 + k * 22 + 10 * Math.sin(t * 2 + i)), by - Hh * (0.85 + 0.35 * Math.sin(t * 1.3 + i * 1.7) * 0.3) - 20 - k * 14];
        limb(ctx, wave(a, b, 9, 14, t, i * 1.9), 9, 1, true);
      }
      // torso: tall, narrow at the waist, broad at the shoulders
      ctx.beginPath();
      ctx.moveTo(bx - W0 * 0.45, by + 4);
      ctx.quadraticCurveTo(bx - W0 * 0.7, by - Hh * 0.4, sh[0][0], sy);
      ctx.lineTo(bx - 14, hy + 20); ctx.lineTo(bx + 14, hy + 20); ctx.lineTo(sh[1][0], sy);
      ctx.quadraticCurveTo(bx + W0 * 0.7, by - Hh * 0.4, bx + W0 * 0.45, by + 4);
      ctx.closePath();
      const tg = ctx.createLinearGradient(0, by, 0, hy);
      tg.addColorStop(0, "#020106"); tg.addColorStop(0.6, "#0e0820"); tg.addColorStop(1, "#24144d");
      ctx.fillStyle = tg; ctx.fill(); inkRim(ctx, "rgba(170,90,255,0.9)", 2);
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.5; ctx.strokeStyle = MID; ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(bx + (i - 1) * 16, by - Hh * 0.2); ctx.lineTo(bx + (i - 1) * 22 + Math.sin(t * 2 + i) * 3, sy + 10); ctx.stroke(); }
      ctx.restore();
      // head: faceless with two long violet eyes
      ctx.beginPath(); ctx.ellipse(bx, hy, 21, 27, 0, 0, TAU); ctx.fillStyle = INK; ctx.fill(); inkRim(ctx, "rgba(190,110,255,0.95)", 2);
      ctx.save(); ctx.fillStyle = "#fff"; ctx.shadowColor = MID; ctx.shadowBlur = 14;
      for (const sx of [-9, 9]) { ctx.save(); ctx.translate(bx + sx, hy - 3); ctx.rotate(sx * 0.04); ctx.beginPath(); ctx.ellipse(0, 0, 6.5, 2, 0, 0, TAU); ctx.fill(); ctx.restore(); }
      ctx.restore();
      // arms: reach for the victim's wrists (and legs) once seized; before that they hang / reach toward where he stands
      const vcx = v ? v.x + v.stats.width / 2 : bx, vy0 = v ? v.y : by - 60, vh = v ? v.stats.height : 76;
      const held = X.phase === "lift" || X.phase === "impale" || X.phase === "slam" || X.phase === "sink";
      const reach = (side, up) => held ? [vcx + side * 17, up ? vy0 + vh * 0.28 : vy0 + vh * 0.92] : [bx + side * (88 + Math.sin(t * 3 + side) * 6), by - Hh * (up ? 0.28 : 0.1) + Math.sin(t * 2 + side) * 8];
      for (const side of [-1, 1]) {
        limb(ctx, wave(sh[side > 0 ? 1 : 0], reach(side, true), 10, 18, t, side), 18, 6, true);
        limb(ctx, wave([bx + side * 16, by - Hh * 0.3], reach(side, false), 10, 16, t, side * 2), 14, 5, true);
        if (held) { const p = reach(side, true), q = reach(side, false); ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = LIGHT; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.8; for (const r of [p, q]) { ctx.beginPath(); ctx.ellipse(r[0], r[1], 6, 3, 0, 0, TAU); ctx.stroke(); } ctx.restore(); }
      }
      // impaling tentacles: one more every impaleGap ticks, flashing white when it lands
      if (X.phase === "impale" || X.phase === "slam" || X.phase === "sink") {
        const gx = vcx, gy = vy0 + vh * 0.5;
        for (let i = 0; i < X.imp; i++) {
          const side = i % 2 ? 1 : -1, a = [bx + side * 40, by - Hh * (0.2 + 0.12 * i)], b = [gx + side * (6 - i), gy + (i - 1.5) * 9];
          limb(ctx, wave(a, b, 8, 7, t, i * 1.3), 13, 1.2, true);
          if (X.phase === "impale" && i === X.imp - 1 && X.p % C.impaleGap < 5) { ctx.save(); ctx.globalCompositeOperation = "lighter"; glow(ctx, b[0], b[1], 26, "rgba(255,255,255,0.9)", "rgba(180,75,255,0)"); ctx.restore(); }
        }
      }
    }
    ctx.restore();
  }

  // ── pieces attached to the Mage's own body: melt / reform liquid, charge, Void Overload pips ──
  function liquidMass(ctx, cx, fy, w, h, a, top) {
    if (h < 2 || a <= 0.01) return;
    const t = nowSec();
    ctx.save(); ctx.globalAlpha = a;
    ctx.beginPath(); ctx.moveTo(cx - w, fy + 3);
    ctx.lineTo(cx - w * 0.9, fy - h * 0.55);
    for (let i = 0; i <= 8; i++) { const u = i / 8; ctx.lineTo(cx - w * 0.8 + u * w * 1.6, fy - h + Math.sin(t * 6 + i * 1.3) * 3 - (top ? Math.sin(u * Math.PI) * 5 : 0)); }
    ctx.lineTo(cx + w * 0.9, fy - h * 0.55); ctx.lineTo(cx + w, fy + 3); ctx.closePath();
    const gr = ctx.createLinearGradient(0, fy, 0, fy - h);
    gr.addColorStop(0, "rgba(3,1,8,0.98)"); gr.addColorStop(1, "rgba(34,12,78,0.95)");
    ctx.fillStyle = gr; ctx.fill(); inkRim(ctx, "rgba(190,110,255,0.9)", 1.5);
    ctx.restore();
    if (Math.random() < 0.5) add({ kind: "void", x: cx + rnd(-w, w), y: fy - rnd(0, h), vx: rnd(-0.3, 0.3), vy: rnd(0.3, 1.2), life: 22, size: rnd(1.2, 2.6), g: 0.1, drag: 0.97 });
  }

  function drawVoidBody(ctx, f) {
    const S = MW.STATE, s = f.stats, t = nowSec();
    const cx = f.x + s.width / 2, fy = f.y + s.height;
    const orb = (f._art && f._art.orb) || [cx + f.facing * s.width * 0.6, f.y + s.height * 0.2];
    // Abyssal Transit: melt (startup), void (closing hole + opening destination), reform
    if (f.state === S.ATTACK_STARTUP && f.hit && f.hit.id === "abyssal_transit") {
      const p = clamp(1 - f.stateTimer / Math.max(1, f.hit.startup), 0, 1), body = p < 0.82 ? easeOutC(p / 0.82) : 1 - (p - 0.82) / 0.18;
      groundHole(ctx, cx, fy, s.width * 0.9 + 24 * p, clamp(p * 3, 0, 1));
      liquidMass(ctx, cx, fy, s.width * 0.62, s.height * 1.02 * body, 0.95, true);
    } else if (f.transit && f.transit.phase === "void") {
      const T = f.transit, C = T.cfg, close = clamp(1 - T.t / (C.hide * 0.35), 0, 1);
      groundHole(ctx, T.from.x, T.from.y, s.width * 1.2, close);
      const d = T.dest;
      if (d) groundHole(ctx, d.x + s.width / 2, d.p.y, s.width * 1.2, clamp((T.t - C.hide * 0.4) / (C.hide * 0.5), 0, 1)); // announces where he comes out
    } else if (f.transit && f.transit.phase === "reform") {
      const T = f.transit, q = clamp(T.t / T.cfg.reform, 0, 1);
      groundHole(ctx, cx, fy, s.width * 1.2, 1 - q * 0.7);
      liquidMass(ctx, cx, fy, s.width * 0.62, s.height * 1.02 * Math.sin(q * Math.PI), 0.95, true);
    }
    // Singularity charge: a miniature black hole grows in the casting hand
    if (f.state === S.ATTACK_STARTUP && f.hit && f.hit.chargeHold && !f.chargeReleased) {
      const r = clamp(f.chargeTicks / Math.max(1, f.hit.chargeTime), 0, 1), full = r >= 1;
      blackHole(ctx, orb[0], orb[1] - 2, 3 + 10 * r + (full ? 1.5 * Math.sin(t * 20) : 0), 1);
      if (full) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = WHITE; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 18); ctx.beginPath(); ctx.arc(orb[0], orb[1] - 2, 20, 0, TAU); ctx.stroke(); ctx.restore(); }
      if (Math.random() < 0.5 + r * 0.4) { const a = Math.random() * TAU, d = 24 + 20 * r; dot(orb[0] + Math.cos(a) * d, orb[1] + Math.sin(a) * d, -Math.cos(a) * d / 12, -Math.sin(a) * d / 12, 12, rnd(1.2, 2.2), MID, { drag: 1 }); }
    }
    // Void Overload pips above the head (+ a stronger hand glow once ready)
    const P = f.stats.passive;
    if (P && P.type === "voidoverload" && (f.overloadHits > 0 || f.overload) && f.state !== S.KO) {
      ctx.save();
      const ready = f.overload, n = P.hits, y = f.y - 12;
      for (let i = 0; i < n; i++) {
        const px = cx + (i - (n - 1) / 2) * 10, on = ready || i < f.overloadHits, pu = ready ? 0.7 + 0.3 * Math.sin(t * 10 + i) : 1;
        ctx.beginPath(); ctx.moveTo(px, y - 4.5); ctx.lineTo(px + 3.2, y); ctx.lineTo(px, y + 4.5); ctx.lineTo(px - 3.2, y); ctx.closePath();
        ctx.fillStyle = on ? "#e6bcff" : "#0c0a14"; ctx.globalAlpha = pu; ctx.fill();
        ctx.strokeStyle = MID; ctx.lineWidth = 1; ctx.stroke();
      }
      if (ready) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 8);
        glow(ctx, orb[0], orb[1], 16, "rgba(220,170,255,0.9)", "rgba(140,50,255,0)");
        ctx.globalAlpha = 0.8; ctx.strokeStyle = LIGHT; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(cx, f.y + s.height * 0.5, s.width * 1.05 + 2 * Math.sin(t * 6), 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawVoidWorld(ctx, f) {
    for (const z of f.zones) {
      if (z.kind === "spikes") drawSpikes(ctx, f, z);
      else if (z.kind === "grasp") drawGrasp(ctx, f, z);
      else if (z.kind === "pull") drawPull(ctx, z);
    }
    if (f.wraiths) drawWraiths(ctx, f, f.wraiths);
    if (f.execution) drawExecution(ctx, f, f.execution);
  }

  // One-shot bursts from the sim's "void" events.
  function ring(x, y, size, grow, life, color) { add({ kind: "ring", x, y, vx: 0, vy: 0, life, size, grow, color: color || MID, drag: 1 }); }
  function voidEvent(ev) {
    const { x, y } = ev;
    switch (ev.kind) {
      case "overload_ready":
        ring(x, y, 40, -2.2, 18, LIGHT); ring(x, y, 8, 3, 18, MID);
        add({ kind: "flash", x, y, vx: 0, vy: 0, life: 10, size: 26, color: WHITE, rot: Math.PI / 8, drag: 1 });
        break;
      case "overload_fire":
        ring(x, y, 34, -2.5, 12, LIGHT);
        inward(x, y, 12, 24, 44, 12, (i) => (i % 3 ? MID : LIGHT));
        break;
      case "transit_out":
        groundBurst(x, y, -1);
        break;
      case "transit_in":
        groundBurst(x, y, 1);
        add({ kind: "flash", x, y: y - 10, vx: 0, vy: 0, life: 9, size: 24, color: WHITE, rot: Math.PI / 8, drag: 1 });
        break;
      case "slam": {
        const big = !!ev.big, n = big ? 3 : 2;
        for (let i = 0; i < n; i++) ring(x, y, 6 + i * 4, 4.5 + i * 1.5 + (big ? 1.5 : 0), 16 + i * 5, i % 2 ? MID : LIGHT);
        add({ kind: "flash", x, y: y - 6, vx: 0, vy: 0, life: 11, size: big ? 62 : 38, color: WHITE, rot: Math.PI / 8, drag: 1 });
        for (let i = 0; i < (big ? 26 : 14); i++) { const sd = i % 2 ? 1 : -1, sp = rnd(2, big ? 9 : 6); dot(x + sd * rnd(0, 12), y - 2, sd * sp, -rnd(0.5, 3.4), 20 + (Math.random() * 14 | 0), rnd(1.6, 3.4), i % 3 ? "#2a1458" : MID, { drag: 0.93, g: 0.14 }); }
        drops(x, y - 4, big ? 12 : 6, -5, 5, -6, -1);
        break;
      }
      case "impale":
        ring(x, y, 20, -1.8, 10, LIGHT);
        for (let i = 0; i < 12; i++) { const a = Math.random() * TAU, sp = rnd(2, 6); dot(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 14, rnd(1.4, 2.6), i % 2 ? WHITE : MID, { drag: 0.9 }); }
        break;
      case "rift_open": ring(x, y - 40, 50, -2.4, 18, MID); inward(x, y - 50, 14, 40, 80, 16, (i) => (i % 3 ? MID : LIGHT)); break;
      case "grab": ring(x, y - 40, 14, 3.5, 14, LIGHT); add({ kind: "flash", x, y: y - 40, vx: 0, vy: 0, life: 8, size: 30, color: WHITE, rot: 0.4, drag: 1 }); break;
      case "rift_miss": ring(x, y - 40, 40, -2, 16, MID); break;
      case "spikes":
        for (let i = 0; i < 16; i++) dot(rnd(ev.x0, ev.x1), y - 1, rnd(-0.6, 0.6), -rnd(0.2, 1.4), 24, rnd(1.4, 2.6), i % 2 ? MID : "#2a1458", { drag: 0.95 });
        break;
      case "spike_hit": ring(x, y, 22, -1.6, 10, LIGHT); for (let i = 0; i < 10; i++) { const a = -Math.PI * Math.random(), sp = rnd(2, 6); dot(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 16, rnd(1.4, 2.6), i % 2 ? MID : LIGHT, { drag: 0.92, g: 0.1 }); } break;
      case "grasp": ring(x, y, 6, 5, 22, MID); drops(x, y - 4, 8, -3, 3, -3, -0.6); break;
      case "wraith_summon": ring(x, y, 24, -1.5, 14, MID); drops(x, y, 6, -1.5, 1.5, -2, 1); break;
      case "wraith_latch": ring(x, y, 18, -1.4, 10, LIGHT); break;
      case "wraith_release": ring(x, y, 10, 3, 14, MID); drops(x, y, 8, -2.5, 2.5, -3, 1); break;
    }
  }
  function groundBurst(x, y, dirY) { // liquid splashing into / pouring out of a black pool
    add({ kind: "ring", x, y, vx: 0, vy: 0, life: 18, size: 6, grow: 2.4, color: MID, drag: 1 });
    for (let i = 0; i < 16; i++) add({ kind: "void", x: x + rnd(-14, 14), y: y - 2, vx: rnd(-1.2, 1.2), vy: dirY > 0 ? -rnd(1.5, 5) : -rnd(0.4, 2), life: 24 + (Math.random() * 14 | 0), size: rnd(1.8, 3.6), g: 0.14, drag: 0.96 });
    for (let i = 0; i < 6; i++) dot(x + rnd(-10, 10), y - rnd(0, 20), rnd(-0.4, 0.4), -rnd(0.6, 2), 22, rnd(1.4, 2.4), i % 2 ? MID : LIGHT, { drag: 0.96 });
  }

  // ─── per-fighter effects (aura, hand glow, cast vortex) ───────────
  // Called once per frame inside the fighter's interpolation transform.
  function drawFighter(ctx, f) {
    const S = MW.STATE;
    const s = f.stats;
    if (f.state === S.KO) { drawVoidWorld(ctx, f); return; }
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

    drawVoidWorld(ctx, f); // spikes, grasp pool, wraiths, execution entity
    drawVoidBody(ctx, f); // melt / reform liquid, Singularity charge, Void Overload pips
  }

  MW.MageFx = { TUNE, TUNE2, tick, draw, event, drawBolt, drawFighter, _pool: pool };
})(globalThis);
