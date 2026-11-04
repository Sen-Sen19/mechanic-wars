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
    maxParticles: 420,
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
      } else if (p.kind === "gring") { // flat ring racing across the floor (ground shockwave)
        ctx.globalAlpha = a * 0.9; ctx.strokeStyle = p.color; ctx.lineWidth = 1 + 4 * a;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(0.5, p.size), Math.max(0.3, p.size * 0.2), 0, 0, TAU); ctx.stroke();
      } else if (p.kind === "chip") { // a spinning shard of black rock / obsidian
        ctx.globalAlpha = Math.min(1, a * 1.6); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = "#07040f"; ctx.strokeStyle = p.color || MID; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-p.size, 0); ctx.lineTo(0, -p.size * 0.7); ctx.lineTo(p.size * 1.3, p.size * 0.2); ctx.lineTo(0, p.size * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      } else if (p.kind === "streak") { // a fast line (impact sparks)
        ctx.globalAlpha = a; ctx.strokeStyle = p.color; ctx.lineWidth = 1.4 + p.size * 0.3 * a; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 2.4, p.y - p.vy * 2.4); ctx.stroke();
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
    if (kind === "singularity") return drawSingularity(ctx, p); // its own, richer drawing (see below)
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
    if (z.cp > 0 && z.cp < 1) { // collapsing: a bright ring closes toward the centre and the surface pulses
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const rr = (x1 - x0) * 0.5 * (1.15 - z.cp * 0.9);
      ctx.globalAlpha = 0.4 + 0.5 * z.cp; ctx.strokeStyle = LIGHT; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse((x0 + x1) / 2, z.y - 1, Math.max(3, rr), Math.max(1.5, rr * 0.16), 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    const foe = f.foe, holding = foe && z.holding.has(foe.id), fcx = foe ? foe.x + foe.stats.width / 2 : 0; // the hands themselves: see drawHandsPass
    ctx.restore();
    if (holding && Math.random() < 0.3) add({ kind: "void", x: fcx + rnd(-12, 12), y: z.y - rnd(0, 20), vx: rnd(-0.3, 0.3), vy: rnd(0.2, 0.9), life: 22, size: rnd(1.2, 2.2), g: 0.06, drag: 0.97 });
  }

  // ─── Singularity: a real little black hole ───────────────────────
  // Event horizon (black disc), a flat glowing accretion disk (hotter on one side) whose far half is bent over the top and under the
  // bottom by gravity, a thin photon ring, matter spiralling in, and a stretched spiral tail of everything it has torn along the way.
  function drawSingularity(ctx, p) {
    const t = nowSec(), dir = p.dir || 1, x = p.x, y = p.y, R = (p.size / 2) * 1.5, pulse = 0.5 + 0.5 * Math.sin(t * 12), tilt = 0.18 * dir;
    ctx.save(); ctx.lineCap = "round";
    // 1) stretched tail: dark liquid core with three spiral threads of torn matter
    const L = 92;
    ctx.beginPath(); ctx.moveTo(x, y - R * 0.9);
    for (let i = 1; i <= 10; i++) { const u = i / 10; ctx.lineTo(x - dir * u * L, y - R * 0.9 * (1 - u) - 1); }
    for (let i = 10; i >= 0; i--) { const u = i / 10; ctx.lineTo(x - dir * u * L, y + R * 0.9 * (1 - u) + 1); }
    ctx.closePath(); const tg = ctx.createLinearGradient(x, 0, x - dir * L, 0); tg.addColorStop(0, "rgba(8,3,20,0.95)"); tg.addColorStop(1, "rgba(40,14,90,0)"); ctx.fillStyle = tg; ctx.fill();
    ctx.globalCompositeOperation = "lighter";
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      for (let i = 0; i <= 18; i++) { const u = i / 18; const o = Math.sin(u * 11 - t * 14 + k * 2.1) * R * 1.05 * (1 - u * 0.75); i ? ctx.lineTo(x - dir * u * L * 1.05, y + o) : ctx.moveTo(x, y + o); }
      ctx.globalAlpha = 0.5; ctx.strokeStyle = k ? MID : LIGHT; ctx.lineWidth = 1.5 - k * 0.3; ctx.stroke();
    }
    // 2) outer gravity glow
    ctx.globalCompositeOperation = "source-over"; glow(ctx, x, y, R * 3.6, "rgba(40,14,95,0.85)", "rgba(60,20,130,0)");
    ctx.globalCompositeOperation = "lighter";
    // 3) disk: far half (behind the hole), 5 concentric rings from white-hot inside to violet outside, brighter on the approaching side
    const ringsAt = (front) => {
      for (let r = 0; r < 5; r++) {
        const rr = R * (1.35 + r * 0.38), ry = rr * 0.24, col = r < 1 ? WHITE : r < 3 ? LIGHT : MID;
        for (let s = 0; s < 14; s++) {
          const a0 = (front ? 0 : Math.PI) + (s / 14) * Math.PI, a1 = a0 + Math.PI / 14 + 0.02, dop = 0.55 + 0.45 * Math.cos(a0 + 0.5 * Math.PI - (dir > 0 ? 0 : Math.PI));
          ctx.globalAlpha = (0.9 - r * 0.14) * dop * (front ? 1 : 0.75); ctx.strokeStyle = col; ctx.lineWidth = 2.6 - r * 0.35;
          ctx.beginPath(); ctx.ellipse(x, y, rr, ry, tilt, a0 + t * 2.4 * (1.1 - r * 0.15), a1 + t * 2.4 * (1.1 - r * 0.15)); ctx.stroke();
        }
      }
    };
    ringsAt(false);
    // 4) lensed light: the far disk bent over the top and under the bottom of the hole
    ctx.strokeStyle = LIGHT; ctx.lineWidth = 2.2; ctx.globalAlpha = 0.75;
    ctx.beginPath(); ctx.ellipse(x, y, R * 1.62, R * 1.22, tilt, Math.PI * 1.07, Math.PI * 1.93); ctx.stroke();
    ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.ellipse(x, y, R * 1.62, R * 1.22, tilt, Math.PI * 0.07, Math.PI * 0.93); ctx.stroke();
    // 5) event horizon
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; ctx.fillStyle = "#000000"; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = WHITE; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(x, y, R * 1.04, 0, TAU); ctx.stroke();
    ctx.strokeStyle = MID; ctx.lineWidth = 3; ctx.globalAlpha = 0.35 + 0.25 * pulse; ctx.beginPath(); ctx.arc(x, y, R * 1.12, 0, TAU); ctx.stroke();
    // 6) near half of the disk crosses in front
    ringsAt(true);
    // 7) shock rings contracting: it drags space inwards
    ctx.strokeStyle = LIGHT; ctx.lineWidth = 1.1;
    for (let i = 0; i < 2; i++) { const k = (t * 1.5 + i * 0.5) % 1; ctx.globalAlpha = 0.45 * (1 - k); ctx.beginPath(); ctx.arc(x, y, R * (4.2 - 2.8 * k), 0, TAU); ctx.stroke(); }
    ctx.restore();
    // matter spiralling in (spawned as particles so it keeps moving after the frame)
    if (Math.random() < 0.85) { const a = Math.random() * TAU, d = R * rnd(3.2, 4.2), sp = 1.6; add({ kind: "dot", x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.7, vx: -Math.cos(a) * sp - Math.sin(a) * 1.8 + (p.vx || 0) * 0, vy: (-Math.sin(a) * sp + Math.cos(a) * 1.8) * 0.7, life: 12, size: rnd(1.2, 2.2), color: Math.random() < 0.4 ? WHITE : (Math.random() < 0.5 ? LIGHT : MID), drag: 0.98 }); }
    if (Math.random() < 0.35) add({ kind: "void", x: x - dir * rnd(6, 24), y: y + rnd(-8, 8), vx: -dir * rnd(0.2, 1), vy: rnd(-0.3, 0.5), life: 22, size: rnd(1.6, 3), g: 0.03, drag: 0.96 });
  }
  const pullSeen = new WeakSet();
  function drawPull(ctx, z) { // after impact: the enemy is dragged into a small collapsing singularity; streaks of stretched matter point at it
    const o = z.target;
    if (!o) return;
    const k = 1 - z.t / z.life, cy = o.y + o.stats.height * 0.5, ocx = o.x + o.stats.width / 2, t = nowSec();
    if (!pullSeen.has(z)) { // first frame: the capture burst on the victim
      pullSeen.add(z);
      ring(ocx, cy, 60, -4.2, 14, LIGHT); ring(ocx, cy, 36, -2.6, 14, MID);
      add({ kind: "flash", x: ocx, y: cy, vx: 0, vy: 0, life: 9, size: 44, color: WHITE, rot: 0.3, drag: 1 });
      inward(ocx, cy, 14, 40, 80, 14, (i) => (i % 3 ? MID : WHITE));
      if (MW.fxShake) MW.fxShake(5);
    }
    const dx = z.goalX - ocx, dl = Math.max(1, Math.abs(dx)), sx = Math.sign(dx || 1);
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
    for (let i = 0; i < 8; i++) { // spaghettified streaks: matter pulled off the body, drawn towards the hole
      const oy = (i - 3.5) * (o.stats.height / 9), u = (t * 2 + i * 0.37) % 1, len = Math.min(dl, 50 + 40 * hash1(i)) * (0.4 + 0.6 * k);
      const x0 = ocx - sx * o.stats.width * 0.2 + sx * u * 12, y0 = cy + oy;
      const g = ctx.createLinearGradient(x0, 0, x0 + sx * len, 0); g.addColorStop(0, "rgba(170,90,255,0)"); g.addColorStop(1, "rgba(235,200,255,0.9)");
      ctx.globalAlpha = 0.7 * k; ctx.strokeStyle = g; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + sx * len * 0.6, y0 + (cy - y0) * 0.3, x0 + sx * len, cy + (y0 - cy) * 0.2); ctx.stroke();
    }
    ctx.restore();
    // the target singularity it is being pulled into
    const R = 4 + 8 * k;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (let r = 0; r < 3; r++) { ctx.globalAlpha = (0.8 - r * 0.2) * k; ctx.strokeStyle = r ? MID : WHITE; ctx.lineWidth = 2 - r * 0.4; ctx.beginPath(); ctx.ellipse(z.goalX, cy, R * (1.5 + r * 0.5), R * (0.4 + r * 0.12), 0, 0, TAU); ctx.stroke(); }
    ctx.restore();
    blackHole(ctx, z.goalX, cy, R * 0.8, k);
  }

  // ── Void bound Wraiths ──
  function drawWraith(ctx, w, W, t, foe) { // a hooded shadow spirit: ragged cloak that streams behind it, hollow white eyes, clawed arms reaching for the target
    const a = W.phase === "fade" ? 1 - W.t / (W.cfg.fadeTicks || 14) : clamp(W.t / 8, 0, 1);
    if (a <= 0.02) return;
    let H = handMem.get(w); if (!H) { H = { tr: [] }; handMem.set(w, H); }
    H.tr.unshift([w.x, w.y]); if (H.tr.length > 14) H.tr.pop();
    const sp = Math.hypot(w.vx, w.vy), fcx = foe ? foe.x + foe.stats.width / 2 : w.x + 1, fcy = foe ? foe.y + foe.stats.height * (w.role === "head" ? 0.1 : 0.9) : w.y;
    const tx = fcx - w.x, ty = fcy - w.y, tl = Math.hypot(tx, ty) || 1, face = tx >= 0 ? 1 : -1, latched = w.latched;
    ctx.save(); ctx.globalAlpha = a;
    ctx.save(); ctx.globalCompositeOperation = "lighter"; glow(ctx, w.x, w.y, 24, "rgba(150,60,255,0.42)", "rgba(100,30,220,0)"); ctx.restore();
    // cloak: the recent path as a tapering, wavering spine
    const spine = [[w.x, w.y + 3]];
    for (let i = 1; i < H.tr.length; i++) spine.push([H.tr[i][0] + Math.sin(t * 7 + i * 0.9 + w.x * 0.02) * (1 + i * 0.35), H.tr[i][1] + 3 + i * (latched ? 1.6 : 0.5)]);
    if (spine.length < 4) for (let i = spine.length; i < 5; i++) spine.push([w.x - face * i * 3, w.y + 3 + i * 3]); // standing still: the cloak hangs down
    limb(ctx, spine, 17, 1.2, true);
    // hood
    ctx.beginPath(); ctx.moveTo(w.x - 7.5, w.y + 2); ctx.quadraticCurveTo(w.x - 8, w.y - 9, w.x - face * 3, w.y - 13); ctx.quadraticCurveTo(w.x + 8, w.y - 8, w.x + 7.5, w.y + 2); ctx.quadraticCurveTo(w.x, w.y + 7, w.x - 7.5, w.y + 2); ctx.closePath();
    ctx.fillStyle = INK; ctx.fill(); inkRim(ctx, "rgba(195,115,255,0.95)", 1.3);
    // eyes: two hollow white slits that look at the target
    ctx.fillStyle = "#ffffff"; ctx.shadowColor = MID; ctx.shadowBlur = 7;
    const ex = clamp(tx / tl, -1, 1) * 1.6, ey = clamp(ty / tl, -1, 1) * 1.1;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(w.x + s * 2.9 + ex, w.y - 2 + ey, 1.2, 2.3, 0.18 * s, 0, TAU); ctx.fill(); }
    ctx.shadowBlur = 0;
    // arms: thin claws stretched towards what it is hunting
    if (!latched) for (const s of [-1, 1]) {
      const sh = [w.x + s * 5, w.y + 3], reach = 11 + 5 * Math.sin(t * 5 + s), hand = [w.x + (tx / tl) * reach + s * 4, w.y + (ty / tl) * reach + 3 - s * 3];
      limb(ctx, bez(sh, [(sh[0] + hand[0]) / 2 + s * 4, (sh[1] + hand[1]) / 2 - 4], hand, 5), 3, 1.2, false);
      for (let j = -1; j <= 1; j++) { ctx.strokeStyle = "rgba(200,130,255,0.95)"; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(hand[0], hand[1]); ctx.lineTo(hand[0] + (tx / tl) * 4 + j * 2.2, hand[1] + (ty / tl) * 4 + j * 1.6); ctx.stroke(); }
    }
    if (w.role === "head") { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = LIGHT; ctx.lineWidth = 1.1; ctx.globalAlpha = a * 0.8; const a0 = t * 1.8; ctx.beginPath(); ctx.ellipse(w.x, w.y - 15, 8, 2.4, 0, a0, a0 + 4.2); ctx.stroke(); ctx.restore(); }
    else { ctx.save(); ctx.strokeStyle = "rgba(190,110,255,0.9)"; ctx.lineWidth = 1; for (let i = 0; i < 2; i++) { const cx0 = w.x - face * (4 + i * 6), cy0 = w.y + 9 + i * 7 + Math.sin(t * 6 + i) * 1.5; ctx.beginPath(); ctx.ellipse(cx0, cy0, 2.6, 1.6, i, 0, TAU); ctx.stroke(); } ctx.restore(); } // loose chain links dragging behind the one that hunts the legs
    if (sp > 0.8 && Math.random() < 0.5) dot(w.x - w.vx * 2 + rnd(-3, 3), w.y + rnd(-3, 8), -w.vx * 0.2, rnd(-0.2, 0.5), 16, rnd(1.2, 2.2), Math.random() < 0.5 ? MID : "#2a1458", { drag: 0.95 });
    ctx.restore();
  }
  function chainLine(ctx, a, b, sag, t, links, glowK) { // a hanging chain of dark links with a violet pulse running along it
    const c = [(a[0] + b[0]) / 2, Math.max(a[1], b[1]) + sag], pts = bez(a, c, b, links * 2);
    ctx.save();
    for (let i = 1; i < pts.length - 1; i += 2) {
      const p = pts[i], q = pts[i + 1], r = pts[i - 1], ang = Math.atan2(q[1] - r[1], q[0] - r[0]), odd = (i >> 1) % 2;
      ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(ang);
      ctx.beginPath(); ctx.ellipse(0, 0, odd ? 1.9 : 3.5, odd ? 3 : 1.9, 0, 0, TAU); ctx.fillStyle = INK; ctx.fill(); ctx.strokeStyle = "rgba(190,110,255,0.95)"; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    }
    ctx.globalCompositeOperation = "lighter";
    const pu = (((t * 2.2) % 1) + 1) % 1, k = clamp(Math.floor(pu * (pts.length - 1)), 0, pts.length - 1), p = pts[k]; // pulse travelling along the chain
    ctx.globalAlpha = 0.85 * glowK; glow(ctx, p[0], p[1], 8, "rgba(230,190,255,0.9)", "rgba(180,75,255,0)");
    ctx.restore();
  }
  function cuff(ctx, x, y, rx, t, k) { // a shackle ring: dark band, glowing inner edge, a couple of runes
    ctx.save();
    ctx.beginPath(); ctx.ellipse(x, y, rx, 4.4, 0, 0, TAU); ctx.lineWidth = 5; ctx.strokeStyle = "#04020a"; ctx.stroke();
    ctx.lineWidth = 1.2; ctx.strokeStyle = "rgba(200,125,255,0.95)"; ctx.beginPath(); ctx.ellipse(x, y - 1.2, rx, 3.6, 0, 0, TAU); ctx.stroke();
    ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.55 * k; ctx.strokeStyle = LIGHT; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(x, y + 0.5, rx - 1, 3, 0, 0.15, Math.PI - 0.15); ctx.stroke();
    ctx.globalAlpha = k; ctx.strokeStyle = MID; ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) { const a = t * 0.9 + (i * TAU) / 3; drawRune(ctx, x + Math.cos(a) * rx * 0.8, y + 1 + Math.sin(a) * 2.6, 2.4, i % 3, a); }
    ctx.restore();
  }
  function drawWraiths(ctx, f, W) {
    const t = nowSec(), foe = f.foe;
    for (const w of W.ws) drawWraith(ctx, w, W, t, foe);
    if (W.phase !== "bound" || !foe) return;
    // restraint: shackles on the legs chained to the floor, a collar on the neck held by the head wraith, ghost hands on its head
    const vcx = foe.x + foe.stats.width / 2, fy = foe.y + foe.stats.height, fw = foe.stats.width, left = 1 - W.t / W.cfg.restrain;
    const k = (0.7 + 0.3 * Math.sin(t * (left < 0.25 ? 20 : 8))) * (left < 0.25 ? 0.75 + 0.25 * Math.sin(t * 40) : 1); // it flickers as it is about to break
    ctx.save(); ctx.lineCap = "round";
    for (const s of [-1, 1]) { // ankle shackles chained to pins in the floor
      const pin = [vcx + s * (fw * 0.62 + 34), fy + 1];
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.7 * k; ctx.fillStyle = "rgba(170,80,255,0.5)"; ctx.beginPath(); ctx.ellipse(pin[0], pin[1], 12, 3.4, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = LIGHT; ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore();
      ctx.fillStyle = "#04020a"; ctx.beginPath(); ctx.ellipse(pin[0], pin[1], 6.5, 2.2, 0, 0, TAU); ctx.fill();
      chainLine(ctx, [vcx + s * fw * 0.5, fy - 6], pin, 7, t + s, 7, k);
    }
    cuff(ctx, vcx, fy - 7, fw * 0.62, t, k); cuff(ctx, vcx, fy - 24, fw * 0.58, t + 1, k);
    const hy = foe.y - 14, ny = foe.y + 7; // collar + chain up to the wraith over its head
    cuff(ctx, vcx, ny, fw * 0.4, t + 2, k);
    chainLine(ctx, [vcx, ny - 3], [vcx, hy + 8], 0, t, 3, k);
    for (const s of [-1, 1]) { // ghost hands clamped on the sides of the head
      const hx = vcx + s * (fw * 0.45 + 2), hy2 = foe.y + 6;
      limb(ctx, bez([vcx + s * 7, hy + 4], [vcx + s * 20, hy + 4], [hx, hy2], 5), 3.4, 2.2, false);
      for (let j = -1; j <= 1; j++) { ctx.strokeStyle = "rgba(200,130,255,0.95)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx, hy2); ctx.lineTo(hx - s * 3.4, hy2 + j * 3.2 + 1.2); ctx.stroke(); }
    }
    ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.9; ctx.strokeStyle = LIGHT; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(vcx, hy, 17, 4.5, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = MID; ctx.lineWidth = 1.3;
    for (let i = 0; i < TUNE2.runesPerBand; i++) { const a = t * 1.6 + (i * TAU) / TUNE2.runesPerBand; drawRune(ctx, vcx + Math.cos(a) * 17, hy + Math.sin(a) * 4.5, 3.2, i % 3, a); }
    ctx.restore();
    if (Math.random() < 0.3) dot(vcx + rnd(-10, 10), fy - rnd(2, 30), rnd(-0.4, 0.4), rnd(-1.2, -0.3), 20, rnd(1.2, 2), MID, { drag: 0.96 });
  }

  // ═════════════════════ EVENT HORIZON (ultimate): dimensional rift + colossal shadow entity ═════════════════════
  // VISUAL ONLY. It reads f.execution (phase / timers / target), which the sim owns, and never writes it.
  // It is drawn in three passes so the victim sits INSIDE the grip:
  //   drawBack  - before the fighters: dark screen, ground cracks, rift, the entity's body and arms
  //   (fighters)
  //   drawFront - after the fighters: the fingers closing over the victim, the piercing spikes, the slam light
  // Sizes live in EH. The sim only says WHEN (phase + timers + events); every picture here is procedural Canvas.
  const EH = {
    height: 285, // how tall the entity stands above the floor portal (px) - about 3.7x a fighter
    shX: 76, shY: 214, armA: 124, armB: 132, // shoulder spread / height, upper arm and forearm length
    strikeDeg: [-150, -30, 172, 14, -90], // where piercing strike 1..5 comes from (screen angle in degrees)
    spikeDist: 250, spikeLife: 13, telegraph: 7, // spike length from its tear, ticks a strike stays visible, ticks of warning before it
    maxDark: 0.5, // how dark the arena gets
  };
  const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
  const lerp = (a, b, u) => a + (b - a) * u;
  const hash1 = (n) => { const x = Math.sin(n * 127.1 + 17.3) * 43758.5453; return x - Math.floor(x); };
  const rad = (d) => (d * Math.PI) / 180;
  const ehLift = {}, ehDark = {}, ehGhost = {}, ehKick = {};
  const splats = []; // void ink splats left on the floor by the Void Overload slam: {x, y, life, max, blob, rays, drops}
  const ground = []; // slam cracks + light that stay on the floor for a moment: {x, y, life, max, lines, shafts}

  function bodyPos(f, alpha) { // where the renderer draws this fighter this frame (interpolated)
    const a = alpha === undefined ? 1 : alpha;
    const px = typeof f.px === "number" ? f.px : f.x, py = typeof f.py === "number" ? f.py : f.y;
    return { x: px + (f.x - px) * a, y: py + (f.y - py) * a };
  }
  function bez(a, c, b, n) { // quadratic curve as n+1 points
    const out = [];
    for (let i = 0; i <= n; i++) { const u = i / n, v = 1 - u; out.push([v * v * a[0] + 2 * u * v * c[0] + u * u * b[0], v * v * a[1] + 2 * u * v * c[1] + u * u * b[1]]); }
    return out;
  }
  function ik(sx, sy, tx, ty, l1, l2, bend) { // two-bone arm: shoulder -> hand, elbow bends to the `bend` side (+1 / -1)
    let dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy) || 1;
    const maxD = l1 + l2 - 2, minD = Math.abs(l1 - l2) + 10;
    if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; } else if (d < minD) { dx *= minD / d; dy *= minD / d; d = minD; }
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a)), ux = dx / d, uy = dy / d;
    return { ex: sx + ux * a - uy * h * bend, ey: sy + uy * a + ux * h * bend, hx: sx + dx, hy: sy + dy };
  }
  function poly(ctx, pts, fill, rim, lw) { // filled ink shape with a violet rim (rim === null: no outline)
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill || INK; ctx.fill();
    if (rim !== null) { ctx.strokeStyle = rim || "rgba(170,90,255,0.85)"; ctx.lineWidth = lw || 1.3; ctx.lineJoin = "round"; ctx.stroke(); }
  }
  function spikeShape(ctx, x0, y0, x1, y1, w, glowTip) { // long thin black thorn from base (x0,y0) to tip (x1,y1)
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    poly(ctx, [[x0 + nx * w / 2, y0 + ny * w / 2], [x0 + dx * 0.55 + nx * w * 0.18, y0 + dy * 0.55 + ny * w * 0.18], [x1, y1], [x0 + dx * 0.55 - nx * w * 0.18, y0 + dy * 0.55 - ny * w * 0.18], [x0 - nx * w / 2, y0 - ny * w / 2]], INK, "rgba(180,100,255,0.9)", 1.2);
    if (glowTip) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = LIGHT; ctx.lineWidth = 1; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.moveTo(x0 + dx * 0.12, y0 + dy * 0.12); ctx.lineTo(x0 + dx * 0.92, y0 + dy * 0.92); ctx.stroke(); ctx.restore(); }
  }
  function crackLine(ctx, x, y, dx, dy, n, amp, seed, alpha, col) { // a glowing jagged crack
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let i = 1; i <= n; i++) { const u = i / n; ctx.lineTo(x + dx * u + (hash1(seed + i * 1.7) - 0.5) * amp, y + dy * u + (hash1(seed + i * 2.9) - 0.5) * amp); }
    ctx.globalAlpha = alpha; ctx.strokeStyle = col || MID; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.globalAlpha = alpha * 0.9; ctx.strokeStyle = WHITE; ctx.lineWidth = 0.6; ctx.stroke();
  }

  // ── where everything is this frame, from the sim's execution state ──
  function ehParams(f, alpha) {
    const X = f.execution, C = X.cfg, v = X.target, t = nowSec();
    const vb = bodyPos(v, alpha), vw = v.stats.width, vh = v.stats.height;
    const mb = bodyPos(f, alpha);
    const ph = X.phase, p = ph === "open" ? X.t : X.p;
    const dir = X.rx - (mb.x + f.stats.width / 2) >= 0 ? 1 : -1; // from the Mage towards the victim
    const gs = -dir, ss = dir; // the grabbing arm comes from the Mage's side; the piercing arm is the far one
    const bx = X.rx, by = X.ry;
    let rise = 1, riftS = 1, entA = 1, reach = 1, curl = 0, raise = 0, charge = 0;
    const closing = (u) => (u < 0.5 ? 1 : 1 - Math.pow((u - 0.5) / 0.5, 2)); // the rift stays open, then collapses inward
    if (ph === "open") { const u = X.t / C.openTicks; rise = easeOutC(u); riftS = easeOutC(X.t / (C.openTicks * 0.4)); reach = smooth((u - 0.3) / 0.7); curl = u > 0.85 ? (u - 0.85) / 0.15 * 0.25 : 0; }
    else if (ph === "retreat") { const u = X.p / C.sinkTicks; rise = 1 - smooth(u / 0.7); riftS = closing(u); reach = 1 - smooth(u / 0.5); }
    else if (ph === "lift") { curl = smooth(X.p / 7); raise = smooth(X.p / C.liftTicks); }
    else if (ph === "impale") { curl = 1; raise = 1; }
    else if (ph === "windup") { curl = 1; raise = 1; charge = smooth(X.p / Math.max(1, C.windup)); }
    else if (ph === "slam") { curl = 1; raise = 1; charge = 1; }
    else { const u = X.p / C.sinkTicks; curl = 1 - smooth(u / 0.3); raise = 1 - smooth(u / 0.4); entA = 1 - smooth(u / 0.62); rise = 1 - 0.22 * smooth(u); riftS = closing(u); reach = 1 - smooth(u / 0.45); }
    const kick = ehKick[f.id] || 0;
    const ey = (1 - rise) * (EH.height + 40) + kick * 9;
    const vcx = vb.x + vw / 2, vcy = vb.y + vh / 2;
    // the strike in progress: age in ticks since it fired (negative = warning)
    let strikes = [], tipGlow = 0, recoil = 0;
    if (ph === "impale") {
      for (let k = 1; k <= C.impales; k++) {
        const age = X.p - k * C.impaleGap; // negative = the warning before the strike lands
        if (age >= -EH.telegraph && age < EH.spikeLife) strikes.push({ k, age });
        if (age >= 0) recoil = Math.max(recoil, Math.exp(-age / 3.5));
        if (age < 0 && age >= -EH.telegraph) tipGlow = Math.max(tipGlow, 1 - Math.abs(age) / EH.telegraph);
        else if (age >= 0 && age < 8) tipGlow = Math.max(tipGlow, 1 - age / 8);
      }
    }
    return { X, C, f, t, phase: ph, p, bx, by, ey, rise, riftS, entA, reach, curl, raise, charge, gs, ss, dir, vcx, vcy, vw, vh, vtop: vb.y, vfeet: vb.y + vh, strikes, tipGlow, recoil, kick };
  }

  // ── the entity: pieces ──
  function drawRift(ctx, P) { // a tall tear in space: jagged lens, black core, violet cracks
    const s = P.riftS; if (s < 0.03) return;
    const { bx, by, t } = P, Hh = (EH.height + 110) * s, W = 138 * s, cy = by - Hh * 0.5 + 10, N = 34, wob = Math.floor(t * 8);
    const pts = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU, j = 0.72 + 0.48 * hash1(i * 3.1 + wob * 0.37) * (i % 2 ? 1 : 0.6);
      pts.push([bx + Math.cos(a) * W * j * (1 - 0.55 * Math.pow(Math.abs(Math.sin(a)), 3)), cy + Math.sin(a) * (Hh / 2) * (0.92 + 0.08 * hash1(i + wob))]);
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.55 * s;
    glow(ctx, bx, cy, Hh * 0.62, "rgba(120,50,230,0.55)", "rgba(60,20,140,0)");
    ctx.restore();
    ctx.save();
    const g = ctx.createRadialGradient(bx, cy, 0, bx, cy, Hh * 0.5);
    g.addColorStop(0, "#9a5cff"); g.addColorStop(0.35, "#6a30d8"); g.addColorStop(0.7, "#2c1270"); g.addColorStop(0.93, "#12062f"); g.addColorStop(1, "#8a4aea");
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < N; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    ctx.shadowColor = MID; ctx.shadowBlur = 20; ctx.strokeStyle = LIGHT; ctx.lineWidth = 2.4; ctx.lineJoin = "round"; ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = WHITE; ctx.lineWidth = 0.8; ctx.globalAlpha = 0.8; ctx.stroke();
    ctx.globalCompositeOperation = "lighter"; // slow rays of dimensional light inside the tear
    for (let i = 0; i < 7; i++) { const rx0 = bx + (i - 3) * W * 0.28, sway = Math.sin(t * 0.9 + i * 1.7) * 10; ctx.globalAlpha = (0.16 + 0.09 * Math.sin(t * 1.6 + i)) * s; ctx.fillStyle = LIGHT; ctx.beginPath(); ctx.moveTo(rx0 - 6, by); ctx.lineTo(rx0 + sway - 2, by - Hh * 0.9); ctx.lineTo(rx0 + sway + 2, by - Hh * 0.9); ctx.lineTo(rx0 + 6, by); ctx.fill(); }
    // cracks leaking outward from the edge
    for (let i = 0; i < 12; i++) {
      const pt = pts[(i * 5 + 2) % N], ox = pt[0] - bx, oy = pt[1] - cy, l = Math.hypot(ox, oy) || 1, len = (22 + 44 * hash1(i * 7.7)) * s;
      crackLine(ctx, pt[0], pt[1], (ox / l) * len, (oy / l) * len, 4, 12, i * 13 + wob * 0.2, (0.45 + 0.35 * Math.sin(t * 5 + i * 1.3)) * s);
    }
    ctx.restore();
    if (Math.random() < 0.9 * s) { // smoke pulled in and thrown out along the edge
      const pt = pts[(Math.random() * N) | 0], out = Math.random() < 0.5, ox = pt[0] - bx, oy = pt[1] - cy, l = Math.hypot(ox, oy) || 1;
      add({ kind: "void", x: pt[0], y: pt[1], vx: (ox / l) * (out ? 0.7 : -0.9) + rnd(-0.3, 0.3), vy: (oy / l) * (out ? 0.7 : -0.9) - 0.2, life: 26, size: rnd(1.6, 3), drag: 0.97 });
    }
  }
  function drawPortalLip(ctx, P) { // the dark hole in the floor the entity climbs out of; drawn over its base
    const s = P.riftS; if (s < 0.03) return;
    const { bx, by, t } = P, rx = 98 * s, ry = 15 * s;
    ctx.save();
    ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.5 * s;
    ctx.fillStyle = "rgba(150,70,255,0.45)"; ctx.beginPath(); ctx.ellipse(bx, by + 1, rx * 1.25, ry * 1.7, 0, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#020106"; ctx.beginPath(); ctx.ellipse(bx, by + 1, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.shadowColor = MID; ctx.shadowBlur = 14; ctx.strokeStyle = LIGHT; ctx.lineWidth = 2; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = MID; ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) { const a0 = t * (1.6 + i * 0.5) + i * 2.1; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.ellipse(bx, by + 1, rx * (0.78 - i * 0.14), ry * (0.78 - i * 0.14), 0, a0, a0 + 1.2); ctx.stroke(); }
    ctx.restore();
  }
  function drawTendrils(ctx, P) { // long shadow tendrils from the back, writhing behind the body
    const { bx, by, ey, t } = P;
    for (let side = -1; side <= 1; side += 2) for (let k = 0; k < 3; k++) {
      const a = [bx + side * (30 + k * 12), by + ey - (150 + k * 26)];
      const b = [bx + side * (125 + k * 38 + 14 * Math.sin(t * 1.7 + k + side)), by + ey - (262 + k * 40 + 10 * Math.sin(t * 1.3 + k * 2))];
      limb(ctx, wave(a, b, 11, 20 + k * 4, t, k * 2.1 + side), 14 - k * 2, 1.4, true);
    }
  }
  function drawArm(ctx, P, sx, sy, hx, hy, bend, w0) { // shoulder -> elbow -> hand as one tapering limb, with plates and an elbow thorn
    const r = ik(sx, sy, hx, hy, EH.armA, EH.armB, bend), ctrl = [2 * r.ex - (sx + r.hx) / 2, 2 * r.ey - (sy + r.hy) / 2];
    limb(ctx, bez([sx, sy], ctrl, [r.hx, r.hy], 14), w0, 17, true);
    const mx = (sx + r.hx) / 2, my = (sy + r.hy) / 2, ox = r.ex - mx, oy = r.ey - my, ol = Math.hypot(ox, oy) || 1;
    spikeShape(ctx, r.ex, r.ey, r.ex + (ox / ol) * 40, r.ey + (oy / ol) * 40, 18, false); // elbow thorn
    for (let i = 0; i < 2; i++) { // armour fragments riding the forearm
      const u = 0.35 + i * 0.3, px = lerp(r.ex, r.hx, u), py = lerp(r.ey, r.hy, u), dx = r.hx - r.ex, dy = r.hy - r.ey, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
      poly(ctx, [[px + nx * 13, py + ny * 13], [px + (dx / l) * 14, py + (dy / l) * 14 + ny * 4], [px - nx * 13, py - ny * 13], [px - (dx / l) * 10, py - (dy / l) * 10]], INK, "rgba(160,80,255,0.7)", 1);
    }
    return r;
  }
  function drawPalm(ctx, x, y, ang, sc) { // the back of a huge hand: blocky palm, knuckle thorns, a glowing fissure
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(sc, sc);
    poly(ctx, [[-34, -24], [-8, -32], [26, -28], [40, -8], [38, 14], [24, 30], [-6, 32], [-30, 20], [-40, -2]], INK, "rgba(180,100,255,0.9)", 1.6);
    for (let i = 0; i < 4; i++) spikeShape(ctx, 28, -22 + i * 14, 40 + (i % 2) * 6, -26 + i * 15, 10, false); // knuckle thorns
    ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.55; ctx.strokeStyle = MID; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-24, -10); ctx.lineTo(-6, 2); ctx.lineTo(6, -6); ctx.lineTo(24, 8); ctx.stroke();
    ctx.restore();
  }
  function clawFinger(ctx, a, c, b, w0, w1, tipGlow) { // one tapering finger on a bent curve, ending in a claw
    const pts = bez(a, c, b, 8);
    limb(ctx, pts, w0, w1, false);
    const q = pts[pts.length - 2], e = pts[pts.length - 1], dx = e[0] - q[0], dy = e[1] - q[1], l = Math.hypot(dx, dy) || 1;
    spikeShape(ctx, e[0], e[1], e[0] + (dx / l) * 15, e[1] + (dy / l) * 15, w1 + 1, false);
    if (tipGlow > 0.02) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = tipGlow; glow(ctx, e[0] + (dx / l) * 10, e[1] + (dy / l) * 10, 11, "rgba(255,255,255,0.95)", "rgba(180,75,255,0)"); ctx.restore(); }
  }
  function drawEntityBody(ctx, P) {
    const { bx, by, ey, t } = P, Y = (up) => by + ey - up;
    drawTendrils(ctx, P);
    // floating obsidian halo: the half behind the head
    const halo = (front) => {
      for (let i = 0; i < 6; i++) {
        const a = t * 0.7 + (i * TAU) / 6, z = Math.sin(a); if ((z >= 0) !== front) continue;
        const sx = bx + Math.cos(a) * 70, sy = Y(268) + z * 15, sz = 1 + 0.25 * z;
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.cos(a) * 0.5);
        poly(ctx, [[0, -17 * sz], [6 * sz, 0], [0, 17 * sz], [-6 * sz, 0]], INK, "rgba(190,110,255,0.9)", 1.3);
        ctx.restore();
      }
    };
    halo(false);
    // crown of swept-back thorns behind the head
    for (let i = 0; i < 5; i++) { const a = rad(-118 + i * 14), L = 52 + 24 * hash1(i * 4.4) + 6 * Math.sin(t * 2 + i); spikeShape(ctx, bx + Math.cos(a) * 14, Y(272) + Math.sin(a) * 18, bx + Math.cos(a) * L * 1.05, Y(272) + Math.sin(a) * L, 15, false); }
    // torso: hunched, broad at the shoulders, craggy edge that smokes
    const R = [[-40, 44], [60, 50], [118, 60], [162, 74], [194, 96], [212, 72], [226, 34]], L = [], Rt = [];
    R.forEach((q, i) => { const j = (hash1(i * 5.3) - 0.5) * 9 + Math.sin(t * 1.5 + i) * 2.5; Rt.push([bx + q[1] + j, Y(q[0])]); L.push([bx - q[1] - j * 0.8, Y(q[0])]); });
    const body = L.concat(Rt.slice().reverse());
    const tg = ctx.createLinearGradient(0, by + ey, 0, Y(260)); tg.addColorStop(0, "#020106"); tg.addColorStop(0.55, "#0c0620"); tg.addColorStop(1, "#2a1560");
    poly(ctx, body, tg, "rgba(185,105,255,0.9)", 2);
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    glow(ctx, bx, Y(150), 70, "rgba(130,55,240," + (0.32 + 0.12 * Math.sin(t * 3)).toFixed(2) + ")", "rgba(60,20,140,0)"); // the living dark has a pulse inside it
    for (let i = 0; i < 4; i++) { // rib bands + glowing fissures between them
      const yy = 70 + i * 34, w = 44 + i * 6; ctx.globalAlpha = 0.5; ctx.strokeStyle = MID; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(bx - w, Y(yy)); ctx.quadraticCurveTo(bx, Y(yy) + 11, bx + w, Y(yy)); ctx.stroke();
    }
    for (let i = 0; i < 9; i++) { const x0 = (hash1(i * 3.3) - 0.5) * 100, y0 = 50 + hash1(i * 6.1) * 160; crackLine(ctx, bx + x0, Y(y0), (hash1(i) - 0.5) * 30, -26 - hash1(i + 4) * 30, 4, 14, i * 11, 0.45 + 0.35 * Math.sin(t * 2 + i)); }
    crackLine(ctx, bx, Y(70), 0, -130, 6, 10, 99, 0.7 + 0.2 * Math.sin(t * 4), LIGHT);
    ctx.restore();
    // pauldrons with irregular thorns
    for (let side = -1; side <= 1; side += 2) {
      const cx = bx + side * EH.shX, cy = Y(EH.shY);
      for (const [x0, y0, x1, y1] of [[-4, -26, -22, -86], [22, -24, 40, -100], [46, -6, 92, -58], [30, 22, 74, 34]]) spikeShape(ctx, cx + side * x0, cy + y0, cx + side * x1, cy + y1, 15, false);
      poly(ctx, [[-26, -16], [-8, -30], [30, -26], [54, -4], [44, 22], [10, 32], [-22, 20]].map((q) => [cx + side * q[0], cy + q[1]]), INK, "rgba(190,110,255,0.9)", 1.6);
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.5; crackLine(ctx, cx - side * 8, cy - 14, side * 40, 20, 4, 8, side * 7 + 3, 0.6); ctx.restore();
    }
    // head: smooth, faceless, with one faint fissure
    const hx = bx, hy = Y(262);
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(0.07 * Math.sin(t * 0.8));
    const hg = ctx.createRadialGradient(-6, -12, 2, 0, 0, 36); hg.addColorStop(0, "#241250"); hg.addColorStop(1, INK);
    ctx.beginPath(); ctx.ellipse(0, 0, 25, 34, 0, 0, TAU); ctx.fillStyle = hg; ctx.fill(); ctx.strokeStyle = "rgba(200,125,255,0.95)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalCompositeOperation = "lighter"; crackLine(ctx, -12, -26, 14, 30, 4, 6, 5, 0.5 + 0.3 * Math.sin(t * 3), MID);
    ctx.restore();
    halo(true);
  }

  // ── hands ──
  function drawSpikeHand(ctx, P, hx, hy) { // raised claws pointed down at the victim; the tips glow before each strike
    const ang = Math.atan2(P.vcy - hy, P.vcx - hx);
    drawPalm(ctx, hx, hy, ang, 1.05);
    for (let i = -2; i <= 2; i++) {
      const a = ang + i * 0.34, L = 62 - Math.abs(i) * 7, bx0 = hx + Math.cos(ang) * 34 + Math.cos(ang + Math.PI / 2) * i * 12, by0 = hy + Math.sin(ang) * 34 + Math.sin(ang + Math.PI / 2) * i * 12;
      const tx = bx0 + Math.cos(a) * L, ty = by0 + Math.sin(a) * L;
      clawFinger(ctx, [bx0, by0], [(bx0 + tx) / 2 + Math.cos(ang + Math.PI / 2) * -i * 4, (by0 + ty) / 2 + Math.sin(ang + Math.PI / 2) * -i * 4], [tx, ty], 13, 3.5, P.tipGlow);
    }
  }
  function drawGrabFingers(ctx, P, hx, hy) { // FRONT pass: the fingers cross over the victim's body and close around it
    const { gs, curl, vcx, vcy, t } = P;
    const open = P.reach < 1 || curl < 0.02;
    for (let i = 0; i < 5; i++) {
      const row = (i - 2) * 15, b = [hx - gs * 14, hy + row];
      const oT = [b[0] - gs * (60 - Math.abs(i - 2) * 6), b[1] + (i - 2) * 22]; // open: fanned out, reaching
      const cT = [vcx - gs * 20, vcy + (i - 2) * 17 - (i === 4 ? -6 : 0)]; // closed: tips end up past the middle of the body
      const tip = [lerp(oT[0], cT[0], curl), lerp(oT[1], cT[1], curl)];
      const mid = [(b[0] + tip[0]) / 2 - gs * 6 * (1 - curl) + (i === 4 ? 0 : 0), (b[1] + tip[1]) / 2 + (i - 2) * 3 * curl - 8 * curl];
      clawFinger(ctx, b, mid, tip, 14, 4, 0);
    }
    if (!open) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 8); ctx.strokeStyle = MID; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(vcx, vcy, 24, 38, 0, 0, TAU); ctx.stroke(); ctx.restore(); }
  }

  // ── BACK pass: everything behind the fighters ──
  function drawEntityBack(ctx, P) {
    const { bx, by, ey, gs, ss } = P;
    ctx.save();
    if (P.phase === "open" && P.riftS > 0.05) { // the grab zone: stand outside it to dodge
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(P.t * 14); ctx.strokeStyle = LIGHT; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.ellipse(bx, by, P.C.grabRX, 11, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "rgba(60,20,130,0.25)"; ctx.fill(); ctx.globalAlpha = 1;
    }
    drawRift(ctx, P);
    if (P.entA > 0.02 && P.rise > 0.03) {
      ctx.save();
      ctx.beginPath(); ctx.rect(bx - 560, by - 1000, 1120, 1003); ctx.clip(); // below the floor line is hidden: the lower body stays in the portal
      ctx.globalAlpha = P.entA;
      drawEntityBody(ctx, P);
      const restG = [bx + gs * 150, by + ey - 60], grabT = [P.phase === "open" ? bx + gs * 34 : P.vcx + gs * 34, P.phase === "open" ? by - P.vh * 0.5 : P.vcy];
      const gh = [lerp(restG[0], grabT[0], P.reach), lerp(restG[1], grabT[1], P.reach)];
      const restS = [bx + ss * 150, by + ey - 70], upS = [bx + ss * 128, by + ey - 318];
      const sh0 = [lerp(restS[0], upS[0], P.raise), lerp(restS[1], upS[1], P.raise)], recoilV = [P.vcx - sh0[0], P.vcy - sh0[1]], rl = Math.hypot(recoilV[0], recoilV[1]) || 1;
      const sh = [sh0[0] + (recoilV[0] / rl) * P.recoil * 16, sh0[1] + (recoilV[1] / rl) * P.recoil * 16];
      P.hands = { grab: gh, spike: sh };
      drawArm(ctx, P, bx + ss * EH.shX, by + ey - EH.shY, sh[0], sh[1], P.raise > 0.5 ? ss : -ss, 38);
      drawSpikeHand(ctx, P, sh[0], sh[1]);
      drawArm(ctx, P, bx + gs * EH.shX, by + ey - EH.shY, gh[0], gh[1], -gs, 38);
      drawPalm(ctx, gh[0], gh[1], gs > 0 ? Math.PI : 0, 1.12);
      ctx.restore();
    }
    drawPortalLip(ctx, P);
    ctx.restore();
    if (P.phase === "sink" || P.phase === "retreat") { // the body comes apart into smoke and violet motes
      const k = P.phase === "sink" ? 1 - P.entA : 1 - P.rise;
      for (let i = 0; i < 4; i++) if (Math.random() < 0.3 + k) {
        const x = bx + rnd(-70, 70), y = by + ey - rnd(20, 270);
        if (Math.random() < 0.55) add({ kind: "void", x, y, vx: rnd(-0.5, 0.5), vy: -rnd(0.6, 2.2), life: 30, size: rnd(2, 4), g: -0.02, drag: 0.97 });
        else dot(x, y, rnd(-0.4, 0.4), -rnd(0.8, 2.6), 26, rnd(1.4, 2.6), Math.random() < 0.5 ? MID : LIGHT, { drag: 0.96 });
      }
    }
  }

  // ── FRONT pass: what must overlap the victim ──
  function drawStrikeSpikes(ctx, P) { // the 4-5 distinct piercing strikes, each from its own small tear in space
    for (const st of P.strikes) {
      const th = rad(EH.strikeDeg[(st.k - 1) % EH.strikeDeg.length]), age = st.age, cth = Math.cos(th), sth = Math.sin(th);
      const ox = P.vcx + cth * EH.spikeDist, oy = P.vcy + sth * EH.spikeDist, tx = P.vcx - cth * 18, ty = P.vcy - sth * 18;
      let e, fade = 1, slit;
      if (age < 0) { e = 0.1 * (1 + age / EH.telegraph); slit = 1 + age / EH.telegraph; }
      else if (age < 2.4) { e = smooth(age / 2.4); slit = 1; }
      else if (age < 6) { e = 1; slit = 1; }
      else { const u = (age - 6) / (EH.spikeLife - 6); e = 1 - smooth(u); fade = 1 - u * 0.6; slit = 1 - smooth((u - 0.4) / 0.6); }
      ctx.save();
      // the tear the spike comes out of
      if (slit > 0.02) {
        ctx.translate(ox, oy); ctx.rotate(th);
        ctx.globalCompositeOperation = "lighter"; glow(ctx, 0, 0, 34 * slit, "rgba(150,70,255,0.5)", "rgba(80,30,180,0)"); ctx.globalCompositeOperation = "source-over";
        poly(ctx, [[0, -26 * slit], [7 * slit, 0], [0, 26 * slit], [-7 * slit, 0]], "#020106", LIGHT, 1.6);
        ctx.rotate(-th); ctx.translate(-ox, -oy);
      }
      if (e > 0.02) {
        const px = lerp(ox, tx, e), py = lerp(oy, ty, e);
        ctx.globalAlpha = fade; spikeShape(ctx, ox, oy, px, py, 14, true);
        const l = Math.hypot(px - ox, py - oy) || 1, nx = -(py - oy) / l, ny = (px - ox) / l;
        for (const q of [0.5, 0.72]) { const bx0 = lerp(ox, px, q), by0 = lerp(oy, py, q); spikeShape(ctx, bx0, by0, bx0 + nx * 16 + (px - ox) / l * 10, by0 + ny * 16 + (py - oy) / l * 10, 6, false); spikeShape(ctx, bx0, by0, bx0 - nx * 16 + (px - ox) / l * 10, by0 - ny * 16 + (py - oy) / l * 10, 6, false); }
        if (age >= 0 && age < 4) { ctx.globalAlpha = 1 - age / 4; ctx.globalCompositeOperation = "lighter"; glow(ctx, tx, ty, 34, "rgba(255,255,255,0.95)", "rgba(190,110,255,0)"); }
      }
      ctx.restore();
    }
  }
  function drawCaptureWrap(ctx, P) { // black-violet energy winding around the captured body
    const { vcx, vcy, t } = P; ctx.save(); ctx.lineCap = "round";
    for (let j = 0; j < 3; j++) {
      const pts = [];
      for (let i = 0; i <= 16; i++) { const u = i / 16, ph = t * 3 + j * 2.1 + u * 7; pts.push([vcx + Math.cos(ph) * (22 + 5 * Math.sin(u * 3 + j)), vcy - 44 + u * 88 + Math.sin(ph) * 2]); }
      ctx.strokeStyle = "rgba(8,3,20,0.8)"; ctx.lineWidth = 6; ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke();
      ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = MID; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.8; ctx.stroke(); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  function drawEntityFront(ctx, P) {
    ctx.save();
    if (P.entA > 0.05 && P.hands) {
      ctx.globalAlpha = P.entA;
      drawGrabFingers(ctx, P, P.hands.grab[0], P.hands.grab[1]);
      ctx.globalAlpha = 1;
    }
    if (P.phase === "lift" || P.phase === "impale" || P.phase === "windup") drawCaptureWrap(ctx, P);
    drawStrikeSpikes(ctx, P);
    if (P.phase === "windup" || P.phase === "slam") { // the finisher is coming: light gathers in the grip, the floor marks where it will land
      const k = P.phase === "slam" ? 1 : P.charge, gy = P.X.ry;
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.25 + 0.5 * k; ctx.fillStyle = "rgba(160,80,255,0.55)"; ctx.beginPath(); ctx.ellipse(P.vcx, gy, 24 + 56 * k, 5 + 9 * k, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.9 * k; ctx.strokeStyle = WHITE; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(P.vcx, gy, 24 + 56 * k, 5 + 9 * k, 0, 0, TAU); ctx.stroke();
      glow(ctx, P.vcx, P.vcy, 30 + 38 * k, "rgba(255,255,255," + (0.35 * k).toFixed(2) + ")", "rgba(160,80,255,0)");
      if (P.phase === "slam") { ctx.globalAlpha = 0.8; ctx.strokeStyle = LIGHT; ctx.lineWidth = 1.6; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(P.vcx + i * 9, P.vcy - 40); ctx.lineTo(P.vcx + i * 9, P.vcy - 40 - 70 - Math.abs(i) * 14); ctx.stroke(); } }
      ctx.restore();
      if (P.phase === "windup" && Math.random() < 0.7) { const a = Math.random() * TAU, d = rnd(40, 80); dot(P.vcx + Math.cos(a) * d, P.vcy + Math.sin(a) * d, (-Math.cos(a) * d) / 11, (-Math.sin(a) * d) / 11, 11, rnd(1.4, 2.6), Math.random() < 0.4 ? WHITE : MID, { drag: 1 }); }
    }
    ctx.restore();
  }

  // ── floor: slam cracks with violet light pushing up through them ──
  // ── ink splash: the slammed body bursts into void ink. It is a SIDE view, so the ink behaves like liquid on the floor line:
  // a crown of tapered spikes jumps up and collapses, droplets fly out under gravity and stain the floor where they land, a thin
  // meniscus-edged pool spreads along the platform top (clipped to the platform) and drips run down its front face. ──
  const SPLAT_INK = "#12051f";
  function addSplat(x, y, x0, x1) {
    const sp = { x, y, x0: typeof x0 === "number" ? x0 : x - 400, x1: typeof x1 === "number" ? x1 : x + 400, life: 96, max: 96, spikes: [], drops: [], stains: [], drips: [], L: [rnd(95, 135), rnd(95, 135)], bump: [] };
    for (let i = 0; i < 40; i++) sp.bump.push(rnd(0.8, 1.2));
    for (let i = 0; i < 11; i++) { const u = (i + 0.5) / 11 - 0.5, a = u * 2.5 + rnd(-0.12, 0.12); sp.spikes.push({ a, h: rnd(55, 135) * (1 - Math.abs(u) * 0.65), w: rnd(6, 11), bx: rnd(-10, 10), det: false }); }
    for (let i = 0; i < 18; i++) { const sd = i % 2 ? 1 : -1; sp.drops.push({ x: x + sd * rnd(0, 14), y: y - rnd(2, 12), vx: sd * rnd(1.2, 7.5), vy: -rnd(4, 11), r: rnd(1.6, 4.4), on: true }); }
    for (let i = 0; i < 4; i++) sp.drips.push({ x: x + rnd(-70, 70), len: 0, max: rnd(12, 34), delay: 8 + ((Math.random() * 18) | 0), w: rnd(2, 3.6) });
    if (splats.length > 4) splats.shift();
    splats.push(sp);
  }
  // back layer (behind the fighters): updates the splash, draws the pool on the floor, the stains and the drips down the platform face
  function drawSplats(ctx) {
    for (let si = splats.length - 1; si >= 0; si--) {
      const sp = splats[si]; sp.life--; if (sp.life <= 0) { splats.splice(si, 1); continue; }
      const age = sp.max - sp.life, fade = Math.min(1, sp.life / 34), fy = sp.y;
      const grow = 1 - Math.pow(1 - Math.min(1, age / 9), 3), settle = 1 - 0.5 * Math.min(1, age / 60);
      for (const d of sp.drops) { // droplets: thrown out, pulled down, stain the floor where they land (only on the platform)
        if (!d.on) continue;
        d.x += d.vx; d.y += d.vy; d.vy += 0.5; d.vx *= 0.99;
        if (d.vy > 0 && d.y >= fy) { d.on = false; if (d.x > sp.x0 + 3 && d.x < sp.x1 - 3) sp.stains.push({ x: d.x, r: d.r * 1.6, age: 0 }); } else if (d.y > fy + 80) d.on = false;
      }
      ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.rect(sp.x0 + 1, fy - 60, sp.x1 - sp.x0 - 2, 200); ctx.clip(); // the ink never leaves the platform
      const N = 36, Hp = 12.5 * settle * (age < 2 ? 0.4 : 1);
      const poolPts = [];
      for (let i = N; i >= 0; i--) poolPts.push([sp.x - sp.L[0] * grow * (i / N), fy - Math.pow(Math.max(0, 1 - Math.pow(i / N, 2.3)), 0.8) * Hp * sp.bump[i % 40]]);
      for (let i = 1; i <= N; i++) poolPts.push([sp.x + sp.L[1] * grow * (i / N), fy - Math.pow(Math.max(0, 1 - Math.pow(i / N, 2.3)), 0.8) * Hp * sp.bump[(i + 7) % 40]]);
      ctx.globalAlpha = fade; ctx.fillStyle = SPLAT_INK;
      ctx.beginPath(); ctx.moveTo(poolPts[0][0], fy + 1); for (const q of poolPts) ctx.lineTo(q[0], q[1]); ctx.lineTo(poolPts[poolPts.length - 1][0], fy + 1); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = MID; ctx.lineWidth = 2.4; ctx.beginPath(); poolPts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke(); // meniscus rim
      ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = fade * (0.55 + 0.2 * Math.sin(age * 0.3)); ctx.strokeStyle = LIGHT; ctx.lineWidth = 1;
      ctx.beginPath(); poolPts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1] + 1.4) : ctx.moveTo(q[0], q[1] + 1.4))); ctx.stroke(); // wet highlight
      ctx.globalAlpha = fade * 0.3; ctx.fillStyle = MID; ctx.fillRect(sp.x - sp.L[0] * grow * 0.7, fy - 4, (sp.L[0] + sp.L[1]) * 0.7 * grow, 4);
      ctx.globalCompositeOperation = "source-over";
      for (const st of sp.stains) { st.age++; const gg = Math.min(1, st.age / 4); ctx.globalAlpha = fade; ctx.fillStyle = SPLAT_INK; ctx.strokeStyle = MID; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(st.x, fy, st.r * 1.8 * gg, st.r * 0.9 * gg, 0, Math.PI, TAU); ctx.fill(); ctx.stroke(); }
      ctx.restore();
      for (const dp of sp.drips) { // drips running down the front face of the platform
        if (age < dp.delay || dp.x < sp.x0 + 6 || dp.x > sp.x1 - 6) continue;
        dp.len = Math.min(dp.max, dp.len + 0.9);
        ctx.save(); ctx.globalAlpha = fade; ctx.lineCap = "round";
        ctx.strokeStyle = SPLAT_INK; ctx.lineWidth = dp.w + 1.8; ctx.beginPath(); ctx.moveTo(dp.x, fy); ctx.lineTo(dp.x, fy + dp.len); ctx.stroke();
        ctx.strokeStyle = MID; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(dp.x - dp.w * 0.4, fy); ctx.lineTo(dp.x - dp.w * 0.4, fy + dp.len); ctx.stroke();
        ctx.fillStyle = SPLAT_INK; ctx.beginPath(); ctx.arc(dp.x, fy + dp.len, dp.w * 0.9 + 0.8, 0, TAU); ctx.fill(); ctx.restore();
      }
    }
  }
  // front layer (over the fighters): the crown of ink spikes jumping up and the flying droplets
  function drawSplatsFront(ctx) {
    for (const sp of splats) {
      const age = sp.max - sp.life, fade = Math.min(1, sp.life / 34), fy = sp.y;
      ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (age < 18) {
        const u = age / 18, hh = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05)), 0.75);
        for (const k of sp.spikes) {
          const H = k.h * hh * (age < 3 ? age / 3 : 1), bx = sp.x + k.bx, tx = bx + Math.sin(k.a) * H * 0.75, ty = fy - Math.cos(k.a) * H, cx = bx + Math.sin(k.a) * H * 0.15, cy = fy - H * 0.62;
          if (H < 2) continue;
          ctx.globalAlpha = fade; ctx.fillStyle = SPLAT_INK; ctx.strokeStyle = MID; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(bx - k.w, fy); ctx.quadraticCurveTo(cx - k.w * 0.4, cy, tx, ty); ctx.quadraticCurveTo(cx + k.w * 0.4, cy, bx + k.w, fy); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.arc(tx, ty, 3 + k.w * 0.3, 0, TAU); ctx.fill(); ctx.stroke(); // bead on the tip
          if (!k.det && age > 9 + (k.w | 0)) { k.det = true; sp.drops.push({ x: tx, y: ty, vx: Math.sin(k.a) * 2.2, vy: -1, r: 2.6, on: true }); }
        }
      }
      for (const d of sp.drops) {
        if (!d.on) continue;
        const sp2 = Math.hypot(d.vx, d.vy), ang = Math.atan2(d.vy, d.vx);
        ctx.globalAlpha = fade; ctx.fillStyle = SPLAT_INK; ctx.strokeStyle = MID; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r + sp2 * 0.55, d.r * 0.9, ang, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = LIGHT; ctx.globalAlpha = fade * 0.8; ctx.beginPath(); ctx.arc(d.x - d.r * 0.3, d.y - d.r * 0.3, Math.max(0.8, d.r * 0.3), 0, TAU); ctx.fill(); // specular dot
      }
      ctx.restore();
    }
  }
  function drawGround(ctx) {
    drawSplats(ctx);
    for (let gi = ground.length - 1; gi >= 0; gi--) {
      const g = ground[gi]; g.life--; if (g.life <= 0) { ground.splice(gi, 1); continue; }
      const age = g.max - g.life, grow = Math.min(1, age / 9), fade = Math.min(1, g.life / 40);
      ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (const L of g.lines) {
        const n = Math.max(2, Math.ceil(L.length * grow));
        ctx.beginPath(); ctx.moveTo(g.x + L[0][0], g.y + L[0][1]); for (let i = 1; i < n; i++) ctx.lineTo(g.x + L[i][0], g.y + L[i][1]);
        ctx.globalAlpha = 0.9 * fade; ctx.strokeStyle = "#04020a"; ctx.lineWidth = 5; ctx.stroke();
        ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = (0.55 + 0.3 * Math.sin(age * 0.4)) * fade; ctx.strokeStyle = MID; ctx.lineWidth = 2.4; ctx.stroke();
        ctx.globalAlpha = 0.8 * fade; ctx.strokeStyle = WHITE; ctx.lineWidth = 0.9; ctx.stroke(); ctx.globalCompositeOperation = "source-over";
      }
      ctx.globalCompositeOperation = "lighter";
      for (const s of g.shafts) { const hgt = s.h * Math.max(0, 1 - age / 26) * grow; if (hgt < 1) continue; const gr = ctx.createLinearGradient(0, g.y, 0, g.y - hgt); gr.addColorStop(0, "rgba(220,170,255,0.8)"); gr.addColorStop(1, "rgba(150,70,255,0)"); ctx.fillStyle = gr; ctx.globalAlpha = fade; ctx.fillRect(g.x + s.x - s.w / 2, g.y - hgt, s.w, hgt); }
      ctx.restore();
    }
  }
  function addSlamCracks(x, y) {
    const lines = [], shafts = [];
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? 1 : -1, len = rnd(80, 300) * (i < 5 ? 1 : 0.55), n = 7 + ((Math.random() * 4) | 0), pts = [[0, 1]]; let px = 0, py = 1 + rnd(0, 3);
      for (let j = 1; j <= n; j++) { px += (side * len / n) * rnd(0.7, 1.3); py = clamp(py + rnd(-7, 9), 0, 22); pts.push([px, py]); if (j % 2 === 0 && Math.random() < 0.7) shafts.push({ x: px, h: rnd(14, 52), w: rnd(2, 5) }); }
      lines.push(pts);
    }
    shafts.push({ x: 0, h: 150, w: 14 }, { x: -10, h: 96, w: 6 }, { x: 12, h: 110, w: 6 });
    if (ground.length > 4) ground.shift();
    ground.push({ x, y, life: 100, max: 100, lines, shafts });
  }

  // ═════════════════════ RIFT SPIKES as thorned VINES, and ABYSSAL GRASP as a crowd of HANDS ═════════════════════
  // VISUAL ONLY. Both read the zone objects the sim owns (z.spikes / z.holding / z.rad ...) and never write to them.
  // The little per-hand "reach / grip / let go" memory lives in a WeakMap here, not on the sim's zone.
  const handMem = new WeakMap();

  // ── vines ──
  function vineGeom(f, z, sp, i, alpha) { // where one vine goes: it grows from its crack to the enemy's body and out the other side
    const C = z.cfg, foe = f.foe, h = MW.voidSpikeHeight(z, sp);
    if (h < 2) return null;
    const lt = z.t - sp.delay, grow = clamp(h / sp.h, 0, 1);
    let ax = sp.x + sp.lean * sp.h * 2, ay = z.y - sp.h * 0.9, aimed = 0, pu = 0;
    if (foe && foe.state !== MW.STATE.KO && lt <= C.eruptTicks + 10) {
      const fb = bodyPos(foe, alpha), fcx = fb.x + foe.stats.width / 2, fy = fb.y + foe.stats.height;
      if (Math.abs(fcx - sp.x) < C.radius + 40) {
        aimed = clamp(1 - (lt - C.eruptTicks) / 10, 0, 1); // let go of the body once the eruption is over
        const k = (i - (C.count - 1) / 2), tx = fcx + k * 5, ty = fy - foe.stats.height * (0.22 + 0.56 * hash1(i * 5.3 + 1));
        ax = lerp(ax, tx, aimed); ay = lerp(ay, ty, aimed); pu = aimed;
      }
    }
    const dx = ax - sp.x, dy = ay - z.y, d = Math.hypot(dx, dy) || 1, ex = pu > 0 ? 70 : 0; // when it is stabbing the body it carries on 70px past it
    return { bx: sp.x, by: z.y, ux: dx / d, uy: dy / d, len: (d + ex) * Math.max(0.35, 1) , dist: d, grow, aimed, i, lt, w: sp.w };
  }
  function vinePts(G, t, upto) { // points along the vine from its root, up to the fraction `upto` of its full length
    const pts = [], n = 30, px = -G.uy, py = G.ux;
    for (let k = 0; k <= n; k++) {
      const u = (k / n) * upto, env = Math.min(1, u * 3.2), wig = (11 + 5 * hash1(G.i * 3.7)) * env * Math.sin(u * TAU * 1.55 + G.i * 1.9 + t * 2.3) * (1 - 0.35 * u);
      pts.push([G.bx + G.ux * G.len * u + px * wig, G.by + G.uy * G.len * u + py * wig]);
    }
    return pts;
  }
  function drawVine(ctx, G, t, from, to, a) { // one tapering thorned vine (or just the part between `from` and `to`, used to weave it through the body)
    const full = clamp(G.grow * 1.0, 0, 1), pts = vinePts(G, t, full), w0 = 12 + 3 * (G.w / 26), seg = pts.slice(Math.floor(from * (pts.length - 1)), Math.ceil(to * (pts.length - 1)) + 1);
    if (seg.length < 2) return;
    ctx.save(); ctx.globalAlpha = a;
    if (from <= 0) { // the root: a split in the floor with a heaving lump of black
      ctx.save(); ctx.globalCompositeOperation = "lighter"; glow(ctx, G.bx, G.by, 26 * full + 6, "rgba(170,80,255,0.5)", "rgba(100,30,220,0)"); ctx.restore();
      ctx.fillStyle = "#04020a"; ctx.beginPath(); ctx.ellipse(G.bx, G.by + 1, 13 + 6 * full, 4, 0, 0, TAU); ctx.fill();
    }
    const i0 = Math.floor(from * (pts.length - 1)), width = (k) => lerp(w0, 1.3, (k + i0) / (pts.length - 1));
    limb(ctx, seg, width(0), Math.max(2.2, width(seg.length - 1)), true);
    for (const uk of [0.14, 0.27, 0.4, 0.53, 0.66, 0.79, 0.9]) { // thorns, alternating sides, getting shorter towards the tip
      if (uk > full || uk < from || uk > to) continue;
      const k = Math.round(uk * (pts.length - 1)), p = pts[k], q = pts[Math.min(pts.length - 1, k + 1)], tx = q[0] - p[0], ty = q[1] - p[1], l = Math.hypot(tx, ty) || 1, side = k % 2 ? 1 : -1;
      const nx = (-ty / l) * side, ny = (tx / l) * side, L = 13 - 7 * uk;
      spikeShape(ctx, p[0], p[1], p[0] + nx * L + (tx / l) * L * 0.55, p[1] + ny * L + (ty / l) * L * 0.55, 5.5, false);
    }
    if (to >= 1 && full > 0.15) { // the sharp head, glowing white-violet
      const p = seg[seg.length - 1], q = seg[seg.length - 2], tx = p[0] - q[0], ty = p[1] - q[1], l = Math.hypot(tx, ty) || 1;
      spikeShape(ctx, p[0], p[1], p[0] + (tx / l) * 22, p[1] + (ty / l) * 22, 6, true);
      ctx.save(); ctx.globalCompositeOperation = "lighter"; glow(ctx, p[0] + (tx / l) * 18, p[1] + (ty / l) * 18, 8, "rgba(240,215,255,0.9)", "rgba(180,75,255,0)"); ctx.restore();
    }
    if (from <= 0 && full > 0.3) { // two small curling tendrils off the base
      for (let s = -1; s <= 1; s += 2) limb(ctx, wave([G.bx + s * 4, G.by - 2], [G.bx + s * (20 + 10 * full), G.by - 14 * full - 4], 8, 4, t, s * 2 + G.i), 3.5, 0.8, false);
    }
    ctx.restore();
  }
  function vinesOf(f, alpha) { const out = []; for (const z of f.zones || []) if (z.kind === "spikes") out.push(z); return out; }
  function drawVinesFront(ctx, f, alpha) { // whole vines, drawn over the fighters so they visibly pierce and wrap the enemy; a glowing wound where each one goes in
    const t = nowSec();
    for (const z of vinesOf(f)) {
      const a = clamp((z.life - z.t) / z.cfg.dissolve, 0, 1);
      z.spikes.forEach((sp, i) => {
        const G = vineGeom(f, z, sp, i, alpha); if (!G) return;
        drawVine(ctx, G, t, 0, 1, a);
        if (G.aimed > 0.3 && G.grow > 0.8) {
          const uA = G.dist / G.len, pts = vinePts(G, t, clamp(G.grow, 0, 1)), p = pts[Math.min(pts.length - 1, Math.round(uA * (pts.length - 1)))];
          ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.85 * G.aimed * a; glow(ctx, p[0], p[1], 14, "rgba(255,255,255,0.8)", "rgba(190,90,255,0)"); ctx.restore();
        }
      });
    }
  }

  // ── hands ──
  function handDraw(ctx, root, tip, size, curl, sway, glowAmt, t, ang, arch) { // arm, palm and five fingers
    const mx = (root[0] + tip[0]) / 2 + sway, my = Math.min(root[1], tip[1]) - 6 - 0.14 * Math.hypot(tip[0] - root[0], tip[1] - root[1]) * (1 - arch); // arms rise out of the pool and arch over; they straighten when stretched
    limb(ctx, bez(root, [mx, my], tip, 9), 4.8 * size, 2.6 * size, false);
    ctx.save(); ctx.translate(tip[0], tip[1]); ctx.rotate(ang);
    ctx.beginPath(); ctx.ellipse(0, 0, 4.3 * size, 3.7 * size, 0, 0, TAU); ctx.fillStyle = INK; ctx.fill(); inkRim(ctx, "rgba(190,110,255,0.95)", 1.1);
    for (let i = 0; i < 5; i++) {
      const a = (i - 2) * lerp(0.5, 0.2, curl), L = (i === 2 ? 5.6 : i === 0 || i === 4 ? 4 : 5) * size, bend = curl * 1.5 * (i < 2 ? 1 : -1) * (i === 2 ? 0.6 : 1);
      const x0 = Math.sin(a) * 2.6 * size, y0 = -Math.cos(a) * 2.6 * size, x1 = x0 + Math.sin(a) * L, y1 = y0 - Math.cos(a) * L, x2 = x1 + Math.sin(a + bend) * L * 0.8, y2 = y1 - Math.cos(a + bend) * L * 0.8;
      ctx.lineCap = "round"; ctx.strokeStyle = "#04020a"; ctx.lineWidth = 2.3 * size; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = "rgba(180,100,255,0.9)"; ctx.lineWidth = 0.9; ctx.stroke();
    }
    ctx.restore();
    if (glowAmt > 0.02) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = glowAmt; glow(ctx, tip[0], tip[1], 9 * size, "rgba(200,140,255,0.7)", "rgba(140,60,255,0)"); ctx.restore(); }
  }
  function updateHands(f, z, alpha) { // the reach / grip / let-go brain of every hand. Frame-based, visual only.
    const C = z.cfg, foe = f.foe, K = C.collapse;
    let M = handMem.get(z);
    if (!M) { M = { hands: [] }; const n = Math.floor((C.radius * 2) / 10); for (let i = 0; i < n; i++) for (let row = 0; row < 2; row++) M.hands.push({ off: ((i + row * 0.5) / (n - 1) * 2 - 1), row, size: row ? 0.78 : 1.05, st: "idle", p: 0, cool: (hash1(i * 2.3 + row) * 30) | 0, wait: 0, ph: hash1(i * 7.7 + row * 3) * TAU, oy: 0.06 + 0.9 * hash1(i * 4.1 + row * 9), ox: (hash1(i * 6.1 + row) - 0.5) * 0.8, reach: 0 }); handMem.set(z, M); }
    const x0 = Math.max(z.xMin, z.cx - z.rad), x1 = Math.min(z.xMax, z.cx + z.rad), alive = clamp((z.life - z.t) / 24, 0, 1), grow = clamp((z.t - 6) / 16, 0, 1);
    let fb = null, inPool = false;
    if (foe && foe.state !== MW.STATE.KO) { fb = bodyPos(foe, alpha); const fcx = fb.x + foe.stats.width / 2, feet = fb.y + foe.stats.height; inPool = fcx > x0 && fcx < x1 && feet >= z.y - C.zoneHeight && feet <= z.y + 10; fb.cx = fcx; fb.feet = feet; }
    M.alive = alive; M.grow = grow; M.x0 = x0; M.x1 = x1; M.fb = fb; M.inPool = inPool;
    const cp = z.cp || 0;
    for (const h of M.hands) {
      h.x = z.cx + h.off * z.rad; h.on = h.x > z.xMin + 6 && h.x < z.xMax - 6 && grow > 0.05;
      if (!h.on) continue;
      if (h.cool > 0) h.cool--;
      h.tx = fb ? fb.cx + h.ox * foe.stats.width : 0; h.ty = fb ? fb.feet - h.oy * foe.stats.height : 0;
      const dist = fb ? Math.hypot(h.tx - h.x, h.ty - z.y) : 1e9, range = 92 * h.size + (cp > 0 ? 70 : 0);
      h.stretch = dist / range;
      if (h.st === "idle") { if (inPool && dist < range && h.cool <= 0) { h.st = "reach"; h.p = 0; } }
      else if (h.st === "reach") { h.p += 0.085; if (!inPool || dist > range * 1.1) h.st = "release"; else if (h.p >= 1) { h.p = 1; h.st = "grip"; } }
      else if (h.st === "grip") { h.p = 1; if (!inPool || (cp === 0 && dist > range * 1.12)) { h.st = "release"; h.cool = 16 + ((hash1(h.ph) * 34) | 0); for (let q = 0; q < 2; q++) dot(h.x, z.y - 6, rnd(-1, 1), -rnd(0.3, 1.4), 16, rnd(1.2, 2.2), MID, { drag: 0.93 }); } }
      else if (h.st === "release") { h.p -= 0.1; if (h.p <= 0) { h.p = 0; h.st = "idle"; } }
    }
  }
  function drawHandsPass(ctx, f, z, alpha, active) { // active=false: waving idle hands (behind the fighters); active=true: reaching / gripping / letting go (in front)
    const M = handMem.get(z); if (!M) return;
    const t = nowSec(), C = z.cfg, cp = z.cp || 0;
    ctx.save(); ctx.globalAlpha = M.alive;
    for (const row of [1, 0]) for (const h of M.hands) {
      if (h.row !== row || !h.on) continue;
      const isActive = h.st !== "idle"; if (isActive !== active) continue;
      const idleH = (13 + 9 * Math.sin(t * 2.1 + h.ph)) * h.size * M.grow * (1 - 0.45 * cp), lean = Math.sin(t * 1.5 + h.ph) * 4 + (M.fb && M.inPool ? clamp((M.fb.cx - h.x) * 0.06, -7, 7) : 0);
      const idleTip = [h.x + lean, z.y - idleH], root = [h.x, z.y + 1];
      let tip = idleTip, curl = cp * 0.8, glowA = 0, ang = Math.atan2(idleTip[1] - root[1], idleTip[0] - root[0]) + Math.PI / 2, sway = Math.sin(t * 3 + h.ph) * 2.5;
      if (isActive && M.fb) {
        const e = h.st === "release" ? h.p * h.p * (3 - 2 * h.p) : smooth(h.p);
        tip = [lerp(idleTip[0], h.tx, e), lerp(idleTip[1], h.ty, e)];
        curl = h.st === "grip" ? 1 : h.st === "reach" ? h.p * 0.35 : h.p * 0.5; sway *= 1 - 0.8 * clamp(h.stretch, 0, 1); glowA = h.st === "grip" ? 0.5 : 0.15;
        ang = Math.atan2(tip[1] - root[1], tip[0] - root[0]) + Math.PI / 2 + (h.st === "release" ? Math.sin(t * 9 + h.ph) * 0.5 * h.p : 0); // let-go hands flop
        if (h.st === "release") tip = [tip[0], tip[1] + (1 - h.p) * 0] ;
      }
      handDraw(ctx, root, tip, h.size * (isActive ? 1.35 : 1), curl, sway, glowA, t, ang, isActive ? clamp(h.stretch, 0, 1) : 1);
    }
    ctx.restore();
  }
  function handsOf(f) { const out = []; for (const z of f.zones || []) if (z.kind === "grasp") out.push(z); return out; }

  // ── per-frame entry points called by the renderer ──
  function voidMages(sim) { return sim.fighters.filter((f) => f.stats && f.stats.id === "mage"); }
  function darkLevel(f) { // 0..1: how dark the arena should be around this Mage's ultimate
    const S = MW.STATE;
    if (f.state === S.KO) return 0;
    if (f.hit && f.hit.id === "void_execution" && f.state === S.ATTACK_STARTUP) return 1;
    const X = f.execution; if (!X) return 0;
    if (X.phase === "sink" || X.phase === "retreat") return 1 - smooth(X.p / X.cfg.sinkTicks);
    return 1;
  }
  function drawBack(ctx, sim, alpha) {
    if (!sim || !sim.fighters) return;
    let want = 0;
    for (const f of voidMages(sim)) { const d = (ehDark[f.id] = (ehDark[f.id] || 0) + (darkLevel(f) - (ehDark[f.id] || 0)) * 0.12); want = Math.max(want, d); }
    if (want > 0.01 && ctx.canvas && ctx.canvas.width) { // arena dims; the fighters are drawn after this, so they stay bright
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = want * EH.maxDark; ctx.fillStyle = "#08021c"; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();
    }
    drawGround(ctx);
    for (const k in ehKick) ehKick[k] = ehKick[k] < 0.02 ? 0 : ehKick[k] * 0.86;
    for (const f of voidMages(sim)) { // Rift Spikes vines (whole, behind) and the Grasp hands (waving ones behind; the state of every hand is updated here)
      for (const z of handsOf(f)) { updateHands(f, z, alpha); drawHandsPass(ctx, f, z, alpha, false); }
    }
    for (const f of voidMages(sim)) {
      if (f.execution && f.state !== MW.STATE.KO) {
        const P = ehParams(f, alpha); ehGhost[f.id] = { P, life: 14 };
        drawEntityBack(ctx, P);
        drawTether(ctx, f, P, alpha);
      } else if (ehGhost[f.id] && ehGhost[f.id].life > 0) { // the Mage was knocked out of it: the entity tears apart quickly instead of blinking out
        const G = ehGhost[f.id], k = --G.life / 14, P = Object.assign({}, G.P, { entA: G.P.entA * k, riftS: G.P.riftS * k, phase: "retreat", rise: G.P.rise * (0.4 + 0.6 * k), hands: null, strikes: [] });
        drawEntityBack(ctx, P);
      }
    }
  }
  function drawFront(ctx, sim, alpha) {
    if (!sim || !sim.fighters) return;
    drawSplatsFront(ctx);
    for (const f of voidMages(sim)) { drawVinesFront(ctx, f, alpha); for (const z of handsOf(f)) drawHandsPass(ctx, f, z, alpha, true); }
    for (const f of voidMages(sim)) if (f.execution && f.state !== MW.STATE.KO) { const P = ehParams(f, alpha); P.hands = (ehGhost[f.id] && ehGhost[f.id].P.hands) || null; drawEntityFront(ctx, P); }
  }
  function drawTether(ctx, f, P, alpha) { // a thread of violet energy from the Mage's chest to the rift: he is the one summoning it
    const mb = bodyPos(f, alpha), cx = mb.x + f.stats.width / 2, cy = mb.y + f.stats.height * 0.45 - (ehLift[f.id] || 0), t = P.t;
    const ex = P.bx, ey2 = P.by - 120 * P.riftS, dx = ex - cx, dy = ey2 - cy, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
    for (let j = 0; j < 2; j++) {
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) { const u = i / 24, o = Math.sin(u * 9 - t * 7 + j * 3) * 9 * Math.sin(u * Math.PI); const x = cx + dx * u + nx * o, y = cy + dy * u + ny * o - Math.sin(u * Math.PI) * 24; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.globalAlpha = 0.5 * Math.min(1, P.riftS * 2); ctx.strokeStyle = j ? LIGHT : MID; ctx.lineWidth = j ? 1 : 2.4; ctx.stroke();
    }
    ctx.restore();
  }
  function lift(f) { // px the Void Mage floats up while Event Horizon runs (called once per frame by the renderer)
    const S = MW.STATE, id = f.id, cur = ehLift[id] || 0;
    const on = f.state !== S.KO && f.hit && f.hit.id === "void_execution" && (f.state === S.ATTACK_STARTUP || f.state === S.ATTACK_ACTIVE || !!f.execution);
    const nxt = cur + ((on ? 24 : 0) - cur) * (on ? 0.1 : 0.05);
    return (ehLift[id] = !on && nxt < 0.3 ? 0 : nxt);
  }

  // The Mage's own casting: he rises, the chest singularity flares, violet energy gathers and a rune circle spins under him.
  function drawAwaken(ctx, f) {
    const S = MW.STATE, s = f.stats, t = nowSec(), X = f.execution;
    const starting = f.state === S.ATTACK_STARTUP && f.hit && f.hit.id === "void_execution";
    if (!starting && !X) return;
    const u = starting ? clamp(1 - f.stateTimer / Math.max(1, f.hit.startup), 0, 1) : 1, e = smooth(u);
    const lf = ehLift[f.id] || 0, cx = f.x + s.width / 2, fy = f.y + s.height + lf, core = (f._art && f._art.core) || [cx, f.y + s.height * 0.45];
    // rune circle on the floor beneath him
    const rx = 20 + 62 * e, ry = 4 + 10 * e;
    ctx.save(); ctx.globalAlpha = 0.25 + 0.6 * e; ctx.strokeStyle = MID; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(cx, fy - 2, rx, ry, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, fy - 2, rx * 0.72, ry * 0.72, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = LIGHT; ctx.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) { const a = t * 1.4 + (i * TAU) / 6; drawRune(ctx, cx + Math.cos(a) * rx * 0.86, fy - 2 + Math.sin(a) * ry * 0.86, 2.5 + 2.5 * e, i % 3, a); }
    ctx.restore();
    // the chest singularity flares
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.4 + 0.5 * e;
    glow(ctx, core[0], core[1] - lf * 0, 14 + 34 * e + 3 * Math.sin(t * 9), "rgba(225,175,255,0.95)", "rgba(140,50,255,0)");
    ctx.restore();
    blackHole(ctx, core[0], core[1], 4 + 5 * e, 1);
    if (Math.random() < 0.3 + 0.6 * e) { const a = Math.random() * TAU, d = rnd(40, 90); dot(core[0] + Math.cos(a) * d, core[1] + Math.sin(a) * d, (-Math.cos(a) * d) / 14, (-Math.sin(a) * d) / 14, 14, rnd(1.4, 2.6), Math.random() < 0.35 ? LIGHT : MID, { drag: 1 }); }
    if (Math.random() < 0.5 * e) dot(cx + rnd(-26, 26), fy - rnd(0, 20), rnd(-0.2, 0.2), -rnd(0.8, 2), 28, rnd(1.2, 2.2), MID, { drag: 0.98 });
    if (starting && Math.random() < 0.06 + 0.1 * e) add({ kind: "ring", x: core[0], y: core[1], vx: 0, vy: 0, life: 16, size: 46, grow: -2.6, color: LIGHT, drag: 1 });
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
        if (ev.big) { eventHorizonSlam(x, y); break; } // the Event Horizon finisher has its own, much bigger version
        addSplat(x, y, ev.px0, ev.px1);
        if (MW.fxShake) MW.fxShake(5);
        for (let i = 0; i < 2; i++) ring(x, y, 6 + i * 4, 4.5 + i * 1.5, 16 + i * 5, i % 2 ? MID : LIGHT);
        add({ kind: "flash", x, y: y - 6, vx: 0, vy: 0, life: 11, size: 38, color: WHITE, rot: Math.PI / 8, drag: 1 });
        for (let i = 0; i < 14; i++) { const sd = i % 2 ? 1 : -1, sp = rnd(2, 6); dot(x + sd * rnd(0, 12), y - 2, sd * sp, -rnd(0.5, 3.4), 20 + (Math.random() * 14 | 0), rnd(1.6, 3.4), i % 3 ? "#2a1458" : MID, { drag: 0.93, g: 0.14 }); }
        drops(x, y - 4, 6, -5, 5, -6, -1);
        break;
      }
      case "impale": { // one of the 4-5 piercing strikes: a flash, a shock ring, black fragments thrown out the far side
        const th = rad(EH.strikeDeg[((ev.n || 1) - 1) % EH.strikeDeg.length]), dx = -Math.cos(th), dy = -Math.sin(th), n = ev.n || 1;
        ring(x, y, 8, 3.6, 12, LIGHT); ring(x, y, 26, -2.2, 9, MID);
        add({ kind: "flash", x, y, vx: 0, vy: 0, life: 9, size: 40 + n * 3, color: WHITE, rot: th, drag: 1 });
        for (let i = 0; i < 12; i++) { const a = Math.atan2(dy, dx) + rnd(-0.55, 0.55), sp = rnd(3, 8.5); add({ kind: "streak", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 12, size: 2.4, color: i % 3 ? MID : WHITE, drag: 0.9 }); }
        for (let i = 0; i < 7; i++) { const a = Math.atan2(dy, dx) + rnd(-0.8, 0.8), sp = rnd(1.5, 5); add({ kind: "chip", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6, life: 26, size: rnd(2, 4.2), color: MID, g: 0.16, drag: 0.95, rot: Math.random() * TAU, vr: rnd(-0.3, 0.3) }); }
        for (let i = 0; i < 6; i++) dot(x, y, rnd(-1.6, 1.6), rnd(-1.6, 1.6), 22, rnd(1.4, 2.6), i % 2 ? "#2a1458" : LIGHT, { drag: 0.93 });
        if (MW.fxShake) MW.fxShake(3 + n * 1.2);
        break;
      }
      case "windup": // the entity hauls its arm back: everything is pulled into the grip
        ring(x, y, 110, -5.5, 20, LIGHT); ring(x, y, 70, -3.4, 20, MID);
        inward(x, y, 20, 60, 130, 18, (i) => (i % 3 ? MID : WHITE));
        break;
      case "release": ring(x, y, 12, 3.5, 14, MID); drops(x, y, 8, -2.5, 2.5, -3, 1); break;
      case "rift_open": {
        ring(x, y - 40, 60, -2.6, 20, MID); inward(x, y - 80, 22, 60, 130, 18, (i) => (i % 3 ? MID : LIGHT));
        add({ kind: "gring", x, y, vx: 0, vy: 0, life: 20, size: 20, grow: 4.5, color: MID, drag: 1 });
        if (MW.fxShake) MW.fxShake(4);
        break;
      }
      case "grab":
        ring(x, y - 40, 14, 3.5, 14, LIGHT);
        add({ kind: "flash", x, y: y - 40, vx: 0, vy: 0, life: 10, size: 46, color: WHITE, rot: 0.4, drag: 1 });
        add({ kind: "gring", x, y, vx: 0, vy: 0, life: 14, size: 10, grow: 5, color: LIGHT, drag: 1 });
        for (let i = 0; i < 12; i++) dot(x + rnd(-12, 12), y - rnd(20, 70), rnd(-2, 2), rnd(-2.5, 0.5), 18, rnd(1.4, 2.6), i % 2 ? MID : LIGHT, { drag: 0.93 });
        if (MW.fxShake) MW.fxShake(9);
        if (MW.fxFlash) MW.fxFlash(0.12, "#c9a0ff");
        break;
      case "rift_miss": ring(x, y - 40, 40, -2, 16, MID); break;
      case "rift_close": { // the tear folds in on itself
        ring(x, y - 110, 130, -9, 14, LIGHT); ring(x, y - 110, 80, -6, 14, MID);
        inward(x, y - 110, 28, 50, 150, 14, (i) => (i % 2 ? MID : WHITE));
        add({ kind: "flash", x, y: y - 110, vx: 0, vy: 0, life: 12, size: 36, color: WHITE, rot: 0.2, drag: 1 });
        if (MW.fxShake) MW.fxShake(5);
        break;
      }
      case "spikes":
        for (let i = 0; i < 16; i++) dot(rnd(ev.x0, ev.x1), y - 1, rnd(-0.6, 0.6), -rnd(0.2, 1.4), 24, rnd(1.4, 2.6), i % 2 ? MID : "#2a1458", { drag: 0.95 });
        break;
      case "spike_hit": ring(x, y, 22, -1.6, 10, LIGHT); for (let i = 0; i < 10; i++) { const a = -Math.PI * Math.random(), sp = rnd(2, 6); dot(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 16, rnd(1.4, 2.6), i % 2 ? MID : LIGHT, { drag: 0.92, g: 0.1 }); } break;
      case "grasp": ring(x, y, 6, 5, 22, MID); drops(x, y - 4, 8, -3, 3, -3, -0.6); break;
      case "grasp_collapse": // the pool snaps shut: a hard ring, a flash and black liquid thrown up
        ring(x, y - 4, 10, 5.5, 16, LIGHT); ring(x, y - 4, 30, -2.4, 14, MID);
        add({ kind: "flash", x, y: y - 8, vx: 0, vy: 0, life: 10, size: 44, color: WHITE, rot: Math.PI / 8, drag: 1 });
        drops(x, y - 4, 12, -4, 4, -6, -1.5);
        break;
      case "wraith_summon": ring(x, y, 24, -1.5, 14, MID); drops(x, y, 6, -1.5, 1.5, -2, 1); break;
      case "wraith_latch": ring(x, y, 18, -1.4, 10, LIGHT); break;
      case "wraith_release": ring(x, y, 10, 3, 14, MID); drops(x, y, 8, -2.5, 2.5, -3, 1); break;
    }
  }
  function eventHorizonSlam(x, y) { // the finishing slam: a huge flat shockwave, cracks with violet light, debris, dust, a hard screen shake
    add({ kind: "flash", x, y: y - 10, vx: 0, vy: 0, life: 14, size: 120, color: WHITE, rot: Math.PI / 8, drag: 1 });
    add({ kind: "flash", x, y: y - 10, vx: 0, vy: 0, life: 10, size: 70, color: LIGHT, rot: 0, drag: 1 });
    for (let i = 0; i < 4; i++) add({ kind: "gring", x, y: y - 1, vx: 0, vy: 0, life: 24 + i * 6, size: 8, grow: 9 - i * 1.4, color: i % 2 ? MID : LIGHT, drag: 1 });
    ring(x, y - 12, 10, 8, 18, WHITE);
    for (let i = 0; i < 40; i++) { const sd = i % 2 ? 1 : -1, sp = rnd(2, 12); add({ kind: "chip", x: x + sd * rnd(0, 26), y: y - 4, vx: sd * sp * rnd(0.3, 1), vy: -rnd(3, 13), life: 40 + ((Math.random() * 24) | 0), size: rnd(2.5, 6.5), color: i % 3 ? MID : LIGHT, g: 0.34, drag: 0.98, rot: Math.random() * TAU, vr: rnd(-0.35, 0.35) }); }
    for (let i = 0; i < 34; i++) { const sd = i % 2 ? 1 : -1; add({ kind: "void", x: x + sd * rnd(0, 40), y: y - 3, vx: sd * rnd(1, 9), vy: -rnd(0.3, 3.2), life: 34 + ((Math.random() * 20) | 0), size: rnd(2.4, 5), g: 0.05, drag: 0.94 }); }
    for (let i = 0; i < 26; i++) dot(x + rnd(-30, 30), y - rnd(0, 20), rnd(-6, 6), -rnd(1, 7), 24 + ((Math.random() * 14) | 0), rnd(1.6, 3.4), i % 3 ? MID : WHITE, { drag: 0.93, g: 0.06 });
    for (let i = 0; i < 16; i++) { const a = -Math.PI * Math.random(); add({ kind: "streak", x, y: y - 6, vx: Math.cos(a) * rnd(4, 13), vy: Math.sin(a) * rnd(4, 13), life: 16, size: 3, color: i % 2 ? WHITE : LIGHT, drag: 0.92 }); }
    addSlamCracks(x, y);
    if (MW.fxShake) MW.fxShake(34);
    if (MW.fxFlash) MW.fxFlash(0.4, "#d9b8ff");
    ehKick[0] = 1; for (const k in ehKick) ehKick[k] = 1;
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

    drawVoidWorld(ctx, f); // spikes, grasp pool, wraiths (the Event Horizon entity is drawn by drawBack / drawFront)
    drawAwaken(ctx, f); // Event Horizon: the Mage's own casting
    drawVoidBody(ctx, f); // melt / reform liquid, Singularity charge, Void Overload pips
  }

  MW.MageFx = { TUNE, TUNE2, EH, tick, draw, event, drawBolt, drawFighter, drawBack, drawFront, lift, _pool: pool };
})(globalThis);