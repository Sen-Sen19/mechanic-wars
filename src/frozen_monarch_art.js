// Mechanic Wars - Frozen Monarch art (render only, never touches the sim).
// A tall ice king: silver and ice-blue royal armor, large angular shoulder guards, a glowing crystal in the
// chest, a fur-lined mantle, a long midnight-blue cape, long silver-white hair and a crown of natural ice.
// Design document: "Frozen Monarch - The Sovereign of Ice" (looks only; no skills or weapons are drawn here).
// Called from character_art.js DETAIL() for id === "monarch".
// k = the shared rig state from character_art.js, e = a few precomputed values (see DETAIL).
// The cape and the hair trail behind him when he moves: their small spring state lives in k.A.mCape.
(function (g) {
  const MW = (g.MW = g.MW || {});
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];

  // Palette from the design document.
  const C = {
    line: "#050a18",
    mid: "#0f1d40", mid2: "#17306a", royal: "#1d3a7a", royalHi: "#2c56a8", boot: "#0b1533",
    sd: "#7d8aa3", sv: "#b9c4d6", sv2: "#e4ecf7", frost: "#f4faff",
    ice: "#a8e4ff", iceDeep: "#5fb6f0", glow: "#7be6ff", core: "#e6fbff", winter: "#2f9cff",
    skin: "#dfe7f1", skinSh: "#a9b6c9",
    hair: "#e8eef7", hair2: "#cdd8e8", hairSh: "#aab7cc",
    fur: "#dfe9f5", furSh: "#a9b9cf",
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
  // smooth curve through points (Catmull-Rom), n samples per segment
  function spline(pts, n) {
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
  // a ribbon of changing width along a path (sleeves, legs, hair strands)
  function taper(k, pts, w0, w1, fill, edgeColor, lw, smooth) {
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
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
  }
  function glowStroke(k, pts, color, lw, blur, alpha) {
    if (k.isFlash) return;
    const { ctx } = k;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    pathOf(ctx, pts, false);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
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
  // six-point snowflake mark
  function flake(k, x, y, r, color, alpha) {
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      line(k, [[x - Math.cos(a) * r, y - Math.sin(a) * r], [x + Math.cos(a) * r, y + Math.sin(a) * r]], color, 0.8, alpha);
    }
  }

  // ── cape / hair spring state: 5 rows, each lags a little more than the one above it ──
  function capeUpdate(k) {
    const A = k.A;
    let c = A.mCape;
    if (!c) c = A.mCape = { x: [0, 0, 0, 0, 0], y: [0, 0, 0, 0, 0], t: -1 };
    if (c.t < 0 || Math.abs(k.now - c.t) > 0.004) { // once per drawn frame (the flash pass draws him twice)
      c.t = k.now;
      const sp = clamp(k.vx || 0, -9, 9), vy = clamp(k.vy || 0, -16, 16);
      for (let i = 0; i < 5; i++) {
        const w = (i + 1) / 5;
        const tx = -sp * 2.4 * w * w + Math.sin(k.now * 1.7 + i * 0.9) * 0.9 * w; // trails opposite to the run
        const ty = -vy * 0.55 * w + Math.sin(k.now * 2.3 + i) * 0.5 * w;        // lifts when falling, drops when rising
        const rate = 0.2 - i * 0.025;
        c.x[i] += (tx - c.x[i]) * rate;
        c.y[i] += (ty - c.y[i]) * rate;
      }
    }
    return c;
  }

  // fur with a ragged, frosted edge
  function fur(k, outline, tuft, fill) {
    const n = outline.length;
    let cx = 0, cy = 0;
    for (const p of outline) { cx += p[0]; cy += p[1]; }
    cx /= n; cy /= n;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const p = outline[i], q = outline[(i + 1) % n];
      pts.push(p);
      for (let j = 1; j <= 2; j++) {
        const m = mix(p, q, j / 3);
        let ox = m[0] - cx, oy = m[1] - cy;
        const l = Math.hypot(ox, oy) || 1;
        const s = tuft * (j === 1 ? 1 : 0.65);
        pts.push([m[0] + (ox / l) * s, m[1] + (oy / l) * s]);
      }
    }
    fillPoly(k, pts, fill, C.furSh, 1);
    return pts;
  }

  function draw(k, e) {
    const { ctx, d, now } = k;
    const F = k.isFlash;
    const { shW, hipW, hcw, armBw, armFw, windU, strike, stunned } = e;
    const H = k.H, u = H / 100;
    const torL = k.torL, sw = k.sw, hw = k.hw, hr = k.hr, legL = k.legL;
    const A = k.A;
    // energy: slow breathing glow (about every 3 s), brighter on a wind-up, a strike or a hit
    const pulse = 0.5 + 0.5 * Math.sin(now * 2.1);
    const en = clamp(0.32 + 0.22 * pulse + (strike ? 0.4 : 0) + windU * 0.3 + (stunned ? 0.25 : 0), 0, 1);

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

    const cape = capeUpdate(k);

    // first frame of a hit: a few ice flecks fly off him
    if (stunned && !A.mHurt && k.spawn && !F) {
      for (let i = 0; i < 9; i++) k.spawn(A.ox + hcw[0] + (Math.random() - 0.5) * 18, A.oy + hcw[1] + 6 + Math.random() * 18, (Math.random() - 0.5) * 3.4, -Math.random() * 2 - 0.4, i % 2 ? "#e6fbff" : "#a8e4ff", 20, 2.6);
    }
    A.mHurt = stunned;

    // ── 1) cape: midnight blue outside, royal-blue lining on the back edge, jagged frosted hem ──
    {
      const F0 = T(torL * 0.95, -sw * 0.28);
      const capeLen = H * 0.62;
      const backW = [4, 7, 11, 15, 20];
      const Fp = [], Bp = [];
      for (let i = 0; i < 5; i++) {
        const yy = F0[1] + (i * capeLen) / 4;
        Fp.push([F0[0] - d * i * 1.4 * u + cape.x[i] * 0.45, yy + cape.y[i] * 0.5]);
        Bp.push([F0[0] - d * backW[i] * u + cape.x[i], yy + cape.y[i]]);
      }
      const hem = [];
      for (let j = 0; j <= 6; j++) {
        const p = mix(Bp[4], Fp[4], j / 6);
        hem.push([p[0], p[1] + (j % 2 === 0 ? 1.5 : 6.5) * u]);
      }
      const outline = [Fp[0], Fp[1], Fp[2], Fp[3], Fp[4]].concat(hem.slice().reverse(), [Bp[3], Bp[2], Bp[1], Bp[0]]);
      fillPoly(k, outline, C.mid, C.line, 1.4);
      // royal-blue lining strip along the back edge
      const inner = [];
      for (let i = 0; i < 5; i++) inner.push([Bp[i][0] + d * (2.6 + i * 0.9) * u, Bp[i][1]]);
      fillPoly(k, Bp.slice(0, 4).concat([hem[0]], [inner[4]], inner.slice(0, 4).reverse()), C.royal, C.royal, 0.6);
      // long vertical folds
      for (const t of [0.42, 0.7]) {
        const pts = [];
        for (let i = 0; i < 5; i++) pts.push(mix(Fp[i], Bp[i], t));
        line(k, spline(pts, 4), C.royalHi, 1, 0.5);
      }
      line(k, [mix(Fp[0], Bp[0], 0.2), mix(Fp[2], Bp[2], 0.2), mix(Fp[4], Bp[4], 0.2)], C.line, 1, 0.5);
      // faint snowflake lattice near the hem
      flake(k, mix(Fp[3], Bp[3], 0.5)[0], mix(Fp[3], Bp[3], 0.5)[1] + 2, 2.6 * u, C.ice, 0.45);
      flake(k, mix(Fp[4], Bp[4], 0.35)[0], mix(Fp[4], Bp[4], 0.35)[1] - 3, 2.2 * u, C.ice, 0.4);
      flake(k, mix(Fp[2], Bp[2], 0.6)[0], mix(Fp[2], Bp[2], 0.6)[1], 2 * u, C.ice, 0.3);
      // hoarfrost crystals on the hem
      if (!F) {
        for (let j = 1; j <= 5; j += 2) {
          const p = hem[j];
          fillPoly(k, [[p[0] - 2.2 * u, p[1] - 0.5], [p[0] + 0.4 * d * u, p[1] + 4.2 * u], [p[0] + 2.2 * u, p[1] - 0.5]], C.ice, C.core, 0.7);
        }
      }
    }

    // ── 2) long silver-white hair hanging behind the shoulders ──
    {
      const hairTrail = [cape.x[1] * 0.8, cape.y[1] * 0.6];
      const strand = (off, w0, col, len) => {
        const p0 = Hp(-0.55, -0.55);
        const p1 = Hp(-1.45, 0.35 + off * 0.3);
        const p2 = T(torL * 0.78, -sw * 0.47 - off * 2.0);
        p2[0] += hairTrail[0] * 0.5; p2[1] += hairTrail[1] * 0.3;
        const p3 = T(torL * 0.4 - len, -sw * 0.5 - off * 3.0);
        p3[0] += hairTrail[0]; p3[1] += hairTrail[1];
        taper(k, [p0, p1, p2, p3], w0 * u, 1.2 * u, col, C.hairSh, 0.9, 5);
      };
      strand(0, 10, C.hair2, 4);
      strand(1.2, 8, C.hair, 0);
      strand(-0.5, 7, C.hairSh, 9);
    }

    // ── 3) arms: coat sleeve, silver gauntlet with ice fins on the outer cuff, slim armored hand ──
    const arm = (pts, front) => {
      const [s0, el, wr] = pts;
      taper(k, [s0, el], 10 * u, 8.5 * u, front ? C.mid2 : C.mid, C.line, 1.1);
      const vx = wr[0] - el[0], vy = wr[1] - el[1], len = Math.hypot(vx, vy) || 1;
      const tx = vx / len, ty = vy / len, qx = -ty, qy = tx;
      const P = (t, q) => [el[0] + tx * len * t + qx * q * u, el[1] + ty * len * t + qy * q * u];
      const side = qx * -d > 0 ? 1 : -1; // the outer (backward) side of the forearm gets the fins
      // elbow cop
      ctx.beginPath(); ctx.arc(el[0], el[1], 4.4 * u, 0, TAU);
      ctx.fillStyle = k.col(front ? C.sv : C.sd); ctx.fill(); edge(k, C.line, 1);
      // forearm gauntlet
      fillPoly(k, [P(0.1, -4.8), P(0.96, -3.7), P(0.96, 3.7), P(0.1, 4.8)], front ? C.sv : C.sd, C.line, 1.1);
      line(k, [P(0.14, -4.6), P(0.94, -3.5)], C.sv2, 1, 0.7);
      glowStroke(k, [P(0.22, 0), P(0.9, 0)], C.glow, 1, 4, 0.3 + 0.6 * en);
      // three sharp ice fins flaring off the outer cuff
      for (const ti of [0.5, 0.69, 0.88]) {
        fillPoly(k, [P(ti - 0.13, side * 4.3), P(ti + 0.02, side * 4), [P(ti - 0.06, side * (10.5 - ti * 2.5))[0], P(ti - 0.06, side * (10.5 - ti * 2.5))[1]]], C.sv2, C.line, 0.9);
      }
      // slim armored hand: palm, finger plates, thumb
      const Gp = (t, q) => [wr[0] + (tx * t + qx * q) * u, wr[1] + (ty * t + qy * q) * u];
      fillPoly(k, [Gp(-1, -3.2), Gp(4, -3.6), Gp(8.2, -2.8), Gp(10, -0.4), Gp(8.2, 2.6), Gp(4, 3.6), Gp(-1, 3.2)], front ? C.sv : C.sd, C.line, 1);
      for (const t of [3.6, 5.6, 7.6]) line(k, [Gp(t, -3), Gp(t, 3)], C.line, 0.8, 0.7);
      line(k, [Gp(0.5, -3.1), Gp(7.8, -2.5)], C.ice, 0.9, 0.7);
      fillPoly(k, [Gp(1.5, 2.9), Gp(5, 4.6), Gp(6.6, 4), Gp(3.4, 2.4)], front ? C.sv2 : C.sv, C.line, 0.8); // thumb
      return Gp(8, 0);
    };
    // big angular shoulder guard: three stacked plates sweeping up and out into sharp points (sgn +1 front, -1 back)
    const pauldron = (sP, s, sgn) => {
      for (let i = 0; i < 3; i++) {
        const a = -2 + i * 5.2, w = (12.5 - i * 1.8) * s;
        const pts = [
          J(sP, (a - 4) * s, -sgn * w * 0.9), J(sP, (a + 2.4) * s, -sgn * w * 1.0), J(sP, (a + (6.5 + i * 1.6)) * s, sgn * w * 0.15),
          J(sP, (a + (3.6 + i * 1.3)) * s, sgn * (w + 6.8 * s)), J(sP, (a - 4.4) * s, sgn * w * 0.82), J(sP, (a - 6) * s, sgn * w * 0.05),
        ];
        fillPoly(k, pts, i === 0 ? C.sd : i === 1 ? C.sv : C.sv2, C.line, 1.1);
        line(k, [pts[1], pts[2], pts[3]], C.ice, 0.9, 0.85); // ice-blue edge line
        if (i === 1) { // fern-frost engraving
          line(k, [J(sP, (a - 1) * s, -sgn * w * 0.4), J(sP, (a + 3) * s, sgn * w * 0.1), J(sP, (a + 4) * s, sgn * w * 0.6)], C.winter, 0.8, 0.6);
          line(k, [J(sP, (a + 1) * s, 0), J(sP, (a + 3.4) * s, -sgn * w * 0.3)], C.winter, 0.7, 0.5);
        }
      }
    };
    arm(armBw, false);
    pauldron(armBw[0], 0.66, -1);

    // ── 4) legs: fitted trousers, silver shin guard, angular knee guard, tall pointed boot with a fur cuff ──
    const leg = (pts, isBack) => {
      const [h, kn, ft] = pts;
      const trou = isBack ? C.mid : C.mid2;
      taper(k, [h, kn], 12 * u, 9.6 * u, trou, C.line, 1.1);
      taper(k, [kn, ft], 9.6 * u, 8 * u, trou, C.line, 1.1);
      // boot: upper from mid-shin down, pointed toe
      const bt = mix(kn, ft, 0.52);
      taper(k, [bt, ft], 9 * u, 8.4 * u, C.boot, C.line, 1.1);
      fillPoly(k, [
        [ft[0] - d * 5 * u, ft[1] - 7 * u], [ft[0] + d * 4.6 * u, ft[1] - 7 * u], [ft[0] + d * 5 * u, ft[1] - 3 * u],
        [ft[0] + d * 17 * u, ft[1] - 0.6 * u], [ft[0] + d * 16 * u, ft[1] + 1.2 * u], [ft[0] - d * 6 * u, ft[1] + 1.2 * u],
      ], C.boot, C.line, 1.1);
      line(k, [[ft[0] + d * 5 * u, ft[1] - 2.8 * u], [ft[0] + d * 16.5 * u, ft[1] + 0.2 * u]], C.sd, 1.1, 0.9); // silver toe edge
      line(k, [[ft[0] - d * 6 * u, ft[1] + 0.6 * u], [ft[0] + d * 16 * u, ft[1] + 0.6 * u]], C.ice, 0.9, 0.55); // frost on the sole
      // silver shin guard above the fur cuff
      taper(k, [mix(kn, ft, 0.14), mix(kn, ft, 0.5)], 8.6 * u, 7.4 * u, isBack ? C.sd : C.sv, C.line, 1);
      line(k, [mix(kn, ft, 0.2), mix(kn, ft, 0.46)], C.sv2, 0.9, 0.7);
      // fur cuff
      for (let i = -2; i <= 2; i++) {
        const p = [bt[0] + i * 1.9 * u, bt[1] - 0.4 * u];
        fillPoly(k, [[p[0] - 1.5 * u, p[1] + 1.8 * u], [p[0], p[1] - 2.4 * u], [p[0] + 1.5 * u, p[1] + 1.8 * u]], C.fur, C.furSh, 0.6);
      }
      // angular knee guard with one small spike
      fillPoly(k, [
        [kn[0] - d * 4.5 * u, kn[1] - 4.5 * u], [kn[0] + d * 0.5 * u, kn[1] - 6.5 * u], [kn[0] + d * 6 * u, kn[1] - 2.2 * u],
        [kn[0] + d * 9.6 * u, kn[1] + 0.4 * u], [kn[0] + d * 4 * u, kn[1] + 4.6 * u], [kn[0] - d * 4 * u, kn[1] + 4 * u],
      ], isBack ? C.sd : C.sv, C.line, 1.1);
      line(k, [[kn[0] - d * 3 * u, kn[1] - 3.2 * u], [kn[0] + d * 1 * u, kn[1] - 4.8 * u], [kn[0] + d * 5 * u, kn[1] - 1.6 * u]], C.ice, 0.9, 0.85);
    };
    leg(k.MP(k.legB), true);

    // ── 5) coat and torso: midnight-blue high-collared coat with silver embroidery ──
    const sway = Math.sin(now * 2.0) * 0.9 - clamp(k.vx, -6, 6) * 0.35;
    fillPoly(k, [T(2, -hw * 0.54), T(torL * 0.96, -sw * 0.37), T(torL * 1.0, sw * 0.35), T(2, hw * 0.5)], C.mid, C.line, 1.3);
    // high collar standing up behind the neck
    fillPoly(k, [T(torL * 0.92, -sw * 0.3), T(torL * 1.2, -sw * 0.27), T(torL * 1.28, -sw * 0.14), T(torL * 1.0, -sw * 0.08)], C.mid2, C.line, 1.1);
    line(k, [T(torL * 1.0, -sw * 0.28), T(torL * 1.2, -sw * 0.25), T(torL * 1.26, -sw * 0.14)], C.sv, 0.9, 0.8);

    // ── 6) chest armor: silver cuirass, abdomen lames, glowing crystal in a frost-branch frame ──
    fillPoly(k, [T(torL * 0.3, -sw * 0.26), T(torL * 0.62, -sw * 0.36), T(torL * 0.98, -sw * 0.38), T(torL * 1.02, sw * 0.36), T(torL * 0.64, sw * 0.3), T(torL * 0.3, sw * 0.14)], C.sd, C.line, 1.4);
    for (const [a0, a1, wf, col] of [[torL * 0.1, torL * 0.36, hw * 0.42, C.sd], [torL * 0.3, torL * 0.54, sw * 0.33, C.sv]]) {
      fillPoly(k, [T(a0, -wf), T(a1, -wf * 1.05), T(a1, wf * 1.05), T(a0, wf)], col, C.line, 1.1);
      line(k, [T(a1 - 0.3, -wf * 0.9), T(a1 - 0.3, wf * 0.9)], C.sv2, 0.8, 0.8);
    }
    fillPoly(k, [T(torL * 0.5, -sw * 0.34), T(torL * 0.98, -sw * 0.38), T(torL * 1.02, sw * 0.36), T(torL * 0.7, sw * 0.32), T(torL * 0.5, sw * 0.1)], C.sv, C.line, 1.5);
    line(k, [T(torL * 0.98, -sw * 0.3), T(torL * 1.0, sw * 0.3)], C.sv2, 1, 0.8); // bright top edge
    // frost engravings: thin glowing lines running out from the crystal like cracks in a frozen lake
    const cc = T(torL * 0.7, sw * 0.03);
    for (const [pa, pb] of [
      [[torL * 0.74, sw * 0.1], [torL * 0.86, sw * 0.24], [torL * 0.96, sw * 0.3]],
      [[torL * 0.68, sw * 0.12], [torL * 0.66, sw * 0.24], [torL * 0.7, sw * 0.3]],
      [[torL * 0.74, -sw * 0.05], [torL * 0.88, -sw * 0.2], [torL * 0.96, -sw * 0.3]],
      [[torL * 0.66, -sw * 0.06], [torL * 0.6, -sw * 0.2], [torL * 0.56, -sw * 0.3]],
    ]) glowStroke(k, [T(pa[0], pa[1]), T(pb[0], pb[1]), T(pb[0] + 0, pb[1])].slice(0, 2).concat([T(torL * 0 + (pa[0] + pb[0]) / 2 + 0, 0)].slice(0, 0)), C.ice, 0.9, 3, 0.25 + 0.5 * en);
    glowStroke(k, [T(torL * 0.76, sw * 0.12), T(torL * 0.86, sw * 0.24), T(torL * 0.96, sw * 0.3)], C.ice, 0.9, 3, 0.25 + 0.5 * en);
    glowStroke(k, [T(torL * 0.76, -sw * 0.1), T(torL * 0.86, -sw * 0.22), T(torL * 0.95, -sw * 0.3)], C.ice, 0.9, 3, 0.25 + 0.5 * en);
    glowStroke(k, [T(torL * 0.64, sw * 0.12), T(torL * 0.6, sw * 0.24)], C.ice, 0.9, 3, 0.2 + 0.45 * en);
    glowStroke(k, [T(torL * 0.64, -sw * 0.14), T(torL * 0.58, -sw * 0.26)], C.ice, 0.9, 3, 0.2 + 0.45 * en);
    // the crystal: tall diamond held by four silver prongs
    {
      const ch = 5.4 * u, cw2 = 3.4 * u;
      for (const [pa, pb] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const base = J(cc, pa * (ch + 3.2 * u), pb * (cw2 + 3.2 * u));
        const tip = J(cc, pa * (ch * 0.7), pb * (cw2 * 0.7));
        line(k, [base, tip], C.sv2, 1.6, 1);
      }
      const dia = [J(cc, ch, 0), J(cc, 0, cw2), J(cc, -ch, 0), J(cc, 0, -cw2)];
      pathOf(ctx, dia);
      ctx.fillStyle = k.col(C.glow); ctx.fill(); edge(k, C.line, 1);
      if (!F) {
        fillPoly(k, [J(cc, ch * 0.7, 0), J(cc, 0, cw2 * 0.5), J(cc, -ch * 0.2, 0), J(cc, 0, -cw2 * 0.5)], C.core, C.core, 0.4);
        glow(k, cc[0], cc[1], 17 * u, 0.28 + 0.4 * en, "123,230,255");
      }
    }

    // ── 7) belt with a snowflake buckle, tabard, long hip plates ──
    fillPoly(k, [T(8, -hw * 0.56), T(8, hw * 0.54), T(1, hw * 0.54), T(1, -hw * 0.56)], C.sd, C.line, 1.2);
    {
      const bk = T(4.5, hw * 0.06);
      ctx.beginPath(); ctx.arc(bk[0], bk[1], 3.6 * u, 0, TAU); ctx.fillStyle = k.col(C.sv2); ctx.fill(); edge(k, C.line, 1);
      flake(k, bk[0], bk[1], 2.6 * u, C.winter, 0.95);
    }
    // tabard: long midnight panel with a silver center stripe and a frost-white edge
    {
      const tl0 = T(2, hw * 0.3), tr0 = T(2, -hw * 0.28);
      const bl = [hipW[0] - d * hw * 0.22 + sway, hipW[1] + legL * 0.64], br = [hipW[0] + d * hw * 0.3 + sway, hipW[1] + legL * 0.66];
      fillPoly(k, [tl0, tr0, bl, br], C.mid, C.line, 1.2);
      line(k, [mix(tl0, tr0, 0.5), mix(br, bl, 0.5)], C.sv, 1.2, 0.85);
      line(k, [bl, br], C.frost, 1.6, 0.95);
      for (let i = 0; i < 4; i++) { // tiny frost stitches
        const p = mix(mix(tl0, tr0, 0.5), mix(br, bl, 0.5), 0.2 + i * 0.2);
        line(k, [[p[0] - 1.4, p[1]], [p[0] + 1.4, p[1]]], C.ice, 0.7, 0.6);
      }
    }
    // long hip plates (tassets) that split at the front
    for (const sg of [1, -1]) {
      for (let i = 1; i >= 0; i--) {
        const a0 = -i * 5, bo = hw * (0.1 + 0.18 * i), bi = hw * (0.55 - 0.05 * i);
        fillPoly(k, [T(7 + a0, sg * bo), T(7 + a0, sg * bi), T(-11 + a0 - i * 3, sg * (bi + 1.5)), T(-14 + a0 - i * 3, sg * (bo + 2))], sg > 0 ? (i ? C.sd : C.sv) : (i ? C.sd : C.sd), C.line, 1);
        line(k, [T(6 + a0, sg * (bo + 1)), T(-11 + a0 - i * 3, sg * (bo + 2.6))], C.sv2, 0.8, 0.6);
      }
    }

    leg(k.MP(k.legF), false);

    // ── 8) fur-lined mantle over both shoulders, V down the chest ──
    {
      const outline = [T(torL * 0.8, -sw * 0.54), T(torL * 1.05, -sw * 0.5), T(torL * 1.13, -sw * 0.18), T(torL * 1.13, sw * 0.2), T(torL * 1.05, sw * 0.56), T(torL * 0.78, sw * 0.54), T(torL * 0.55, sw * 0.1), T(torL * 0.74, -sw * 0.2)];
      // soft shadow underneath, then the fur itself
      const shadow = outline.map((p) => [p[0], p[1] + 2.2 * u]);
      fur(k, shadow, 2.4 * u, C.furSh);
      const pts = fur(k, outline, 3 * u, C.fur);
      if (!F) {
        // brighter tufts on top and tiny frost crystals on the tips
        for (let i = 2; i < pts.length; i += 4) {
          const p = pts[i], q = pts[(i + 1) % pts.length];
          line(k, [mix(p, q, 0.2), mix(p, q, 0.7)], C.frost, 1, 0.8);
        }
        for (let i = 4; i < pts.length; i += 9) {
          const p = pts[i];
          fillPoly(k, [[p[0] - 1.1, p[1] + 0.8], [p[0], p[1] - 3], [p[0] + 1.1, p[1] + 0.8]], C.ice, C.core, 0.5);
        }
      }
      // two silver clasps with small crystals where the cape joins the mantle
      for (const [a, b] of [[torL * 0.99, -sw * 0.36], [torL * 0.84, -sw * 0.38]]) {
        const p = T(a, b);
        ctx.beginPath(); ctx.arc(p[0], p[1], 2.4 * u, 0, TAU); ctx.fillStyle = k.col(C.sv2); ctx.fill(); edge(k, C.line, 0.9);
        ctx.beginPath(); ctx.arc(p[0], p[1], 1.1 * u, 0, TAU); ctx.fillStyle = k.col(C.glow); ctx.fill();
      }
    }

    // ── 9) head: neck, pale face with glowing eye, swept-back hair, crown of ice ──
    {
      // neck
      fillPoly(k, [Hp(-0.3, 0.4), Hp(0.5, 0.5), Hp(0.6, 1.6), Hp(-0.45, 1.55)], C.skinSh, C.line, 1);
      // face
      const face = [Hp(-0.35, -0.95), Hp(0.55, -1.02), Hp(0.95, -0.7), Hp(1.0, -0.42), Hp(1.04, -0.18), Hp(1.3, 0.2), Hp(1.04, 0.28), Hp(1.04, 0.42), Hp(1.0, 0.52), Hp(1.02, 0.66), Hp(0.92, 0.94), Hp(0.55, 1.06), Hp(-0.1, 0.98), Hp(-0.55, 0.55), Hp(-0.65, -0.3)];
      fillPoly(k, face, C.skin, C.line, 1.3);
      if (!F) {
        // cool shadow under the cheekbone and along the jaw, a flat firm mouth, a low straight brow
        ctx.save(); ctx.globalAlpha = 0.5;
        pathOf(ctx, [Hp(0.1, 0.1), Hp(0.8, 0.3), Hp(0.9, 0.8), Hp(0.5, 1.02), Hp(-0.1, 0.95)]);
        ctx.fillStyle = C.skinSh; ctx.fill();
        ctx.restore();
        line(k, [Hp(0.78, 0.5), Hp(1.0, 0.5)], "#6e7d96", 1.1, 0.9);   // mouth
        line(k, [Hp(0.72, 0.62), Hp(0.82, 0.78)], "#8794ab", 0.7, 0.5);  // faint line beside the mouth
        line(k, [Hp(0.4, -0.46), Hp(1.0, -0.34)], "#8a97ad", 1.7, 0.95);  // brow
        line(k, [Hp(0.35, -0.62), Hp(0.15, -0.5), Hp(0.3, -0.38)], C.ice, 0.7, 0.55); // faint frost lines at the temple
      }
      // eye: no pupil, a bright iris with a white-cyan core
      {
        const a0 = Hp(0.55, -0.18), a1 = Hp(0.98, -0.2);
        const wide = stunned ? 1.5 : 1;
        if (!F) {
          ctx.save();
          ctx.shadowColor = C.glow; ctx.shadowBlur = 7 + 7 * en;
          ctx.strokeStyle = stunned ? "#ffffff" : C.glow; ctx.lineWidth = Math.max(1.8, hrx * 0.17) * wide; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.stroke();
          ctx.shadowBlur = 0; ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(0.8, hrx * 0.06);
          ctx.beginPath(); ctx.moveTo(a0[0] + d * 1, a0[1]); ctx.lineTo(a1[0] - d * 0.5, a1[1]); ctx.stroke();
          ctx.restore();
        } else {
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.stroke();
        }
      }
      // swept-back hair over the top and back of the head, front lock beside the cheek
      fillPoly(k, [Hp(1.0, -0.72), Hp(0.7, -1.14), Hp(0.1, -1.22), Hp(-0.6, -1.06), Hp(-1.08, -0.4), Hp(-1.3, 0.5), Hp(-0.95, 1.0), Hp(-0.55, 0.45), Hp(-0.35, -0.2), Hp(0.1, -0.52), Hp(0.55, -0.7)], C.hair, C.hairSh, 1.2);
      for (const [x0, y0, x1, y1] of [[0.85, -0.8, -0.7, -0.7], [0.6, -1.0, -0.9, -0.1], [0.2, -1.1, -1.0, 0.4]]) line(k, [Hp(x0, y0), Hp((x0 + x1) / 2, (y0 + y1) / 2 - 0.12), Hp(x1, y1)], C.frost, 0.9, 0.8);
      taper(k, [Hp(0.3, -0.45), Hp(0.32, 0.2), Hp(0.05, 0.95)], 3.2 * u, 1 * u, C.hair2, C.hairSh, 0.8, 4);
      // a little hair spilling over the fur on the back of the shoulder
      taper(k, [Hp(-1.1, 0.3), Hp(-1.3, 1.4), T(torL * 0.72, -sw * 0.4)], 6.5 * u, 2 * u, C.hair, C.hairSh, 0.8, 5);

      // crown: thin silver circlet low on the brow, with five grown spikes of ice
      const bandB = (a) => (a < -0.2 ? lerp(-0.62, -0.84, (a + 0.95) / 0.75) : a < 0.55 ? lerp(-0.84, -0.86, (a + 0.2) / 0.75) : lerp(-0.86, -0.66, (a - 0.55) / 0.45));
      const spikes = [[-0.72, 0.55, 0.26, -0.15], [-0.3, 0.85, 0.28, -0.05], [0.15, 1.1, 0.32, 0.05], [0.6, 0.8, 0.27, 0.38], [0.93, 0.48, 0.2, 0.3]];
      if (!F) glow(k, Hp(0.1, -1.1)[0], Hp(0.1, -1.1)[1], hrx * 1.7, 0.1 + 0.12 * en, "168,228,255");
      for (const [a, ht, wd, lean] of spikes) {
        const b = bandB(a);
        const tip = Hp(a + lean * 0.5, b - ht);
        const poly = [Hp(a - wd, b + 0.04), Hp(a - wd * 0.5 + lean * 0.15, b - ht * 0.52), tip, Hp(a + wd * 0.4 + lean * 0.2, b - ht * 0.4), Hp(a + wd, b + 0.04)];
        fillPoly(k, poly, C.ice, C.core, 0.9);
        if (!F) {
          pathOf(ctx, [Hp(a - wd * 0.1, b), Hp(a + lean * 0.15, b - ht * 0.55), tip]);
          ctx.fillStyle = "rgba(230,251,255,0.8)"; ctx.fill();
          line(k, [Hp(a - wd * 0.55, b - ht * 0.2), tip], C.frost, 0.8, 0.9);
        }
      }
      for (const a of [-0.5, -0.05, 0.4, 0.78]) { // tiny shards at the base
        const b = bandB(a);
        fillPoly(k, [Hp(a - 0.08, b), Hp(a + 0.04, b - 0.3), Hp(a + 0.14, b)], C.ice, C.core, 0.5);
      }
      taper(k, [Hp(-0.95, bandB(-0.95)), Hp(-0.2, bandB(-0.2)), Hp(0.55, bandB(0.55)), Hp(1.0, bandB(1.0))], 3.2 * u, 3.2 * u, C.sv, C.line, 1, 4);
      line(k, [Hp(-0.6, bandB(-0.6)), Hp(0.5, bandB(0.5))], C.ice, 0.9, 0.9);
    }

    // ── 10) front arm and gauntlet ──
    const hand = arm(armFw, true);

    // ── 11) front shoulder guard (over the top of the arm) ──
    pauldron(armFw[0], 0.95, 1);

    // ── 12) light and little extras: a wind-up / strike glow on the hand, frost drifting off it, snow near the hem ──
    if (!F) {
      const hot = clamp(windU * 0.7 + (strike ? 1 : 0), 0, 1);
      if (hot > 0) {
        glow(k, hand[0], hand[1], 18 * u, 0.35 * hot, "168,228,255");
        if (strike && k.spawn && Math.random() < 0.7) k.spawn(A.ox + hand[0], A.oy + hand[1], (Math.random() - 0.5) * 1.2, (Math.random() - 0.3) * 1.2, Math.random() < 0.5 ? "#e6fbff" : "#a8e4ff", 18, 2.4);
      }
      if (k.spawn && !stunned && Math.random() < 0.03) k.spawn(A.ox - d * 12 + (Math.random() - 0.5) * 22, A.oy - 14 - Math.random() * 10, (Math.random() - 0.5) * 0.3, 0.12 + Math.random() * 0.2, "#e6fbff", 44, 1.6);
    }
  }

  MW.FrozenMonarch = { draw, PALETTE: C };
})(globalThis);