// Mechanic Wars - Void Mage art (render only, never touches the sim).
// A tall astral figure half-consumed by a dimensional void: obsidian body, a midnight-violet starry face, asymmetrical armor
// with glowing violet cracks, a cloak of living smoke, claw hands, shoulder tentacles and a
// singularity in the chest. Called from character_art.js DETAIL() for id === "mage".
// k = the shared rig state from character_art.js, e = a few precomputed values (see DETAIL).
(function (g) {
  const MW = (g.MW = g.MW || {});
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // obs = obsidian body, rim = violet edge light (keeps the silhouette readable on dark stages)
  const C = { void: "#020106", obs: "#0c0a14", obs2: "#1b1533", obs3: "#30265a", deep: "#3a1680", rim: "#4a2699", elec: "#b44bff", hot: "#e6bcff" };

  // star specks on the face: [x, y, size, twinkle phase] in head-ellipse units (-1..1)
  const VOID_STARS = [
    [0.15, -0.7, 1, 0], [0.62, -0.55, 0.7, 1.3], [-0.3, -0.35, 0.6, 2.1], [0.8, -0.1, 0.8, 0.7], [0.45, 0.05, 0.5, 3.0],
    [-0.55, 0.1, 0.7, 4.2], [0.25, 0.35, 1, 5.1], [0.72, 0.38, 0.8, 2.6], [-0.1, 0.55, 0.5, 3.7], [0.5, 0.7, 0.7, 1.9],
    [-0.45, 0.62, 0.6, 0.4], [0.05, -0.15, 0.5, 4.8], [0.9, -0.45, 0.5, 5.5], [-0.7, -0.3, 0.6, 2.9], [0.35, -0.92, 0.6, 3.3], [0.0, 0.85, 0.5, 6.0],
  ];

  // ── tiny drawing helpers ───────────────────────────────────────────
  function pathOf(ctx, pts, close) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (close !== false) ctx.closePath();
  }
  function edge(k, edgeColor, lw) {
    k.ctx.lineJoin = "round";
    k.ctx.lineWidth = (lw || 1.5) * 0.7;
    k.ctx.strokeStyle = k.isFlash ? "#fff" : edgeColor;
    k.ctx.stroke();
  }
  function fillPoly(k, pts, fill, edgeColor, lw) {
    pathOf(k.ctx, pts);
    k.ctx.fillStyle = k.col(fill);
    k.ctx.fill();
    edge(k, edgeColor || C.rim, lw);
  }
  // Tapered limb along a polyline (w0 at the start, w1 at the end).
  function taper(k, pts, w0, w1, fill, edgeColor, lw) {
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
    ctx.stroke();
    ctx.restore();
  }
  // Zig-zag crack between two points (deterministic, seeded by s).
  function crack(a, b, s, amp) {
    const pts = [a];
    const n = 4;
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    for (let i = 1; i < n; i++) {
      const o = Math.sin(s * 12.9898 + i * 78.233) * amp;
      pts.push([a[0] + (dx * i) / n - (dy / l) * o, a[1] + (dy * i) / n + (dx / l) * o]);
    }
    pts.push(b);
    return pts;
  }
  // Removed bezier helper function as crown shards are no longer drawn with it.

  function draw(k, e) {
    const { ctx, d, now, A, f, M } = k;
    const F = k.isFlash;
    const { shW, hipW, hcw, armBw, armFw, windU, strike, pulse, stunned } = e;
    const torL = k.torL, sw = k.sw, hw = k.hw, aw = k.aw, lw = k.lw, hr = k.hr, legL = k.legL;
    const back = -d;
    const power = clamp(windU + (strike ? 0.8 : 0), 0, 1);

    // torso frame: T(a, b) = a along the spine (0 = hip, torL = shoulders), b toward the front
    let ux = shW[0] - hipW[0], uy = shW[1] - hipW[1];
    const tl = Math.hypot(ux, uy) || 1;
    ux /= tl; uy /= tl;
    let nx = -uy, ny = ux;
    if (nx * d < 0) { nx = -nx; ny = -ny; }
    const T = (a, b) => [hipW[0] + ux * a + nx * b, hipW[1] + uy * a + ny * b];
    // same frame, anchored at a joint (for pauldrons)
    const J = (o, a, b) => [o[0] + ux * a + nx * b, o[1] + uy * a + ny * b];

    // ground-hugging violet glow: the whole figure sits in a faint void haze
    if (!F) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const hg = ctx.createRadialGradient(hipW[0], hipW[1] - torL * 0.5, 2, hipW[0], hipW[1] - torL * 0.5, k.H * 0.62);
      hg.addColorStop(0, "rgba(120,50,220,0.22)");
      hg.addColorStop(1, "rgba(60,20,140,0)");
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(hipW[0], hipW[1] - torL * 0.5, k.H * 0.62, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // ── 1) cloak of living smoke (two layers, dissolving at the hem) ──
    const drift = -clamp(k.vx, -8, 8) * 1.7;
    const hemY = hipW[1] + legL * 0.82;
    const cloak = (layer) => {
      const stretch = 6 + layer * 6 + clamp(Math.abs(k.vx) * 2.2, 0, 16);
      const topBack = T(torL * 1.0, -sw * (0.36 + layer * 0.06));
      const topNeck = T(torL * 1.07, -sw * 0.02);
      const topFront = T(torL * 0.96, sw * 0.18);
      const xb = hipW[0] + back * (hw * 0.7 + stretch);
      const xf = hipW[0] + d * hw * 0.3;
      const N = 8, hem = [];
      for (let j = 0; j <= N; j++) {
        const u = j / N;
        const tip = j % 2 === 0;
        hem.push([
          lerp(xb, xf, u) + drift * (0.75 + 0.25 * (1 - u)) + Math.sin(now * 2.6 + j * 0.8 + layer) * 2.8 + (tip ? back * (3 + layer * 2) : 0),
          hemY + layer * 3 + (tip ? 6 + 4 * Math.abs(Math.sin(j * 3.7 + now * 1.4)) : -2) + Math.sin(now * 3.1 + j * 1.3 + layer * 2) * 2,
        ]);
      }
      ctx.beginPath();
      ctx.moveTo(topNeck[0], topNeck[1]);
      ctx.lineTo(topBack[0], topBack[1]);
      ctx.quadraticCurveTo(lerp(topBack[0], xb, 0.45) + back * (4 + layer * 3) + drift * 0.45, lerp(topBack[1], hemY, 0.5), hem[0][0], hem[0][1]);
      for (let j = 1; j <= N; j++) ctx.lineTo(hem[j][0], hem[j][1]);
      ctx.lineTo(topFront[0], topFront[1]);
      ctx.closePath();
      if (F) { ctx.fillStyle = "#fff"; ctx.fill(); return; }
      const top = Math.min(topBack[1], topNeck[1]);
      const gr = ctx.createLinearGradient(0, top, 0, hemY + 12);
      if (layer) { gr.addColorStop(0, "rgba(42,16,92,0.95)"); gr.addColorStop(1, "rgba(58,22,128,0)"); }
      else { gr.addColorStop(0, "rgba(18,13,31,1)"); gr.addColorStop(0.65, "rgba(11,9,18,0.96)"); gr.addColorStop(1, "rgba(11,9,18,0)"); }
      ctx.fillStyle = gr;
      ctx.fill();
      const sg = ctx.createLinearGradient(0, top, 0, hemY + 12);
      sg.addColorStop(0, layer ? "rgba(110,52,214,0.35)" : "rgba(150,80,255,0.85)");
      sg.addColorStop(1, "rgba(150,80,255,0)");
      ctx.strokeStyle = sg;
      ctx.lineWidth = layer ? 1 : 1.6;
      ctx.lineJoin = "round";
      ctx.stroke();
    };
    cloak(1);
    cloak(0);

    // ── 2) shadow tentacles from behind the shoulders (they come and go) ──
    const lens = [36, 42, 30], bases = [-1.2, -0.15, 0.85];
    for (let i = 0; i < 3; i++) {
      const em = stunned ? 0.45 : clamp(0.22 + Math.sin(now * 0.75 + i * 2.4) * 1.1 + power * 0.9, 0.14, 1);
      const n = 9, seg = (lens[i] * em) / (n - 1);
      let p = T(torL * (0.95 - 0.19 * i), -sw * 0.14), ang = bases[i];
      const pts = [p.slice()];
      for (let j = 1; j < n; j++) {
        ang += Math.sin(now * 2.4 + i * 1.9 + j * 0.65) * 0.22 * (0.4 + j / n);
        p = [p[0] + back * Math.cos(ang) * seg - (k.vx * 0.1 * j) / n, p[1] + Math.sin(ang) * seg];
        pts.push(p);
      }
      taper(k, pts, 5.0 * (0.55 + 0.45 * em), 0.6, C.obs, C.rim, 1.3); // 'obs' for shadow tendrils
      glowStroke(k, pts.slice(1, n - 1), C.elec, 0.8, 5, 0.45);
      if (!F) { ctx.save(); ctx.shadowColor = C.elec; ctx.shadowBlur = 8; ctx.fillStyle = C.hot; ctx.beginPath(); ctx.arc(pts[n - 1][0], pts[n - 1][1], 1.3, 0, TAU); ctx.fill(); ctx.restore(); }
    }

    // ── shared bits: bracer + claw hand ──
    const bracer = (arm, front) => {
      const [sh, el, wr] = arm;
      const vx = wr[0] - el[0], vy = wr[1] - el[1], len = Math.hypot(vx, vy) || 1;
      const tx = vx / len, ty = vy / len, qx = -ty, qy = tx;
      const mx = (sh[0] + wr[0]) / 2, my = (sh[1] + wr[1]) / 2;
      let ox = el[0] - mx, oy = el[1] - my; const ol = Math.hypot(ox, oy) || 1; ox /= ol; oy /= ol;
      const p0 = [el[0] + tx * len * 0.08, el[1] + ty * len * 0.08], p1 = [el[0] + tx * len * 0.9, el[1] + ty * len * 0.9];
      const w0 = aw * 1.2, w1 = aw * 0.85;
      const pts = [
        [p0[0] + qx * w0, p0[1] + qy * w0], [p1[0] + qx * w1, p1[1] + qy * w1],
        [p1[0] + tx * aw * 0.9, p1[1] + ty * aw * 0.9],
        [p1[0] - qx * w1, p1[1] - qy * w1], [p0[0] - qx * w0, p0[1] - qy * w0],
        [el[0] + ox * aw * 2.9 - tx * aw * 0.7, el[1] + oy * aw * 2.9 - ty * aw * 0.7],
      ];
      fillPoly(k, pts, front ? C.obs2 : C.obs, C.rim, 1.4);
      glowStroke(k, crack([p0[0] + tx * 2, p0[1] + ty * 2], [p1[0] - tx * 2, p1[1] - ty * 2], front ? 3 : 5, aw * 0.35), C.elec, 0.9, 5, 0.9);
    };
    const claws = (arm, open, front) => {
      const el = arm[1], wr = arm[2];
      const base = Math.atan2(wr[1] - el[1], wr[0] - el[0]);
      const palm = [wr[0] + Math.cos(base) * aw * 0.6, wr[1] + Math.sin(base) * aw * 0.6];
      ctx.beginPath(); ctx.ellipse(palm[0], palm[1], aw * 1.0, aw * 0.8, base, 0, TAU);
      ctx.fillStyle = k.col(C.obs); ctx.fill(); edge(k, C.rim, 1.3);
      const spread = 0.2 + 0.28 * open;
      for (let j = 0; j < 4; j++) {
        const o = j - 1.5;
        const a0 = base + o * spread;
        const len = aw * (3.0 + (j === 1 || j === 2 ? 1.0 : 0) + open * 0.7);
        const curl = 0.38 * d + o * 0.05;
        const p1 = [palm[0] + Math.cos(a0) * len * 0.55, palm[1] + Math.sin(a0) * len * 0.55];
        const p2 = [p1[0] + Math.cos(a0 + curl) * len * 0.55, p1[1] + Math.sin(a0 + curl) * len * 0.55];
        const p3 = [p2[0] + Math.cos(a0 + curl * 1.8) * len * 0.3, p2[1] + Math.sin(a0 + curl * 1.8) * len * 0.3];
        taper(k, [palm, p1, p2, p3], aw * 0.62, 0.35, front ? C.obs2 : C.obs, C.rim, 1);
      }
      return { palm, dir: base };
    };

    // ── 3) back arm + back shoulder shard ──
    taper(k, [armBw[0], armBw[1]], aw * 1.05, aw * 0.85, C.obs, C.rim, 1.3);
    taper(k, [armBw[1], armBw[2]], aw * 0.85, aw * 0.6, C.obs, C.rim, 1.3);
    bracer(armBw, false);
    claws(armBw, windU * 0.6, false);
    fillPoly(k, [J(armBw[0], -1.2, 1.6), J(armBw[0], -1.9, -2.2), J(armBw[0], 1.9, -3.4), J(armBw[0], 5.9, -5.3), J(armBw[0], 2.5, 0.3)], C.obs, C.rim, 1.4);

    // ── 4) legs: lean obsidian limbs, softened knee guards, taloned feet ──
    const leg = (pts, isBack) => {
      const [h, kn, ft] = pts;
      taper(k, [h, kn], lw * 1.55, lw * 1.1, isBack ? C.obs : C.obs2, C.rim, 1.3);
      taper(k, [kn, ft], lw * 1.1, lw * 0.62, isBack ? C.obs : C.obs2, C.rim, 1.3);
      // Softened knee guard
      fillPoly(k, [
        [kn[0] - d * lw * 0.2, kn[1] - lw * 0.9],
        [kn[0] + d * lw * 1.5, kn[1] - lw * 0.2], // Softened upper point
        [kn[0] + d * lw * 1.2, kn[1] + lw * 0.5], // Softened lower point
        [kn[0] - d * lw * 0.1, kn[1] + lw * 0.9]
      ], isBack ? C.obs : C.obs2, C.rim, 1.2);
      glowStroke(k, [[kn[0], kn[1] + lw * 0.8], [lerp(kn[0], ft[0], 0.6), lerp(kn[1], ft[1], 0.6)]], C.elec, 0.8, 4, 0.55);
      // Taloned feet
      fillPoly(k, [[ft[0] - d * lw * 0.55, ft[1] - lw * 0.7], [ft[0] + d * lw * 0.55, ft[1] - lw * 0.5], [ft[0] + d * lw * 3.0, ft[1] + lw * 0.05], [ft[0] + d * lw * 0.3, ft[1] + lw * 0.35], [ft[0] - d * lw * 1.4, ft[1] + lw * 0.15]], C.obs, C.rim, 1.2);
    };
    leg(k.MP(k.legB), true);
    leg(k.MP(k.legF), false);

    // tattered hip armor: three asymmetrical shards
    fillPoly(k, [T(3, hw * 0.4), T(3, -hw * 0.1), T(-legL * 0.46, hw * 0.62)], C.obs2, C.rim, 1.3);
    fillPoly(k, [T(3, -hw * 0.05), T(3, -hw * 0.55), T(-legL * 0.3 + Math.sin(now * 2) * 1.5, -hw * 0.7)], C.obs, C.rim, 1.3);
    fillPoly(k, [T(3, hw * 0.25), T(3, -hw * 0.3), T(-legL * 0.2, hw * 0.0)], C.obs3, C.rim, 1.2);

    // ── 5) pelvis, floating gap, ribcage ──
    fillPoly(k, [T(torL * 0.2, -hw * 0.32), T(torL * 0.2, hw * 0.32), T(-1, hw * 0.5), T(-1, -hw * 0.5)], C.obs2, C.rim, 1.4);
    // spine bridging the gap + floating fragments (the void ate the abdomen)
    taper(k, [T(torL * 0.2, -sw * 0.02), T(torL * 0.3, -sw * 0.04), T(torL * 0.4, -sw * 0.02)], 2.4, 2.4, C.obs3, C.rim, 1);
    for (let i = 0; i < 3; i++) {
      const a = torL * (0.24 + i * 0.07), b = Math.sin(now * 1.6 + i * 2.1) * sw * 0.2 + (i - 1) * sw * 0.1;
      const c = T(a + Math.sin(now * 1.2 + i) * 1.2, b), r = 1.5 + (i % 2);
      fillPoly(k, [[c[0], c[1] - r * 1.4], [c[0] + r, c[1]], [c[0], c[1] + r * 1.4], [c[0] - r, c[1]]], C.obs2, C.elec, 1);
    }
    // ribcage with visible ribs (more humanoid, less segmented)
    const rib = [
      T(torL * 1.0, -sw * 0.22),
      T(torL * 1.0, sw * 0.25),
      T(torL * 0.76, sw * 0.22 + 2), // Slightly extend to soften curve
      T(torL * 0.5, sw * 0.12 + 1),  // Slightly extend and soften
      T(torL * 0.4, sw * 0.04),
      T(torL * 0.42, -sw * 0.1),
      T(torL * 0.6, -sw * 0.14 - 1), // Soften curve
      T(torL * 0.8, -sw * 0.2 - 2)   // Soften curve
    ];
    fillPoly(k, rib, C.obs2, C.rim, 1.5);
    if (!F) {
      ctx.lineCap = "round";
      for (let r = 0; r < 3; r++) {
        const a = torL * (0.78 - r * 0.11);
        const p0 = T(a, -sw * 0.14), p1 = T(a - 1.8, sw * 0.04), p2 = T(a + 0.5, sw * 0.18);
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.quadraticCurveTo(p1[0], p1[1], p2[0], p2[1]);
        ctx.strokeStyle = C.obs3; ctx.lineWidth = 1.3; ctx.stroke();
      }
    }
    // spine spikes
    for (let i = 0; i < 3; i++) {
      const a = torL * (0.9 - i * 0.18), b = -sw * 0.2;
      fillPoly(k, [T(a + 3, b), T(a - 2, b), T(a - 0.5 + i * 0.6, b - 5.5 + i * 0.8)], C.obs, C.rim, 1.1);
    }

    // ── 6) chest plate (asymmetrical, with glowing cracks) + the singularity ──
    const plate = [T(torL * 1.03, sw * 0.34), T(torL * 1.02, -sw * 0.08), T(torL * 0.8, -sw * 0.18), T(torL * 0.5, -sw * 0.02), T(torL * 0.3, sw * 0.16), T(torL * 0.56, sw * 0.36), T(torL * 0.86, sw * 0.32)];
    fillPoly(k, plate, C.obs3, C.rim, 1.6);
    const core = T(torL * 0.68, sw * 0.1);
    const crackAt = [[T(torL * 1.0, sw * 0.28), 1], [T(torL * 0.9, -sw * 0.1), 2], [T(torL * 0.4, sw * 0.14), 3], [T(torL * 0.5, sw * 0.28), 4]];
    for (const [pt, s] of crackAt) glowStroke(k, crack(core, pt, s, 1.4), C.elec, 1, 5 + 4 * power, 0.9);
    // socket + singularity
    ctx.beginPath(); ctx.arc(core[0], core[1], 4.2, 0, TAU);
    ctx.fillStyle = k.col(C.void); ctx.fill(); edge(k, C.elec, 1.2);
    if (!F) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const gr = 8 + 4 * pulse + 6 * power;
      const cg = ctx.createRadialGradient(core[0], core[1], 0, core[0], core[1], gr);
      cg.addColorStop(0, "rgba(255,255,255,0.95)"); cg.addColorStop(0.3, "rgba(190,100,255,0.7)"); cg.addColorStop(1, "rgba(130,50,255,0)");
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(core[0], core[1], gr, 0, TAU); ctx.fill();
      ctx.strokeStyle = C.hot; ctx.lineWidth = 1;
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.ellipse(core[0], core[1], 6.4, 1.8, now * 2.2, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(core[0], core[1], 5.2, 1.4, -now * 1.6 + 1.2, 0, TAU); ctx.stroke();
      ctx.restore();
    } else { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(core[0], core[1], 3, 0, TAU); ctx.fill(); }
    A.core = [A.ox + core[0], A.oy + core[1]];

    // ── 7) neck, head (smooth, elongated humanoid with black void face), floating fragments ──
    taper(k, [T(torL * 1.0, 0), [hcw[0], hcw[1] + hr * 0.5]], 4.2, 3.2, C.obs, C.rim, 1.2);

    // ── 8) front shoulder (big spiked pauldron) + front arm + the hand that casts ──
    taper(k, [armFw[0], armFw[1]], aw * 1.1, aw * 0.9, C.obs2, C.rim, 1.3);
    taper(k, [armFw[1], armFw[2]], aw * 0.9, aw * 0.62, C.obs2, C.rim, 1.3);
    bracer(armFw, true);
    const sP = armFw[0];
    fillPoly(k, [J(sP, -2.5, 2.8), J(sP, -3.1, -1.9), J(sP, -0.3, -4.3), J(sP, 3.1, -5.3), J(sP, 8.4, -7.4), J(sP, 5.0, -2.5), J(sP, 6.8, 1.6), J(sP, 2.5, 3.4)], C.obs3, C.rim, 1.6);
    fillPoly(k, [J(sP, 1.6, -0.6), J(sP, 3.1, -3.4), J(sP, 9.3, -5.9), J(sP, 5.9, -0.9)], C.obs2, C.rim, 1.2);
    glowStroke(k, crack(J(sP, -1.2, 1.2), J(sP, 6.8, -5.6), 7, 1.2), C.elec, 0.9, 4, 0.85);
    const hand = claws(armFw, power, true);

    // singularity gathering between the claws (grows while casting)
    const orbR = 2.2 + 1.2 * pulse * 0.4 + 5.5 * windU + (strike ? 3 : 0);
    const orb = [hand.palm[0] + Math.cos(hand.dir) * (aw * 3.4 + orbR * 0.4), hand.palm[1] + Math.sin(hand.dir) * (aw * 3.4 + orbR * 0.4) - 1];
    A.orb = [A.ox + orb[0], A.oy + orb[1]]; // used by mage_fx.js
    ctx.beginPath(); ctx.arc(orb[0], orb[1], orbR, 0, TAU);
    ctx.fillStyle = k.col(C.void); ctx.fill();
    if (!F) {
      ctx.save();
      ctx.shadowColor = C.elec; ctx.shadowBlur = 8 + 10 * power;
      ctx.strokeStyle = C.hot; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(orb[0], orb[1], orbR, 0, TAU); ctx.stroke();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = C.elec; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(orb[0], orb[1], orbR * 1.9, orbR * 0.55, now * 3, 0, TAU); ctx.stroke();
      ctx.restore();
    } else { ctx.beginPath(); ctx.arc(orb[0], orb[1], orbR, 0, TAU); ctx.fillStyle = "#fff"; ctx.fill(); }

    // ── 9) the head is drawn LAST so the front pauldron never hides the face ──
    // ── ASTRAL FACE: midnight-violet skin dusted with stars, nebula cheeks, dark cosmic markings,
    //    one round glowing pupil-less eye with a light trail, NO nose, NO mouth. Features are placed in head units (hr) with
    //    HP(u, v): u = forward (the way he faces), v = down. ──
    const hx = hcw[0], hy = hcw[1], rx = hr * 0.85, ry = hr * 1.25;
    const HP = (u, v) => [hx + d * u * hr, hy + v * hr];
    // side-profile head: sloped brow, flat face plane, tapered chin, smooth swept-back skull (no nose, no mouth)
    const shellPath = () => {
      const P = HP; let a, b, c;
      ctx.beginPath();
      a = P(0.15, -1.25); ctx.moveTo(a[0], a[1]);
      a = P(0.55, -1.2); b = P(0.88, -0.85); c = P(0.9, -0.4); ctx.bezierCurveTo(a[0], a[1], b[0], b[1], c[0], c[1]);
      a = P(0.92, -0.05); b = P(0.86, 0.25); c = P(0.74, 0.5); ctx.bezierCurveTo(a[0], a[1], b[0], b[1], c[0], c[1]);
      a = P(0.62, 0.8); b = P(0.4, 1.1); c = P(0.08, 1.2); ctx.bezierCurveTo(a[0], a[1], b[0], b[1], c[0], c[1]);
      a = P(-0.3, 1.25); b = P(-0.7, 0.9); c = P(-0.82, 0.4); ctx.bezierCurveTo(a[0], a[1], b[0], b[1], c[0], c[1]);
      a = P(-0.95, -0.2); b = P(-0.85, -0.9); c = P(-0.35, -1.2); ctx.bezierCurveTo(a[0], a[1], b[0], b[1], c[0], c[1]);
      a = P(-0.15, -1.25); b = P(0.0, -1.26); c = P(0.15, -1.25); ctx.bezierCurveTo(a[0], a[1], b[0], b[1], c[0], c[1]);
      ctx.closePath();
    };
    const lw1 = (m) => Math.max(0.5, hr * m); // line width that never vanishes at game scale
    const DARK = "#05020c", LAV = "#d9ccff";

    // head shell: deep midnight violet, lighter on the brow, darker toward the jaw
    shellPath();
    if (F) ctx.fillStyle = "#ffffff";
    else {
      const fa = HP(1.0, -0.5), fb = HP(-0.9, 0.9); // light comes from the front-top, shade falls to the back-bottom
      const sg = ctx.createLinearGradient(fa[0], fa[1], fb[0], fb[1]);
      sg.addColorStop(0, "#3a2680"); sg.addColorStop(0.45, "#1f1248"); sg.addColorStop(1, "#0a0619");
      ctx.fillStyle = sg;
    }
    ctx.fill();
    edge(k, "#5a37b8", 1.6);

    if (!F) {
      ctx.save();
      shellPath(); ctx.clip(); // everything below stays inside the head

      // nebula clouds on the cheeks (indigo + magenta + a cold cyan edge), faint and slow
      const neb = (u, v, r, c0, c1, al) => {
        const c = HP(u, v), g2 = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], r * hr);
        g2.addColorStop(0, c0); g2.addColorStop(1, c1);
        ctx.globalAlpha = al; ctx.fillStyle = g2;
        ctx.fillRect(c[0] - r * hr, c[1] - r * hr, r * hr * 2, r * hr * 2);
      };
      const drift = Math.sin(now * 0.6) * 0.05;
      neb(0.5 + drift, 0.5, 0.62, "rgba(160,90,255,0.9)", "rgba(80,30,190,0)", 0.75);
      neb(0.62, 0.42, 0.34, "rgba(255,120,220,0.9)", "rgba(200,60,200,0)", 0.45);
      neb(0.02 - drift, 0.5, 0.5, "rgba(110,70,240,0.9)", "rgba(60,30,170,0)", 0.6);
      neb(0.3, 0.75, 0.4, "rgba(90,200,255,0.8)", "rgba(40,100,220,0)", 0.18);
      // thin nebula wisps curling across the cheek
      ctx.globalAlpha = 0.32; ctx.strokeStyle = "#cdb4ff"; ctx.lineWidth = lw1(0.045); ctx.lineCap = "round";
      for (let i = 0; i < 3; i++) {
        const s0 = HP(0.18 + i * 0.16, 0.34 + i * 0.1), s1 = HP(0.46 + i * 0.12, 0.2 + i * 0.12), s2 = HP(0.86, 0.46 + i * 0.1);
        ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.quadraticCurveTo(s1[0], s1[1], s2[0], s2[1]); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // dark cosmic markings (drawn under the eyes so the glow stays on top)
      ctx.fillStyle = DARK; ctx.strokeStyle = DARK; ctx.lineCap = "round"; ctx.lineJoin = "round";
      // forehead: tall diamond sigil with a spine rising into the hairline and two arcs sweeping to the temples
      const fc = HP(0.3, -0.7);
      ctx.beginPath();
      ctx.moveTo(fc[0], fc[1] - hr * 0.32); ctx.lineTo(fc[0] + hr * 0.1, fc[1]); ctx.lineTo(fc[0], fc[1] + hr * 0.32); ctx.lineTo(fc[0] - hr * 0.1, fc[1]);
      ctx.closePath(); ctx.fill();
      ctx.lineWidth = lw1(0.09);
      let q0 = HP(0.3, -1.0), q1 = HP(0.3, -1.3);
      ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke();
      const arc = (a, c, b, w) => { ctx.lineWidth = lw1(w); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]); ctx.stroke(); };
      arc(HP(0.3, -0.46), HP(0.78, -0.92), HP(1.12, -0.46), 0.08);
      arc(HP(0.3, -0.46), HP(-0.18, -0.92), HP(-0.5, -0.5), 0.08);
      // eye surrounds: heavy stern brow bars, winged outer corners, one falling streak under each eye
      const surround = (u, v, inn, wing) => {
        let a = HP(u - inn * 0.36, v - 0.34), b = HP(u + inn * 0.26, v - 0.2);
        ctx.lineWidth = lw1(0.095); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); // brow bar, inner end low = stern
        a = HP(u - inn * 0.22, v - 0.06); b = HP(u - inn * wing, v - 0.2);
        ctx.lineWidth = lw1(0.1); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); // outer wing
        a = HP(u - inn * 0.04, v + 0.14); b = HP(u - inn * 0.16, v + 0.56);
        ctx.lineWidth = lw1(0.07); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); // falling streak
      };
      surround(0.5, -0.18, -1, 0.9);
      // faint lavender glints along the markings
      ctx.globalAlpha = 0.55 + 0.15 * Math.sin(now * 2); ctx.strokeStyle = "#a98bff"; ctx.lineWidth = lw1(0.03);
      ctx.beginPath(); ctx.moveTo(fc[0], fc[1] - hr * 0.3); ctx.lineTo(fc[0] + hr * 0.08, fc[1]); ctx.lineTo(fc[0], fc[1] + hr * 0.3); ctx.lineTo(fc[0] - hr * 0.08, fc[1]); ctx.closePath(); ctx.stroke();
      // tiny constellation on the temple: 4 stars joined by hair-thin lines
      const cs = [HP(0.86, -0.78), HP(0.98, -0.52), HP(0.84, -0.3), HP(0.72, -0.62)];
      ctx.globalAlpha = 0.5; ctx.strokeStyle = "#cdb8ff"; ctx.lineWidth = lw1(0.025);
      ctx.beginPath(); ctx.moveTo(cs[0][0], cs[0][1]); for (let i = 1; i < cs.length; i++) ctx.lineTo(cs[i][0], cs[i][1]); ctx.stroke();
      ctx.globalAlpha = 0.95; ctx.fillStyle = "#ffffff";
      for (const c of cs) { ctx.beginPath(); ctx.arc(c[0], c[1], Math.max(0.45, hr * 0.05), 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;

      // star specks scattered over the skin (twinkling)
      for (let i = 0; i < VOID_STARS.length; i++) {
        const st = VOID_STARS[i];
        const sx = hx + d * st[0] * rx * 0.95, sy = hy + st[1] * ry * 0.92;
        const tw = 0.45 + 0.55 * Math.max(0, Math.sin(now * 2.2 + st[3]));
        ctx.globalAlpha = tw; ctx.fillStyle = i % 4 === 0 ? "#ffffff" : "#d7c8ff";
        ctx.beginPath(); ctx.arc(sx, sy, Math.max(0.4, hr * 0.045 * st[2] * 1.6), 0, TAU); ctx.fill();
        if (st[2] > 0.95) { // a couple of brighter ones get a tiny cross glint
          ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 0.35; const g = hr * 0.14 * tw;
          ctx.beginPath(); ctx.moveTo(sx - g, sy); ctx.lineTo(sx + g, sy); ctx.moveTo(sx, sy - g); ctx.lineTo(sx, sy + g); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Eyes: round, pupil-less orbs of pure light inside a thin halo ring (a godlike entity). No lids, never blinks.
    const eyeLight = stunned ? "#ffffff" : LAV;
    const eye = (u, v, r, squash) => {
      const c = HP(u, v), R = Math.max(1.2, r * hr), rxE = R * squash;
      const pulseE = 0.5 + 0.5 * Math.sin(now * 2.4 + u * 3);
      ctx.save();
      if (!F) {
        // soft divine glow behind the orb
        ctx.globalCompositeOperation = "lighter";
        const gl = ctx.createRadialGradient(c[0], c[1], R * 0.6, c[0], c[1], R * 2.6);
        gl.addColorStop(0, "rgba(200,175,255," + (0.45 + 0.2 * pulseE) + ")"); gl.addColorStop(1, "rgba(120,80,255,0)");
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(c[0], c[1], R * 2.6, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = "source-over";
        // the orb itself
        ctx.shadowColor = stunned ? "#ffffff" : "#c9b2ff"; ctx.shadowBlur = 10 + 6 * power;
        const eg = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], R);
        eg.addColorStop(0, "#ffffff"); eg.addColorStop(0.6, eyeLight); eg.addColorStop(1, "#a78bf0");
        ctx.fillStyle = eg;
      } else ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.ellipse(c[0], c[1], rxE, R, 0, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      if (!F) { // thin halo ring that breathes, plus a faint second ring
        ctx.strokeStyle = "#e6dcff"; ctx.lineWidth = Math.max(0.5, R * 0.14);
        ctx.globalAlpha = 0.55 + 0.35 * pulseE;
        ctx.beginPath(); ctx.ellipse(c[0], c[1], rxE * 1.55, R * 1.55, 0, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 0.18 + 0.15 * pulseE; ctx.lineWidth = Math.max(0.4, R * 0.08);
        ctx.beginPath(); ctx.ellipse(c[0], c[1], rxE * (2.0 + 0.15 * pulseE), R * (2.0 + 0.15 * pulseE), 0, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    };
    eye(0.52, -0.16, 0.28, 0.9); // the one eye (side view)

    // Eye trail: light streams backward from the eye like a comet tail, longer when he moves fast
    if (!F) {
      const c = HP(0.52, -0.16), R = Math.max(1.2, 0.28 * hr);
      const speed = Math.min(1, Math.abs(k.vx || 0) / 6);
      const L = hr * (3.4 + 1.8 * speed + 0.8 * power);
      const ribbon = (yOff, wMul, phase, alpha, col) => {
        const N = 14, top = [], bot = [];
        for (let i = 0; i <= N; i++) {
          const t = i / N;
          const x = c[0] + back * L * t;
          const y = c[1] + yOff * R + Math.sin(now * 5 + t * 6 + phase) * R * 0.45 * t - t * R * 0.5;
          const w = R * wMul * (1 - t) * (1 - t * 0.3);
          top.push([x, y - w]); bot.push([x, y + w]);
        }
        const g = ctx.createLinearGradient(c[0], c[1], c[0] + back * L, c[1]);
        g.addColorStop(0, "rgba(255,255,255," + alpha + ")"); g.addColorStop(0.35, col); g.addColorStop(1, "rgba(120,80,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(top[0][0], top[0][1]);
        for (let i = 1; i <= N; i++) ctx.lineTo(top[i][0], top[i][1]);
        for (let i = N; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
        ctx.closePath(); ctx.fill();
      };
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ribbon(0, 1.15, 0, 0.55, "rgba(170,130,255,0.45)");   // wide violet glow
      ribbon(0, 0.55, 1.3, 0.9, "rgba(235,225,255,0.55)");   // bright core
      ribbon(-0.9, 0.22, 2.1, 0.6, "rgba(200,170,255,0.4)"); // thin streamer above
      ribbon(0.9, 0.22, 3.4, 0.6, "rgba(200,170,255,0.4)");  // thin streamer below
      ctx.restore();
    }

    // Floating fragments above and behind the head (replaces crown shards)
    if (!F) {
      const fragScale = hr * 0.5;
      const fx = hcw[0], fy = hcw[1] - hr * 1.6; // Base position for fragments
      const offset = [
        [back * 0.8, -0.6], [back * 2.0, -0.2], [back * 1.0, 0.4],
        [back * 0.2, -1.2], [back * 1.4, -1.0]
      ];
      const fragmentShapes = [
        [[0, -1], [1, 0], [0.5, 1], [-0.5, 0.5], [-0.8, -0.2]], // Jagged
        [[0, -0.8], [0.8, -0.4], [0.4, 0.8], [-0.4, 0.4]],       // Angular
        [[-0.6, -0.6], [0.6, -0.2], [0.2, 0.6], [-0.4, 0.2]],    // Small shard
      ];

      for (let i = 0; i < offset.length; i++) {
        const u = i / offset.length;
        const sh = fragmentShapes[i % fragmentShapes.length];
        const pts = sh.map(p => [
          fx + offset[i][0] * fragScale + p[0] * fragScale * 0.4 + Math.sin(now * 1.8 + i * 1.1) * 1.5,
          fy + offset[i][1] * fragScale + p[1] * fragScale * 0.4 + Math.cos(now * 1.5 + i * 0.9) * 1
        ]);
        fillPoly(k, pts, C.obs, C.rim, 1.0); // Obsidian fragments
        if (Math.random() < 0.3) { // Occasional glowing crack
          glowStroke(k, crack(pts[0], pts[Math.floor(pts.length / 2)], i, 0.5), C.elec, 0.7, 3, 0.6);
        }
      }
    }

    // Wisps of the head dissolving upward
    if (!F) {
      ctx.save(); ctx.lineCap = "round";
      for (let w = 0; w < 2; w++) {
        let px = hcw[0] + back * hr * (0.1 + w * 0.5), py = hcw[1] - hr * 1.05;
        for (let j = 0; j < 7; j++) {
          const nxp = px + Math.sin(now * 3 + j * 0.9 + w * 2) * 1.6 + back * 0.7 - k.vx * 0.12, nyp = py - 2.1;
          ctx.globalAlpha = (1 - j / 7) * 0.6; ctx.strokeStyle = C.elec; ctx.lineWidth = 1.5 - j * 0.15;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nxp, nyp); ctx.stroke();
          px = nxp; py = nyp;
        }
      }
      ctx.restore();
    }
  }

  MW.VoidMage = { draw, C };
})(globalThis);