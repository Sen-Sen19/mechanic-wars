// Mechanic Wars - Fulminar art (render only, never touches the sim).
// A lean, athletic storm warrior: silver and electric-blue lightweight armor with lightning-shaped edges, a dark navy
// combat suit, asymmetrical shoulder guards (the near one larger), a glowing core in the chest, a short asymmetrical
// waist mantle (no cape), and a long silver-white high ponytail with electric-blue tips and a lightning-bolt clip.
// Design document: "Fulminar - The Stormforged" (looks only; no skills or weapons are drawn here).
// Called from character_art.js DETAIL() for id === "fulminar".
// k = the shared rig state from character_art.js, e = a few precomputed values (see DETAIL).
// The ponytail and the mantle trail behind her when she moves: their small spring state lives in k.A.fPony.
(function (g) {
  const MW = (g.MW = g.MW || {});
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }; // steady 0..1 noise, no Math.random in drawing

  // Palette from the design document.
  const C = {
    line: "#080E1B",
    shadow: "#14243D", shadow2: "#1b3050",   // dark navy: suit, trousers
    storm: "#244E83", electric: "#397FD1",   // armor main / secondary
    silver: "#BFCFE0", silverSh: "#8798b0", frost: "#EAF5FF", // armor highlight / bright armor
    cyan: "#43DFFF", core: "#D8FAFF", violet: "#826DDB",     // electricity / lightning core / accent
    hair: "#E5EDF7", hair2: "#c3d0e2", hairSh: "#9aa9c2",
    skin: "#e6dadd", skinSh: "#b3a4b0", // light natural complexion, cool-leaning shadow (must read against the white hair)
  };

  // ── tiny drawing helpers ───────────────────────────────────────────
  function pathOf(ctx, pts, close) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (close !== false) ctx.closePath();
  }
  function edge(k, edgeColor, lw) {
    k.ctx.lineJoin = "round";
    k.ctx.lineWidth = lw || 1.2;
    k.ctx.strokeStyle = k.isFlash ? "#fff" : edgeColor;
    k.ctx.stroke();
  }
  function fillPoly(k, pts, fill, edgeColor, lw) {
    pathOf(k.ctx, pts);
    k.ctx.fillStyle = k.col(fill);
    k.ctx.fill();
    edge(k, edgeColor || C.line, lw);
  }
  function spline(pts, n) { // Catmull-Rom, n samples per segment
    if (pts.length < 3) return pts.slice();
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
      for (let j = 0; j < n; j++) {
        const t = j / n, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        ]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  function taper(k, pts, w0, w1, fill, edgeColor, lw, smooth) { // ribbon of changing width (sleeves, legs, hair)
    if (smooth) pts = spline(pts, smooth);
    const n = pts.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, n - 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      const w = lerp(w0, w1, i / (n - 1)) / 2;
      L.push([pts[i][0] - ty * w, pts[i][1] + tx * w]);
      R.push([pts[i][0] + ty * w, pts[i][1] - tx * w]);
    }
    fillPoly(k, L.concat(R.reverse()), fill, edgeColor, lw);
  }
  function line(k, pts, color, lw, alpha) {
    if (k.isFlash) return;
    const { ctx } = k;
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    pathOf(ctx, pts, false);
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
  }
  function glowStroke(k, pts, color, lw, blur, alpha) {
    if (k.isFlash) return;
    const { ctx } = k;
    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = blur;
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    pathOf(ctx, pts, false);
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
  }
  function glow(k, x, y, r, a, rgb) {
    if (k.isFlash || a <= 0) return;
    const { ctx } = k;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(" + rgb + "," + a + ")");
    gr.addColorStop(1, "rgba(" + rgb + ",0)");
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // a jagged bolt from p to q: `n` kinks, `amp` sideways jitter (px). seed keeps it steady for a few frames, then it re-rolls (crackle)
  function bolt(p, q, n, amp, seed) {
    const out = [p];
    const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    for (let i = 1; i < n; i++) {
      const t = i / n, o = (hash(seed + i * 7.31) - 0.5) * 2 * amp;
      out.push([p[0] + dx * t + nx * o, p[1] + dy * t + ny * o]);
    }
    out.push(q);
    return out;
  }

  // ── ponytail / mantle spring state: 5 rows, each lags a little more than the one above it ──
  function ponyUpdate(k) {
    const A = k.A;
    let c = A.fPony;
    if (!c) c = A.fPony = { x: [0, 0, 0, 0, 0], y: [0, 0, 0, 0, 0], t: -1 };
    if (c.t < 0 || Math.abs(k.now - c.t) > 0.004) { // once per drawn frame (the flash pass draws her twice)
      c.t = k.now;
      const sp = clamp(k.vx || 0, -9, 9), vy = clamp(k.vy || 0, -16, 16);
      for (let i = 0; i < 5; i++) {
        const w = (i + 1) / 5;
        // trails opposite to the run, and is never quite still: a steady electric breeze lifts it
        const tx = -sp * 2.6 * w * w + (Math.sin(k.now * 2.6 + i * 0.8) * 1.3 + 0.9) * w;
        const ty = -vy * 0.6 * w + Math.sin(k.now * 3.4 + i * 1.1) * 0.9 * w - 0.8 * w;
        const rate = 0.26 - i * 0.03;
        c.x[i] += (tx - c.x[i]) * rate;
        c.y[i] += (ty - c.y[i]) * rate;
      }
    }
    return c;
  }

  function draw(k, e) {
    const { ctx, d, now } = k;
    const F = k.isFlash;
    const { shW, hipW, hcw, armBw, armFw, windU, strike, stunned } = e;
    const H = k.H, u = H / 100;
    const torL = k.torL, sw = k.sw, hw = k.hw, hr = k.hr, legL = k.legL;
    const A = k.A;
    // energy: idle is subtle (small breathing pulse); wind-up, strike and hits push it up
    const pulse = 0.5 + 0.5 * Math.sin(now * 2.6);
    const en = clamp(0.2 + 0.14 * pulse + (strike ? 0.55 : 0) + windU * 0.35 + (stunned ? 0.4 : 0), 0, 1);
    const tb = Math.floor(now * 14); // crackle clock: bolts re-roll about 14 times a second

    // torso frame: T(a, b) = a along the spine (0 = hip, torL = shoulders), b toward the front
    let ux = shW[0] - hipW[0], uy = shW[1] - hipW[1];
    const tl = Math.hypot(ux, uy) || 1;
    ux /= tl; uy /= tl;
    let nx = -uy, ny = ux;
    if (nx * d < 0) { nx = -nx; ny = -ny; }
    const T = (a, b) => [hipW[0] + ux * a + nx * b, hipW[1] + uy * a + ny * b];
    const J = (o, a, b) => [o[0] + ux * a + nx * b, o[1] + uy * a + ny * b];

    // head frame: Hp(a, b) = a forward, b down (in head-radius units)
    const hx = hcw[0], hy = hcw[1], hrx = hr * 1.2;
    const Hp = (a, b) => [hx + d * hrx * a, hy + hrx * b];

    const pony = ponyUpdate(k);
    const sway = Math.sin(now * 2.2) * 0.8 - clamp(k.vx, -6, 6) * 0.5;

    // first frame of a hit: a burst of sparks flies off her
    if (stunned && !A.fHurt && k.spawn && !F) {
      for (let i = 0; i < 10; i++) k.spawn(A.ox + hcw[0] + (Math.random() - 0.5) * 20, A.oy + hcw[1] + 8 + Math.random() * 20, (Math.random() - 0.5) * 4, -Math.random() * 2.4 - 0.4, i % 2 ? "#D8FAFF" : "#43DFFF", 16, 2.2);
    }
    A.fHurt = stunned;

    // ── 1) ponytail: high tie, rises, then streams back; electric-blue tips ──
    {
      const base = Hp(-0.9, -0.95);
      const rest = [[-6, -5], [-12, 0], [-16, 8], [-18, 18], [-17, 28]]; // px at u = 1, offsets behind (x, times d) and down (y)
      const strand = (spread, w0, col, tipCol, lenK) => {
        const pts = [base];
        for (let i = 0; i < 5; i++) {
          pts.push([base[0] + d * rest[i][0] * u * lenK + pony.x[i] * lenK * (1 + spread * 0.15) + spread * 0.8 * d * u,
                    base[1] + rest[i][1] * u * lenK + pony.y[i] * lenK + spread * 1.2 * u]);
        }
        const sm = spline(pts, 5);
        const n = sm.length, cut = Math.floor(n * 0.64);
        taper(k, sm, w0 * u, 1 * u, col, C.hairSh, 0.8);
        // electric-blue tips: the last third of the strand
        const tip = sm.slice(cut);
        taper(k, tip, lerp(w0 * u, 1 * u, cut / (n - 1)) * 0.96, 1 * u, tipCol, C.hairSh, 0.6);
        return sm;
      };
      strand(1.6, 6.4, C.hairSh, C.storm, 0.88);
      strand(-0.9, 7.2, C.hair2, C.electric, 1.0);
      const top = strand(0, 8, C.hair, C.cyan, 1.08);
      if (!F) { // an occasional electric-blue glint running down the tail
        const gl = (now * 0.9 + 0.3) % 1.9;
        if (gl < 1) { const p = top[Math.floor(gl * (top.length - 1))]; glow(k, p[0], p[1], 5 * u, 0.5 * Math.sin(gl * Math.PI), "67,223,255"); }
        line(k, top.slice(2, Math.floor(top.length * 0.6)), C.frost, 0.9, 0.6);
      }
    }

    // ── 2) back arm + the small back shoulder guard ──
    const arm = (pts, front) => {
      const [s0, el, wr] = pts;
      taper(k, [s0, el], 6.4 * u, 5.4 * u, front ? C.storm : C.shadow2, C.line, 1.1); // electric-blue fabric sleeve
      const vx = wr[0] - el[0], vy = wr[1] - el[1], len = Math.hypot(vx, vy) || 1;
      const tx = vx / len, ty = vy / len, qx = -ty, qy = tx;
      const P = (t, q) => [el[0] + tx * len * t + qx * q * u, el[1] + ty * len * t + qy * q * u];
      const side = qx * -d > 0 ? 1 : -1; // the outer (backward) side of the forearm
      // angular elbow guard
      fillPoly(k, [P(-0.04, -4.2), P(0.14, -5.4), P(0.2, 0), P(0.14, 5.4), P(-0.04, 4.2), P(-0.2, 0)], front ? C.silver : C.silverSh, C.line, 1);
      // silver gauntlet with electric-blue edge
      fillPoly(k, [P(0.18, -4.4), P(0.97, -3.4), P(1.02, 3.4), P(0.18, 4.4)], front ? C.silver : C.silverSh, C.line, 1.1);
      line(k, [P(0.2, -4.2), P(0.96, -3.2)], C.frost, 0.9, 0.7);
      line(k, [P(0.2, 4.2), P(0.98, 3.2)], C.electric, 1.3, 0.95);
      // angular wrist guard: one sharp fin on the outer cuff
      fillPoly(k, [P(0.58, side * 4), P(0.86, side * 3.8), P(0.72, side * 8.4)], front ? C.frost : C.silver, C.line, 0.9);
      // thin electrical marking along the forearm (jagged, subtle at rest)
      const fa = bolt(P(0.26, 0), P(0.94, 0), 5, 1.1 * u, tb * 3 + (front ? 1 : 9));
      glowStroke(k, fa, C.cyan, 0.9, 4, 0.22 + 0.6 * en);
      // fingerless glove: dark knuckle plate, bare fingers
      const Gp = (t, q) => [wr[0] + (tx * t + qx * q) * u, wr[1] + (ty * t + qy * q) * u];
      fillPoly(k, [Gp(-1, -3), Gp(3.6, -3.4), Gp(4.2, 3.4), Gp(-1, 3)], C.shadow, C.line, 1);
      line(k, [Gp(3, -3.2), Gp(3, 3.2)], C.electric, 1, 0.9);
      fillPoly(k, [Gp(3.4, -3), Gp(8.2, -2.4), Gp(9.4, -0.2), Gp(8.2, 2.2), Gp(3.4, 3)], C.skin, C.line, 0.9);
      for (const t of [5.2, 6.8]) line(k, [Gp(t, -2.6), Gp(t, 2.6)], C.skinSh, 0.7, 0.8);
      fillPoly(k, [Gp(1.2, 2.8), Gp(4.8, 4.6), Gp(6.2, 3.9), Gp(3.2, 2.2)], C.skin, C.line, 0.7); // thumb
      return Gp(8.4, 0);
    };
    // lightning-bolt shoulder guard: two sharp spikes zigzag across the top; s scales it (near one bigger, far one small)
    const pauldron = (sP, s) => {
      const pts = [J(sP, -3 * s, -6 * s), J(sP, 3 * s, -8.5 * s), J(sP, 8 * s, -6.5 * s), J(sP, 4.6 * s, -2.4 * s), J(sP, 9 * s, 2.6 * s), J(sP, 5 * s, 4.2 * s), J(sP, -0.5 * s, 6.5 * s), J(sP, -3.5 * s, 3 * s)];
      fillPoly(k, [J(sP, -6.4 * s, -5 * s), J(sP, -1 * s, -7.4 * s), J(sP, 0.6 * s, 0), J(sP, -5.6 * s, 4.4 * s)], C.storm, C.line, 1); // lower plate
      fillPoly(k, pts, C.electric, C.line, 1.1);
      fillPoly(k, [pts[1], pts[2], pts[3], J(sP, 2.5 * s, -3 * s)], C.silver, C.line, 0.7); // bright facet on the first spike
      line(k, [pts[1], pts[2], pts[3], pts[4], pts[5]], C.cyan, 0.9, 0.55 + 0.4 * en); // thin cyan edge line
    };
    arm(armBw, false);
    pauldron(armBw[0], 0.44);

    // ── 3) back leg, then the short asymmetrical waist mantle ──
    const leg = (pts, isBack) => {
      const [h, kn, ft] = pts;
      const trou = isBack ? C.shadow : C.shadow2;
      taper(k, [h, kn], 10.6 * u, 7.4 * u, trou, C.line, 1.1);
      taper(k, [kn, ft], 7.4 * u, 5.2 * u, trou, C.line, 1.1);
      // one sleek outer thigh plate (fitted, not a stack of stripes)
      {
        const p = mix(h, kn, 0.16), q = mix(h, kn, 0.5);
        const vx = kn[0] - h[0], vy = kn[1] - h[1], l = Math.hypot(vx, vy) || 1, px = -vy / l, py = vx / l;
        const sd = (px * -d > 0 ? 1 : -1) * 0.5;
        fillPoly(k, [[p[0] + px * sd * 3 * u, p[1] + py * sd * 3 * u], [p[0] + px * sd * 9.4 * u, p[1] + py * sd * 9.4 * u], [q[0] + px * sd * 7.4 * u, q[1] + py * sd * 7.4 * u], [q[0] + px * sd * 2.4 * u, q[1] + py * sd * 2.4 * u]], isBack ? C.silverSh : C.silver, C.line, 0.9);
      }
      // electric-blue fabric panel on the thigh + tiny branching marking
      line(k, [mix(h, kn, 0.64), mix(h, kn, 0.9)], C.electric, 2.2, 0.8);
      const br = mix(h, kn, 0.5);
      glowStroke(k, [mix(h, kn, 0.18), br, [br[0] + d * 2 * u, br[1] + 3 * u]], C.cyan, 0.8, 3, 0.18 + 0.45 * en);
      // boot: flexible, reinforced toe, angular silver edge
      const bt = mix(kn, ft, 0.5);
      taper(k, [bt, ft], 5.6 * u, 5.4 * u, C.shadow, C.line, 1.1);
      fillPoly(k, [
        [ft[0] - d * 4.4 * u, ft[1] - 6 * u], [ft[0] + d * 4 * u, ft[1] - 6 * u], [ft[0] + d * 4.6 * u, ft[1] - 2.6 * u],
        [ft[0] + d * 13.6 * u, ft[1] - 0.4 * u], [ft[0] + d * 12.6 * u, ft[1] + 1.2 * u], [ft[0] - d * 5 * u, ft[1] + 1.2 * u],
      ], C.shadow, C.line, 1.1);
      fillPoly(k, [[ft[0] + d * 6.5 * u, ft[1] - 2.2 * u], [ft[0] + d * 13.6 * u, ft[1] - 0.4 * u], [ft[0] + d * 12.6 * u, ft[1] + 1.2 * u], [ft[0] + d * 6 * u, ft[1] + 1.2 * u]], isBack ? C.silverSh : C.silver, C.line, 0.8); // reinforced toe cap
      line(k, [[ft[0] - d * 5 * u, ft[1] + 0.6 * u], [ft[0] + d * 12 * u, ft[1] + 0.6 * u]], C.electric, 0.9, 0.7);
      // silver shin armor: sharp, angular
      const s0 = mix(kn, ft, 0.12), s1 = mix(kn, ft, 0.56);
      fillPoly(k, [[s0[0] - d * 3 * u, s0[1]], [s0[0] + d * 3 * u, s0[1] + 1 * u], [s1[0] + d * 2.6 * u, s1[1] - 2 * u], [s1[0] + d * 0.8 * u, s1[1] + 3 * u], [s1[0] - d * 2.4 * u, s1[1] - 1 * u]], isBack ? C.silverSh : C.silver, C.line, 1);
      line(k, [[s0[0] + d * 0.4 * u, s0[1] + 1.5 * u], [s1[0] + d * 0.6 * u, s1[1] - 1 * u]], C.frost, 0.9, 0.7);
      // lightweight knee guard: a small angular wedge
      fillPoly(k, [[kn[0] - d * 3.6 * u, kn[1] - 3.6 * u], [kn[0] + d * 1.2 * u, kn[1] - 5.4 * u], [kn[0] + d * 6.8 * u, kn[1] - 0.6 * u], [kn[0] + d * 2.6 * u, kn[1] + 3.8 * u], [kn[0] - d * 3 * u, kn[1] + 3 * u]], isBack ? C.silverSh : C.silver, C.line, 1);
      line(k, [[kn[0] - d * 2 * u, kn[1] - 2.6 * u], [kn[0] + d * 1.4 * u, kn[1] - 3.8 * u], [kn[0] + d * 4.6 * u, kn[1] - 0.8 * u]], C.cyan, 0.8, 0.5 + 0.35 * en);
    };
    leg(k.MP(k.legB), true);

    // waist mantle: short, zigzag hem like a bolt, hangs behind one hip only (never a long cape)
    {
      const m = [T(8, -hw * 0.5), T(8, hw * 0.04), T(-5, hw * 0.0), T(-9, -hw * 0.28), T(-15, -hw * 0.42), T(-9, -hw * 0.66)];
      m[2][0] += sway * 0.6; m[3][0] += sway; m[4][0] += sway * 1.5; m[5][0] += sway * 1.1;
      fillPoly(k, m, C.storm, C.line, 1.2);
      line(k, [m[1], m[2], m[3], m[4], m[5]], C.cyan, 0.9, 0.3 + 0.4 * en);
      line(k, [mix(m[0], m[5], 0.4), mix(m[1], m[3], 0.6)], C.electric, 1, 0.7);
    }

    // ── 4) suit and torso: fitted dark navy combat suit ──
    fillPoly(k, [T(0, -hw * 0.62), T(torL * 0.3, -hw * 0.34), T(torL * 0.64, -sw * 0.3), T(torL * 0.96, -sw * 0.32), T(torL * 1.0, sw * 0.3), T(torL * 0.68, sw * 0.36), T(torL * 0.3, hw * 0.3), T(0, hw * 0.58)], C.shadow2, C.line, 1.3); // hourglass: narrow waist, fuller hips
    // electric-blue fabric inset at the ribs
    line(k, [T(torL * 0.12, -hw * 0.5), T(torL * 0.3, -hw * 0.32)], C.electric, 2, 0.8);

    // ── 5) chest armor: form-fitting silver / storm-blue breastplate, rib guard, glowing core ──
    fillPoly(k, [T(torL * 0.36, -hw * 0.3), T(torL * 0.62, -sw * 0.3), T(torL * 0.98, -sw * 0.32), T(torL * 1.02, sw * 0.28), T(torL * 0.86, sw * 0.44), T(torL * 0.66, sw * 0.42), T(torL * 0.5, sw * 0.22), T(torL * 0.36, hw * 0.1)], C.storm, C.line, 1.4); // contoured bodice
    // rib/abdomen lame: reinforced section
    fillPoly(k, [T(torL * 0.06, -hw * 0.5), T(torL * 0.3, -hw * 0.32), T(torL * 0.3, hw * 0.26), T(torL * 0.06, hw * 0.46)], C.silver, C.line, 1.1);
    line(k, [T(torL * 0.29, -hw * 0.28), T(torL * 0.29, hw * 0.22)], C.frost, 0.8, 0.8);
    // silver upper plate with a sharp lower edge pointing at the core
    fillPoly(k, [T(torL * 0.56, -sw * 0.3), T(torL * 0.98, -sw * 0.32), T(torL * 1.02, sw * 0.28), T(torL * 0.9, sw * 0.4), T(torL * 0.74, sw * 0.4), T(torL * 0.62, sw * 0.12)], C.silver, C.line, 1.4); // bust line
    line(k, [T(torL * 0.98, -sw * 0.28), T(torL * 1.0, sw * 0.26)], C.frost, 1, 0.85);
    // lightning engravings from the core (very faint) + glowing lines of electricity
    const cc = T(torL * 0.62, sw * 0.0);
    for (const pts of [
      [cc, T(torL * 0.74, sw * 0.12), T(torL * 0.8, sw * 0.08), T(torL * 0.92, sw * 0.26)],
      [cc, T(torL * 0.74, -sw * 0.06), T(torL * 0.82, -sw * 0.04), T(torL * 0.94, -sw * 0.22)],
      [cc, T(torL * 0.58, sw * 0.12), T(torL * 0.52, sw * 0.08)],
      [cc, T(torL * 0.58, -sw * 0.1), T(torL * 0.5, -sw * 0.14)],
    ]) glowStroke(k, pts, C.cyan, 0.8, 3, 0.16 + 0.55 * en);
    // collarbone marks
    glowStroke(k, [T(torL * 0.96, -sw * 0.2), T(torL * 0.9, -sw * 0.14), T(torL * 0.95, -sw * 0.1)], C.cyan, 0.7, 3, 0.2 + 0.5 * en);
    // the core: small bright diamond, soft cyan-white pulse
    {
      const ch = 4 * u, cw2 = 2.8 * u;
      const dia = [J(cc, ch, 0), J(cc, 0, cw2), J(cc, -ch, 0), J(cc, 0, -cw2)];
      pathOf(ctx, dia);
      ctx.fillStyle = k.col(C.cyan); ctx.fill(); edge(k, C.line, 1);
      if (!F) {
        fillPoly(k, [J(cc, ch * 0.62, 0), J(cc, 0, cw2 * 0.45), J(cc, -ch * 0.2, 0), J(cc, 0, -cw2 * 0.45)], C.core, C.core, 0.4);
        glow(k, cc[0], cc[1], 9 * u, 0.12 + 0.35 * en, "67,223,255");
      }
    }

    // ── 6) belt with a lightning insignia, hip armor ──
    fillPoly(k, [T(8, -hw * 0.52), T(8, hw * 0.5), T(1, hw * 0.5), T(1, -hw * 0.52)], C.silverSh, C.line, 1.2);
    line(k, [T(7.4, -hw * 0.48), T(7.4, hw * 0.46)], C.silver, 0.9, 0.8);
    {
      const bk = T(4.5, hw * 0.04);
      fillPoly(k, [J(bk, 3, 0.6), J(bk, 0.2, 1.6), J(bk, 0.6, -0.2), J(bk, -3, -0.8), J(bk, -0.4, -1.8), J(bk, -0.6, 0)], C.cyan, C.line, 0.6); // tiny bolt
    }
    // short front hip plate (angular, not a tasset skirt)
    fillPoly(k, [T(7, hw * 0.1), T(7, hw * 0.6), T(-2, hw * 0.7), T(-7, hw * 0.4)], C.silver, C.line, 1);
    line(k, [T(5, hw * 0.24), T(-4, hw * 0.4)], C.electric, 0.9, 0.8);

    leg(k.MP(k.legF), false);

    // ── 7a) front arm and gauntlet ──
    const hand = arm(armFw, true);

    // ── 7b) front (larger) shoulder guard, over the top of the arm ──
    pauldron(armFw[0], 0.66);
    // shoulder marking: a few small electric lines
    glowStroke(k, [J(armFw[0], 8 * u * 0.3, 8 * u * 0.2), J(armFw[0], 3.4 * u, 3.2 * u), J(armFw[0], 2.4 * u, 5 * u), J(armFw[0], 6.4 * u, 7 * u)].map((p) => p), C.cyan, 0.7, 3, 0.15 + 0.45 * en);

    // ── 7) head: neck, face, glowing eye, facial bolt marking, hair, loose strands, bolt clip ──
    {
      fillPoly(k, [Hp(-0.3, 0.4), Hp(0.5, 0.5), Hp(0.56, 1.6), Hp(-0.4, 1.55)], C.skinSh, C.line, 1); // neck
      // face: defined cheekbone, sharp jaw
      const face = [Hp(-0.35, -0.95), Hp(0.55, -1.02), Hp(0.95, -0.7), Hp(1.0, -0.42), Hp(1.04, -0.18), Hp(1.26, 0.2), Hp(1.02, 0.28), Hp(1.04, 0.42), Hp(0.98, 0.52), Hp(0.98, 0.66), Hp(0.84, 0.94), Hp(0.5, 1.08), Hp(-0.1, 0.98), Hp(-0.55, 0.55), Hp(-0.65, -0.3)];
      fillPoly(k, face, C.skin, C.line, 1.3);
      if (!F) {
        ctx.save(); ctx.globalAlpha = 0.45; // cool shadow under the cheekbone and along the jaw
        pathOf(ctx, [Hp(0.1, 0.1), Hp(0.78, 0.28), Hp(0.86, 0.8), Hp(0.5, 1.04), Hp(-0.1, 0.95)]);
        ctx.fillStyle = C.skinSh; ctx.fill();
        ctx.restore();
        fillPoly(k, [Hp(0.8, 0.5), Hp(0.98, 0.46), Hp(1.02, 0.5), Hp(0.96, 0.62), Hp(0.82, 0.6)], "#c25a78", "#7a3348", 0.7); // full lips
        line(k, [Hp(0.8, 0.54), Hp(1.0, 0.5)], "#7a3348", 0.8, 0.9);
        line(k, [Hp(0.9, 0.5), Hp(0.98, 0.49)], "#f2b8c8", 0.8, 0.7); // gloss
        line(k, [Hp(0.32, -0.5), Hp(0.98, -0.42)], "#6f7f9a", 1.5, 0.95);               // brow, slightly lowered: challenging, not angry
      }
      // eye: bright electric blue, subtle white glow
      {
        const a0 = Hp(0.55, -0.2), a1 = Hp(0.98, -0.24);
        const wide = stunned ? 1.5 : 1;
        if (!F) {
          ctx.save();
          ctx.shadowColor = C.cyan; ctx.shadowBlur = 6 + 7 * en;
          ctx.strokeStyle = stunned ? "#ffffff" : C.cyan; ctx.lineWidth = Math.max(2.2, hrx * 0.24) * wide; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.stroke();
          ctx.shadowBlur = 0; ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(0.8, hrx * 0.06);
          ctx.beginPath(); ctx.moveTo(a0[0] + d * 1, a0[1]); ctx.lineTo(a1[0] - d * 0.5, a1[1]); ctx.stroke();
          ctx.restore();
        } else {
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.stroke();
        }
      }
      // lashes + liner sweeping out past the eye
      line(k, [Hp(0.5, -0.3), Hp(0.8, -0.38), Hp(1.0, -0.34)], C.line, 1.5, 1);
      line(k, [Hp(0.5, -0.3), Hp(0.36, -0.4)], C.line, 1.3, 1);
      // small lightning marking beside the eye, running back toward the temple
      glowStroke(k, [Hp(0.52, -0.02), Hp(0.38, 0.1), Hp(0.46, 0.14), Hp(0.2, 0.3)], C.cyan, 0.9, 3, 0.3 + 0.55 * en);
      // hair cap: swept back and pulled up into the ponytail
      fillPoly(k, [Hp(1.0, -0.72), Hp(0.7, -1.14), Hp(0.1, -1.24), Hp(-0.6, -1.1), Hp(-1.0, -0.8), Hp(-1.0, -0.2), Hp(-0.75, 0.3), Hp(-0.5, 0.2), Hp(-0.35, -0.2), Hp(0.1, -0.52), Hp(0.55, -0.7)], C.hair, C.hairSh, 1.2);
      line(k, [Hp(1.0, -0.72), Hp(0.55, -0.7), Hp(0.1, -0.52), Hp(-0.35, -0.2), Hp(-0.5, 0.2)], C.hairSh, 1.4, 0.9); // hairline shadow
      for (const [x0, y0, x1, y1] of [[0.85, -0.82, -0.8, -0.8], [0.55, -1.02, -0.9, -0.5], [0.2, -1.12, -0.95, -0.15]]) line(k, [Hp(x0, y0), Hp((x0 + x1) / 2, (y0 + y1) / 2 - 0.1), Hp(x1, y1)], C.frost, 0.9, 0.8);
      // loose strands framing the face, blue near the ends
      taper(k, [Hp(0.5, -0.72), Hp(0.72, -0.2), Hp(0.62, 0.55 + 0.05 * Math.sin(now * 3))], 3 * u, 0.8 * u, C.hair, C.hairSh, 0.7, 4);
      taper(k, [Hp(0.26, -0.82), Hp(0.38, 0.05), Hp(0.14, 0.95 + 0.06 * Math.sin(now * 3.4 + 1))], 2.8 * u, 0.7 * u, C.hair2, C.hairSh, 0.7, 4);
      line(k, [Hp(0.66, 0.22), Hp(0.62, 0.5)], C.electric, 1, 0.9);
      taper(k, [Hp(0.2, -1.1), Hp(0.9, -0.95), Hp(1.04, -0.5)], 3.4 * u, 0.8 * u, C.hair, C.hairSh, 0.7, 4); // side-swept fringe
      // hair tie + lightning-bolt clip at the base of the ponytail
      const tie = Hp(-0.9, -0.95);
      fillPoly(k, [[tie[0] + d * 1 * u, tie[1] - 3.4 * u], [tie[0] - d * 2.6 * u, tie[1] - 1 * u], [tie[0] - d * 0.6 * u, tie[1] + 0.2 * u], [tie[0] - d * 3.4 * u, tie[1] + 3.6 * u], [tie[0] + d * 1.6 * u, tie[1] + 0.6 * u], [tie[0] - d * 0.2 * u, tie[1] - 0.4 * u]], C.silver, C.line, 0.8);
      if (!F) glow(k, tie[0], tie[1], 5 * u, 0.12 + 0.2 * en, "67,223,255");
    }

    // ── 10) electricity: faint idle crackle, hot hand on a wind-up / strike, sparks drifting off her ──
    if (!F) {
      const hot = clamp(windU * 0.7 + (strike ? 1 : 0), 0, 1);
      if (hot > 0) {
        glow(k, hand[0], hand[1], 18 * u, 0.4 * hot, "67,223,255");
        const tip = [hand[0] + d * (10 + 10 * hot) * u, hand[1] + (hash(tb) - 0.5) * 6 * u];
        glowStroke(k, bolt(hand, tip, 4, 3.2 * u, tb * 5 + 2), "#D8FAFF", 1.2, 8, 0.5 + 0.5 * hot);
        if (strike && k.spawn && Math.random() < 0.8) k.spawn(A.ox + hand[0], A.oy + hand[1], (Math.random() - 0.4) * 3 * d, (Math.random() - 0.5) * 2.4, Math.random() < 0.5 ? "#D8FAFF" : "#43DFFF", 12, 2.2);
      }
      // idle: now and then a tiny arc snaps along an arm or off a shoulder
      if (hash(tb * 0.37) > 0.82 && !stunned) {
        const o = hash(tb) > 0.5 ? armFw[1] : armBw[1];
        glowStroke(k, bolt(o, [o[0] + (hash(tb + 3) - 0.5) * 16 * u, o[1] + (hash(tb + 5) - 0.7) * 14 * u], 3, 2.4 * u, tb * 2), C.cyan, 0.9, 5, 0.55);
      }
      if (k.spawn && !stunned && Math.random() < 0.035) k.spawn(A.ox + hcw[0] - d * 8 + (Math.random() - 0.5) * 24, A.oy - H * (0.2 + Math.random() * 0.7), (Math.random() - 0.5) * 0.6, -0.2 - Math.random() * 0.3, "#43DFFF", 22, 1.5);
    }
  }

  MW.Fulminar = { draw, PALETTE: C };
})(globalThis);