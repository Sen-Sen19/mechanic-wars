// Mechanic Wars - Miette art (render only, never touches the sim).
// Miette - The Living Color: a scrappy battle painter. Mustard beret (with a little stem and paint splat), short messy dark-brown hair with an orange-red streak
// and a beaded ribbon braid, a maroon halter top with a collar strap, an off-shoulder cream paint-splattered coat with purple lining and puffy sleeves,
// black fingerless gloves, a belt with two paint jars, mustard wide cropped pants, white socks, chunky buckled black boots and a GIANT brush
// (smooth orange wooden handle, grey-white collar, a fat teardrop brush head with a curled point dipped in blue paint, one drip).
// Reference: the "Paintbrush Battle Artist" pixel-art sheet (looks only; no skills are drawn here).
// Called from character_art.js DETAIL() for id === "miette".
// k = the shared rig state from character_art.js, e = a few precomputed values (see DETAIL).
// The brush follows her two wrists, so every pose in character_art.js (guard, run, swings) moves it for free.
// The braid, hair flicks, coat tail and ribbon lag behind when she moves: their small spring state lives in k.A.mMiette.
// Sizes below are in u = H / 100 (H = her hit-box height); head sizes are in head-radius units (R = k.hr).
(function (g) {
  const MW = (g.MW = g.MW || {});
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];

  const C = {
    line: "#14101F", line2: "#6A54A8",
    hair: "#3B2320", hairSh: "#26140F", hairHi: "#7A4A3A", hairRed: "#E4502B", hairRedHi: "#FF8A52", hairLine: "#1A0E0C",
    hat: "#D9A02E", hatSh: "#A9741A", hatHi: "#F2C65C", band: "#2A1C1A",
    coat: "#EADFC4", coatSh: "#BDAB88", coatHi: "#FFF6DC", ink: "#4B3A34",
    lining: "#5B3A9A", liningSh: "#3E2670", liningDk: "#2A1B4A", cuff: "#2B1F45", cuffHi: "#5A4690",
    top: "#D4CCBA", topHi: "#F4EEE0", topSh: "#A99E86", topGrime: "#9A8E76",
    pants: "#D9A02E", pantsSh: "#A9741A", pantsHi: "#F2C65C",
    black: "#1D1826", blackHi: "#443C58", blackSh: "#100D18",
    sock: "#F4F1EC", sockSh: "#CFCAC4",
    sole: "#9A96A8", soleSh: "#6E6A80", metal: "#CDD2D8", metalSh: "#7C788E",
    skin: "#FCE3D8", skinSh: "#EBBFB2", blush: "#F6A0A8",
    eyeW: "#F6F4FA", iris: "#9494AA", irisDk: "#3A3A4C",
    belt: "#7A5638", beltHi: "#A07850", cork: "#C89A5A",
    wood: "#EE8F25", woodHi: "#FFC266", woodSh: "#C8650F", grip: "#B88B55",
    bristle: "#C85A00", bristleHi: "#F0903A", blue: "#5BB4F2", blueHi: "#CBE8FF", metalHi: "#E4E8EC",
    bristleDk: "#2B2336", bristleCr: "#E8DCC0",
    orange: "#F0562A", teal: "#2EC8C8", purple: "#A050E0", yellow: "#F5C842", pink: "#FF6FA8",
    glass: "#BFD8E0",
  };
  const SPLAT = [C.teal, C.orange, C.purple, C.yellow, C.orange, C.teal, C.purple];

  function pathOf(ctx, pts, close) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (close !== false) ctx.closePath();
  }
  function edge(k, edgeColor, lw) {
    k.ctx.lineJoin = "round";
    k.ctx.lineWidth = lw || 1.1;
    k.ctx.strokeStyle = k.isFlash ? "#fff" : edgeColor;
    k.ctx.stroke();
  }
  function fillPoly(k, pts, fill, edgeColor, lw) {
    pathOf(k.ctx, pts);
    k.ctx.fillStyle = k.col(fill);
    k.ctx.fill();
    if (edgeColor !== null) edge(k, edgeColor || C.line, lw);
  }
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
  const closedSpline = (pts, n) => spline(pts.concat([pts[0], pts[1]]), n).slice(0, -n);
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
  function ribbon(pts, wFn) { // a ribbon with a rounded end (the floppy ears, the hair)
    const n = pts.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, n - 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      const w = wFn(i / (n - 1)) / 2;
      L.push([pts[i][0] - ty * w, pts[i][1] + tx * w]);
      R.push([pts[i][0] + ty * w, pts[i][1] - tx * w]);
    }
    const last = pts[n - 1], prev = pts[Math.max(n - 2, 0)];
    let tx = last[0] - prev[0], ty = last[1] - prev[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    const w = wFn(1) / 2, cap = [];
    for (let j = 1; j <= 5; j++) {
      const an = (j / 6) * Math.PI;
      cap.push([last[0] + (-ty * Math.cos(an) + tx * Math.sin(an)) * w, last[1] + (tx * Math.cos(an) + ty * Math.sin(an)) * w]);
    }
    return L.concat(cap, R.reverse());
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
  function shade(k, shape, shadow, color, alpha) {
    if (k.isFlash) return;
    const { ctx } = k;
    ctx.save();
    pathOf(ctx, shape); ctx.clip();
    pathOf(ctx, shadow);
    ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.fill();
    ctx.restore();
  }
  function dot(k, p, r, fill, edgeColor, lw) {
    k.ctx.beginPath(); k.ctx.arc(p[0], p[1], r, 0, TAU);
    k.ctx.fillStyle = k.col(fill); k.ctx.fill();
    if (edgeColor) edge(k, edgeColor, lw || 0.7);
  }
  function splat(k, p, r, color, seed) { // a paint splat: a blob with a few satellite drops (deterministic from the seed)
    if (k.isFlash) return;
    const { ctx } = k;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU); ctx.fill();
    for (let i = 0; i < 4; i++) {
      const a = seed * 2.3 + i * 1.7, dd = r * (1.4 + 0.5 * ((seed + i) % 3) / 2);
      ctx.beginPath(); ctx.arc(p[0] + Math.cos(a) * dd, p[1] + Math.sin(a) * dd, r * (0.28 + 0.12 * ((seed + i) % 2)), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  function springUpdate(k) {
    const A = k.A;
    let c = A.mMiette;
    if (!c) c = A.mMiette = { x: [0, 0, 0, 0], y: [0, 0, 0, 0], vx: [0, 0, 0, 0], vy: [0, 0, 0, 0], t: -1 };
    if (c.t < 0 || Math.abs(k.now - c.t) > 0.004) {
      c.t = k.now;
      const sp = clamp(k.vx || 0, -9, 9), vy = clamp(k.vy || 0, -16, 16), land = A.land || 0;
      const running = Math.abs(sp) > 0.8 && Math.abs(vy) < 1;
      for (let i = 0; i < 4; i++) {
        const w = i / 3;
        const tx = -sp * 3.4 * w * w + Math.sin(k.now * 1.5 + i * 0.9) * 1.2 * w;
        const ty = -vy * 0.9 * w + land * 5 * w + (running ? -Math.abs(Math.sin(k.now * 12)) * 3.2 * w : 0) + Math.sin(k.now * 2.0 + i) * 1.3 * w;
        c.vx[i] += (tx - c.x[i]) * 0.2; c.vx[i] *= 0.82; c.x[i] = clamp(c.x[i] + c.vx[i], -10, 10);
        c.vy[i] += (ty - c.y[i]) * 0.2; c.vy[i] *= 0.82; c.y[i] = clamp(c.y[i] + c.vy[i], -10, 10);
      }
    }
    return c;
  }

  // ── the giant brush: follows the line from her back wrist through her front wrist ──
  function brush(k, wB, wF, u, sp) {
    const { ctx } = k, F = k.isFlash;
    let vx = wF[0] - wB[0], vy = wF[1] - wB[1];
    let l = Math.hypot(vx, vy);
    if (l < 3 * u) { vx = k.d * 0.35; vy = -1; l = Math.hypot(vx, vy); }
    vx /= l; vy /= l;
    const butt = [wB[0] - vx * 22 * u, wB[1] - vy * 22 * u];
    const fer0 = [wF[0] + vx * 30 * u, wF[1] + vy * 30 * u];        // where the metal ferrule starts
    const fer1 = [fer0[0] + vx * 9 * u, fer0[1] + vy * 9 * u];
    const tip = [fer1[0] + vx * 36 * u + sp.x[3] * 0.25, fer1[1] + vy * 36 * u + sp.y[3] * 0.25]; // the bristles trail a little
    const nx = -vy, ny = vx, v = [vx, vy], n = [nx, ny];
    const off = (p, o) => [p[0] + nx * o * u, p[1] + ny * o * u];
    // handle: a smooth orange wooden stick, thick at the ferrule and tapering to a rounded end, with light streaks
    taper(k, [butt, fer0], 3.0 * u, 4.8 * u, C.wood, C.line, 1.1);
    taper(k, [butt, mix(butt, fer0, 0.06)], 3.0 * u, 3.0 * u, C.woodSh, C.line, 0.8);
    if (!F) {
      line(k, [off(mix(butt, fer0, 0.18), 0.6), off(mix(butt, fer0, 0.5), 0.9)], C.woodHi, 0.9, 0.9);
      line(k, [off(mix(butt, fer0, 0.56), 0.9), off(mix(butt, fer0, 0.82), 1.1)], C.woodHi, 0.9, 0.9);
      line(k, [off(mix(butt, fer0, 0.04), -0.4), off(mix(butt, fer0, 0.1), -0.7)], C.woodSh, 0.8, 0.9);
    }
    // ferrule: a grey-white collar with a fat ring where it meets the bristles
   fillPoly(k, [off(fer0, 3.2), off(fer1, 4.3), off(fer1, -4.3), off(fer0, -3.2)], C.metal, C.line, 1);
taper(k, [mix(fer0, fer1, 0.62), fer1], 9.5 * u, 10.2 * u, C.metalHi, C.line, 1);
    if (!F) line(k, [off(mix(fer0, fer1, 0.7), 4.2), off(mix(fer0, fer1, 0.94), 4.6)], "#fff", 0.9, 0.7);
    // bristles: a fat teardrop (natural tan hair) whose point curls to one side. The last third is dipped in wet, shifting rainbow paint
    // with a glossy wavy dip line, and real teardrop drips that stretch, pinch off, fall and fade.
    const curl = 6;
    const P = (t, o) => {
      const q = mix(fer1, tip, t), c = curl * t * t;
      return [q[0] + nx * (o + c) * u, q[1] + ny * (o + c) * u];
    };
    const wd = (t) => 4.5 * (1 - t) * (1 - t) + 8.0 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.55)), 0.9) * (1 - Math.pow(t, 1.6));
    const N = 22, L = [], Rr = [];
    for (let i = 0; i <= N; i++) { const t = i / N; L.push(P(t, wd(t))); Rr.push(P(t, -wd(t))); }
    const bristle = L.concat(Rr.reverse());
    const hsl = (h, s, l, a) => "hsla(" + (((h % 360) + 360) % 360).toFixed(0) + "," + s + "%," + l + "%," + (a === undefined ? 1 : a) + ")";
    const hue = (k.now * 55) % 360;                 // the paint slowly cycles through the rainbow: she is the Living Color
    fillPoly(k, bristle, "#D9BB8C", C.line, 1.1);
    const tipP = P(1, 0);

    if (!F) {
      ctx.save();
      pathOf(ctx, bristle);
      ctx.clip();
      // a few hair strands along the bristles
      for (const o of [-5, -2.4, 0.4, 3, 5.4]) line(k, [P(0.04, o * 0.5), P(0.4, o), P(0.8, o * 0.35)], "#B8935F", 0.7, 0.5);
      line(k, [P(0.06, -3.2), P(0.34, -5.8)], "#F2DDB4", 0.9, 0.7);
      // the paint dip: wavy dip line, two-hue gradient toward the tip
      const dip = [];
      for (let o = -12; o <= 12; o += 2) dip.push(P(0.36 + 0.05 * Math.sin(o * 0.75 + 1.2) + 0.02 * Math.cos(o * 1.9), o));
      dip.push(P(1.15, 12), P(1.15, -12));
      pathOf(ctx, dip);
      const g0 = P(0.36, 0), g1 = P(1, 0);
      const grad = ctx.createLinearGradient(g0[0], g0[1], g1[0], g1[1]);
      grad.addColorStop(0, hsl(hue, 85, 56));
      grad.addColorStop(0.55, hsl(hue + 55, 90, 60));
      grad.addColorStop(1, hsl(hue + 120, 90, 62));
      ctx.fillStyle = grad;
      ctx.fill();
      // wet edge where the paint meets the hair, a darker pooled rim
      line(k, dip.slice(0, -2), hsl(hue, 80, 38), 1.2, 0.55);
      // gloss
      line(k, [P(0.42, wd(0.42) * 0.6), P(0.6, wd(0.6) * 0.55), P(0.8, wd(0.8) * 0.4)], "#fff", 1.1 * u, 0.55);
      dot(k, P(0.66, -wd(0.66) * 0.3), 0.9 * u, "rgba(255,255,255,0.75)", null);
      ctx.restore();
      pathOf(ctx, bristle); edge(k, C.line, 1.1);
      // drips: each hangs from the lowest edge of the dipped head, stretches, pinches off into a falling drop, then starts again
      const lowSide = (t) => { const a = P(t, wd(t) * 0.78), b = P(t, -wd(t) * 0.78); return a[1] > b[1] ? a : b; };
      const defs = [{ t: 0.5, ph: 0.05, sp: 0.31, h: 0, mx: 7.5 }];
      for (const dd of defs) {
        const cyc = (k.now * dd.sp + dd.ph) % 1;
        const p = lowSide(dd.t), col = hsl(hue + dd.h + 20, 90, 58);
        const stretch = cyc < 0.72 ? cyc / 0.72 : 1, q = cyc < 0.72 ? 0 : (cyc - 0.72) / 0.28;
        const len = (cyc < 0.72 ? 1.2 + dd.mx * stretch * stretch : lerp(dd.mx + 1.2, 1.2, Math.min(1, q * 3))) * u;
        const bulb = (1.1 + 0.9 * (cyc < 0.72 ? stretch : 1 - q)) * u;
        ctx.save();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(p[0] - 1.5 * u, p[1] - 0.6 * u);
        ctx.quadraticCurveTo(p[0] - 0.5 * u, p[1] + len * 0.55, p[0] - bulb, p[1] + len);
        ctx.arc(p[0], p[1] + len, bulb, Math.PI, 0, true);
        ctx.quadraticCurveTo(p[0] + 0.5 * u, p[1] + len * 0.55, p[0] + 1.5 * u, p[1] - 0.6 * u);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.beginPath(); ctx.arc(p[0] - bulb * 0.35, p[1] + len - bulb * 0.1, Math.max(0.3, bulb * 0.28), 0, TAU); ctx.fill();
        if (cyc >= 0.72) { // the pinched-off drop falls and fades
          const dy = p[1] + len + bulb + q * q * 20 * u;
          ctx.globalAlpha = 1 - q;
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.ellipse(p[0], dy, 1.05 * u, 1.5 * u, 0, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
    }
    return tipP;
  }

  // ── normal-hit effect, anchored on the brush TIP: a rainbow paint-stroke trail behind the bristles, and a big colourful splash that bursts
  //    from the tip when the swing goes active (the finisher splashes bigger). Cosmetic only. ──
  function paintHitFx(k, tip, strike, stunned, u, pivot) {
    if (k.isFlash) return;
    const { ctx, A, now, d } = k;
    const hsl = (h, a) => "hsla(" + (((h % 360) + 360) % 360).toFixed(0) + ",90%,58%," + (a === undefined ? 1 : a) + ")";
    const big = (k.f && k.f.chainIndex === 2) ? 1.5 : 1;
    const tr = A.mTrail || (A.mTrail = []);
    const wx = A.ox + tip[0], wy = A.oy + tip[1];
    if (A.mFxT !== now) { // once per drawn frame (the body can be drawn more than once)
      A.mFxT = now;
      if (strike) {
        const ch = (k.f && k.f.chainIndex) || 0;
        const pw = [A.ox + pivot[0], A.oy + pivot[1]];
        const ph = Math.atan2(wy - pw[1], (wx - pw[0]) * d); // brush angle in her own forward/down space
        if (!A.mWasStrike) A.mSlash = { t0: now, ch, R: Math.hypot(wx - pw[0], wy - pw[1]), ph, ph0: ph, d, pw, cols: null };
        const SL = A.mSlash;
        if (SL) { SL.ph = ph; SL.R = Math.hypot(wx - pw[0], wy - pw[1]); SL.pw = pw; SL.last = now; }
        if (!A.mWasStrike) { // first active frame: a wet paint splat, 2-3 random paint colours per hit
          const h0 = Math.random() * 360;
          A.mSplash = { x: wx, y: wy, t0: now, big, seed: Math.random() * 100, cols: [h0, h0 + 90 + Math.random() * 60, h0 + 200 + Math.random() * 60] };
          if (A.mSlash) A.mSlash.cols = A.mSplash.cols;
          if (k.spawn) for (let i = 0; i < Math.round(9 * big); i++) { // heavy drops flung forward in a cone, they arc down with gravity
            const a = (d > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 1.1 - 0.25 * d * (d > 0 ? 1 : -1), sp = 1.2 + Math.random() * 2.6 * big;
            k.spawn(wx, wy, Math.cos(a) * sp, Math.sin(a) * sp - 0.6, hsl(A.mSplash.cols[i % 3]), 30 + (Math.random() * 14 | 0), 2.6 + Math.random() * 2.2);
          }
        }
        if (A.mSplash) { A.mSplash.x = wx; A.mSplash.y = wy; }
      }
      A.mWasStrike = strike;
      while (tr.length && now - tr[0].t > 0.2) tr.shift();
    }
    // the paint SLASH: a thick crescent of wet paint along the arc the bristle tip travels (around her hands), widest at the tip and
    // thinning to nothing behind it, in three stacked paint colours with a ragged edge and a bright wet highlight, fading after the swing
    const SL = A.mSlash;
    if (SL && SL.cols) {
      const age = (now - (SL.last || SL.t0)) / 0.26;
      if (age >= 1) A.mSlash = null;
      else {
        // where the arc started (the brush's wind-up angle for this chain) and how far to show behind the tip
        const w0 = [141, -54, -125][SL.ch] * Math.PI / 180;
        let span = SL.ph - w0; // signed sweep so far, from the wind-up angle
        const shown = Math.min(Math.abs(span), 2.0), sg = span < 0 ? -1 : 1;
        if (Math.abs(span) < 0.25) span = 0.25 * (SL.ch === 0 ? -1 : 1);
        const dirS = span < 0 ? -1 : 1, sweep = Math.max(0.7, Math.min(Math.abs(span), 1.15)) * dirS;
        const N = 18, W = (SL.ch === 2 ? 20 : 15) * u, alpha = age < 0.3 ? 1 : 1 - (age - 0.3) / 0.7;
        const pt = (i, f) => { // f: 0 = outer edge, 1 = inner edge of the crescent at step i
          const q = i / N, ang = SL.ph - sweep * (1 - q), wdt = W * Math.pow(q, 0.9) * (1 - age * 0.4);
          const rag = 1 + 0.12 * Math.sin(i * 2.3 + SL.t0 * 40);
          const rad = SL.R * 0.97 + wdt * (0.25 - f) * rag;
          return [SL.pw[0] + d * Math.cos(ang) * rad - A.ox, SL.pw[1] + Math.sin(ang) * rad - A.oy];
        };
        ctx.save();
        ctx.globalAlpha = alpha;
        for (let band = 0; band < 3; band++) { // three stacked paint colours across the width
          const f0 = band / 3, f1 = (band + 1) / 3;
          ctx.fillStyle = hsl(SL.cols[band]);
          ctx.beginPath();
          for (let i = 0; i <= N; i++) { const p = pt(i, f0); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
          for (let i = N; i >= 0; i--) { const p = pt(i, f1); ctx.lineTo(p[0], p[1]); }
          ctx.closePath(); ctx.fill();
        }
        ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 1.1 * u; ctx.lineCap = "round"; // wet highlight along the outer edge
        ctx.beginPath();
        for (let i = 6; i <= N; i++) { const p = pt(i, 0.12); i > 6 ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
        ctx.stroke();
        for (let j = 0; j < 4; j++) { // flung drops just off the outer edge
          const i = 6 + j * 3, p = pt(i, -0.5 - 0.3 * (j % 2));
          ctx.fillStyle = hsl(SL.cols[j % 3]);
          ctx.beginPath(); ctx.arc(p[0], p[1], (0.9 + 0.5 * (j % 2)) * u, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
    }
    const S = A.mSplash;
    // the splat: an irregular wet blob with a second colour dabbed on top, elongated streaks flung forward and loose round drops
    if (S) {
      const age = (now - S.t0) / 0.38;
      if (age >= 1) { A.mSplash = null; return; }
      const sx = S.x - A.ox, sy = S.y - A.oy;
      const grow = Math.min(1, age * 5), r = (2.2 + 2.0 * grow) * u * S.big;
      const rnd = (i) => { const v = Math.sin((S.seed + i) * 12.9898) * 43758.5453; return v - Math.floor(v); };
      ctx.save();
      ctx.globalAlpha = age < 0.55 ? 1 : 1 - (age - 0.55) / 0.45;
      const blob = (cx, cy, rr, col, n, seedOff) => {
        ctx.fillStyle = col; ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const a = (i % n) / n * TAU, rad = rr * (0.7 + 0.6 * rnd(i + seedOff));
          const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad * 0.85;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath(); ctx.fill();
      };
      // streaks: teardrops pointing away from the blob, biased toward the swing direction
      for (let i = 0; i < 6; i++) {
        const a = (d > 0 ? 0 : Math.PI) + (rnd(i + 20) - 0.5) * 2.4, len = r * (1.5 + 1.6 * rnd(i + 30)) * grow, w = r * (0.2 + 0.18 * rnd(i + 40));
        const ex = sx + Math.cos(a) * len, ey = sy + Math.sin(a) * len + age * age * 5 * u;
        ctx.fillStyle = hsl(S.cols[i % 3]);
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a + 1.57) * w, sy + Math.sin(a + 1.57) * w);
        ctx.quadraticCurveTo((sx + ex) / 2 + Math.cos(a + 1.57) * w * 0.4, (sy + ey) / 2 + Math.sin(a + 1.57) * w * 0.4, ex, ey);
        ctx.quadraticCurveTo((sx + ex) / 2 - Math.cos(a + 1.57) * w * 0.4, (sy + ey) / 2 - Math.sin(a + 1.57) * w * 0.4, sx - Math.cos(a + 1.57) * w, sy - Math.sin(a + 1.57) * w);
        ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(ex + Math.cos(a) * w * 1.6, ey + Math.sin(a) * w * 1.6, w * 0.8, 0, TAU); ctx.fill(); // the drop at the end of each streak
      }
      blob(sx, sy, r, hsl(S.cols[0]), 14, 0);
      blob(sx + d * r * 0.25, sy - r * 0.15, r * 0.6, hsl(S.cols[1]), 10, 50);
      blob(sx - d * r * 0.2, sy + r * 0.25, r * 0.35, hsl(S.cols[2]), 8, 90);
      ctx.fillStyle = "rgba(255,255,255,0.65)"; // wet gloss
      ctx.beginPath(); ctx.ellipse(sx - r * 0.25, sy - r * 0.3, r * 0.22, r * 0.12, -0.5, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  function draw(k, e) {
    const { ctx, d, now } = k;
    const F = k.isFlash;
    const { shW, hipW, hcw, armBw, armFw, windU, strike, stunned } = e;
    const H = k.H, u = H / 100;
    const A = k.A;

    // torso frame: T(a, b) = a along the spine (0 = hip, torL = shoulders), b toward the front
    let ux = shW[0] - hipW[0], uy = shW[1] - hipW[1];
    const tl = Math.hypot(ux, uy) || 1;
    ux /= tl; uy /= tl;
    let nx = -uy, ny = ux;
    if (nx * d < 0) { nx = -nx; ny = -ny; }
    const T = (a, b) => [hipW[0] + ux * a + nx * b, hipW[1] + uy * a + ny * b];
    const Tu = (a, b) => T(a * u, b * u);

    // head frame: Hp(a, b) = a forward, b down, in head-radius units
    const hx = hcw[0], hy = hcw[1], R = k.hr;
    const Hp = (a, b) => [hx + d * R * a, hy + R * b];
    const ell = (cx, cy, rx, ry, n, bump) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        const t = (i / n) * TAU, s = 1 + (bump && i % 2 ? bump : 0);
        out.push(Hp(cx + Math.cos(t) * rx * s, cy + Math.sin(t) * ry * s));
      }
      return out;
    };
    const sp = springUpdate(k);
    const fighting = !!k.attacking && !stunned;

    // first frame of a hit: a few paint flecks fly off her
    if (stunned && !A.mHurt && k.spawn && !F) {
      for (let i = 0; i < 10; i++) k.spawn(A.ox + hcw[0] + (Math.random() - 0.5) * 18, A.oy + hcw[1] + 6 + Math.random() * 18, (Math.random() - 0.5) * 3.4, -Math.random() * 2.2 - 0.3, SPLAT[i % SPLAT.length], 22, 2.6);
    }
    A.mHurt = stunned;

    // ── beaded ribbon braid: hangs behind her ear and swings with her ──
    {
      const root = Hp(-1.05, 0.15);
      const pts = spline([root, [root[0] - d * 0.35 * R + sp.x[1] * 0.4, root[1] + 0.7 * R], [root[0] - d * 0.7 * R + sp.x[2] * 0.8, root[1] + 1.5 * R + sp.y[2] * 0.4], [root[0] - d * 0.9 * R + sp.x[3] * 1.1, root[1] + 2.2 * R + sp.y[3] * 0.7]], 6);
      const body = ribbon(pts, (t) => R * lerp(0.3, 0.2, t));
      fillPoly(k, body, C.hairSh, C.line, 1);
      if (!F) {
        for (const t of [0.35, 0.6]) { const p = pts[Math.floor(pts.length * t)]; dot(k, p, 0.14 * R, t < 0.5 ? C.hat : C.orange, C.line, 0.6); }
        const e1 = pts[pts.length - 1];
        taper(k, [e1, [e1[0] - d * 0.2 * R + sp.x[3] * 0.2, e1[1] + 0.7 * R]], 0.3 * R, 0.08 * R, C.coat, null, 0);
        taper(k, [[e1[0] + d * 0.1 * R, e1[1]], [e1[0] + d * 0.1 * R + sp.x[3] * 0.2, e1[1] + 0.55 * R]], 0.18 * R, 0.05 * R, C.orange, null, 0);
      }
    }

    // ── arms: puffy off-shoulder coat sleeves (cream, purple lining at the shoulder), a dark cuff, a black fingerless glove ──
    const sleeve = (pts, front) => {
      const [s0, el, wr] = pts;
      let vx = wr[0] - el[0], vy = wr[1] - el[1];
      const len = Math.hypot(vx, vy) || 1;
      vx /= len; vy /= len;
      const body = front ? C.coat : C.coatSh, lin = front ? C.lining : C.liningSh;
      taper(k, [s0, el], 9.5 * u, 12.5 * u, body, C.line, 1.1);
      taper(k, [el, wr], 12.5 * u, 10 * u, body, C.line, 1.1);
      dot(k, el, 6 * u, body, null);
      taper(k, [mix(s0, el, -0.05), mix(s0, el, 0.34)], 10.4 * u, 11.6 * u, lin, C.line, 1);           // purple lining at the dropped shoulder
      if (front && !F) {
        line(k, [mix(s0, el, 0.45), mix(s0, el, 0.8)], C.coatHi, 1, 0.8);
        splat(k, mix(el, wr, 0.4), 1.9 * u, C.orange, 1);
        splat(k, mix(s0, el, 0.62), 1.4 * u, C.teal, 4);
        dot(k, mix(el, wr, 0.15), 1.2 * u, C.ink, null);
      }
      const c0 = mix(el, wr, 0.72);
      taper(k, [c0, mix(wr, el, -0.06)], 9.4 * u, 8.4 * u, C.cuff, C.line, 1);
      const qx = -vy, qy = vx;
      if (!F) line(k, [[c0[0] - qx * 4.8 * u, c0[1] - qy * 4.8 * u], [c0[0] + qx * 4.8 * u, c0[1] + qy * 4.8 * u]], C.cuffHi, 0.9, 0.9);
      return wr;
    };
    const fist = (wr) => { // black fingerless glove gripping the handle, bare fingertips
      dot(k, wr, 4.8 * u, C.black, C.line, 0.9);
      if (!F) {
        dot(k, [wr[0] + d * 2.2 * u, wr[1] - 1.5 * u], 1.3 * u, C.skin, C.line, 0.5);
        dot(k, [wr[0] + d * 2.0 * u, wr[1] + 1.4 * u], 1.2 * u, C.skin, C.line, 0.5);
        line(k, [[wr[0] - 2.4 * u, wr[1] - 1 * u], [wr[0] + 0.6 * u, wr[1] - 2.8 * u]], C.blackHi, 0.8, 0.9);
      }
    };
    sleeve(armBw, false);

    // ── legs: black buckled boots, white socks, mustard wide cropped pants that flare at the hem ──
    const leg = (pts, back) => {
      const [h, kn, ft] = pts;
      const hemP = mix(kn, ft, 0.34), bootTop = mix(kn, ft, 0.55);
      const S = (x, y) => [ft[0] + d * x * u, ft[1] + y * u];
      // white sock and the boot shaft
      taper(k, [mix(kn, ft, 0.3), bootTop], 7 * u, 7.4 * u, back ? C.sockSh : C.sock, C.line, 0.9);
      taper(k, [mix(kn, ft, 0.55), mix(kn, ft, 0.96)], 10.4 * u, 11.8 * u, back ? C.blackSh : C.black, C.line, 1.1);
      const shoe = closedSpline([S(-9, -3), S(-8.6, -11), S(-1, -14.5), S(7, -13), S(14, -9.5), S(18.4, -4.5), S(18, 0.4), S(6, 1.2), S(-7, 1)], 3);
      fillPoly(k, shoe, back ? C.blackSh : C.black, C.line, 1.1);
      fillPoly(k, [S(-9.4, -3.4), S(18.8, -3.8), S(18.4, 1.8), S(-8.6, 2)], back ? C.soleSh : C.sole, C.line, 0.9);       // thick grey sole
      if (!F) {
        line(k, [S(-6, 0.2), S(-6, 1.6)], C.blackSh, 0.8, 0.8); line(k, [S(0, 0.4), S(0, 1.8)], C.blackSh, 0.8, 0.8); line(k, [S(7, 0.4), S(7, 1.6)], C.blackSh, 0.8, 0.8);
        for (const t of [0.7, 0.86]) {                                                                                        // two buckled straps
          const m = mix(kn, ft, t);
          line(k, [[m[0] - 5.6 * u, m[1]], [m[0] + 5.6 * u, m[1]]], C.blackHi, 1.7 * u, 1);
          fillPoly(k, [[m[0] - 1.4 * u, m[1] - 2 * u], [m[0] + 1.8 * u, m[1] - 2 * u], [m[0] + 1.8 * u, m[1] + 2 * u], [m[0] - 1.4 * u, m[1] + 2 * u]], C.metal, C.line, 0.6);
        }
        line(k, [S(-1, -12.5), S(8, -12)], C.blackHi, 0.8, 0.7);
      }
      // pants
      const pc = back ? C.pantsSh : C.pants;
      taper(k, [mix(h, kn, 0.05), kn], 11.4 * u, 13.4 * u, pc, C.line, 1.1);
      taper(k, [kn, hemP], 13.4 * u, 18 * u, pc, C.line, 1.1);
      if (!F) {
        const m = mix(kn, hemP, 0.55);
        line(k, [[m[0] - 7.6 * u, m[1]], [m[0] + 7.6 * u, m[1] + 0.5 * u]], back ? C.pantsSh : C.pantsHi, 1.2, 0.7);
        line(k, [mix(h, kn, 0.3), mix(kn, hemP, 0.2)].map((p) => [p[0] + d * 2 * u, p[1]]), back ? C.pantsSh : C.pantsHi, 1, 0.6);
        line(k, [[hemP[0] - 8.6 * u, hemP[1] - 0.8 * u], [hemP[0] + 8.6 * u, hemP[1] + 0.5 * u]], C.pantsSh, 1.6, 0.9);       // hem
        if (!back) {
          splat(k, mix(kn, hemP, 0.35), 2.4 * u, C.orange, 2);
          splat(k, mix(kn, hemP, 0.8), 2 * u, C.purple, 5);
          splat(k, mix(h, kn, 0.55), 1.6 * u, C.teal, 3);
          dot(k, mix(h, kn, 0.3), 1.6 * u, C.ink, null);
        } else { splat(k, mix(kn, hemP, 0.5), 1.6 * u, C.teal, 4); }
      }
    };
    leg(k.MP(k.legB), true);
    leg(k.MP(k.legF), false);

    // ── the long coat: a dark purple lining at the back, a long cream front panel with ragged hem and paint all over it ──
    {
      const sw = sp.x[2] * 0.45, sy = Math.abs(sp.y[2]) * 0.4;
      const bk = [Tu(8, -13), Tu(-4, -17), Tu(-12, -15), Tu(-18, -9), Tu(-10, -3), Tu(2, -2)].map((p, i) => (i >= 2 ? [p[0] + sw * (i >= 3 ? 1.1 : 0.6), p[1] + sy] : p));
      fillPoly(k, closedSpline(bk, 3), C.liningDk, C.line, 1.2);
      const fr = [Tu(11, -12), Tu(11, 13), Tu(3, 16), Tu(-6, 16), Tu(-17, 11), Tu(-13, 3), Tu(-18, -4), Tu(-11, -12), Tu(-2, -14)].map((p, i) => (i >= 3 && i <= 7 ? [p[0] + sw * (i === 5 ? 0.6 : 1), p[1] + sy] : p));
      const body = closedSpline(fr, 3);
      fillPoly(k, body, C.coat, C.line, 1.3);
      shade(k, body, [Tu(-30, -22), Tu(0, -22), Tu(0, -4), Tu(-30, 0)], C.coatSh, 0.55);
      if (!F) {
        line(k, [Tu(-3, -9), Tu(-9, -6), Tu(-15, -3)], C.coatSh, 1.1, 0.8);                                                  // fold lines
        line(k, [Tu(4, 3), Tu(-4, 6), Tu(-12, 8)], C.coatSh, 0.9, 0.7);
        line(k, [Tu(10, 12), Tu(4, 15), Tu(-5, 15)], C.coatHi, 1.1, 0.9);
        for (const [a, b, r] of [[-14, 8, 2.2], [-12, -8, 1.9], [-16, -2, 1.5], [-6, 14, 1.3]]) dot(k, Tu(a, b), r * u, C.ink, null);  // dark ink blots along the hem
        for (let i = 0; i < 26; i++) { const a = -15 + ((i * 37) % 26), b = -13 + ((i * 53) % 27); dot(k, Tu(a, b), (0.5 + (i % 3) * 0.28) * u, SPLAT[(i * 3) % SPLAT.length], null); }
        const spl = [[3, -6, 2.4, 0], [-4, 5, 2.6, 1], [-11, -4, 2.2, 2], [0, 11, 1.8, 3], [-13, 6, 2.0, 4], [6, 8, 1.5, 5], [-7, 12, 1.7, 1], [-2, -10, 1.5, 0]];
        for (let i = 0; i < spl.length; i++) splat(k, Tu(spl[i][0], spl[i][1]), spl[i][2] * u * 1.45, SPLAT[spl[i][3] % SPLAT.length], i + 2);
      }
    }

    // ── belt with a buckle, a black pouch and two paint jars on the back hip ──
    if (!F) {
      line(k, [Tu(7, -14), Tu(7, 14)], C.belt, 3 * u, 1);
      line(k, [Tu(8.2, -14), Tu(8.2, 14)], C.beltHi, 0.7, 0.7);
      { const b = Tu(7, 5); fillPoly(k, [[b[0] - 2.8 * u, b[1] - 2.4 * u], [b[0] + 2.8 * u, b[1] - 2.4 * u], [b[0] + 2.8 * u, b[1] + 2.4 * u], [b[0] - 2.8 * u, b[1] + 2.4 * u]], C.metal, C.line, 0.7); dot(k, b, 0.8 * u, C.metalSh, null); }
      fillPoly(k, [Tu(4, -19), Tu(4, -11.5), Tu(-11, -11.5), Tu(-10, -19)], C.black, C.line, 1);
      line(k, [Tu(3, -17.5), Tu(-8, -17.5)], C.blackHi, 0.8, 0.8);
      const jar = (p, col) => {
        fillPoly(k, [[p[0] - 2.2 * u, p[1] - 3 * u], [p[0] + 2.2 * u, p[1] - 3 * u], [p[0] + 2.2 * u, p[1] + 3 * u], [p[0] - 2.2 * u, p[1] + 3 * u]], C.glass, C.line, 0.8);
        pathOf(ctx, [[p[0] - 1.7 * u, p[1] - 0.8 * u], [p[0] + 1.7 * u, p[1] - 0.8 * u], [p[0] + 1.7 * u, p[1] + 2.6 * u], [p[0] - 1.7 * u, p[1] + 2.6 * u]]);
        ctx.fillStyle = col; ctx.fill();
        fillPoly(k, [[p[0] - 2.5 * u, p[1] - 5.2 * u], [p[0] + 2.5 * u, p[1] - 5.2 * u], [p[0] + 2.5 * u, p[1] - 3 * u], [p[0] - 2.5 * u, p[1] - 3 * u]], C.cork, C.line, 0.7);
      };
      jar(Tu(11.5, -15.5), C.teal);
      jar(Tu(11.5, -8.8), C.orange);
    }

    // ── maroon halter top, black collar with a strap and buckle ──
    {
      const top = closedSpline([Tu(5, -9), Tu(5, 9), Tu(17, 10.5), Tu(27, 8), Tu(31.5, 4), Tu(32, -3), Tu(28, -9), Tu(16, -10.5)], 3);
      fillPoly(k, top, C.top, C.line, 1.2);
      shade(k, top, [Tu(2, -12), Tu(34, -12), Tu(34, -3), Tu(2, -3)], C.topSh, 0.55);
      if (!F) {
        line(k, [Tu(12, 6), Tu(19, 7.5), Tu(25, 5.5)], C.topHi, 1.1, 0.75);
        // dirty-white top: grime smudges and paint spots in many colours (clipped to the top)
        ctx.save();
        pathOf(ctx, top); ctx.clip();
        ctx.globalAlpha = 0.35;
        for (const [a, b, r] of [[8, -6, 3.2], [14, 7, 2.6], [22, -2, 2.4], [28, 6, 2.2], [10, 2, 2]]) dot(k, Tu(a, b), r * u, C.topGrime, null);
        ctx.globalAlpha = 1;
        const SP = [[7, -5, 1.7, "#FF6FA8"], [11, 4, 1.3, "#5BB4F2"], [14, -7, 1.5, "#F5C842"], [17, 6, 1.9, "#2EC8C8"], [20, -3, 1.4, "#A050E0"], [23, 7, 1.2, "#F0562A"], [25, -6, 1.6, "#78C98B"], [28, 1, 1.5, "#FF6FA8"], [30, -5, 1.1, "#F5C842"], [9, 8, 1.1, "#A050E0"], [19, 0, 1, "#F0562A"], [13, -1, 1.2, "#2EC8C8"]];
        for (let i = 0; i < SP.length; i++) splat(k, Tu(SP[i][0], SP[i][1]), SP[i][2] * u, SP[i][3], i + 1);
        ctx.restore();
        fillPoly(k, [Tu(31, -3.6), Tu(31, 4.2), Tu(35.5, 3.6), Tu(35.5, -3.2)], C.black, C.line, 0.9);                         // collar
        line(k, [Tu(33, -2.6), Tu(33, 3)], C.blackHi, 0.8, 0.8);
        line(k, [Tu(31.5, 4.4), Tu(25, 9)], C.belt, 1.8 * u, 1);                                                                // strap
        { const b = Tu(28, 6.8); fillPoly(k, [[b[0] - 1.8 * u, b[1] - 2.2 * u], [b[0] + 1.8 * u, b[1] - 2.2 * u], [b[0] + 1.8 * u, b[1] + 2.2 * u], [b[0] - 1.8 * u, b[1] + 2.2 * u]], C.metal, C.line, 0.6); }
      }
    }

    // ── purple ribbon and a black strap hanging from the belt ──
    if (!F) {
      const r0 = Tu(7, 10);
      const rp = spline([r0, [r0[0] + sp.x[1] * 0.3, r0[1] + 8 * u], [r0[0] - d * 1.5 * u + sp.x[2] * 0.6, r0[1] + 17 * u + sp.y[2] * 0.3], [r0[0] - d * 3 * u + sp.x[3] * 0.9, r0[1] + 24 * u + sp.y[3] * 0.4]], 6);
      fillPoly(k, ribbon(rp, (t) => lerp(3.2, 2.2, t) * u), C.lining, C.line, 0.9);
      const s0 = Tu(7, -2), s1 = [s0[0] + sp.x[1] * 0.2, s0[1] + 24 * u];
      line(k, [s0, s1], C.line, 3 * u, 1);
      line(k, [s0, s1], C.black, 2.2 * u, 1);
      ctx.save(); ctx.strokeStyle = C.metal; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(s1[0], s1[1] + 1.4 * u, 1.7 * u, 0, TAU); ctx.stroke(); ctx.restore();
    }

    // ── the off-shoulder coat collar: big cream flaps with purple lining that sit on her shoulders ──
    {
      const bf = closedSpline([Tu(22, -16), Tu(31, -15), Tu(36, -9), Tu(31, -5), Tu(25, -8)], 3);
      fillPoly(k, bf, C.coat, C.line, 1.2);
      if (!F) { line(k, [Tu(26, -8.5), Tu(31, -5.4), Tu(35, -8.6)], C.lining, 2 * u, 1); splat(k, Tu(28, -12), 1.4 * u, C.orange, 3); }
      const ff = closedSpline([Tu(21, 12), Tu(30, 11), Tu(35.5, 6), Tu(30, 1.6), Tu(24, 5)], 3);
      fillPoly(k, ff, C.coat, C.line, 1.2);
      if (!F) { line(k, [Tu(25, 5.5), Tu(30, 2.2), Tu(34.6, 6.2)], C.lining, 2 * u, 1); line(k, [Tu(23, 10.5), Tu(29, 10)], C.coatHi, 0.9, 0.8); splat(k, Tu(28, 8), 1.2 * u, C.teal, 2); dot(k, Tu(24, 9), 1 * u, C.ink, null); }
    }

    // ── near arm over the coat, the brush through both fists ──
    sleeve(armFw, true);
    const tip = brush(k, armBw[2], armFw[2], u, sp);
    paintHitFx(k, tip, strike, stunned, u, armBw[2]);
    fist(armBw[2]);
    fist(armFw[2]);


    // ── neck, messy short hair, face, bangs and side lock, beret ──
    fillPoly(k, [Hp(-0.1, 0.6), Hp(0.5, 0.7), Hp(0.55, 1.5), Hp(-0.25, 1.5)], C.skinSh, C.line, 0.9);
    {
      const sx = (i) => sp.x[i] * 0.7, sy = (i) => sp.y[i] * 0.5;
      const back = [Hp(0.3, -1.0), Hp(-0.7, -1.3), Hp(-1.45, -0.8), [Hp(-1.8, -0.15)[0] + sx(1), Hp(-1.8, -0.15)[1] + sy(1)], Hp(-1.45, 0.3),
        [Hp(-2.0, 0.65)[0] + sx(2), Hp(-2.0, 0.65)[1] + sy(2)], Hp(-1.4, 0.9), [Hp(-1.55, 1.4)[0] + sx(3), Hp(-1.55, 1.4)[1] + sy(3)], Hp(-1.0, 1.1),
        [Hp(-0.85, 1.55)[0] + sx(3) * 0.6, Hp(-0.85, 1.55)[1] + sy(3) * 0.6], Hp(-0.5, 1.05), Hp(-0.3, 0.6), Hp(0.0, 0.2)];
      fillPoly(k, back, C.hair, C.line, 1.3);
      shade(k, back, ell(-1.2, 0.6, 0.9, 1.2, 20), C.hairSh, 0.6);
      if (!F) { line(k, [Hp(-0.6, -1.1), Hp(-1.2, -0.7), Hp(-1.4, -0.2)], C.hairHi, 1, 0.6); line(k, [Hp(-1.0, 0.5), Hp(-1.1, 1.0)], C.hairHi, 0.8, 0.45); }
    }
    {
      const face = closedSpline([Hp(-0.3, -0.95), Hp(0.7, -0.92), Hp(1.12, -0.4), Hp(1.18, 0.1), Hp(1.08, 0.55), Hp(0.8, 1.02), Hp(0.45, 1.2), Hp(-0.1, 1.0), Hp(-0.45, 0.3), Hp(-0.45, -0.5)], 3);
      fillPoly(k, face, C.skin, C.line, 1.1);
      shade(k, face, [Hp(-0.6, 0.78), Hp(1.2, 0.7), Hp(1.2, 1.3), Hp(-0.6, 1.3)], C.skinSh, 0.55);
      const hurt = !!stunned, happy = fighting || windU > 0.05;
      const bt = (now % 4.4) / 4.4;
      const open = bt < 0.04 ? 0.15 : bt < 0.08 ? 0.55 : 1;
      if (!F) {
        ctx.save(); ctx.globalAlpha = hurt ? 0.65 : 0.35;
        ctx.beginPath(); const bc = Hp(0.38, 0.36); ctx.ellipse(bc[0], bc[1], R * 0.22, R * 0.12, 0, 0, TAU);
        ctx.fillStyle = C.blush; ctx.fill(); ctx.restore();
        const ec = Hp(0.62, 0.0);
        if (hurt) { // squeezed eye: ">"
          line(k, [Hp(0.2, -0.08), Hp(0.62, 0.08), Hp(0.2, 0.26)], C.line, Math.max(1.2, R * 0.09), 1);
        } else {
          const ew = R * 0.46, eh = R * (happy ? 0.3 : 0.38) * open;
          ctx.save();
          ctx.beginPath(); ctx.ellipse(ec[0], ec[1], ew, Math.max(eh, 0.01), d * 0.12, 0, TAU);
          ctx.fillStyle = C.eyeW; ctx.fill(); ctx.clip();
          const ic = Hp(0.72, 0.02);
          ctx.beginPath(); ctx.arc(ic[0], ic[1], R * 0.32, 0, TAU); ctx.fillStyle = C.iris; ctx.fill();
          ctx.fillStyle = C.irisDk; ctx.fillRect(ic[0] - R * 0.32, ic[1] - R * 0.32, R * 0.64, R * 0.22);
          ctx.beginPath(); ctx.arc(ic[0] + d * R * 0.03, ic[1] + R * 0.02, R * 0.13, 0, TAU); ctx.fillStyle = C.line; ctx.fill();
          ctx.beginPath(); const hl = Hp(0.56, -0.04); ctx.arc(hl[0], hl[1], Math.max(0.5, R * 0.06), 0, TAU); ctx.fillStyle = "#fff"; ctx.fill();
          ctx.restore();
          line(k, [Hp(0.14, 0.06), Hp(0.5, -0.2), Hp(0.98, -0.1)], C.line, Math.max(1.3, R * 0.11), 1);                         // a sharp, heavy upper lid
          line(k, [Hp(0.94, -0.1), Hp(1.1, -0.2)], C.line, 1, 1);
        }
        const by = happy ? -0.42 : -0.36;
        if (hurt) line(k, [Hp(0.26, -0.5), Hp(0.7, -0.26)], C.hairLine, 1.1, 0.95);
        else line(k, [Hp(0.25, by + 0.12), Hp(0.95, by - 0.12)], C.hairLine, 1.3, 0.95);
        dot(k, Hp(1.1, 0.25), 0.45, C.skinSh, null);
      }
    }
    // bangs: a ragged fringe, one spike hanging toward the eye
    {
      const fringe = [Hp(-0.9, -1.0), Hp(1.1, -0.95), Hp(1.04, -0.6), Hp(0.88, -0.42), Hp(0.66, -0.72), Hp(0.32, -0.45), Hp(0.06, -0.75), Hp(-0.25, -0.5), Hp(-0.55, -0.7)];
      fillPoly(k, fringe, C.hair, C.line, 1.1);
      if (!F) line(k, [Hp(0.1, -0.85), Hp(0.5, -0.8), Hp(0.8, -0.7)], C.hairHi, 0.9, 0.7);
      // side lock framing the cheek, orange-red toward the tip
      const lp = [Hp(-0.5, -0.6), Hp(-0.5, 0.2), Hp(-0.42, 0.8), Hp(-0.26, 1.3)].map((p, i) => [p[0] + (i > 1 ? sp.x[1] * 0.25 : 0), p[1]]);
      taper(k, lp, 0.42 * R, 0.24 * R, C.hair, C.line, 1.1, 5);
      taper(k, lp.slice(1), 0.38 * R, 0.24 * R, C.hairRed, C.line, 0.9, 5);
      if (!F) { line(k, [lp[1], mix(lp[2], lp[3], 0.7)].map((p) => [p[0] + d * 0.1 * R, p[1]]), C.hairRedHi, 1, 0.8); line(k, [Hp(-0.5, -0.4), Hp(-0.5, 0.0)], C.hairHi, 0.9, 0.6); }
    }
    // the mustard beret, tilted back, with a little stem, a dark band and fresh paint on it
    {
      const bere = closedSpline([Hp(-1.55, -0.95), Hp(-1.5, -1.45), Hp(-0.8, -1.8), Hp(0.2, -1.88), Hp(1.0, -1.6), Hp(1.35, -1.1), Hp(1.2, -0.9), Hp(0.2, -0.95), Hp(-0.8, -0.88)], 4);
      fillPoly(k, bere, C.hat, C.line, 1.3);
      shade(k, bere, ell(-1.1, -1.0, 1.0, 0.9, 18), C.hatSh, 0.55);
      if (!F) {
        line(k, [Hp(-0.3, -1.76), Hp(0.5, -1.8), Hp(1.0, -1.52)], C.hatHi, 1.3, 0.85);
        line(k, [Hp(-1.5, -0.86), Hp(-0.4, -0.78), Hp(0.6, -0.84), Hp(1.25, -0.82)], C.band, Math.max(1.2, R * 0.13), 1);
        splat(k, Hp(-0.95, -1.4), 0.22 * R, C.purple, 3);
        splat(k, Hp(-0.55, -1.2), 0.14 * R, C.teal, 5);
        dot(k, Hp(0.7, -1.7), 0.07 * R, C.orange, null);
      }
      taper(k, [Hp(-0.1, -1.88), Hp(-0.2, -2.2)], 0.2 * R, 0.14 * R, C.hatSh, C.line, 0.8);
    }

    // ── a doodled swirl above her head when she is hit (cosmetic only) ──
    if (stunned && !F) {
      ctx.save(); ctx.strokeStyle = C.orange; ctx.lineWidth = 1.2; ctx.lineCap = "round"; ctx.globalAlpha = 0.9;
      const c = Hp(0.2, -2.7); ctx.beginPath();
      for (let i = 0; i <= 28; i++) { const a = i * 0.45 + now * 8, r = 0.8 + i * 0.22; const x = c[0] + Math.cos(a) * r * u, y = c[1] + Math.sin(a) * r * u * 0.8; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke(); ctx.restore();
    }
  }

  MW.Miette = { draw, PALETTE: C };
})(globalThis);