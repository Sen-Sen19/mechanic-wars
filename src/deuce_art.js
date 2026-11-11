// Mechanic Wars - Deuce art (render only, never touches the sim).
// Deuce - The House Always Wins: a casino gentleman who treats every fight like a high-stakes hand.
// Black tailcoat with gold piping and a burgundy lining, a burgundy waistcoat with a gold diamond pattern and a pocket-watch chain,
// ivory shirt and a burgundy cravat, black gloves with gold stitching, ivory spats on black shoes, a tilted black gambler's hat
// (burgundy band, a gold chip pin, an ace tucked in the band), a swept-back pompadour with one burgundy streak and a lazy smirk.
// Props kept small so the silhouette stays "tailcoat + hat + card": a fanned card in the front hand, a tiny spinning roulette wheel
// strapped to the back forearm, a stack of poker chips and a golden die on the belt.
// Called from character_art.js DETAIL() for id === "deuce".
// k = the shared rig state from character_art.js, e = a few precomputed values (see DETAIL).
// Sizes are in u = H / 100 (H = his hit-box height); head sizes are in head-radius units (R = k.hr).
// The coat tails and the hair flick lag behind when he moves: their small spring state lives in k.A.mDeuce.
(function (g) {
  const MW = (g.MW = g.MW || {});
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];

  const C = {
    line: "#0B0709",
    black: "#17121A", blackHi: "#3B3342", blackSh: "#0C090E",
    burg: "#8C1230", burgHi: "#C42A4E", burgSh: "#5A0A20", burgDk: "#3A0614",
    gold: "#D9A92E", goldHi: "#F7DA7A", goldSh: "#9A6E14",
    ivory: "#F4EBD6", ivorySh: "#CBBF9E",
    skin: "#F3D5BE", skinSh: "#DDAF98", blush: "#F0A090",
    hair: "#1B1316", hairHi: "#4A3A42", hairBurg: "#B01E44",
    eyeW: "#FBF6EC", iris: "#B8721E", irisDk: "#4A2A0C",
    felt: "#0F5A3A", red: "#C42A2E",
  };

  function pathOf(ctx, pts, close) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (close !== false) ctx.closePath();
  }
  function fillPoly(k, pts, fill, edgeColor, lw) {
    const { ctx } = k;
    pathOf(ctx, pts);
    ctx.fillStyle = k.col(fill);
    ctx.fill();
    if (edgeColor !== null) { ctx.lineJoin = "round"; ctx.lineWidth = lw || 1.1; ctx.strokeStyle = k.isFlash ? "#fff" : (edgeColor || C.line); ctx.stroke(); }
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
    const { ctx } = k;
    ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU);
    ctx.fillStyle = k.col(fill); ctx.fill();
    if (edgeColor) { ctx.lineWidth = lw || 0.7; ctx.strokeStyle = k.isFlash ? "#fff" : edgeColor; ctx.stroke(); }
  }
  function diamond(k, p, r, fill, alpha) { // a small card-suit diamond
    if (k.isFlash) return;
    const { ctx } = k;
    ctx.save(); ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    pathOf(ctx, [[p[0], p[1] - r * 1.25], [p[0] + r, p[1]], [p[0], p[1] + r * 1.25], [p[0] - r, p[1]]]);
    ctx.fillStyle = fill; ctx.fill();
    ctx.restore();
  }

  // A playing card centred on p, rotated by ang (radians), w x h in px. Face shows an ace-ish pip so it reads as a card at sprite size.
  function card(k, p, ang, w, h, face) {
    const { ctx } = k;
    ctx.save();
    ctx.translate(p[0], p[1]); ctx.rotate(ang);
    pathOf(ctx, [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]);
    ctx.fillStyle = k.col(face ? C.ivory : C.burg); ctx.fill();
    ctx.lineJoin = "round"; ctx.lineWidth = 0.9; ctx.strokeStyle = k.isFlash ? "#fff" : C.line; ctx.stroke();
    if (!k.isFlash) {
      if (face) { diamond(k, [0, 0], w * 0.2, C.red); diamond(k, [-w * 0.28, -h * 0.3], w * 0.08, C.red); }
      else { ctx.strokeStyle = C.gold; ctx.lineWidth = 0.6; ctx.strokeRect(-w * 0.34, -h * 0.34, w * 0.68, h * 0.68); }
    }
    ctx.restore();
  }

  // The tiny roulette wheel on the back forearm: gold rim, red / black wedges, a gold hub; it spins slowly.
  function roulette(k, c, r, ang) {
    const { ctx } = k;
    ctx.save();
    ctx.translate(c[0], c[1]);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = k.col(C.gold); ctx.fill();
    ctx.lineWidth = 0.9; ctx.strokeStyle = k.isFlash ? "#fff" : C.line; ctx.stroke();
    if (!k.isFlash) {
      for (let i = 0; i < 8; i++) {
        const a0 = ang + (i / 8) * TAU, a1 = ang + ((i + 1) / 8) * TAU;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r * 0.82, a0, a1); ctx.closePath();
        ctx.fillStyle = i % 2 ? C.black : C.red; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, TAU); ctx.fillStyle = C.goldHi; ctx.fill();
      ctx.beginPath(); ctx.arc(Math.cos(ang * 1.7) * r * 0.62, Math.sin(ang * 1.7) * r * 0.62, r * 0.1, 0, TAU); ctx.fillStyle = "#fff"; ctx.fill(); // the little ball
    }
    ctx.restore();
  }

  function springUpdate(k) {
    const A = k.A;
    let c = A.mDeuce;
    if (!c) c = A.mDeuce = { x: [0, 0, 0], y: [0, 0, 0], vx: [0, 0, 0], vy: [0, 0, 0], t: -1 };
    if (c.t < 0 || Math.abs(k.now - c.t) > 0.004) {
      c.t = k.now;
      const sp = clamp(k.vx || 0, -9, 9), vy = clamp(k.vy || 0, -16, 16), land = A.land || 0;
      for (let i = 0; i < 3; i++) {
        const w = (i + 1) / 3;
        const tx = -sp * 3.2 * w * w + Math.sin(k.now * 1.6 + i) * 0.9 * w;
        const ty = -vy * 0.8 * w + land * 4 * w + Math.sin(k.now * 2.1 + i) * 1.0 * w;
        c.vx[i] += (tx - c.x[i]) * 0.2; c.vx[i] *= 0.82; c.x[i] = clamp(c.x[i] + c.vx[i], -10, 10);
        c.vy[i] += (ty - c.y[i]) * 0.2; c.vy[i] *= 0.82; c.y[i] = clamp(c.y[i] + c.vy[i], -10, 10);
      }
    }
    return c;
  }

  function draw(k, e) {
    const { ctx, d, now } = k;
    const F = k.isFlash;
    const { shW, hipW, hcw, armBw, armFw, windU, strike, stunned } = e;
    const H = k.H, u = H / 100, A = k.A;

    // torso frame: Tu(a, b) = a along the spine (0 = hip), b toward the front, both in u
    let ux = shW[0] - hipW[0], uy = shW[1] - hipW[1];
    const tl = Math.hypot(ux, uy) || 1;
    ux /= tl; uy /= tl;
    let nx = -uy, ny = ux;
    if (nx * d < 0) { nx = -nx; ny = -ny; }
    const Tu = (a, b) => [hipW[0] + (ux * a + nx * b) * u, hipW[1] + (uy * a + ny * b) * u];

    // head frame: Hp(a, b) = a forward, b down, in head-radius units
    const hx = hcw[0], hy = hcw[1], R = k.hr;
    const Hp = (a, b) => [hx + d * R * a, hy + R * b];
    const sp = springUpdate(k);
    const fighting = !!k.attacking && !stunned;

    // first frame of a hit: a few cards and chips scatter off him
    if (stunned && !A.mDHurt && k.spawn && !F) {
      const cols = [C.ivory, C.gold, C.burg, C.goldHi];
      for (let i = 0; i < 9; i++) k.spawn(A.ox + hcw[0] + (Math.random() - 0.5) * 16, A.oy + hcw[1] + 6 + Math.random() * 18, (Math.random() - 0.5) * 3.4, -Math.random() * 2.4 - 0.3, cols[i % 4], 24, 2.4);
    }
    A.mDHurt = stunned;

    // ── back arm: black sleeve, gold cuff, the roulette wheel strapped on the forearm ──
    const sleeve = (pts, front) => {
      const [s0, el, wr] = pts;
      const body = front ? C.black : "#2A2230";
      taper(k, [s0, el], 8 * u, 9 * u, body, C.line, 1.1);
      taper(k, [el, wr], 9 * u, 7.6 * u, body, C.line, 1.1);
      dot(k, el, 4.2 * u, body, null);
      if (!F) line(k, [mix(s0, el, 0.15), mix(s0, el, 0.85)], front ? C.blackHi : C.black, 1, 0.8);
      const c0 = mix(el, wr, 0.78);
      taper(k, [c0, mix(wr, el, -0.04)], 8.2 * u, 7.6 * u, C.ivory, C.line, 0.9);              // shirt cuff
      taper(k, [mix(el, wr, 0.64), c0], 8.8 * u, 8.6 * u, C.gold, C.line, 0.8);                  // gold sleeve trim
      return wr;
    };
    const glove = (wr) => { // black glove with gold stitching on the back of the hand
      dot(k, wr, 4.4 * u, C.black, C.line, 0.9);
      if (!F) { line(k, [[wr[0] - 1.8 * u, wr[1] - 1.2 * u], [wr[0] + 1.8 * u, wr[1] - 1.2 * u]], C.gold, 0.8, 0.9); dot(k, [wr[0] + d * 1.2 * u, wr[1] + 0.6 * u], 0.6 * u, C.gold, null); }
    };

    // ── legs: black trousers with a gold side stripe, ivory spats, polished black shoes ──
    const leg = (pts, back) => {
      const [h, kn, ft] = pts;
      const S = (x, y) => [ft[0] + d * x * u, ft[1] + y * u];
      const trou = back ? C.blackSh : C.black;
      taper(k, [mix(h, kn, 0.0), kn], 10 * u, 9 * u, trou, C.line, 1.1);
      taper(k, [kn, mix(kn, ft, 0.6)], 9 * u, 7.4 * u, trou, C.line, 1.1);
      if (!F) line(k, [mix(h, kn, 0.2), kn, mix(kn, ft, 0.7)].map((p) => [p[0] + d * 3 * u, p[1]]), back ? C.goldSh : C.gold, 0.9, 0.85);
      taper(k, [mix(kn, ft, 0.56), mix(kn, ft, 0.93)], 7.4 * u, 8.4 * u, back ? C.ivorySh : C.ivory, C.line, 0.9);   // spat
      const shoe = closedSpline([S(-6, -2.5), S(-5.6, -5.2), S(1, -6.4), S(8, -5.4), S(14, -3.6), S(16, -1), S(15, 1), S(4, 1.2), S(-5, 1)], 3);
      fillPoly(k, shoe, back ? C.blackSh : C.black, C.line, 1.1);
      if (!F) { line(k, [S(2, -7.2), S(9, -5.4)], C.blackHi, 0.8, 0.8); dot(k, S(10.5, -3.6), 0.7 * u, C.goldHi, null); }
    };
    leg(k.MP(k.legB), true);
    leg(k.MP(k.legF), false);

    // ── coat tails: two black tails with a burgundy lining behind the hips, they swing with him ──
    {
      const t0 = Tu(2, -6), t1 = Tu(2, 6);
      const e1 = [Tu(-16, -9)[0] + sp.x[1] * 0.9 + -d * 2 * u, Tu(-16, -9)[1] + 6 * u + sp.y[1] * 0.6];
      const e2 = [Tu(-22, -3)[0] + sp.x[2] * 1.2 - d * 3 * u, Tu(-22, -3)[1] + 8 * u + sp.y[2] * 0.8];
      const tail = closedSpline([t0, Tu(-6, -12), e2, e1, Tu(-10, 2), t1, Tu(2, 0)], 3);
      fillPoly(k, tail, C.burgDk, C.line, 1.2);
      shade(k, tail, [Tu(-30, -20), Tu(-10, -20), Tu(-10, 10), Tu(-30, 10)], C.black, 0.0);
      const tail2 = closedSpline([Tu(5, -9), Tu(-4, -12), [e1[0], e1[1]], Tu(-8, 4), Tu(2, 6)], 3);
      fillPoly(k, tail2, C.black, C.line, 1.2);
      if (!F) line(k, [Tu(4, -9), Tu(-3, -11), e1], C.gold, 0.9, 0.85);
    }

    // ── torso: burgundy waistcoat, gold diamonds, buttons and a pocket-watch chain; the open black coat on top ──
    {
      const vest = closedSpline([Tu(-2, -10), Tu(32, -11), Tu(32, 11), Tu(-4, 11), Tu(-8, 2)], 2);
      fillPoly(k, vest, C.burg, C.line, 1.2);
      shade(k, vest, [Tu(-10, -14), Tu(36, -14), Tu(36, -2), Tu(-10, -2)], C.burgSh, 0.6);
      if (!F) {
        for (const [a, b] of [[4, -2], [12, 5], [12, -6], [20, 5], [20, -6], [28, -1], [4, 6]]) diamond(k, Tu(a, b), 1.5 * u, C.gold, 0.7);
        for (const a of [6, 13, 20]) dot(k, Tu(a, 8.5), 1.1 * u, C.goldHi, C.line, 0.4);
        // pocket-watch chain: a gold swag across the vest
        line(k, [Tu(20, 9), Tu(14, 3), Tu(8, 4), Tu(3, 10)], C.gold, 1.1, 0.95);
        dot(k, Tu(3, 10), 1.6 * u, C.goldHi, C.line, 0.5);
      }
      // ivory shirt collar and a burgundy cravat with a gold pin
      const col = closedSpline([Tu(30, -6), Tu(36, -4), Tu(37, 4), Tu(30, 7), Tu(28, 0)], 2);
      fillPoly(k, col, C.ivory, C.line, 1);
      const crav = closedSpline([Tu(30, -2), Tu(26, 0), Tu(21, -3), Tu(23, 4), Tu(28, 4)], 2);
      fillPoly(k, crav, C.burgHi, C.line, 0.9);
      if (!F) dot(k, Tu(25.5, 0.5), 1.1 * u, C.goldHi, C.line, 0.4);

      // the open coat: a black lapel panel at the back of the chest and a front lapel, gold piping
      const coatB = closedSpline([Tu(33, -12), Tu(33, -3), Tu(8, -6), Tu(-5, -11), Tu(-4, -14), Tu(14, -15)], 2);
      fillPoly(k, coatB, C.black, C.line, 1.2);
      const lapel = closedSpline([Tu(31, 12), Tu(33, 5), Tu(20, 7), Tu(8, 8), Tu(-4, 12), Tu(12, 14)], 2);
      fillPoly(k, lapel, C.black, C.line, 1.2);
      if (!F) {
        line(k, [Tu(33, 5), Tu(20, 7), Tu(8, 8), Tu(-4, 12)], C.gold, 1, 0.9);
        line(k, [Tu(33, -3), Tu(8, -6), Tu(-5, -11)], C.gold, 0.9, 0.7);
        line(k, [Tu(30, 11), Tu(12, 13.5)], C.blackHi, 0.8, 0.8);
      }

      // belt: gold buckle, a stack of poker chips and a golden die on a chain
      if (!F) {
        line(k, [Tu(-1, -11), Tu(-1, 11)], C.black, 3 * u, 1);
        const b = Tu(-1, 4); fillPoly(k, [[b[0] - 2.2 * u, b[1] - 2 * u], [b[0] + 2.2 * u, b[1] - 2 * u], [b[0] + 2.2 * u, b[1] + 2 * u], [b[0] - 2.2 * u, b[1] + 2 * u]], C.gold, C.line, 0.6);
        // chips stacked on the back hip
        const ch = Tu(-1, -9);
        const chipCols = [C.red, C.ivory, C.gold, C.red];
        for (let i = 0; i < 4; i++) {
          const cy = ch[1] - i * 1.9 * u;
          ctx.beginPath(); ctx.ellipse(ch[0], cy, 3.2 * u, 1.3 * u, 0, 0, TAU); ctx.fillStyle = chipCols[i]; ctx.fill();
          ctx.lineWidth = 0.6; ctx.strokeStyle = C.line; ctx.stroke();
        }
        // the golden die swings from a short chain
        const dp = Tu(-1, 8);
        const dx = dp[0] + sp.x[0] * 0.5, dy = dp[1] + 7 * u + sp.y[0] * 0.3;
        line(k, [dp, [dx, dy - 2 * u]], C.gold, 0.8, 0.9);
        fillPoly(k, [[dx - 2.4 * u, dy - 2.4 * u], [dx + 2.4 * u, dy - 2.4 * u], [dx + 2.4 * u, dy + 2.4 * u], [dx - 2.4 * u, dy + 2.4 * u]], C.goldHi, C.line, 0.7);
        dot(k, [dx - 0.8 * u, dy - 0.8 * u], 0.45 * u, C.line, null);
        dot(k, [dx + 0.9 * u, dy + 0.9 * u], 0.45 * u, C.line, null);
      }
    }

    // ── front arm over the coat, a card fanned between the fingers ──
    // back arm: drawn over the coat and waistcoat (not hidden behind them) so the sleeve, cuff, roulette wheel and glove read as one connected arm
    sleeve(armBw, false);
    roulette(k, mix(armBw[1], armBw[2], 0.55), 6.2 * u, now * 1.2);
    glove(armBw[2]);
    sleeve(armFw, true);
    {
      const wr = armFw[2], el = armFw[1];
      let vx = wr[0] - el[0], vy = wr[1] - el[1];
      const len = Math.hypot(vx, vy) || 1; vx /= len; vy /= len;
      if (!strike && !stunned) { // a card between two fingers, always ready; it leaves the hand on the throw
        const ang = Math.atan2(vy, vx);
        const c0 = [wr[0] + vx * 5 * u, wr[1] + vy * 5 * u];
        card(k, [c0[0] - vy * 1.2 * u, c0[1] + vx * 1.2 * u], ang + 0.35 * d, 11 * u, 7.6 * u, true);
        card(k, [c0[0] + vy * 1.2 * u, c0[1] - vx * 1.2 * u], ang - 0.22 * d, 11 * u, 7.6 * u, false);
      }
      glove(wr);
    }

// ════════════════════════════════════════════════════════════════════════════════
    // PATCH: replace everything in MW.Deuce.draw() from the line
    //     // ── neck, pompadour, face, hat ──
    // down to (but NOT including) the line
    //     // the gambler's hat: low black crown, ...
    // with the block below. The hat block, the hurt-pips block and everything above stay untouched.
    // Uses only helpers already in the file: fillPoly, closedSpline, spline, taper, line, shade, dot, pathOf.
    // ════════════════════════════════════════════════════════════════════════════════

    // ── neck, hair, face (redesign: handsome, angular, composed) ──
    fillPoly(k, [Hp(-0.1, 0.6), Hp(0.5, 0.7), Hp(0.55, 1.5), Hp(-0.25, 1.5)], C.skinSh, C.line, 0.9);
    {
      // back hair: swept up and back, tidier than before, the tip still lags a little when he moves
      const back = closedSpline([
        Hp(0.5, -1.1), Hp(-0.7, -1.3), Hp(-1.25, -0.85),
        [Hp(-1.58, -0.35)[0] + sp.x[1] * 0.4, Hp(-1.58, -0.35)[1] + sp.y[1] * 0.25],
        Hp(-1.25, 0.05),
        [Hp(-1.3, 0.55)[0] + sp.x[2] * 0.45, Hp(-1.3, 0.55)[1] + sp.y[2] * 0.3],
        Hp(-0.7, 0.4), Hp(-0.3, 0.2),
      ], 3);
      fillPoly(k, back, C.hair, C.line, 1.2);
      if (!F) {
        line(k, [Hp(-0.6, -1.0), Hp(-1.1, -0.55), Hp(-1.38, 0.0)], C.hairHi, 0.9, 0.7);
        line(k, [Hp(-0.5, -1.02), Hp(-1.0, -0.7), Hp(-1.4, -0.2)], C.hairBurg, Math.max(1.2, R * 0.11), 0.95); // burgundy streak, back sweep
      }
    }
    {
      // face: straight-ish brow plane, a proper nose in profile, a firm chin and an angular jaw (straight edges, not a balloon)
      const upper = spline([
        Hp(-0.3, -0.9), Hp(0.65, -0.92), Hp(1.0, -0.6), Hp(1.06, -0.3),   // forehead -> brow ridge
        Hp(1.1, 0.02), Hp(1.25, 0.3), Hp(1.1, 0.4),                       // nose bridge, tip, base
        Hp(1.06, 0.55), Hp(1.04, 0.74),                                    // lips
      ], 3);
      const jaw = [Hp(1.0, 0.98), Hp(0.8, 1.24), Hp(0.3, 1.27), Hp(-0.08, 1.1), Hp(-0.42, 0.6), Hp(-0.45, 0.2), Hp(-0.45, -0.5)];
      const face = upper.concat(jaw);
      fillPoly(k, face, C.skin, C.line, 1.1);
      shade(k, face, [Hp(-0.6, 0.86), Hp(1.3, 0.8), Hp(1.3, 1.4), Hp(-0.6, 1.4)], C.skinSh, 0.5);              // under the jaw
      shade(k, face, [Hp(0.1, 0.35), Hp(0.55, 0.5), Hp(0.8, 0.95), Hp(0.2, 0.95)], C.skinSh, 0.22);             // cheek hollow under the cheekbone
      const hurt = !!stunned, cocky = fighting || windU > 0.05;
      const bt = (now % 4.8) / 4.8, open = bt < 0.04 ? 0.15 : bt < 0.08 ? 0.55 : 1;    // same blink timing as before
      if (!F) {
        // nose: soft side shadow and the nostril
        line(k, [Hp(0.84, 0.12), Hp(0.94, 0.32), Hp(1.04, 0.38)], C.skinSh, 0.9, 0.7);
        line(k, [Hp(1.14, 0.37), Hp(1.0, 0.4)], C.line, 0.8, 0.55);
        // cheekbone / jaw definition
        line(k, [Hp(0.15, 0.5), Hp(0.5, 0.62), Hp(0.72, 0.92)], C.skinSh, 0.8, 0.4);
        line(k, [Hp(-0.08, 1.1), Hp(0.3, 1.27), Hp(0.8, 1.24)], C.skinSh, 1, 0.5);

        // ── eye: narrow almond, outer corner lifted, amber iris, lid cuts across the top of it ──
        const eIn = Hp(0.36, 0.05), eOut = Hp(0.96, -0.08);
        if (hurt) {
          line(k, [Hp(0.38, -0.1), Hp(0.8, 0.04), Hp(0.38, 0.16)], C.line, Math.max(1.2, R * 0.1), 1);
        } else {
          const o = open * (cocky ? 0.85 : 1);                                    // eyes narrow a touch when he fights
          const up = Hp(0.66, -0.01 - 0.26 * o), lo = Hp(0.64, 0.01 + 0.12 * o);
          ctx.save();
          ctx.beginPath(); ctx.moveTo(eIn[0], eIn[1]); ctx.quadraticCurveTo(up[0], up[1], eOut[0], eOut[1]); ctx.quadraticCurveTo(lo[0], lo[1], eIn[0], eIn[1]); ctx.closePath();
          ctx.fillStyle = C.eyeW; ctx.fill(); ctx.clip();
          const ic = Hp(0.74, -0.01);
          ctx.beginPath(); ctx.arc(ic[0], ic[1], R * 0.21, 0, TAU); ctx.fillStyle = C.iris; ctx.fill();
          ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(ic[0], ic[1] + R * 0.1, R * 0.2, 0, Math.PI); ctx.fillStyle = C.irisDk; ctx.fill(); ctx.globalAlpha = 1; // darker lower half of the iris
          ctx.beginPath(); ctx.arc(ic[0] + d * R * 0.03, ic[1], R * 0.09, 0, TAU); ctx.fillStyle = C.line; ctx.fill();
          ctx.beginPath(); ctx.arc(ic[0] - d * R * 0.07, ic[1] - R * 0.05, R * 0.04, 0, TAU); ctx.fillStyle = "#fff"; ctx.fill();   // catch-light
          ctx.restore();
          // upper lid: heavy line with a small flick at the outer corner; faint lower lid; a lid crease above
          ctx.save();
          ctx.beginPath(); ctx.moveTo(eIn[0], eIn[1]); ctx.quadraticCurveTo(up[0], up[1], eOut[0], eOut[1]);
          ctx.strokeStyle = C.line; ctx.lineWidth = Math.max(1.3, R * 0.12); ctx.lineCap = "round"; ctx.stroke();
          ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(eIn[0], eIn[1]); ctx.quadraticCurveTo(lo[0], lo[1], eOut[0], eOut[1]);
          ctx.strokeStyle = C.skinSh; ctx.lineWidth = 0.8; ctx.stroke();
          ctx.restore();
          line(k, [eOut, Hp(1.07, -0.16)], C.line, Math.max(1, R * 0.08), 1);
          if (o > 0.6) line(k, [Hp(0.42, -0.22), Hp(0.7, -0.33), Hp(0.98, -0.22)], C.skinSh, 0.8, 0.45);
        }

        // ── brow: defined and arched, the outer end tapering; lifts slightly when he is fighting ──
        const bl = cocky ? 0.05 : 0;
        taper(k, [Hp(0.2, -0.3 - bl), Hp(0.58, -0.5 - bl), Hp(1.02, -0.36 - bl * 0.5)], R * 0.17, R * 0.07, C.hair, null, 0, 3);

        // ── mouth: closed, firm; the corner on the front side lifts into a small smirk, no teeth ──
        const lift = cocky ? 0.14 : 0.08;
        if (hurt) {
          // grimace: flat, slightly down at the corner, a thin dark gap
          line(k, [Hp(0.52, 0.8), Hp(0.74, 0.77), Hp(0.96, 0.82)], C.line, Math.max(1.2, R * 0.1), 1);
          line(k, [Hp(0.6, 0.86), Hp(0.84, 0.86)], C.skinSh, 0.8, 0.6);
        } else {
          line(k, [Hp(0.5, 0.78), Hp(0.72, 0.8), Hp(0.9, 0.76 - lift * 0.4), Hp(1.0, 0.68 - lift)], C.line, Math.max(1.1, R * 0.09), 1);   // lip line, corner climbing
          line(k, [Hp(0.62, 0.9), Hp(0.82, 0.9)], C.blush, Math.max(1, R * 0.08), 0.5);                                                      // lower lip hint
          line(k, [Hp(0.99, 0.54 - lift), Hp(0.96, 0.62 - lift)], C.skinSh, Math.max(1, R * 0.07), 0.85);                                    // smirk crease at the raised corner
        }
        ctx.save(); ctx.globalAlpha = 0.2; ctx.beginPath(); const bc = Hp(0.4, 0.45); ctx.ellipse(bc[0], bc[1], R * 0.2, R * 0.1, 0, 0, TAU); ctx.fillStyle = C.blush; ctx.fill(); ctx.restore();
      }
    }
    // hair over the face: tidy swept-back wave (mostly under the hat), a sideburn at the temple, and one slim forelock with the burgundy streak
    {
      const wave = closedSpline([Hp(-0.8, -0.95), Hp(-0.9, -1.5), Hp(-0.2, -1.85), Hp(0.8, -1.7), Hp(1.12, -1.15), Hp(1.08, -0.8), Hp(0.8, -0.9), Hp(0.45, -0.74), Hp(0.05, -0.82), Hp(-0.35, -0.86)], 3);
      fillPoly(k, wave, C.hair, C.line, 1.2);
      fillPoly(k, closedSpline([Hp(-0.45, -0.6), Hp(0.0, -0.8), Hp(0.14, -0.4), Hp(0.1, 0.08), Hp(-0.12, 0.28), Hp(-0.45, 0.3)], 2), C.hair, C.line, 1);   // sideburn
      if (!F) {
        line(k, [Hp(-0.5, -1.4), Hp(0.2, -1.65), Hp(0.9, -1.5)], C.hairHi, 1, 0.7);
        line(k, [Hp(-0.1, -1.1), Hp(0.5, -1.4), Hp(1.1, -1.2)], C.hairBurg, Math.max(1.2, R * 0.11), 0.95);
      }
      const fx = sp.x[0] * 0.01;
      taper(k, [Hp(0.62, -0.92), Hp(0.9 + fx, -0.62), Hp(0.84, -0.34)], 0.24 * R, 0.07 * R, C.hair, C.line, 0.7, 3);       // forelock
      if (!F) taper(k, [Hp(0.74, -0.8), Hp(0.9 + fx, -0.62), Hp(0.84, -0.34)], 0.1 * R, 0.04 * R, C.hairBurg, null, 0, 3);  // burgundy streak on the forelock
    }

    // ════════════════════════════════════════════════════════════════════════════════
    // end of patch: the existing "the gambler's hat" block follows directly after this
    // ════════════════════════════════════════════════════════════════════════════════
    // the gambler's hat: low black crown, short slanted brim, burgundy band, a gold chip pin and an ace tucked in the band, tipped over one brow
    {
      const crown = closedSpline([Hp(-1.2, -1.2), Hp(-1.0, -1.85), Hp(-0.1, -2.25), Hp(0.8, -2.15), Hp(1.2, -1.6), Hp(1.2, -1.15), Hp(0.0, -1.2)], 3);
      fillPoly(k, crown, C.black, C.line, 1.3);
      shade(k, crown, [Hp(-1.6, -2.4), Hp(-0.4, -2.4), Hp(-0.4, -0.9), Hp(-1.6, -0.9)], C.blackSh, 0.7);
      const brim = closedSpline([Hp(-1.8, -1.05), Hp(-0.4, -1.28), Hp(1.2, -1.28), Hp(1.9, -1.0), Hp(1.5, -0.82), Hp(0.0, -0.98), Hp(-1.5, -0.86)], 3);
      fillPoly(k, brim, C.black, C.line, 1.3);
      if (!F) {
        line(k, [Hp(-0.2, -2.1), Hp(0.6, -2.0), Hp(1.0, -1.6)], C.blackHi, 1.1, 0.8);
        line(k, [Hp(-1.18, -1.28), Hp(0.0, -1.32), Hp(1.2, -1.3)], C.burg, Math.max(1.8, R * 0.26), 1);
        line(k, [Hp(-1.8, -1.05), Hp(-0.4, -1.28), Hp(1.2, -1.28), Hp(1.9, -1.0)], C.gold, 0.7, 0.8);
        // tucked card (just its top corner shows above the band), and the chip pin
        card(k, Hp(-0.5, -1.62), -0.35 * d, R * 0.5, R * 0.7, true);
        dot(k, Hp(0.7, -1.3), R * 0.2, C.red, C.goldHi, 0.8);
        dot(k, Hp(0.7, -1.3), R * 0.08, C.ivory, null);
      }
    }

    // a ring of floating card-suit pips over his head when he is hit (cosmetic only)
    if (stunned && !F) {
      ctx.save(); ctx.globalAlpha = 0.9;
      for (let i = 0; i < 3; i++) { const a = now * 6 + i * (TAU / 3); diamond(k, [hx + Math.cos(a) * R * 1.4, hy - R * 2.7 + Math.sin(a) * R * 0.4], 1.8 * u, i % 2 ? C.goldHi : C.burgHi); }
      ctx.restore();
    }
  }

  MW.Deuce = { draw, PALETTE: C };
})(globalThis);
