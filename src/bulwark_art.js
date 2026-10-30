// Mechanic Wars - Bulwark art (render only, never touches the sim).
// A colossal armored guardian, a walking fortress: layered black-steel plate, a huge asymmetrical
// shoulder plate on the shield side, a massive defensive gauntlet on the other arm, a closed great helm
// with a crenellated (castle wall) crown and a narrow glowing eye slit, and an enormous tower shield
// with a gold fortress-gate emblem. Ancient runes and energy channels in the armor glow softly,
// and glow brightly while super armor is on (bash wind-up/swing) or when a hit is absorbed.
// Called from character_art.js DETAIL() for id === "tank".
// k = the shared rig state from character_art.js, e = a few precomputed values (see DETAIL).
(function (g) {
  const MW = (g.MW = g.MW || {});
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // Palette: obsidian black, gunmetal gray, weathered silver, antique gold, steel-blue / pale-gold energy.
  const C = {
    line: "#050608", obs: "#0a0b0f", obs2: "#14161d", obs3: "#1e222b",
    gun: "#363e4e", gun2: "#4e586b", gun3: "#667186",
    silver: "#a9b2c2", silverDim: "#79849a",
    gold: "#a9873f", goldHi: "#dcbf6e",
    blue: "#7fb2dd", blueHi: "#cfe6fa", paleGold: "#f4dd9e",
    rim: "#454f63",
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
    k.ctx.lineWidth = (lw || 1.5) * 0.75;
    k.ctx.strokeStyle = k.isFlash ? "#fff" : edgeColor;
    k.ctx.stroke();
  }
  function fillPoly(k, pts, fill, edgeColor, lw) {
    pathOf(k.ctx, pts);
    k.ctx.fillStyle = k.col(fill);
    k.ctx.fill();
    edge(k, edgeColor || C.rim, lw);
  }
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
  // battle damage: a short light scratch
  function scratch(k, x, y, ang, len, alpha) {
    line(k, [[x, y], [x + Math.cos(ang) * len, y + Math.sin(ang) * len]], C.silver, 0.8, alpha === undefined ? 0.4 : alpha);
  }
  // battle damage: a dent (dark pit with a light lower rim)
  function dent(k, x, y, r) {
    if (k.isFlash) return;
    const { ctx } = k;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0.4, 0, TAU);
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.25, r, r * 0.6, 0.4, 0.2, Math.PI - 0.2);
    ctx.strokeStyle = "rgba(200,210,230,0.3)"; ctx.lineWidth = 0.8; ctx.stroke();
  }

  function draw(k, e) {
    const { ctx, d, now } = k;
    const F = k.isFlash;
    const { shW, hipW, hcw, armBw, armFw, windU, strike, pulse, stunned, armorOn, spark } = e;
    const torL = k.torL, sw = k.sw, hw = k.hw, aw = k.aw * 0.64, lw = k.lw * 0.68, hr = k.hr, legL = k.legL; // aw/lw scaled so the heavy parts sit right on the rig
    const H = k.H;
    // energy level: faint at rest, bright while super armor is on or a hit is absorbed
    const en = clamp(0.28 + 0.1 * pulse + (armorOn ? 0.55 : 0) + (spark ? 0.5 : 0) + (strike ? 0.2 : 0), 0, 1);
    const eCol = armorOn || spark ? C.paleGold : C.blue;
    const eRgb = armorOn || spark ? "244,221,158" : "127,178,221";

    // torso frame: T(a, b) = a along the spine (0 = hip, torL = shoulders), b toward the front
    let ux = shW[0] - hipW[0], uy = shW[1] - hipW[1];
    const tl = Math.hypot(ux, uy) || 1;
    ux /= tl; uy /= tl;
    let nx = -uy, ny = ux;
    if (nx * d < 0) { nx = -nx; ny = -ny; }
    const T = (a, b) => [hipW[0] + ux * a + nx * b, hipW[1] + uy * a + ny * b];
    const J = (o, a, b) => [o[0] + ux * a + nx * b, o[1] + uy * a + ny * b];

    // ── 1) back arm: thick sleeve, huge defensive gauntlet, small asymmetrical pauldron ──
    const arm = (pts, front) => {
      taper(k, [pts[0], pts[1]], aw * 1.55, aw * 1.4, C.obs2, C.rim, 1.4);
      taper(k, [pts[1], pts[2]], aw * 1.4, aw * 1.25, C.obs3, C.rim, 1.4);
      // reinforced vambrace: thick gunmetal tube with gold bands and a glowing channel
      const [sh, el, wr] = pts;
      const vx = wr[0] - el[0], vy = wr[1] - el[1], len = Math.hypot(vx, vy) || 1;
      const tx = vx / len, ty = vy / len, qx = -ty, qy = tx;
      const p0 = [el[0] + tx * len * 0.05, el[1] + ty * len * 0.05], p1 = [el[0] + tx * len * 0.95, el[1] + ty * len * 0.95];
      const w0 = aw * 0.98, w1 = aw * 0.86;
      fillPoly(k, [[p0[0] + qx * w0, p0[1] + qy * w0], [p1[0] + qx * w1, p1[1] + qy * w1], [p1[0] - qx * w1, p1[1] - qy * w1], [p0[0] - qx * w0, p0[1] - qy * w0]], front ? C.gun : C.gun2, C.silverDim, 1.5);
      for (const u of [0.12, 0.88]) {
        const c = [lerp(p0[0], p1[0], u), lerp(p0[1], p1[1], u)], w = lerp(w0, w1, u);
        line(k, [[c[0] + qx * w, c[1] + qy * w], [c[0] - qx * w, c[1] - qy * w]], C.goldHi, 1.6, 0.95);
      }
      glowStroke(k, [[lerp(p0[0], p1[0], 0.25), lerp(p0[1], p1[1], 0.25)], [lerp(p0[0], p1[0], 0.75), lerp(p0[1], p1[1], 0.75)]], eCol, 1, 4, 0.3 + 0.6 * en);
      // elbow cop (round plate)
      ctx.beginPath(); ctx.arc(el[0], el[1], aw * 0.95, 0, TAU);
      ctx.fillStyle = k.col(C.gun2); ctx.fill(); edge(k, C.silverDim, 1.4);
      ctx.beginPath(); ctx.arc(el[0], el[1], aw * 0.5, 0, TAU); edge(k, C.goldHi, 1);
      return { tx, ty, qx, qy, wr, len };
    };
    // the defensive gauntlet: a big blocky fist with knuckle plates and a finger-guard
    const gauntlet = (a) => {
      const { tx, ty, qx, qy, wr } = a;
      const G = (t, q) => [wr[0] + (tx * t + qx * q) * aw, wr[1] + (ty * t + qy * q) * aw];
      fillPoly(k, [G(-0.4, -1.25), G(0.9, -1.4), G(2.0, -1.2), G(2.5, -0.5), G(2.5, 0.6), G(2.0, 1.3), G(0.9, 1.45), G(-0.4, 1.3)], C.gun2, C.silver, 1.6);
      for (const t of [0.7, 1.3, 1.9]) line(k, [G(t, -1.2), G(t, 1.2)], C.obs, 1, 0.8); // finger plates
      fillPoly(k, [G(-0.5, -1.4), G(0.3, -1.55), G(0.3, 1.55), G(-0.5, 1.4)], C.gun, C.goldHi, 1.3); // cuff
      glowStroke(k, [G(0.8, 0), G(2.1, 0)], eCol, 0.9, 4, 0.25 + 0.6 * en);
      scratch(k, G(1.2, -0.7)[0], G(1.2, -0.7)[1], 0.6, 3, 0.45);
    };
    // layered pauldron: three stacked lames over the shoulder (big = oversized, shield side)
    const pauldron = (sP, s, crest) => {
      for (let i = 2; i >= 0; i--) {
        const aTop = aw * (1.5 - 0.95 * i) * s, h = aw * 1.15 * s, w = aw * (2.2 - 0.22 * i) * s;
        fillPoly(k, [J(sP, aTop - h, -w), J(sP, aTop, -w * 1.0), J(sP, aTop + h * 0.5, -w * 0.5), J(sP, aTop + h * 0.7, w * 0.1), J(sP, aTop + h * 0.5, w * 0.7), J(sP, aTop, w * 1.0), J(sP, aTop - h, w * 0.95)], i === 0 ? C.gun2 : i === 1 ? C.gun : C.obs3, C.silverDim, 1.6);
        line(k, [J(sP, aTop + h * 0.1, -w * 0.9), J(sP, aTop + h * 0.55, -w * 0.4), J(sP, aTop + h * 0.72, w * 0.1), J(sP, aTop + h * 0.5, w * 0.65)], C.goldHi, 1.2, 0.9); // gold rim
      }
      if (crest) {
        // tall ridge fin on top of the big plate (breaks the silhouette, asymmetrical)
        fillPoly(k, [J(sP, aw * 2.0, -aw * 1.4), J(sP, aw * 2.9, -aw * 0.5), J(sP, aw * 2.4, aw * 0.8), J(sP, aw * 1.8, aw * 1.0)], C.gun3, C.silver, 1.5);
        glowStroke(k, [J(sP, aw * 2.1, -aw * 0.8), J(sP, aw * 2.5, -aw * 0.2), J(sP, aw * 2.1, aw * 0.5)], eCol, 1, 4, 0.3 + 0.6 * en);
        dent(k, ...J(sP, aw * 1.7, aw * 0.2), 2.2);
        scratch(k, ...J(sP, aw * 1.2, -aw * 1.0), 0.9, 5, 0.5);
      }
    };

    const aB = arm(armBw, false);
    gauntlet(aB);
    pauldron(armBw[0], 0.55, false);

    // ── 2) legs: thick thighs, big knee guards, greaves, heavy sabatons ──
    const leg = (pts, isBack) => {
      const [h, kn, ft] = pts;
      const fl = isBack ? C.obs : C.obs2;
      taper(k, [h, kn], lw * 1.75, lw * 1.3, fl, C.rim, 1.4);
      taper(k, [kn, ft], lw * 1.3, lw * 0.95, fl, C.rim, 1.4);
      // greave (shin armor) with a center ridge
      taper(k, [[lerp(kn[0], ft[0], 0.18), lerp(kn[1], ft[1], 0.18)], [lerp(kn[0], ft[0], 0.86), lerp(kn[1], ft[1], 0.86)]], lw * 1.5, lw * 1.15, isBack ? C.gun : C.gun2, C.silverDim, 1.4);
      line(k, [[lerp(kn[0], ft[0], 0.25) + d * lw * 0.25, lerp(kn[1], ft[1], 0.25)], [lerp(kn[0], ft[0], 0.8) + d * lw * 0.15, lerp(kn[1], ft[1], 0.8)]], C.silver, 0.9, 0.55);
      // big knee guard: layered dome with a gold rim and a small spike
      fillPoly(k, [[kn[0] - d * lw * 0.9, kn[1] - lw * 0.9], [kn[0] + d * lw * 0.2, kn[1] - lw * 1.45], [kn[0] + d * lw * 1.5, kn[1] - lw * 0.7], [kn[0] + d * lw * 1.8, kn[1] + lw * 0.2], [kn[0] + d * lw * 0.9, kn[1] + lw * 1.25], [kn[0] - d * lw * 0.7, kn[1] + lw * 1.0]], isBack ? C.gun : C.gun2, C.silver, 1.6);
      fillPoly(k, [[kn[0] + d * lw * 0.9, kn[1] - lw * 0.9], [kn[0] + d * lw * 2.5, kn[1] - lw * 0.05], [kn[0] + d * lw * 1.0, kn[1] + lw * 0.45]], C.gun3, C.silver, 1.2);
      line(k, [[kn[0] - d * lw * 0.6, kn[1] - lw * 0.7], [kn[0] + d * lw * 0.2, kn[1] - lw * 1.2], [kn[0] + d * lw * 1.4, kn[1] - lw * 0.5]], C.goldHi, 1.2, 0.9);
      // sabaton: wide heavy boot with layered toe plates
      fillPoly(k, [
        [ft[0] - d * lw * 1.0, ft[1] - lw * 2.5], [ft[0] + d * lw * 0.95, ft[1] - lw * 2.5], [ft[0] + d * lw * 1.05, ft[1] - lw * 0.95],
        [ft[0] + d * lw * 3.2, ft[1] - lw * 0.4], [ft[0] + d * lw * 3.3, ft[1] + lw * 0.3], [ft[0] - d * lw * 1.5, ft[1] + lw * 0.3], [ft[0] - d * lw * 1.5, ft[1] - lw * 0.85],
      ], C.gun, C.silverDim, 1.5);
      fillPoly(k, [[ft[0] + d * lw * 1.4, ft[1] - lw * 0.85], [ft[0] + d * lw * 3.2, ft[1] - lw * 0.4], [ft[0] + d * lw * 3.3, ft[1] + lw * 0.3], [ft[0] + d * lw * 1.3, ft[1] + lw * 0.1]], C.gun2, C.silver, 1.2);
      line(k, [[ft[0] - d * lw * 1.0, ft[1] - lw * 1.5], [ft[0] + d * lw * 1.0, ft[1] - lw * 1.5]], C.goldHi, 1.3, 0.9);
      line(k, [[ft[0] - d * lw * 1.5, ft[1] + lw * 0.05], [ft[0] + d * lw * 3.3, ft[1] + lw * 0.05]], C.obs, 1.6, 0.9); // sole
    };
    leg(k.MP(k.legB), true);
    leg(k.MP(k.legF), false);

    // ── 3) hips: pelvis block, tabard strip, hanging tassets, heavy belt ──
    const sway = Math.sin(now * 2.2) * 1.2 - clamp(k.vx, -6, 6) * 0.4;
    fillPoly(k, [T(torL * 0.3, -hw * 0.62), T(torL * 0.3, hw * 0.58), T(-legL * 0.2, hw * 0.52), T(-legL * 0.2, -hw * 0.56)], C.obs2, C.rim, 1.4);
    // dark cloth tabard with gold trim hanging from the belt
    fillPoly(k, [T(2, hw * 0.28), T(2, -hw * 0.26), [hipW[0] - d * hw * 0.2 + sway, hipW[1] + legL * 0.72], [hipW[0] + d * hw * 0.28 + sway, hipW[1] + legL * 0.74]], C.obs, C.rim, 1.3);
    line(k, [[hipW[0] - d * hw * 0.2 + sway, hipW[1] + legL * 0.72], [hipW[0] + d * hw * 0.28 + sway, hipW[1] + legL * 0.74]], C.gold, 1.6, 0.95);
    // tassets: three overlapping plates, front and back
    for (let i = 2; i >= 0; i--) {
      const a0 = -i * 3.4;
      fillPoly(k, [T(a0, hw * 0.66 - i * 1.5), T(a0, hw * 0.04), T(a0 - 5.5, hw * 0.08), T(a0 - 6, hw * 0.66 - i * 1.5 + 2)], i === 0 ? C.gun2 : C.gun, C.silverDim, 1.3);
      fillPoly(k, [T(a0, -hw * 0.02), T(a0, -hw * 0.66 + i * 1.5), T(a0 - 6, -hw * 0.66 + i * 1.5 - 2), T(a0 - 5.5, -hw * 0.04)], i === 0 ? C.gun : C.obs3, C.silverDim, 1.3);
    }
    // belt + gold fortress buckle
    fillPoly(k, [T(7, -hw * 0.6), T(7, hw * 0.6), T(0.5, hw * 0.6), T(0.5, -hw * 0.6)], C.obs3, C.silverDim, 1.4);
    fillPoly(k, [T(8, hw * 0.1), T(8, hw * 0.42), T(-0.5, hw * 0.42), T(-0.5, hw * 0.1)], C.gold, C.goldHi, 1.2);
    line(k, [T(6, hw * 0.18), T(6, hw * 0.34)], C.obs, 1, 0.8);

    // ── 4) torso: back plate, layered chest lames, breastplate with engraved gold lines ──
    fillPoly(k, [T(torL * 1.04, -sw * 0.46), T(torL * 1.04, sw * 0.44), T(torL * 0.55, sw * 0.5), T(7, hw * 0.52), T(7, -hw * 0.56), T(torL * 0.55, -sw * 0.52)], C.obs2, C.rim, 1.6);
    // lames from the waist up (lowest first so higher ones overlap)
    const lame = (a0, a1, wf, fill) => {
      fillPoly(k, [T(a0, -wf * 0.98), T(a1, -wf), T(a1, wf), T(a0, wf * 0.98), T(a0 - 2.6, wf * 0.4), T(a0 - 2.6, -wf * 0.4)], fill, C.silverDim, 1.5);
      line(k, [T(a0 - 0.2, -wf * 0.75), T(a0 - 0.2, wf * 0.75)], C.goldHi, 1, 0.8);
    };
    lame(7, torL * 0.3, hw * 0.5, C.gun);
    lame(torL * 0.28, torL * 0.55, sw * 0.43, C.gun);
    lame(torL * 0.5, torL * 0.78, sw * 0.46, C.gun2);
    // big breastplate on top with a center ridge and engraved gold chevrons
    fillPoly(k, [T(torL * 0.74, -sw * 0.45), T(torL * 1.03, -sw * 0.42), T(torL * 1.06, sw * 0.4), T(torL * 0.76, sw * 0.49), T(torL * 0.68, sw * 0.12), T(torL * 0.68, -sw * 0.14)], C.gun2, C.silver, 1.7);
    line(k, [T(torL * 0.78, sw * 0.02), T(torL * 1.04, sw * 0.0)], C.silver, 1, 0.55);
    for (let i = 0; i < 3; i++) { // engraved chevrons
      const a = torL * (0.84 + i * 0.065);
      line(k, [T(a, -sw * 0.28), T(a - 2.4, sw * 0.0), T(a, sw * 0.28)], C.goldHi, 0.9, 0.7);
    }
    // glowing rune channel down the chest
    glowStroke(k, [T(torL * 1.0, sw * 0.18), T(torL * 0.86, sw * 0.26), T(torL * 0.7, sw * 0.3)], eCol, 1.1, 5, 0.25 + 0.6 * en);
    glowStroke(k, [T(torL * 0.97, -sw * 0.3), T(torL * 0.84, -sw * 0.34)], eCol, 1, 4, 0.2 + 0.5 * en);
    // battle damage on the chest and back
    dent(k, ...T(torL * 0.9, sw * 0.3), 2.4);
    dent(k, ...T(torL * 0.6, -sw * 0.22), 2);
    scratch(k, ...T(torL * 0.98, -sw * 0.05), 0.5, 7, 0.5);
    scratch(k, ...T(torL * 0.7, sw * 0.3), 1.9, 6, 0.4);
    scratch(k, ...T(torL * 0.45, sw * 0.2), 0.3, 6, 0.35);

    // ── 5) gorget + closed great helm with a crenellated crown and a narrow glowing eye slit ──
    fillPoly(k, [T(torL * 0.96, -sw * 0.32), T(torL + hr * 0.8, -sw * 0.28), T(torL + hr * 0.9, sw * 0.24), T(torL * 0.94, sw * 0.32)], C.gun, C.silver, 1.5);
    line(k, [T(torL + hr * 0.6, -sw * 0.26), T(torL + hr * 0.7, sw * 0.22)], C.goldHi, 1.2, 0.9);
    const hx = hcw[0], hy = hcw[1], hrx = hr * 1.28;
    const Hp = (a, b) => [hx + d * hrx * a, hy + hrx * b]; // helm-space point (a forward, b down)
    // crenellated crown: three square merlons on a flat top
    for (const a of [-0.62, 0.0, 0.62]) {
      fillPoly(k, [Hp(a - 0.2, -0.95), Hp(a - 0.2, -1.42), Hp(a + 0.2, -1.42), Hp(a + 0.2, -0.95)], C.gun2, C.silver, 1.3);
    }
    // helm shell
    fillPoly(k, [Hp(-1.08, 0.95), Hp(-1.12, -0.4), Hp(-0.85, -1.05), Hp(0.85, -1.05), Hp(1.12, -0.35), Hp(1.18, 0.35), Hp(0.92, 0.78), Hp(0.55, 1.12), Hp(-0.4, 1.16)], C.gun, C.silver, 1.9);
    // brow overhang + dark eye channel
    fillPoly(k, [Hp(0.05, -0.46), Hp(1.16, -0.4), Hp(1.14, -0.22), Hp(0.05, -0.2)], C.obs, C.silverDim, 1.1);
    // narrow glowing slit
    if (!F) {
      const slit = stunned ? "#ff6a5a" : eCol;
      ctx.save();
      ctx.shadowColor = stunned ? "#ff4030" : eCol; ctx.shadowBlur = 8 + 8 * en;
      const a0 = Hp(0.28, -0.3), a1 = Hp(1.1, -0.27);
      ctx.strokeStyle = slit; ctx.lineWidth = Math.max(1.6, hrx * 0.13); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.stroke();
      ctx.shadowBlur = 0; ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(0.8, hrx * 0.05);
      ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.stroke();
      ctx.restore();
    } else {
      const a0 = Hp(0.28, -0.3), a1 = Hp(1.1, -0.27);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.stroke();
    }
    // breath vents, center ridge, gold rim lines, seam
    for (let i = 0; i < 3; i++) line(k, [Hp(0.5 + i * 0.16, 0.34), Hp(0.5 + i * 0.16, 0.7)], C.obs, 1.3, 0.9);
    line(k, [Hp(-0.1, -1.0), Hp(-0.1, 0.9)], C.silverDim, 0.9, 0.55);
    line(k, [Hp(-0.85, -1.0), Hp(0.85, -1.0)], C.goldHi, 1.3, 0.9);
    line(k, [Hp(-1.08, 0.9), Hp(-0.4, 1.12), Hp(0.55, 1.08), Hp(0.9, 0.74)], C.goldHi, 1.2, 0.8);
    dent(k, ...Hp(-0.55, -0.4), 2.2);
    scratch(k, ...Hp(0.2, -0.85), 0.9, 6, 0.5);
    scratch(k, ...Hp(-0.4, 0.2), 0.5, 5, 0.4);
    // faint glow leaking from the slit
    glow(k, ...Hp(0.9, -0.28), hrx * 1.2, 0.18 + 0.25 * en, eRgb);

    // ── 6) front arm (shield arm): thick sleeve + vambrace, hidden grip behind the shield ──
    const aF = arm(armFw, true);

    // ── 7) the enormous tower shield ──
    const gp = armFw[2];
    const sW = Math.max(sw * 0.74, 38), sH = H * 0.9;
    const x0 = gp[0] - d * sW * 0.66, x1 = x0 + d * sW, top = gp[1] - sH * 0.4, xc = (x0 + x1) / 2;
    const mid = top + sH * 0.6;
    const shield = (ox, oy, scale) => {
      const cx = xc, cy = top + sH * 0.5;
      const P = [
        [x0, top + 9], [x0 + d * 6, top], [x1 - d * 6, top], [x1, top + 9], [x1, mid], [x1 - d * sW * 0.14, top + sH * 0.84], [xc, top + sH], [x0 + d * sW * 0.14, top + sH * 0.84], [x0, mid],
      ];
      return P.map((p) => [cx + (p[0] - cx) * scale + ox, cy + (p[1] - cy) * scale + oy]);
    };
    // aura behind the shield while super armor is on
    if (armorOn || spark) glow(k, xc, top + sH * 0.5, sH * 0.8, spark ? 0.4 : 0.28, "244,221,158");
    // thickness: a darker, slightly offset slab behind the face
    fillPoly(k, shield(-d * 4.5, 3.5, 1), C.obs, C.rim, 1.6);
    // face: blackened steel with a thick silver rim
    const face = shield(0, 0, 1);
    fillPoly(k, face, C.obs3, C.silver, 3.2);
    // inner raised panel + gold inlay line
    const panel = shield(0, 0, 0.84);
    fillPoly(k, panel, C.obs2, C.gun3, 1.6);
    pathOf(ctx, shield(0, 0, 0.9)); edge(k, C.gold, 1.2);
    // corner bolts
    for (const p of [face[0], face[3], face[4], face[8]]) {
      const q = [lerp(p[0], xc, 0.12), lerp(p[1], top + sH * 0.5, 0.06)];
      ctx.beginPath(); ctx.arc(q[0], q[1], 1.6, 0, TAU); ctx.fillStyle = k.col(C.silverDim); ctx.fill(); edge(k, C.line, 1);
    }
    const ecx = xc, ecy = top + sH * 0.4, er = sW * 0.27;
    // ancient defensive engravings: gold dashes along both sides and the top
    if (!F) {
      ctx.save(); ctx.globalAlpha = 0.65; ctx.strokeStyle = C.goldHi; ctx.lineWidth = 1; ctx.lineCap = "round";
      for (let i = 0; i < 7; i++) {
        const y = top + sH * (0.16 + i * 0.085);
        for (const sx of [x0 + d * sW * 0.14, x1 - d * sW * 0.14]) {
          ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx, y + 3.2 + (i % 3)); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(sx - 1.6, y + 1.6); ctx.lineTo(sx + 1.6, y + 1.6); ctx.stroke();
        }
      }
      ctx.restore();
    }
    // energy channels: from the emblem to the four sides, brighter when defense is active
    const ch = (pts) => glowStroke(k, pts, eCol, 1.3, 6, 0.22 + 0.7 * en);
    ch([[ecx, ecy - er], [ecx, top + sH * 0.1]]);
    ch([[ecx - d * er, ecy], [x0 + d * sW * 0.14, ecy]]);
    ch([[ecx + d * er, ecy], [x1 - d * sW * 0.14, ecy]]);
    ch([[ecx, ecy + er], [ecx, ecy + er + sH * 0.12], [ecx - d * sW * 0.2, ecy + er + sH * 0.2]]);
    ch([[ecx, ecy + er + sH * 0.12], [ecx + d * sW * 0.2, ecy + er + sH * 0.2]]);
    // emblem: gold ring + fortress gate (arch with a portcullis) + keystone
    ctx.beginPath(); ctx.arc(ecx, ecy, er, 0, TAU);
    ctx.fillStyle = k.col(C.obs); ctx.fill(); edge(k, C.goldHi, 2.4);
    ctx.beginPath(); ctx.arc(ecx, ecy, er * 0.82, 0, TAU); edge(k, C.gold, 1);
    {
      const r = er * 0.62;
      ctx.beginPath();
      ctx.moveTo(ecx - r * 0.62, ecy + r * 0.78);
      ctx.lineTo(ecx - r * 0.62, ecy - r * 0.1);
      ctx.arc(ecx, ecy - r * 0.1, r * 0.62, Math.PI, 0);
      ctx.lineTo(ecx + r * 0.62, ecy + r * 0.78);
      ctx.closePath();
      ctx.fillStyle = F ? "#fff" : (armorOn || spark ? C.paleGold : C.gold);
      ctx.fill();
      if (!F) {
        // portcullis bars inside the gate
        ctx.strokeStyle = C.obs; ctx.lineWidth = 1;
        for (const q of [-0.3, 0, 0.3]) { ctx.beginPath(); ctx.moveTo(ecx + q * r, ecy - r * 0.6); ctx.lineTo(ecx + q * r, ecy + r * 0.78); ctx.stroke(); }
        for (const q of [-0.2, 0.25]) { ctx.beginPath(); ctx.moveTo(ecx - r * 0.62, ecy + q * r); ctx.lineTo(ecx + r * 0.62, ecy + q * r); ctx.stroke(); }
      }
      // keystone above the arch
      fillPoly(k, [[ecx - r * 0.2, ecy - r * 0.78], [ecx + r * 0.2, ecy - r * 0.78], [ecx + r * 0.14, ecy - r * 1.05], [ecx - r * 0.14, ecy - r * 1.05]], C.goldHi, C.line, 0.8);
    }
    glow(k, ecx, ecy, er * 1.9, 0.12 + 0.35 * en * (armorOn || spark ? 1 : 0.5), eRgb);
    // battle damage: dents, scratches, a deep gouge
    dent(k, x0 + d * sW * 0.28, top + sH * 0.72, 3);
    dent(k, x1 - d * sW * 0.24, top + sH * 0.22, 2.4);
    dent(k, x0 + d * sW * 0.2, top + sH * 0.3, 2);
    scratch(k, x0 + d * sW * 0.3, top + sH * 0.55, 0.9 * d + (d < 0 ? 1.3 : 0), 11, 0.5);
    scratch(k, x1 - d * sW * 0.35, top + sH * 0.62, 2.2, 9, 0.4);
    scratch(k, x0 + d * sW * 0.5, top + sH * 0.08, 0.4, 8, 0.4);
    line(k, [[x1 - d * sW * 0.18, top + sH * 0.45], [x1 - d * sW * 0.3, top + sH * 0.52], [x1 - d * sW * 0.26, top + sH * 0.6]], C.obs, 1.4, 0.9); // gouge
    // bash: bright arc along the leading edge
    if (strike && !F) {
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.shadowColor = C.paleGold; ctx.shadowBlur = 14;
      ctx.strokeStyle = C.paleGold; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x1, gp[1], aw * 2.6, -1.2, 1.2); ctx.stroke();
      ctx.restore();
    }

    // ── 8) oversized shoulder plate on the shield side, over everything ──
    pauldron(armFw[0], 0.82, true);
  }

  MW.Bulwark = { draw, C };
})(globalThis);