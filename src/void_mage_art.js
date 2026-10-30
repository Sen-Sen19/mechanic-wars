// Mechanic Wars - Void Mage art (render only, never touches the sim).
// A tall, faceless figure half-consumed by a dimensional void: obsidian body, asymmetrical armor
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
  const bez = (p0, p1, p2, n) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
    }
    return out;
  };

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
      taper(k, pts, 5.0 * (0.55 + 0.45 * em), 0.6, C.obs, C.rim, 1.3);
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

    // ── 4) legs: lean obsidian limbs, spiked knees, taloned feet ──
    const leg = (pts, isBack) => {
      const [h, kn, ft] = pts;
      taper(k, [h, kn], lw * 1.55, lw * 1.1, isBack ? C.obs : C.obs2, C.rim, 1.3);
      taper(k, [kn, ft], lw * 1.1, lw * 0.62, isBack ? C.obs : C.obs2, C.rim, 1.3);
      fillPoly(k, [[kn[0] - d * lw * 0.2, kn[1] - lw * 0.9], [kn[0] + d * lw * 2.3, kn[1] - lw * 0.05], [kn[0] + d * lw * 0.1, kn[1] + lw * 0.9]], isBack ? C.obs : C.obs2, C.rim, 1.2);
      glowStroke(k, [[kn[0], kn[1] + lw * 0.8], [lerp(kn[0], ft[0], 0.6), lerp(kn[1], ft[1], 0.6)]], C.elec, 0.8, 4, 0.55);
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
    // ribcage with visible ribs
    const rib = [T(torL * 1.0, -sw * 0.22), T(torL * 1.0, sw * 0.25), T(torL * 0.76, sw * 0.22), T(torL * 0.5, sw * 0.12), T(torL * 0.4, sw * 0.04), T(torL * 0.42, -sw * 0.1), T(torL * 0.6, -sw * 0.14), T(torL * 0.8, -sw * 0.2)];
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

    // ── 7) neck, head (faceless hollow, two violet eyes), swept crown shards ──
    taper(k, [T(torL * 1.0, 0), [hcw[0], hcw[1] + hr * 0.5]], 4.2, 3.2, C.obs, C.rim, 1.2);
    // crown shards swept back (one long, one broken)
    taper(k, bez([hcw[0] + back * hr * 0.2, hcw[1] - hr * 0.85], [hcw[0] + back * hr * 1.6, hcw[1] - hr * 2.2], [hcw[0] + back * hr * 3.0, hcw[1] - hr * 1.9], 7), hr * 0.62, 0.4, C.obs, C.rim, 1.2);
    taper(k, bez([hcw[0] + back * hr * 0.55, hcw[1] - hr * 0.55], [hcw[0] + back * hr * 1.7, hcw[1] - hr * 1.2], [hcw[0] + back * hr * 2.1, hcw[1] - hr * 0.5], 5), hr * 0.5, 0.4, C.obs2, C.rim, 1.1);
    // head shell
    ctx.beginPath(); ctx.ellipse(hcw[0], hcw[1], hr * 0.92, hr * 1.18, 0.08 * d, 0, TAU);
    ctx.fillStyle = k.col(C.obs2); ctx.fill(); edge(k, C.rim, 1.6);
    // hollow face
    ctx.save();
    ctx.beginPath(); ctx.ellipse(hcw[0], hcw[1], hr * 0.92, hr * 1.18, 0.08 * d, 0, TAU); ctx.clip();
    ctx.beginPath(); ctx.ellipse(hcw[0] + d * hr * 0.34, hcw[1] + hr * 0.02, hr * 0.78, hr * 0.98, 0.1 * d, 0, TAU);
    ctx.fillStyle = k.col(C.void); ctx.fill();
    ctx.restore();
    // eyes: two narrow slanted slits, a far one slightly smaller
    const eyeCol = stunned ? "#ffffff" : C.elec;
    const eye = (x, y, w, h) => {
      ctx.save();
      ctx.translate(x, y); ctx.rotate(-0.38 * d);
      if (!F) { ctx.shadowColor = C.elec; ctx.shadowBlur = 9 + 5 * power; }
      ctx.fillStyle = F ? "#fff" : eyeCol;
      ctx.beginPath(); ctx.ellipse(0, 0, w, h, 0, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.ellipse(0, 0, w * 0.62, h * 0.45, 0, 0, TAU); ctx.fill();
      ctx.restore();
    };
    eye(hcw[0] + d * hr * 0.58, hcw[1] - hr * 0.12, hr * 0.34, hr * 0.1);
    eye(hcw[0] + d * hr * 0.14, hcw[1] - hr * 0.1, hr * 0.24, hr * 0.085);
    // wisps of the head dissolving upward
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
  }

  MW.VoidMage = { draw, C };
})(globalThis);
