// Mechanic Wars - Mochi art (render only, never touches the sim).
// Mochi - The Sleepy Dreamer: a cozy pastel adult woman in an oversized lavender bunny-ear hoodie, with fluffy mint hair,
// droopy half-open eyes, cream thigh-high socks, big white bunny slippers and a small pillow backpack.
// Design document: "Mochi - The Sleepy Dreamer" (looks only; no skills or weapons are drawn here).
// Called from character_art.js DETAIL() for id === "mochi".
// k = the shared rig state from character_art.js, e = a few precomputed values (see DETAIL).
// The bunny ears, the hair ends and the star charm lag behind when she moves: their small spring state lives in k.A.mMochi.
// Sizes below are in u = H / 100 (H = her hit-box height); head sizes are in head-radius units (R = k.hr).
(function (g) {
  const MW = (g.MW = g.MW || {});
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];

  // Palette from the design document.
  const C = {
    line: "#5B4A86", line2: "#7E6AA8", hairLine: "#4E9A82",
    hair: "#A8E6CF", hairSh: "#72BFA7", hairHi: "#D4F5E6",
    hood: "#C9B6E8", hoodSh: "#A18AC8", hoodHi: "#E3D7F5",
    cream: "#FFF0D5", creamSh: "#EAD6B4",
    pink: "#F3B9CB", pinkSh: "#E19BB4",
    skin: "#FCE3D6", skinSh: "#EBBFAE", blush: "#F7A8B8",
    eyeW: "#FAF6FF", iris: "#C47A26", irisDk: "#7A4312",
    shorts: "#9D8CB9", shortsSh: "#7F6F9E",
    shoe: "#F5F1F7", shoeSh: "#D8D0E3",
pillow: "#F9CFDC", pillowSh: "#E8A9BF", moonClip: "#D9C8F5",
    butter: "#FFE9A8", butterLine: "#E3C477",
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
    k.ctx.lineWidth = lw || 1.1;
    k.ctx.strokeStyle = k.isFlash ? "#fff" : edgeColor;
    k.ctx.stroke();
  }
  function fillPoly(k, pts, fill, edgeColor, lw) {
    pathOf(k.ctx, pts);
    k.ctx.fillStyle = k.col(fill);
    k.ctx.fill();
    edge(k, edgeColor || C.line, lw);
  }
  function spline(pts, n) { // smooth curve through points (Catmull-Rom), n samples per segment
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
  const closedSpline = (pts, n) => spline(pts.concat([pts[0], pts[1]]), n).slice(0, -n); // smooth closed loop
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
  // a ribbon with a rounded end (the floppy bunny ears)
  function ribbon(pts, wFn) {
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
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
  }
  // soft shadow clipped inside a shape (never drawn in the white hit-flash pass)
  function shade(k, shape, shadow, color, alpha) {
    if (k.isFlash) return;
    const { ctx } = k;
    ctx.save();
    pathOf(ctx, shape);
    ctx.clip();
    pathOf(ctx, shadow);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }
  function dot(k, p, r, fill, edgeColor, lw) {
    k.ctx.beginPath(); k.ctx.arc(p[0], p[1], r, 0, TAU);
    k.ctx.fillStyle = k.col(fill); k.ctx.fill();
    if (edgeColor) edge(k, edgeColor, lw || 0.7);
  }
  function star(x, y, r) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.46 : r;
      pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
    }
    return pts;
  }
  function moon(k, x, y, r, dir, fill, edgeColor) { // crescent opening toward the facing side: a disc minus a smaller, shifted disc
    const pts = [], c = 0.45 * r, rho = 0.8 * r;
    const p0 = Math.atan2(0.78, 0.625), q0 = Math.atan2(0.78, 0.175);
    for (let i = 0; i <= 10; i++) { const a = p0 + (i / 10) * (TAU - 2 * p0); pts.push([x + dir * r * Math.cos(a), y + r * Math.sin(a)]); }
    for (let i = 0; i <= 10; i++) { const a = TAU - q0 - (i / 10) * (TAU - 2 * q0); pts.push([x + dir * (c + rho * Math.cos(a)), y + rho * Math.sin(a)]); }
    fillPoly(k, pts, fill, edgeColor || C.line, 0.7);
  }

  // ── spring state: 4 rows, each lags a little more than the one above it (ears, hair ends, star charm) ──
  function springUpdate(k) {
    const A = k.A;
    let c = A.mMochi;
    if (!c) c = A.mMochi = { x: [0, 0, 0, 0], y: [0, 0, 0, 0], vx: [0, 0, 0, 0], vy: [0, 0, 0, 0], t: -1 };
    if (c.t < 0 || Math.abs(k.now - c.t) > 0.004) { // once per drawn frame (the flash pass draws her twice)
      c.t = k.now;
      const sp = clamp(k.vx || 0, -9, 9), vy = clamp(k.vy || 0, -16, 16), land = A.land || 0;
      const running = Math.abs(sp) > 0.8 && Math.abs(vy) < 1;
      for (let i = 0; i < 4; i++) {
        const w = i / 3;
        // where each row wants to be: trailing the run, lifted when falling, dropped on landing, hopping with every step, a slow idle sway
        const tx = -sp * 3.2 * w * w + Math.sin(k.now * 1.6 + i * 0.9) * 1.1 * w;
        const ty = -vy * 0.9 * w + land * 5 * w + (running ? -Math.abs(Math.sin(k.now * 12)) * 3.4 * w : 0) + Math.sin(k.now * 2.1 + i) * 1.3 * w;
        // a real spring (not a plain ease): it overshoots and wobbles before it settles, so the fluff feels bouncy
        c.vx[i] += (tx - c.x[i]) * 0.2; c.vx[i] *= 0.82; c.x[i] = clamp(c.x[i] + c.vx[i], -9, 9);
        c.vy[i] += (ty - c.y[i]) * 0.2; c.vy[i] *= 0.82; c.y[i] = clamp(c.y[i] + c.vy[i], -9, 9);
      }
    }
    return c;
  }

  function draw(k, e) {
    const { ctx, d, now } = k;
    const F = k.isFlash;
    const { shW, hipW, hcw, armBw, armFw, stunned } = e;
    const H = k.H, u = H / 100;
    const torL = k.torL, A = k.A;

    // torso frame: T(a, b) = a along the spine (0 = hip, torL = shoulders), b toward the front. Tu = same, in u.
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
    const ell = (cx, cy, rx, ry, n, bump) => { // points round an ellipse in head units (bump = fluffy scallops)
      const out = [];
      for (let i = 0; i < n; i++) {
        const t = (i / n) * TAU, s = 1 + (bump && i % 2 ? bump : 0);
        out.push(Hp(cx + Math.cos(t) * rx * s, cy + Math.sin(t) * ry * s));
      }
      return out;
    };

    const sp = springUpdate(k);
    const calm = !k.attacking && !stunned && Math.abs(k.vx || 0) < 0.4 && Math.abs(k.vy || 0) < 0.5;

    // first frame of a hit: a few soft flecks fly off her
    if (stunned && !A.mHurt && k.spawn && !F) {
      for (let i = 0; i < 8; i++) k.spawn(A.ox + hcw[0] + (Math.random() - 0.5) * 18, A.oy + hcw[1] + 6 + Math.random() * 18, (Math.random() - 0.5) * 3.2, -Math.random() * 2 - 0.3, i % 3 === 0 ? C.pink : i % 3 === 1 ? C.cream : C.hood, 20, 2.4);
    }
    A.mHurt = stunned;

    // ── ears: two separate ribbons so they can swing on their own (far one hangs behind her, near one over the shoulder) ──
    const earPath = (base, rest, gain, forward) => {
      const pts = [];
      for (let i = 0; i < rest.length; i++) {
        let x = base[0] + d * rest[i][0] * u + (i ? sp.x[i] * gain : 0);
        const y = base[1] + rest[i][1] * u + (i ? sp.y[i] * gain : 0);
        if (forward) x = base[0] + d * Math.min(5 * u, Math.max(-9 * u, ((x - base[0]) * d))); // never swings across the face
        pts.push([x, y]);
      }
      return pts;
    };
    const ear = (pts, front) => {
      const s = spline(pts, 6);
      const out = ribbon(s, (t) => lerp(10, 8.6, t) * u);
      fillPoly(k, out, front ? C.hood : C.hoodSh, C.line, 1.1);
      shade(k, out, ribbon(s.map((p) => [p[0] - d * 2.6 * u, p[1]]), (t) => lerp(5, 5, t) * u), C.hoodSh, front ? 0.4 : 0.3);
      // pale pink inner fabric: about half the width, stops short of the tip
      const inner = s.slice(2, Math.floor(s.length * 0.86));
      fillPoly(k, ribbon(inner, (t) => lerp(3.8, 3.2, t) * u), front ? C.pink : C.pinkSh, C.pinkSh, 0.6);
      // fold crease about 40% of the way down
      const m = s[Math.floor(s.length * 0.4)];
      line(k, [[m[0] - 3 * u, m[1] - 0.6 * u], [m[0], m[1] + 0.6 * u], [m[0] + 3 * u, m[1] - 0.2 * u]], C.line2, 0.7, 0.8);
    };
    const farBase = Hp(-1.15, -1.0), nearBase = Hp(-0.85, -1.2);
    ear(earPath(farBase, [[0, 0], [-4, 9], [-9, 19], [-13, 30]], 1.5, false), false);

    // ── arms: huge puffy sleeves that swallow her hands ──
    const sleeve = (pts, front) => {
      const [s0, el, wr] = pts;
      let vx = wr[0] - el[0], vy = wr[1] - el[1];
      const len = Math.hypot(vx, vy) || 1;
      vx /= len; vy /= len;
      const tip = [wr[0] + vx * 8 * u + sp.x[3] * 0.5, wr[1] + vy * 8 * u + sp.y[3] * 0.6]; // the loose sleeve end flops a little too
      const body = front ? C.hood : C.hoodSh, cuff = front ? C.hoodSh : "#8F7AB8";
      taper(k, [s0, el], 12 * u, 16 * u, body, C.line, 1.1);
      taper(k, [el, tip], 16 * u, 15 * u, body, C.line, 1.1);
      dot(k, el, 7.4 * u, body, null);
      if (front && !F) {
        line(k, [mix(s0, el, 0.15), mix(s0, el, 0.55)], C.hoodHi, 1, 0.8); // light on top of the sleeve
        line(k, [[el[0] - 3 * u, el[1] + 2 * u], [el[0], el[1] + 4 * u], [el[0] + 3 * u, el[1] + 2.4 * u]], C.hoodSh, 0.9, 0.9); // elbow fold
      }
      // ribbed cuff
      const c0 = mix(el, tip, 0.78);
      taper(k, [c0, tip], 12 * u, 11 * u, cuff, C.line, 1);
      const qx = -vy, qy = vx;
      for (let i = 1; i <= 3; i++) {
        const p = mix(c0, tip, i / 4);
        line(k, [[p[0] - qx * 4.4 * u, p[1] - qy * 4.4 * u], [p[0] + qx * 4.4 * u, p[1] + qy * 4.4 * u]], C.line2, 0.6, 0.7);
      }
      // a couple of fingertips barely peek out of the near sleeve
      if (front) {
        for (const o of [-1.6, 1.4]) dot(k, [tip[0] + vx * 2.2 * u + qx * o * u, tip[1] + vy * 2.2 * u + qy * o * u], 1.5 * u, C.skin, C.line, 0.7);
      }
      return tip;
    };
    sleeve(armBw, false);

    // ── pillow backpack: a small plush pillow behind her back, drawn before the hoodie so the hoodie overlaps its front edge ──
    {
      const pv = [Tu(28, -10), Tu(27, -20), Tu(22, -26), Tu(14, -27.5), Tu(6, -26), Tu(1.5, -20), Tu(1, -11), Tu(7, -9), Tu(15, -8.5), Tu(23, -9)];
      const body = closedSpline(pv, 3);
      fillPoly(k, body, C.pillow, C.line, 1.1);
      shade(k, body, [Tu(-2, -30), Tu(30, -30), Tu(30, -22), Tu(14, -22.5), Tu(-2, -21)], C.pillowSh, 0.55);
      if (!F) {
        for (const p of [Tu(27.5, -14), Tu(1.5, -15)]) dot(k, p, 1.3 * u, C.pillowSh, null); // pinched pillow corners
line(k, [Tu(25, -14), Tu(22, -22)], "#FFE6EE", 1, 0.8);
        const mc = Tu(14, -18);
        moon(k, mc[0], mc[1], 4.2 * u, d, C.cream, C.creamSh); // cream crescent moon
        dot(k, Tu(14, -9.2), 0.9 * u, C.hood, null);
      }
      // star charm on a short cord, swinging a little behind her
      const cs = Tu(2, -24), cx2 = cs[0] + sp.x[3] * 1.3, cy2 = cs[1] + 6 * u + sp.y[3] * 0.8;
      line(k, [cs, [cs[0] + sp.x[3] * 0.6, cs[1] + 3 * u], [cx2, cy2 - 1.5 * u]], C.line2, 0.8, 1);
      fillPoly(k, star(cx2, cy2, 3.1 * u), C.butter, C.butterLine, 0.7);
    }

    // ── legs: cream thigh-high sock, big white bunny slipper ──
    const leg = (pts, back) => {
      const [h, kn, ft] = pts;
      const ank = mix(kn, ft, 0.62);
      const sock = back ? C.creamSh : C.cream;
      taper(k, [mix(h, kn, 0.45), kn], 9.4 * u, 8.4 * u, sock, C.line, 1);
      taper(k, [kn, ank], 8.4 * u, 7.2 * u, sock, C.line, 1);
      if (!F) {
        line(k, [[ank[0] - 3 * u, ank[1] - 3 * u], [ank[0] + d * 0.5 * u, ank[1] - 2.2 * u], [ank[0] + 3 * u, ank[1] - 3.2 * u]], C.creamSh, 0.8, 0.9); // loose ankle fold
        if (!back) { const m = mix(kn, ank, 0.42); moon(k, m[0], m[1], 1.6 * u, d, C.hood, null); } // tiny moon on the near sock
      }
      // slipper: a fat white plush blob, a bit too big for her foot
      const S = (x, y) => [ft[0] + d * x * u, ft[1] + y * u];
      const shoe = closedSpline([S(-8.5, -4), S(-7.5, -9.5), S(-1, -12), S(7, -11.2), S(14, -8), S(18.6, -3.4), S(17.6, 1), S(6, 1.4), S(-6, 1.2)], 3);
      fillPoly(k, shoe, back ? C.shoeSh : C.shoe, C.line, 1.1);
      shade(k, shoe, [S(-10, -2.5), S(20, -2.5), S(20, 3), S(-10, 3)], C.shoeSh, 0.7);
      line(k, [S(2, -10.4), S(9, -9.6), S(14.5, -6.6)], "#fff", 1, 0.9); // soft light on the toe
      // two pink bunny ears on the toe cap, tiny face on the front
      fillPoly(k, [S(7.4, -10.6), S(7.6, -16.6), S(10.8, -10.8)], C.pink, C.line, 0.8);
      fillPoly(k, [S(11.4, -9.6), S(12.8, -15.2), S(15.4, -8.4)], C.pink, C.line, 0.8);
      if (!F) {
        dot(k, S(14.8, -4.6), 0.8 * u, C.line, null);
        dot(k, S(18, -2.6), 0.9 * u, C.pinkSh, null);
      }
    };
    leg(k.MP(k.legB), true);
    leg(k.MP(k.legF), false);

    // ── loose lavender shorts: a block at the hip and a short leg on each side, small bow on the near hip ──
    {
      const sh1 = (pts, back) => {
        const [h, kn] = pts;
        const hemP = mix(h, kn, 0.6);
        taper(k, [h, hemP], 15 * u, 16.5 * u, back ? C.shortsSh : C.shorts, C.line, 1.1);
        if (!back && !F) line(k, [[hemP[0] - 5 * u, hemP[1] - 1.6 * u], [hemP[0] + 5 * u, hemP[1] - 1.6 * u]], C.shortsSh, 0.8, 0.8);
      };
      sh1(k.MP(k.legB), true);
      sh1(k.MP(k.legF), false);
      fillPoly(k, [Tu(3, -10), Tu(3, 11), Tu(-9, 12.5), Tu(-9, -11.5)], C.shorts, C.line, 1.1);
      if (!F) {
        const b = Tu(-2.5, 9.5);
        fillPoly(k, [b, [b[0] - 3 * u, b[1] - 2 * u], [b[0] - 3 * u, b[1] + 2 * u]], C.pink, C.line, 0.6);
        fillPoly(k, [b, [b[0] + 3 * u, b[1] - 2 * u], [b[0] + 3 * u, b[1] + 2 * u]], C.pink, C.line, 0.6);
        dot(k, b, 0.9 * u, C.pinkSh, null);
      }
    }

    // ── oversized hoodie: dropped shoulders, rounded hem that hangs lower at the back, kangaroo pocket, zip, sleeping bunny ──
    {
      const pts = [Tu(-9, -17), Tu(-10, -4), Tu(-6, 15), Tu(10, 14), Tu(20, 13), Tu(30, 10), Tu(31, 6), Tu(31, -6), Tu(30, -11), Tu(20, -14), Tu(6, -15)];
      const body = closedSpline(pts, 4);
      fillPoly(k, body, C.hood, C.line, 1.3);
      shade(k, body, [Tu(-14, -22), Tu(40, -22), Tu(40, -5), Tu(18, -3), Tu(4, 2), Tu(-14, 6)], C.hoodSh, 0.5); // shadow on the back and under the belly
      if (!F) {
        line(k, [Tu(29, 9), Tu(21, 12.4), Tu(12, 13.2)], C.hoodHi, 1.1, 0.9); // light crescent on the front shoulder
        // ribbed hem band
        fillPoly(k, [Tu(-9, -17), Tu(-10, -4), Tu(-6, 15), Tu(-3.2, 14.6), Tu(-7, -4), Tu(-6, -16.4)], C.hoodSh, C.line2, 0.7);
        for (const b of [-12, -5, 3, 10]) line(k, [Tu(-5.5, b), Tu(-8.8, b - 0.4)], C.line2, 0.6, 0.7);
        // kangaroo pocket on the front
        fillPoly(k, [Tu(8.5, 14.6), Tu(7.6, 8), Tu(0, 6), Tu(-2.4, 13), Tu(2, 15.6)], C.hood, C.line2, 0.8);
        line(k, [Tu(7.2, 12.6), Tu(1.4, 10.6)], C.hoodSh, 0.8, 0.9);
        // fold lines
        line(k, [Tu(3, -12), Tu(5, -3), Tu(3, 3)], C.hoodSh, 0.9, 0.8);
        line(k, [Tu(15, -11), Tu(13, -5)], C.hoodSh, 0.8, 0.7);
        // zip and star pull
        line(k, [Tu(31, 7), Tu(22, 11.4), Tu(15, 12.6)], C.line2, 0.8, 0.9);
        fillPoly(k, star(...Tu(29, 6.2), 2.1 * u), C.butter, C.butterLine, 0.6);
        // sleeping bunny embroidery on the chest: cream head, two lying ears, a tiny pink z
        const eb = Tu(21, 8.4);
        fillPoly(k, [[eb[0] - d * 0.6 * u, eb[1] - 1.8 * u], [eb[0] - d * 5.6 * u, eb[1] - 3.6 * u], [eb[0] - d * 1.4 * u, eb[1] - 0.2 * u]], C.cream, C.creamSh, 0.5);
        dot(k, eb, 2.4 * u, C.cream, C.creamSh, 0.6);
        line(k, [[eb[0] + d * 0.4 * u, eb[1] - 0.2 * u], [eb[0] + d * 1.6 * u, eb[1] - 0.2 * u]], C.line2, 0.6, 0.9);
        line(k, [Tu(25, 6.5), Tu(25, 9), Tu(27, 6.6), Tu(27, 9.2)], C.pinkSh, 0.7, 0.9);
      }
    }

    // ── near arm over the hoodie, then the pack strap over the shoulder ──
    sleeve(armFw, true);
    fillPoly(k, [Tu(31, -9.5), Tu(30, 9.6), Tu(26.4, 10.2), Tu(27.6, -10.2)], C.hoodSh, C.line, 0.8);
    line(k, [Tu(30.4, -6), Tu(29.4, 6)], C.hood, 0.7, 0.6);

    // ── neck, back hair, hood shell, collar roll ──
    fillPoly(k, [Hp(-0.1, 0.6), Hp(0.5, 0.7), Hp(0.55, 1.5), Hp(-0.25, 1.5)], C.skinSh, C.line, 0.9);
    {
      const hsx = sp.x[2] * 0.5, hsy = sp.y[2] * 0.4;
      const back = [Hp(-0.5, -0.95), Hp(-1.15, -0.6), Hp(-1.42, 0.05), Hp(-1.5, 0.85), [Hp(-1.78, 1.55)[0] + hsx, Hp(-1.78, 1.55)[1] + hsy], Hp(-1.38, 1.5),
        [Hp(-1.3, 1.95)[0] + hsx * 0.8, Hp(-1.3, 1.95)[1] + hsy], Hp(-0.95, 1.6), [Hp(-0.75, 1.9)[0] + hsx * 0.6, Hp(-0.75, 1.9)[1] + hsy], Hp(-0.4, 1.2), Hp(-0.3, 0.4), Hp(-0.3, -0.4)];
      fillPoly(k, back, C.hair, C.hairLine, 1.1);
      shade(k, back, [Hp(-2, 0.5), Hp(-0.2, 0.5), Hp(-0.2, 2.2), Hp(-2, 2.2)], C.hairSh, 0.65);
      line(k, [Hp(-1.0, -0.2), Hp(-1.25, 0.6), Hp(-1.2, 1.2)], C.hairHi, 0.9, 0.8);
    }
    {
      // collar: the hood bunched on the upper back
      fillPoly(k, closedSpline([Tu(27, -13), Tu(35, -14), Tu(37.5, -4), Tu(33, 3), Tu(27.5, -3)], 3), C.hood, C.line, 1.1);
      // hood shell, a big rounded dome with a darker lower back
      const shell = ell(-0.2, -0.2, 1.25, 1.2, 28, 0.025);
      fillPoly(k, shell, C.hood, C.line, 1.3);
      shade(k, shell, ell(-0.7, 0.35, 1.1, 1.1, 18), C.hoodSh, 0.55);
      if (!F) line(k, [Hp(-0.9, -1.0), Hp(-0.3, -1.3), Hp(0.4, -1.2)], C.hoodHi, 1, 0.8);
      // the deep-mint strip where the hair meets the hood
      if (!F) line(k, [Hp(-1.3, 0.55), Hp(-1.2, 0.9)], C.hairSh, 1.6, 0.8);
    }

    // ── head and face (inside the hood opening) ──
    {
      const face = closedSpline([Hp(-0.2, -0.95), Hp(0.6, -0.9), Hp(1.0, -0.4), Hp(1.08, 0.1), Hp(1.0, 0.5), Hp(0.82, 0.88), Hp(0.4, 1.06), Hp(-0.1, 0.92), Hp(-0.4, 0.3), Hp(-0.4, -0.5)], 3);
      fillPoly(k, face, C.skin, C.line, 1.1);
      shade(k, face, [Hp(-0.6, 0.78), Hp(1.2, 0.7), Hp(1.2, 1.3), Hp(-0.6, 1.3)], C.skinSh, 0.55); // shadow under the chin
      const hurt = !!stunned;
      const ph = now % 9;
      const yawn = calm && ph > 8.0 && ph < 8.9;
      const bt = (now % 4) / 4;
      let open = bt < 0.05 ? 0.15 : bt < 0.1 ? 0.55 : 1; // a slow blink every few seconds
      if (yawn || hurt) open = 0.1;
      if (!F) {
        // blush
        ctx.save(); ctx.globalAlpha = hurt ? 0.85 : 0.55;
        ctx.beginPath(); const bc = Hp(0.38, 0.36); ctx.ellipse(bc[0], bc[1], R * 0.22, R * 0.12, 0, 0, TAU);
        ctx.fillStyle = C.blush; ctx.fill(); ctx.restore();
        // eye: white, violet iris cut by a heavy lid, one small highlight
        const ec = Hp(0.45, 0.05 + 0.04);
        const ew = R * 0.25, eh = R * 0.2 * open;
        ctx.save();
        ctx.beginPath(); ctx.ellipse(ec[0], ec[1], ew, Math.max(eh, 0.01), 0, 0, TAU);
        ctx.fillStyle = C.eyeW; ctx.fill();
        ctx.clip();
        const ic = Hp(0.5, 0.08);
        ctx.beginPath(); ctx.arc(ic[0], ic[1], R * 0.2, 0, TAU); ctx.fillStyle = C.iris; ctx.fill();
        ctx.fillStyle = C.irisDk; ctx.fillRect(ic[0] - R * 0.2, ic[1] - R * 0.2, R * 0.4, R * 0.2);
        ctx.beginPath(); const hl = Hp(0.42, 0.02); ctx.arc(hl[0], hl[1], Math.max(0.5, R * 0.05), 0, TAU); ctx.fillStyle = "#fff"; ctx.fill();
        ctx.restore();
        // heavy upper lid line, drooping toward the outer corner, and a few lashes on the outer half
        const lidDrop = (1 - open) * 0.1;
        line(k, [Hp(0.17, 0.08 + lidDrop), Hp(0.4, -0.11 + lidDrop), Hp(0.7, -0.04 + lidDrop)], C.line, Math.max(1.1, R * 0.08), 1);
        line(k, [Hp(0.2, 0.09), Hp(0.1, 0.17)], C.line, 0.7, 0.9);
        line(k, [Hp(0.3, 0.2), Hp(0.62, 0.2)], C.line2, 0.5, 0.6);
        // brows: thin and relaxed; raised for a yawn, angled in and down when she is disturbed
        const by = yawn ? -0.42 : -0.3;
        if (hurt) line(k, [Hp(0.26, -0.42), Hp(0.7, -0.2)], C.hairLine, 1, 0.95);
        else line(k, [Hp(0.28, by - 0.02), Hp(0.66, by + 0.04)], C.hairLine, 0.9, 0.9);
        // mouth: a small flat line, an open oval when she yawns, a small kink when disturbed
        const mo = Hp(0.6, 0.52);
        if (yawn) { ctx.beginPath(); ctx.ellipse(mo[0], mo[1], R * 0.1, R * 0.13, 0, 0, TAU); ctx.fillStyle = "#D9798F"; ctx.fill(); edge(k, C.line, 0.7); }
        else if (hurt) line(k, [Hp(0.5, 0.56), Hp(0.6, 0.5), Hp(0.7, 0.56)], C.line, 0.8, 1);
        else line(k, [Hp(0.5, 0.52), Hp(0.68, 0.52)], C.line, 0.8, 0.95);
        dot(k, Hp(0.96, 0.18), 0.45, C.skinSh, null); // the tiniest nose
      }
    }

    // ── hood rim: a fluffy cream ring round the face opening ──
    {
      const outer = ell(0.35, 0.12, 0.86, 0.94, 30, 0.035), inner = ell(0.35, 0.12, 0.64, 0.72, 24);
      ctx.save();
      pathOf(ctx, [Hp(-3, -4), Hp(4, -4), Hp(4, 0.72), Hp(-3, 0.72)]);
      ctx.clip(); // the lining frames the top and sides of the face and stays open under the chin
      ctx.beginPath();
      ctx.moveTo(outer[0][0], outer[0][1]);
      for (let i = 1; i < outer.length; i++) ctx.lineTo(outer[i][0], outer[i][1]);
      ctx.closePath();
      ctx.moveTo(inner[0][0], inner[0][1]);
      for (let i = 1; i < inner.length; i++) ctx.lineTo(inner[i][0], inner[i][1]);
      ctx.closePath();
      ctx.fillStyle = k.col(C.cream);
      ctx.fill("evenodd");
      ctx.lineJoin = "round"; ctx.lineWidth = 1.1; ctx.strokeStyle = F ? "#fff" : C.line; ctx.stroke();
      ctx.restore();
    }

    // ── messy bangs (five uneven tufts), a loose side lock, the ahoge ──
    {
      const top = (a) => 0.12 - 0.72 * Math.sqrt(Math.max(0.02, 1 - Math.pow((a - 0.35) / 0.66, 2)));
      const lens = [0.26, 0.4, 0.24, 0.34, 0.2];
      const bangs = [Hp(0.0, top(0.0) - 0.1)];
      for (let i = 0; i < 5; i++) {
        const a0 = 0.0 + i * 0.2;
        bangs.push(Hp(a0 + 0.1, top(a0 + 0.1) + lens[i]));
        bangs.push(Hp(a0 + 0.2, top(a0 + 0.2) + lens[i] * 0.3));
      }
      bangs.push(Hp(1.02, top(0.98) - 0.12), Hp(0.5, -1.0));
      fillPoly(k, bangs, C.hair, C.hairLine, 1);
      shade(k, bangs, [Hp(-0.2, -0.3), Hp(1.2, -0.3), Hp(1.2, 0.8), Hp(-0.2, 0.8)], C.hairSh, 0.55);
      line(k, [Hp(0.05, -0.62), Hp(0.45, -0.8), Hp(0.9, -0.6)], C.hairHi, 0.9, 0.85);
      // loose strand framing the cheek
      const lx = sp.x[2] * 0.3;
      taper(k, [Hp(0.02, 0.3), [Hp(0.08, 0.7)[0] + lx, Hp(0.08, 0.7)[1]], [Hp(0.14, 1.15)[0] + lx * 1.4, Hp(0.14, 1.15)[1] + sp.y[2] * 0.3]], 0.18 * R, 0.06 * R, C.hair, C.hairLine, 0.8, 4);
      // the tuft that sticks up
      const ax = sp.x[2] * 0.5;
      taper(k, [Hp(0.5, -0.9), Hp(0.58, -1.2), [Hp(0.9, -1.38)[0] + ax, Hp(0.9, -1.38)[1]], [Hp(1.12, -1.2)[0] + ax, Hp(1.12, -1.2)[1]]], 2.6 * u, 0.9 * u, C.hair, C.hairLine, 0.8, 4);
    }

    // ── near bunny ear: last big shape, drapes over the shoulder ──
    ear(earPath(nearBase, [[0, 0], [0.5, 10], [2.5, 21], [5, 32]], 1.3, true), true);

    // ── small accessories: crescent moon hair clip ──
    {
      const c = Hp(-0.05, -0.86);
      moon(k, c[0], c[1], 3 * u, d, C.moonClip, C.line);
    }

    // ── a little "z" drifts up now and then while she just stands there dozing (cosmetic only) ──
    if (!F && calm) {
      const zp = (now % 6) / 6;
      if (zp < 0.4) {
        const t = zp / 0.4, p = Hp(1.2 + t * 0.7, -1.9 - t * 1.2);
        ctx.save();
        ctx.globalAlpha = Math.sin(Math.PI * t) * 0.9;
        ctx.fillStyle = C.hood; ctx.strokeStyle = C.line; ctx.lineWidth = 0.6;
        ctx.font = "bold " + Math.round(Math.max(6, 8.5 * u * 1.1)) + "px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.strokeText("z", p[0], p[1]); ctx.fillText("z", p[0], p[1]);
        ctx.restore();
      }
    }
  }

  MW.Mochi = { draw, PALETTE: C };
})(typeof globalThis !== "undefined" ? globalThis : this);