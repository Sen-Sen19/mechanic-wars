// Mechanic Wars - Mage magic effects. VISUAL ONLY: the sim never reads this file.
// Everything here is drawn with additive light ("lighter") over a soft dark underlay,
// so it still reads on bright stages. All sizes and timings are in the TUNE block below.
//
// What it draws:
//   - aura:    rune glyphs circle the Mage, sparkles rise from the staff orb
//   - cast:    a spinning magic circle opens where the bolt will appear; energy is sucked in
//   - fire:    flash + ring + forward sparks when the bolt leaves
//   - bolt:    glowing arcane orb with a comet tail, a double helix of sparks and a rune ring
//   - impact:  star flash, two rings, spark burst, rising runes
//   - fizzle:  soft fade when the bolt runs out of range
(function (g) {
  const MW = (g.MW = g.MW || {});
  const TAU = Math.PI * 2;

  const TUNE = {
    maxParticles: 260,
    circleRadius: 30, // magic circle radius at full charge (px)
    runeCount: 3, // runes orbiting the Mage
    tailLength: 70, // bolt comet tail (px)
    helixLength: 58,
    impactSparks: 16,
  };

  const LIGHT = "#d6b8ff";
  const MID = "#a77cff";
  const DEEP = "#4b2a96";
  const GOLD = "#ffd479";
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
  function event(ev) {
    if (!ev || ev.style !== "arcane") return;
    const { x, y, dir } = ev;
    if (ev.type === "fire") {
      add({ kind: "flash", x, y, vx: 0, vy: 0, life: 9, size: 30, color: WHITE, rot: Math.PI / 8, drag: 1 });
      add({ kind: "ring", x, y, vx: 0, vy: 0, life: 14, size: 8, grow: 3, color: LIGHT, drag: 1 });
      add({ kind: "ring", x, y, vx: 0, vy: 0, life: 10, size: 4, grow: 2, color: GOLD, drag: 1 });
      for (let i = 0; i < 10; i++) dot(x, y, dir * rnd(2, 7), rnd(-2.2, 2.2), 14 + (Math.random() * 10 | 0), rnd(1.5, 3), i % 3 ? MID : GOLD, { drag: 0.93 });
    } else if (ev.type === "hit") {
      add({ kind: "flash", x, y, vx: 0, vy: 0, life: 11, size: 44, color: WHITE, rot: Math.PI / 8, drag: 1 });
      add({ kind: "flash", x, y, vx: 0, vy: 0, life: 9, size: 30, color: GOLD, rot: 0, drag: 1 });
      add({ kind: "ring", x, y, vx: 0, vy: 0, life: 18, size: 8, grow: 3.4, color: LIGHT, drag: 1 });
      add({ kind: "ring", x, y, vx: 0, vy: 0, life: 12, size: 4, grow: 2.4, color: GOLD, drag: 1 });
      for (let i = 0; i < TUNE.impactSparks; i++) {
        const a = (i / TUNE.impactSparks) * TAU + rnd(-0.2, 0.2), sp = rnd(2, 7);
        dot(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 18 + (Math.random() * 14 | 0), rnd(1.6, 3.4), i % 3 ? MID : (i % 2 ? LIGHT : GOLD), { drag: 0.92, g: 0.05 });
      }
      for (let i = 0; i < 4; i++) {
        add({ kind: "star", x: x + rnd(-10, 10), y: y + rnd(-10, 10), vx: rnd(-1, 1), vy: rnd(-1.8, -0.4), life: 32, size: rnd(5, 9), color: i % 2 ? GOLD : LIGHT, vr: rnd(-0.12, 0.12), drag: 0.97 });
      }
      for (let i = 0; i < 2; i++) {
        add({ kind: "rune", x: x + rnd(-14, 14), y: y + rnd(-6, 6), vx: rnd(-0.4, 0.4), vy: rnd(-1.2, -0.6), life: 42, size: rnd(6, 9), color: LIGHT, glyph: (Math.random() * 3) | 0, vr: rnd(-0.05, 0.05), drag: 0.98 });
      }
    } else if (ev.type === "fizzle") {
      add({ kind: "ring", x, y, vx: 0, vy: 0, life: 12, size: 4, grow: 1.4, color: MID, drag: 1 });
      for (let i = 0; i < 8; i++) dot(x, y, rnd(-1.6, 1.6), rnd(-1.6, 1.6), 16 + (Math.random() * 10 | 0), rnd(1.4, 2.6), i % 2 ? LIGHT : MID, { drag: 0.94 });
    }
  }

  // ─── bolt ─────────────────────────────────────────────────────────
  // Drawn at the projectile position (p.x, p.y), already inside the interpolation transform.
  function drawBolt(ctx, p) {
    const t = nowSec();
    const dir = p.dir, x = p.x, y = p.y;
    const R = (p.size / 2) * 1.5; // drawn a bit bigger than the hitbox on purpose (glow is soft)
    const pulse = 0.5 + 0.5 * Math.sin(t * 18);
    const L = TUNE.tailLength, HL = TUNE.helixLength;

    ctx.save();
    ctx.lineCap = "round";

    // 1) solid violet body (normal blending): this is what keeps the bolt visible on bright stages
    ctx.globalAlpha = 1;
    glow(ctx, x, y, R * 2.8, "rgba(120,70,225,0.85)", "rgba(75,42,150,0)");
    const tg0 = ctx.createLinearGradient(x, 0, x - dir * L, 0);
    tg0.addColorStop(0, "rgba(110,62,215,0.75)");
    tg0.addColorStop(1, "rgba(110,62,215,0)");
    ctx.fillStyle = tg0;
    ctx.beginPath();
    ctx.moveTo(x, y - R * 1.15); ctx.lineTo(x - dir * L, y); ctx.lineTo(x, y + R * 1.15); ctx.closePath();
    ctx.fill();

    // helix of sparks (solid colours, dark edge underneath)
    for (let strand = 0; strand < 2; strand++) {
      for (let k = 0; k < 10; k++) {
        const u = k / 9;
        const off = Math.sin(t * 16 - u * 9 + strand * Math.PI) * (6 - 3 * u);
        const hx = x - dir * (6 + u * HL), hy = y + off, hr = 2.4 * (1 - u * 0.7) + 0.5;
        ctx.globalAlpha = (1 - u) * 0.9;
        ctx.fillStyle = DEEP;
        ctx.beginPath(); ctx.arc(hx, hy, hr + 1.2, 0, TAU); ctx.fill();
        ctx.fillStyle = strand ? GOLD : LIGHT;
        ctx.beginPath(); ctx.arc(hx, hy, hr, 0, TAU); ctx.fill();
      }
    }

    // rotating rune ring (dark edge + light line)
    const ra = t * 7 * dir;
    ctx.globalAlpha = 1;
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? LIGHT : DEEP;
      ctx.lineWidth = pass ? 1.7 : 3.6;
      for (let i = 0; i < 3; i++) {
        const a0 = ra + (i * TAU) / 3;
        ctx.beginPath(); ctx.arc(x, y, R + 6, a0, a0 + 1.3); ctx.stroke();
      }
    }
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? GOLD : DEEP;
      ctx.lineWidth = pass ? 1.4 : 3.2;
      for (let i = 0; i < 4; i++) {
        const a = -ra * 0.8 + (i * TAU) / 4;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * (R + 9), y + Math.sin(a) * (R + 9));
        ctx.lineTo(x + Math.cos(a) * (R + 12), y + Math.sin(a) * (R + 12));
        ctx.stroke();
      }
    }

    // 2) additive light on top: bright core + soft glow (looks great on dark stages, subtle on bright ones)
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.55 + 0.25 * pulse;
    glow(ctx, x, y, R * 3.2 + pulse * 2, "rgba(190,150,255,0.7)", "rgba(140,82,255,0)");
    ctx.globalAlpha = 1;
    const tg = ctx.createLinearGradient(x, 0, x - dir * L * 0.8, 0);
    tg.addColorStop(0, "rgba(205,175,255,0.55)");
    tg.addColorStop(1, "rgba(140,82,255,0)");
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(x, y - R * 0.8); ctx.lineTo(x - dir * L * 0.8, y); ctx.lineTo(x, y + R * 0.8); ctx.closePath();
    ctx.fill();
    glow(ctx, x, y, R * 1.3, "rgba(255,255,255,1)", "rgba(167,124,255,0.3)");
    ctx.fillStyle = WHITE;
    ctx.beginPath(); ctx.arc(x, y, R * 0.5, 0, TAU); ctx.fill();
    ctx.restore();

    // trailing sparkles (little stars and dots that linger behind)
    if (Math.random() < 0.8) {
      const star = Math.random() < 0.3;
      if (star) add({ kind: "star", x: x - dir * rnd(4, 14), y: y + rnd(-7, 7), vx: -dir * rnd(0.2, 1), vy: rnd(-0.6, 0.6), life: 22, size: rnd(3, 5.5), color: Math.random() < 0.4 ? GOLD : LIGHT, vr: rnd(-0.2, 0.2), drag: 0.96 });
      else dot(x - dir * rnd(4, 14), y + rnd(-6, 6), -dir * rnd(0.3, 1.4), rnd(-0.5, 0.5), 18 + (Math.random() * 10 | 0), rnd(1.2, 2.4), Math.random() < 0.5 ? MID : LIGHT, { drag: 0.95 });
    }
  }

  // ─── magic circle ─────────────────────────────────────────────────
  function drawCircle(ctx, x, y, R, rot, alpha) {
    ctx.save();
    ctx.translate(x, y);
    // soft dark underlay
    ctx.globalAlpha = 0.28 * alpha;
    ctx.fillStyle = DEEP;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.05, 0, TAU); ctx.fill();

    ctx.lineCap = "round";
    // dark outline under the main ring and the hexagram (readability on bright stages)
    ctx.globalAlpha = 0.6 * alpha;
    ctx.strokeStyle = DEEP;
    ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    for (let tri = 0; tri < 2; tri++) {
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const a = -rot + tri * (Math.PI / 3) + (k * TAU) / 3;
        const px = Math.cos(a) * R * 0.72, py = Math.sin(a) * R * 0.72;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }

    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = LIGHT;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();

    // 8 tick marks
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 8; i++) {
      const a = rot * 0.5 + (i * TAU) / 8;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R);
      ctx.lineTo(Math.cos(a) * R * 1.16, Math.sin(a) * R * 1.16);
      ctx.stroke();
    }

    // dashed inner ring, turning the other way
    ctx.strokeStyle = MID;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([3, 4]);
    ctx.lineDashOffset = rot * 12;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.72, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);

    // hexagram (two triangles)
    ctx.strokeStyle = LIGHT;
    ctx.lineWidth = 1.5;
    for (let tri = 0; tri < 2; tri++) {
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const a = -rot + tri * (Math.PI / 3) + (k * TAU) / 3;
        const px = Math.cos(a) * R * 0.72, py = Math.sin(a) * R * 0.72;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }

    // bright centre
    ctx.globalAlpha = alpha;
    glow(ctx, 0, 0, R * 0.45, "rgba(255,255,255,0.9)", "rgba(167,124,255,0)");
    ctx.restore();
  }

  // ─── per-fighter effects (aura, staff glow, cast circle) ──────────
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

    // spawn point of the bolt (same rule as projectiles.js) = where the circle opens
    const px = f.facing > 0 ? f.x + s.width + 18 : f.x - 18;
    const py = f.y + s.height * 0.4;
    const orb = (f._art && f._art.orb) || [cx + f.facing * (s.width * 0.6), f.y + s.height * 0.2];

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    // staff orb glow
    const pulse = 0.5 + 0.5 * Math.sin(t * 6 + f.id);
    ctx.globalAlpha = 0.45 + 0.5 * windU;
    glow(ctx, orb[0], orb[1], 13 + 18 * windU + 2 * pulse, "rgba(214,184,255,0.9)", "rgba(140,82,255,0)");

    // orbiting runes
    ctx.strokeStyle = LIGHT;
    ctx.lineWidth = 1.5;
    const speed = 1.1 + 3.2 * windU;
    const rx = s.width * 0.95 - 8 * windU, ry = s.height * 0.44;
    for (let i = 0; i < TUNE.runeCount; i++) {
      const a = t * speed + (i * TAU) / TUNE.runeCount;
      const z = Math.sin(a); // front (+) or behind (-)
      const sz = 5 + 1.6 * z + 2 * windU;
      ctx.globalAlpha = clamp((0.3 + 0.45 * (z * 0.5 + 0.5)) * power * 1.5, 0, 0.9);
      // each rune has its own height; the small up/down wobble fakes a tilted orbit
      drawRune(ctx, cx + Math.cos(a) * rx, cy + (i - 1) * ry * 0.5 + z * 7, sz, i % 3, t * 1.5 + i);
    }
    ctx.restore();

    // ambient sparkles rising off the staff orb / robe
    if (!stunned && Math.random() < 0.14 + 0.5 * windU) {
      if (Math.random() < 0.35) add({ kind: "star", x: orb[0] + rnd(-6, 6), y: orb[1] + rnd(-6, 6), vx: rnd(-0.3, 0.3), vy: rnd(-1, -0.3), life: 28, size: rnd(2.5, 4.5), color: Math.random() < 0.4 ? GOLD : LIGHT, vr: rnd(-0.15, 0.15), drag: 0.97 });
      else dot(orb[0] + rnd(-7, 7), orb[1] + rnd(-5, 5), rnd(-0.3, 0.3), rnd(-0.9, -0.3), 24 + (Math.random() * 12 | 0), rnd(1.2, 2.4), Math.random() < 0.5 ? MID : LIGHT, { drag: 0.97 });
    }

    if (casting) {
      // spinning magic circle that opens where the bolt will appear
      const e = 1 - Math.pow(1 - windU, 2);
      drawCircle(ctx, px, py, 6 + (TUNE.circleRadius - 6) * e, t * 3 + windU * 4, 0.35 + 0.6 * windU);
      // energy is sucked into the circle
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * TAU, d = rnd(34, 62);
        const sx = px + Math.cos(a) * d, sy = py + Math.sin(a) * d;
        dot(sx, sy, (px - sx) / 13, (py - sy) / 13, 13, rnd(1.4, 2.6), Math.random() < 0.3 ? GOLD : LIGHT, { drag: 1 });
      }
    }
  }

  MW.MageFx = { TUNE, tick, draw, event, drawBolt, drawFighter, _pool: pool };
})(globalThis);
