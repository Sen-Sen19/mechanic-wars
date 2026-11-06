// Mechanic Wars - Artillerist art (render only, never touches the sim).
// An elite arcane weapons specialist: obsidian split-tail combat coat, gunmetal shoulder and forearm
// armor with aged bronze trim, a cartridge bandolier, a mechanical eyepiece, a holstered sidearm and a
// blackened-steel arcane rifle with a glowing blue energy chamber and a floating-ring barrel.
//
// Refactor Notes:
// - Head design changed to "The Anonymous Marksman": deep black hood, matte-black angular mask,
//   narrow golden-yellow glowing eye slits, and subtle orange-glowing mechanical vents.
// - No exposed skin or traditional facial features. The character remains anonymous.
// - Energy colors (rifle, eyepiece, ammo) remain yellow/orange as per previous iteration.

(function (g) {
  const MW = (g.MW = g.MW || {});
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // Palette: obsidian black, gunmetal gray, aged bronze / muted gold, controlled arcane yellow/orange.
  // rim = soft edge light so the black coat still reads on dark stages.
  const C = {
    line: "#040508", obs: "#0b0c11", obs2: "#151821", obs3: "#222733",
    rim: "#3b4659", steel: "#343c4b", steel2: "#4c5567", steelHi: "#7a869b",
    bronze: "#8c6330", bronzeHi: "#c79a4e", gold: "#d4b36a",
    leather: "#2b1f17",

    // Yellow/orange arcane energy palette
    yellowLight: "#FFD229", // Electric Yellow
    yellowBright: "#FFC766", // Golden Glow - for brighter yellow highlights
    orange: "#FF8C1A",      // Burnt Orange
    fireOrange: "#E04000",   // Intense fiery orange for deeper parts of glow/muzzle
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
  function line(k, pts, color, lw, alpha) {
    if (k.isFlash) return;
    const { ctx } = k;
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    pathOf(ctx, pts, false);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
  }
  // soft additive yellow/orange glow
  function glow(k, x, y, r, a) {
    if (k.isFlash || a <= 0) return;
    const { ctx } = k;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(255,240,180," + a * 0.9 + ")"); // White-yellow core
    gr.addColorStop(0.45, "rgba(255,199,102," + a * 0.5 + ")"); // Golden glow
    gr.addColorStop(1, "rgba(255,140,26,0)"); // Burnt Orange fade
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function draw(k, e) {
    const { ctx, d, now, A } = k;
    const F = k.isFlash;
    const { shW, hipW, hcw, armBw, armFw, windU, pulse, stunned } = e;
    const torL = k.torL, sw = k.sw, hw = k.hw, aw = k.aw, lw = k.lw, hr = k.hr, legL = k.legL;
    const back = -d;
    const sc = k.H / 74;
    const rs = sc * 0.74; // rifle scale
    const muz = A.muzzle || 0; // muzzle flash timer (set in character_art.js)
    const en = clamp(0.5 + 0.12 * pulse + windU * 0.35 + (muz / 7) * 0.6, 0, 1); // energy level 0..1

    // torso frame: T(a, b) = a along the spine (0 = hip, torL = shoulders), b toward the front
    let ux = shW[0] - hipW[0], uy = shW[1] - hipW[1];
    const tl = Math.hypot(ux, uy) || 1;
    ux /= tl; uy /= tl;
    let nx = -uy, ny = ux;
    if (nx * d < 0) { nx = -nx; ny = -ny; }
    const T = (a, b) => [hipW[0] + ux * a + nx * b, hipW[1] + uy * a + ny * b];
    const J = (o, a, b) => [o[0] + ux * a + nx * b, o[1] + uy * a + ny * b]; // same frame at a joint

    // ── 1) split-tail combat coat: a long tail and a shorter one, asymmetrical, blowing back ──
    const drift = -clamp(k.vx, -8, 8) * 1.5;
    const stretch = clamp(Math.abs(k.vx) * 1.6, 0, 12);
    const tail = (len, spread, top0, top1, fill, ph) => {
      const tipX = hipW[0] + back * (hw * 0.5 + spread + stretch) + drift + Math.sin(now * 3 + ph) * 2.2;
      const tipY = hipW[1] + legL * len + Math.sin(now * 3.4 + ph) * 1.5;
      const nearX = hipW[0] + back * (hw * 0.05) + drift * 0.5 + Math.sin(now * 3 + ph);
      const mid = [lerp(top0[0], tipX, 0.5) + back * 3, lerp(top0[1], tipY, 0.5)];
      fillPoly(k, [top0, mid, [tipX, tipY], [lerp(tipX, nearX, 0.45), tipY - 4], [nearX, tipY + 1], top1], fill, C.rim, 1.4);
      line(k, [[tipX, tipY], [lerp(tipX, nearX, 0.45), tipY - 4], [nearX, tipY + 1]], C.bronze, 1.4, 0.9); // bronze hem trim
      line(k, [mid, [lerp(mid[0], nearX, 0.5), lerp(mid[1], tipY, 0.5)]], C.obs3, 1, 0.9); // fold line
    };
    tail(0.92, 14, T(torL * 0.55, -sw * 0.34), T(2, hw * 0.2), C.obs, 0);
    tail(0.64, 7, T(torL * 0.35, -sw * 0.2), T(2, hw * 0.05), C.obs2, 1.7);

    // ── shared bits: bracer, glove, pauldron ──
    const bracer = (arm, front) => {
      const [sh, el, wr] = arm;
      const vx = wr[0] - el[0], vy = wr[1] - el[1], len = Math.hypot(vx, vy) || 1;
      const tx = vx / len, ty = vy / len, qx = -ty, qy = tx;
      const p0 = [el[0] + tx * len * 0.1, el[1] + ty * len * 0.1], p1 = [el[0] + tx * len * 0.92, el[1] + ty * len * 0.92];
      const w0 = aw * 0.78, w1 = aw * 0.58;
      fillPoly(k, [
        [p0[0] + qx * w0, p0[1] + qy * w0], [p1[0] + qx * w1, p1[1] + qy * w1],
        [p1[0] + tx * aw * 0.35, p1[1] + ty * aw * 0.35],
        [p1[0] - qx * w1, p1[1] - qy * w1], [p0[0] - qx * w0, p0[1] - qy * w0],
      ], front ? C.steel : C.obs3, C.rim, 1.4);
      // bronze cuff bands + one yellow/orange rune dot
      for (const u of [0.18, 0.78]) {
        const c = [lerp(p0[0], p1[0], u), lerp(p0[1], p1[1], u)], w = lerp(w0, w1, u);
        line(k, [[c[0] + qx * w, c[1] + qy * w], [c[0] - qx * w, c[1] - qy * w]], C.bronzeHi, 1.4, 0.95);
      }
      const m = [lerp(p0[0], p1[0], 0.48), lerp(p0[1], p1[1], 0.48)];
      glowStroke(k, [[m[0] - tx * 2, m[1] - ty * 2], [m[0] + tx * 2, m[1] + ty * 2]], C.yellowBright, 0.9, 4, 0.5 + 0.4 * en);
    };
    const glove = (pt, ang) => {
      ctx.beginPath(); ctx.ellipse(pt[0], pt[1], aw * 0.62, aw * 0.5, ang, 0, TAU);
      ctx.fillStyle = k.col(C.obs2); ctx.fill(); edge(k, C.rim, 1.2);
    };
    const pauldron = (sP, big) => {
      const s = big ? 0.62 : 0.48;
      fillPoly(k, [J(sP, -aw * 0.9 * s, aw * 1.7 * s), J(sP, aw * 0.5 * s, aw * 2.0 * s), J(sP, aw * 1.8 * s, aw * 0.7 * s), J(sP, aw * 1.8 * s, -aw * 1.2 * s), J(sP, -aw * 0.5 * s, -aw * 1.9 * s), J(sP, -aw * 1.3 * s, -aw * 0.2 * s)], C.steel, C.rim, 1.5);
      fillPoly(k, [J(sP, aw * 0.1 * s, aw * 1.4 * s), J(sP, aw * 1.3 * s, aw * 0.5 * s), J(sP, aw * 1.3 * s, -aw * 0.9 * s), J(sP, aw * 0.0, -aw * 1.2 * s)], C.obs3, C.bronze, 1.2);
      line(k, [J(sP, -aw * 0.7 * s, aw * 1.5 * s), J(sP, aw * 0.6 * s, aw * 1.8 * s), J(sP, aw * 1.6 * s, aw * 0.6 * s)], C.bronzeHi, 1.3, 0.95); // bronze rim
      if (big) glowStroke(k, [J(sP, aw * 0.3, aw * 0.2), J(sP, aw * 0.9, -aw * 0.1)], C.yellowLight, 0.9, 4, 0.4 + 0.4 * en);
    };

    // ── 2) back arm: sleeve, small pauldron, bracer ──
    taper(k, [armBw[0], armBw[1]], aw * 0.85, aw * 0.7, C.obs, C.rim, 1.3);
    taper(k, [armBw[1], armBw[2]], aw * 0.7, aw * 0.55, C.obs2, C.rim, 1.3);
    bracer(armBw, false);
    pauldron(armBw[0], false);

    // ── 3) legs: fitted trousers, gunmetal knee guards, heavy boots ──
    const leg = (pts, isBack) => {
      const [h, kn, ft] = pts;
      const fl = isBack ? C.obs : C.obs2;
      taper(k, [h, kn], lw * 1.5, lw * 1.1, fl, C.rim, 1.3);
      taper(k, [kn, ft], lw * 1.1, lw * 0.7, fl, C.rim, 1.3);
      // knee guard with bronze edge
      fillPoly(k, [[kn[0] - d * lw * 0.3, kn[1] - lw * 1.0], [kn[0] + d * lw * 1.1, kn[1] - lw * 0.7], [kn[0] + d * lw * 1.2, kn[1] + lw * 0.8], [kn[0] - d * lw * 0.2, kn[1] + lw * 1.0]], C.steel, C.bronze, 1.2);
      // boot: tall shaft, heavy sole, bronze toe cap and ankle strap
      fillPoly(k, [
        [ft[0] - d * lw * 0.7, ft[1] - lw * 2.1], [ft[0] + d * lw * 0.65, ft[1] - lw * 2.1], [ft[0] + d * lw * 0.75, ft[1] - lw * 0.7],
        [ft[0] + d * lw * 2.5, ft[1] - lw * 0.25], [ft[0] + d * lw * 2.5, ft[1] + lw * 0.3], [ft[0] - d * lw * 1.2, ft[1] + lw * 0.3], [ft[0] - d * lw * 1.2, ft[1] - lw * 0.6],
      ], C.obs, C.rim, 1.3);
      fillPoly(k, [[ft[0] + d * lw * 1.7, ft[1] - lw * 0.5], [ft[0] + d * lw * 2.5, ft[1] - lw * 0.25], [ft[0] + d * lw * 2.5, ft[1] + lw * 0.3], [ft[0] + d * lw * 1.6, ft[1] + lw * 0.1]], C.bronze, C.bronzeHi, 1);
      line(k, [[ft[0] - d * lw * 0.75, ft[1] - lw * 1.3], [ft[0] + d * lw * 0.75, ft[1] - lw * 1.3]], C.bronzeHi, 1.3, 0.95);
    };
    leg(k.MP(k.legB), true);
    leg(k.MP(k.legF), false);

    // pelvis block joining the legs
    fillPoly(k, [T(torL * 0.2, -hw * 0.5), T(torL * 0.2, hw * 0.46), T(-legL * 0.22, hw * 0.4), T(-legL * 0.22, -hw * 0.44)], C.obs, C.rim, 1.3);
    // front coat flap (short tail on the front hip: the coat is split and uneven)
    {
      const fx = hipW[0] + d * hw * 0.5 + drift * 0.2, fy = hipW[1] + legL * 0.52 + Math.sin(now * 2.4) * 1;
      fillPoly(k, [T(4, hw * 0.1), T(4, hw * 0.62), [fx, fy], [hipW[0] + d * hw * 0.06 + drift * 0.2, fy + 4]], C.obs2, C.rim, 1.3);
      line(k, [[fx, fy], [hipW[0] + d * hw * 0.06 + drift * 0.2, fy + 4]], C.bronze, 1.3, 0.9);
    }

    // ── 4) torso: oversized cloak, bandolier, belt, pouches, sidearm ──
    // Widen the torso for an "oversized cloak" feel. Adjust points to be slightly wider.
    fillPoly(k, [T(torL * 1.02, -sw * 0.4), T(torL * 1.02, sw * 0.38), T(torL * 0.55, sw * 0.42), T(2, hw * 0.46), T(2, -hw * 0.5), T(torL * 0.55, -sw * 0.44)], C.obs, C.rim, 1.5);
    // This forms the interior lining/front opening of the cloak.
    fillPoly(k, [T(torL * 0.98, sw * 0.1), T(torL * 0.98, sw * 0.25), T(torL * 0.3, sw * 0.28), T(torL * 0.3, sw * 0.05)], C.obs3, C.rim, 1.1);

    // cartridge bandolier: strap from the back shoulder to the front hip, bronze rounds with yellow/orange tips
    {
      const s0 = T(torL * 0.97, -sw * 0.24), s1 = T(torL * 0.14, sw * 0.3);
      line(k, [s0, s1], C.line, 3.6);
      line(k, [s0, s1], C.leather, 2.6);
      for (let i = 0; i < 5; i++) {
        const u = 0.14 + i * 0.17, c = [lerp(s0[0], s1[0], u), lerp(s0[1], s1[1], u)];
        fillPoly(k, [[c[0] - 1.5, c[1] - 2.4], [c[0] + 1.5, c[1] - 2.4], [c[0] + 1.5, c[1] + 2.4], [c[0] - 1.5, c[1] + 2.4]], C.bronzeHi, C.line, 0.9);
        if (!F) { ctx.fillStyle = C.yellowLight; ctx.fillRect(c[0] - 1, c[1] - 3.2, 2, 1.6); } // Yellow tips
      }
    }
    // belt + buckle + two ammo pouches
    fillPoly(k, [T(4, -hw * 0.46), T(4, hw * 0.44), T(-1.5, hw * 0.44), T(-1.5, -hw * 0.46)], C.leather, C.line, 1.2);
    fillPoly(k, [T(4.6, hw * 0.08), T(4.6, hw * 0.3), T(-2.2, hw * 0.3), T(-2.2, hw * 0.08)], C.bronzeHi, C.bronze, 1);
    for (const b of [-0.02, 0.34]) {
      fillPoly(k, [T(0, hw * b), T(0, hw * (b + 0.34)), T(-7, hw * (b + 0.32)), T(-7.4, hw * (b + 0.02))], C.obs3, C.bronze, 1.1);
    }
    // sidearm: holster on the back hip, pistol grip and slide with a thin yellow/orange line
    {
      fillPoly(k, [T(0, -hw * 0.5), T(0, -hw * 0.95), T(-13, -hw * 0.98), T(-13.5, -hw * 0.55)], C.leather, C.line, 1.2);
      fillPoly(k, [T(0, -hw * 0.62), T(5.5, -hw * 0.7), T(4.6, -hw * 0.96), T(0, -hw * 0.9)], C.steel2, C.rim, 1.1); // grip
      line(k, [T(-5, -hw * 0.72), T(-11, -hw * 0.74)], C.yellowLight, 0.9, 0.35 + 0.4 * en); // Yellow line
      line(k, [T(0.5, -hw * 0.62), T(0.5, -hw * 0.92)], C.bronzeHi, 1.1, 0.9);
    }

    // ── 5) neck, high collar, hooded head with angular mask and glowing eyes ──
    // Neck (hidden beneath cloak/mask)
    taper(k, [T(torL * 1.0, 0), [hcw[0], hcw[1] + hr * 0.6]], 4.6, 3.8, C.obs3, C.line, 1.2);
    // High collar
    fillPoly(k, [T(torL * 0.9, -sw * 0.34), T(torL + hr * 0.7, -sw * 0.24), T(torL + hr * 0.78, sw * 0.12), T(torL * 0.88, sw * 0.2)], C.obs3, C.rim, 1.4);
    line(k, [T(torL + hr * 0.7, -sw * 0.2), T(torL + hr * 0.74, sw * 0.1)], C.bronzeHi, 1.1, 0.9);

    const hx = hcw[0], hy = hcw[1];
    const H_ = (a, b) => [hx + d * hr * a, hy + hr * b]; // head-space point (a forward, b down), in head radii

    // Deep black hood exterior
    fillPoly(k, [
        H_(-1.4, -0.6), // Back of head
        H_(-0.8, -1.8), // Top back
        H_(0.2, -2.0),  // Top center
        H_(1.2, -1.5),  // Top front
        H_(1.8, 0.0),   // Front edge of hood
        H_(1.5, 0.8),   // Lower front
        H_(0.6, 1.5),   // Chin/jaw area (hidden)
        H_(-0.8, 1.4),  // Lower back
        H_(-1.6, 0.5)   // Side
    ], C.obs2, C.rim, 1.5);

    // Face is in SIDE VIEW: the hood opens toward the way he faces (d), so he looks down his sights
    // instead of at the camera. a = forward, b = down, in head radii.
    // Deep interior shadow of the hood opening (pushed to the front of the hood)
    fillPoly(k, [
        H_(0.4, -0.95),
        H_(1.25, -0.6),
        H_(1.5, 0.2),
        H_(1.25, 0.95),
        H_(0.5, 1.05),
        H_(0.25, 0.1)
    ], C.obs, C.line, 1.0);

    // Matte-black angular mask: a beaked, swept-forward profile covering nose and mouth
    fillPoly(k, [
        H_(0.5, -0.2),
        H_(1.3, -0.12),
        H_(1.7, 0.3),
        H_(1.3, 0.85),
        H_(0.6, 0.95),
        H_(0.35, 0.45)
    ], C.obs, C.rim, 1.5);
    // brow plate above the eye (heavy, slanted down toward the front = focused, not staring)
    line(k, [H_(0.45, -0.72), H_(1.4, -0.46)], C.line, 1.8, 1);
    // bronze trim along the mask
    if (!F) line(k, [H_(0.55, 0.08), H_(1.55, 0.26)], C.bronzeHi, 0.8, 0.7);

    if (!F) { // Only draw glowing elements if not flashing
        const eyeGlowBlur = 8;
        const eyeGlowAlpha = 0.8 + 0.4 * en;
        // near eye: one long narrow slit, angled down toward the front
        glowStroke(k, [H_(0.7, -0.6), H_(1.32, -0.38)], C.yellowBright, 2.2, eyeGlowBlur, eyeGlowAlpha);
        // far eye: only a short dim sliver peeking past the edge of the mask
        glowStroke(k, [H_(1.42, -0.42), H_(1.58, -0.34)], C.yellowBright, 1.3, 5, eyeGlowAlpha * 0.6);

        // mechanical breathing vents on the side of the mask
        const ventGlowAlpha = 0.7 + 0.3 * en;
        glowStroke(k, [H_(0.72, 0.3), H_(0.98, 0.38)], C.orange, 1.2, 4, ventGlowAlpha);
        glowStroke(k, [H_(0.78, 0.55), H_(1.02, 0.63)], C.orange, 1.2, 4, ventGlowAlpha);
    }

    // ── 6) the arcane rifle (grip in the back hand, handguard on the front hand) ──
    const gB = armBw[2], gF = armFw[2];
    let ax = gF[0] - gB[0], ay = gF[1] - gB[1];
    let L1 = Math.hypot(ax, ay);
    if (L1 < 6) { ax = d; ay = 0; L1 = 6; } else { ax /= L1; ay /= L1; }
    if (ax * d < 0) { ax = -ax; ay = -ay; }
    const upx = d > 0 ? ay : -ay, upy = d > 0 ? -ax : ax; // "up" side of the rifle
    const R = (a, b) => [gB[0] + (ax * a + upx * b) * rs, gB[1] + (ay * a + upy * b) * rs];
    const rp = (pts) => pts.map((p) => R(p[0], p[1]));
    const Lh = clamp(L1 / rs + 5, 34, 46); // handguard end
    const Lb = Lh + 16; // barrel end
    const mz = R(Lb + 8, 6.8); // muzzle point
    // energy chamber glow behind the metal (now yellow/orange)
    const ch = R(8.5, 6.8);
    glow(k, ch[0], ch[1], 15 * rs * (0.7 + 0.5 * en), 0.5 * en + 0.15);
    // stock with bronze butt plate
    fillPoly(k, rp([[-15, 9.5], [-3, 10.5], [-3, 2], [-8, -4], [-15, -2]]), C.obs2, C.rim, 1.4);
    fillPoly(k, rp([[-16.5, 10], [-15, 10], [-15, -2.5], [-16.5, -2.5]]), C.bronze, C.bronzeHi, 1);
    // grip + trigger guard
    fillPoly(k, rp([[-1.6, 2], [3.6, 2], [2, -8], [-3.6, -7]]), C.obs3, C.rim, 1.3);
    line(k, rp([[3.6, 2], [8, 2], [7.4, -1.2], [4.6, -1.4]]), C.steel2, 1.2);
    // cartridge canister magazine (bronze with a yellow/orange ring)
    fillPoly(k, rp([[8.6, 2], [14, 2], [14, -4.8], [8.6, -4.8]]), C.steel, C.bronze, 1.2);
    glowStroke(k, rp([[8.8, -1.6], [13.8, -1.6]]), C.yellowLight, 0.9, 4, 0.35 + 0.5 * en); // Yellow ring
    // receiver (blackened steel) with bronze top rail
    fillPoly(k, rp([[-3, 11.4], [16, 11.4], [18, 9.6], [18, 2], [-3, 2]]), C.obs3, C.rim, 1.5);
    line(k, rp([[-3, 11.4], [16, 11.4]]), C.bronzeHi, 1.3, 0.95);
    // engraved ancient pattern: small bronze chevrons + ticks along the lower receiver
    for (let i = 0; i < 4; i++) { const a = -1 + i * 3.6; line(k, rp([[a, 4.2], [a + 1.4, 3.1], [a + 2.8, 4.2]]), C.bronze, 0.8, 0.9); }
    line(k, rp([[15, 3.6], [17, 3.6]]), C.bronze, 0.8, 0.9);
    // visible energy chamber window (now yellow/orange)
    fillPoly(k, rp([[3, 9.6], [14, 9.6], [14, 4.4], [3, 4.4]]), C.obs3, C.bronzeHi, 1.2); // Use obs3 for chamber fill, allows glow to show through.
    if (!F) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const pa = R(3.4, 4.8), pb = R(13.6, 9.2);
      const cg = ctx.createLinearGradient(pa[0], pa[1], pb[0], pb[1]);
      cg.addColorStop(0, "rgba(255,140,26," + (0.25 + 0.45 * en) + ")"); // Burnt Orange
      cg.addColorStop(1, "rgba(255,210,41," + (0.3 + 0.5 * en) + ")");   // Electric Yellow
      ctx.fillStyle = cg;
      pathOf(ctx, rp([[3.4, 9.2], [13.6, 9.2], [13.6, 4.8], [3.4, 4.8]])); ctx.fill();
      ctx.restore();
      for (let i = 0; i < 3; i++) { // coil lines inside the window
        const a = 5.5 + i * 3.2;
        line(k, rp([[a, 9.2], [a, 4.8]]), C.yellowBright, 0.7, 0.35 + 0.3 * en); // Yellow coils
      }
    }
    // short optic on top
    fillPoly(k, rp([[2, 11.4], [3.6, 13.2], [14, 13.2], [15.6, 11.4]]), C.steel, C.bronze, 1.1);
    fillPoly(k, rp([[3, 13.2], [14, 13.2], [14, 16], [3, 16]]), C.steel2, C.bronzeHi, 1.1);
    const lens = R(14.4, 14.6);
    // dot(k, lens[0], lens[1], 1.5 * rs, C.yellowLight); // Yellow lens - could add dot if needed, currently not explicitly requested.
    // handguard with glowing slots (now yellow/orange)
    fillPoly(k, rp([[18, 10.4], [Lh, 10.4], [Lh, 3], [18, 2]]), C.steel, C.rim, 1.4);
    for (let i = 0; i < 3; i++) {
      const a = 22 + i * 5;
      if (a + 2.4 < Lh) glowStroke(k, rp([[a, 8], [a + 2.4, 8]]), C.yellowLight, 1.2, 4, 0.35 + 0.5 * en);
    }
    line(k, rp([[19, 3.6], [Lh - 1, 3.6]]), C.bronze, 0.9, 0.9);
    // unusual barrel: thick main barrel + thin bronze conduit above it + two floating bronze rings (now glowing yellow)
    fillPoly(k, rp([[Lh, 8.7], [Lb, 8.7], [Lb, 4.4], [Lh, 4.4]]), C.obs2, C.rim, 1.3);
    fillPoly(k, rp([[Lh, 11], [Lb - 5, 11], [Lb - 5, 9.6], [Lh, 9.6]]), C.bronze, C.bronzeHi, 1);
    glowStroke(k, rp([[10, 6.7], [Lb, 6.7]]), C.yellowBright, 0.8, 3, 0.25 + 0.35 * en); // Yellow energy flowing to the muzzle
    for (const a of [Lh + 4, Lh + 10]) {
      fillPoly(k, rp([[a - 1.2, 12.4], [a + 1.2, 12.4], [a + 1.2, 1.6], [a - 1.2, 1.6]]), C.bronzeHi, C.bronze, 1);
      glowStroke(k, rp([[a, 12.4], [a, 1.6]]), C.yellowLight, 0.6, 3, 0.3 + 0.3 * en); // Yellow glow for floating rings
    }
    // forked muzzle brake
    fillPoly(k, rp([[Lb, 10.4], [Lb + 8, 10.8], [Lb + 8, 8], [Lb + 4.4, 6.9], [Lb + 8, 5.8], [Lb + 8, 2.8], [Lb, 3.4]]), C.steel2, C.bronzeHi, 1.2);
    glow(k, mz[0], mz[1], 5 * rs, 0.35 + 0.4 * en); // Muzzle end glow (now yellow/orange)
    // a small bead of energy running along the barrel, plus a few drifting motes above the chamber (now yellow)
    if (!F) {
      const t = (now * 0.9) % 1, bp = R(lerp(14, Lb, t), 6.7);
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.7 * (1 - t);
      ctx.fillStyle = C.yellowBright; ctx.beginPath(); ctx.arc(bp[0], bp[1], 1.1, 0, TAU); ctx.fill();
      for (let i = 0; i < 3; i++) {
        const u = (now * 0.5 + i * 0.37) % 1, mp = R(4 + i * 4.2, 12 + u * 7);
        ctx.globalAlpha = (1 - u) * 0.65; ctx.beginPath(); ctx.arc(mp[0], mp[1], 0.8, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    // ── 7) front arm over the handguard: sleeve, big pauldron, bracer, glove ──
    taper(k, [armFw[0], armFw[1]], aw * 0.88, aw * 0.72, C.obs2, C.rim, 1.3);
    taper(k, [armFw[1], armFw[2]], aw * 0.72, aw * 0.56, C.obs2, C.rim, 1.3);
    bracer(armFw, true);
    pauldron(armFw[0], true);
    glove(gF, Math.atan2(ay, ax));
    // back (trigger) hand on the grip
    glove(gB, Math.atan2(ay, ax));
    line(k, [[gB[0] + ax * aw * 0.4, gB[1] + ay * aw * 0.4], [gB[0] + ax * aw * 0.9 + upx * aw * 0.45, gB[1] + ay * aw * 0.9 + upy * aw * 0.45]], C.obs, 1.4, 0.9); // trigger finger

    // ── 8) muzzle flash: yellow-white arcane burst along the barrel ──
    if (muz > 0 && !F) {
      const m = muz / 7, ang = Math.atan2(ay, ax);
      ctx.save();
      ctx.translate(mz[0], mz[1]); ctx.rotate(ang);
      ctx.globalCompositeOperation = "lighter";
      ctx.shadowColor = C.yellowLight; ctx.shadowBlur = 20; // Yellow shadow
      ctx.globalAlpha = m;
      for (const [r0, r1, c] of [[24 * rs, 5, "rgba(255,140,26,0.85)"], [13 * rs, 3, "rgba(255,240,220,0.95)"]]) { // Orange and White-yellow colors
        ctx.fillStyle = c; ctx.beginPath();
        for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU, r = i % 2 ? r1 : r0 * (0.55 + 0.45 * m); ctx.lineTo(Math.cos(a) * r * (a > 1.6 && a < 4.6 ? 0.5 : 1), Math.sin(a) * r * 0.7); }
        ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = C.yellowBright; ctx.lineWidth = 1.4; // Yellow shock ring
      ctx.beginPath(); ctx.arc(8 * rs, 0, 6 + (1 - m) * 14, 0, TAU); ctx.stroke(); // shock ring
      ctx.restore();
    }
    // brass casing + yellow sparks + a little smoke (once per shot)
    if (A.fireFx) {
      A.fireFx = false;
      const sp = k.spawn;
      if (sp) {
        const ej = R(9, 8), wx = A.ox + mz[0], wy = A.oy + mz[1];
        sp(A.ox + ej[0], A.oy + ej[1] - 2, -d * 1.3, -2.8, C.gold, 26, 2.4); // Brass casing remains gold
        for (let i = 0; i < 4; i++) sp(wx, wy, ax * (2 + Math.random() * 3), ay * 2 + (Math.random() - 0.5) * 2, "#ffd700", 8, 2); // Yellow sparks
        for (let i = 0; i < 3; i++) sp(wx + ax * 4, wy + ay * 4, ax * 1.4 + (Math.random() - 0.5), ay * 1.4 - 0.5, "#8fa3c0", 22, 3.2);
      }
    }
    A.muzzlePos = [A.ox + mz[0], A.oy + mz[1]]; // handy for fx files
  }

  MW.Artillerist = { draw, C };
})(globalThis);