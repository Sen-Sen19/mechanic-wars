// Mechanic Wars - Mochi art (render only, never touches the sim).
// Mochi - The Sleepy Dreamer (REDESIGN from the new character sheet): a petite adult woman who always looks like she just
// woke up. Long wavy mint hair, a lavender bunny-ear hood with big floppy ears (pink inside) and a little white bunny clip,
// an oversized off-the-shoulder lavender jacket over a white bunny camisole, lavender shorts with pink ribbon ties,
// white thigh-high socks, fluffy white bunny slippers with sleeping faces, and a big butter-yellow crescent-moon pillow
// backpack with a sleepy face and a star charm. No armor, no glow, no magic: softness comes from the shapes.
// Visual only; no skills or weapons are drawn here.
// Called from character_art.js DETAIL() for id === "mochi".
// k = the shared rig state from character_art.js, e = a few precomputed values (see DETAIL).
// Cosmetic state (ear / hair springs, charm swing, idle timer, z particles) lives in k.A.mochi and is advanced once per
// drawn frame (the hit-flash pass draws her twice).
(function (g) {
  const MW = (g.MW = g.MW || {});
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }; // steady 0..1 noise

  // Palette from the character sheet.
  const C = {
    line: "#5B4A86", line2: "#7E6AA8",                                   // outer outline / inner detail lines (never pure black)
    hair: "#A8E6CF", hairSh: "#72BFA7", hairHi: "#D4F5E6", hairLine: "#4E9A82",
    hood: "#C9B6E8", hoodSh: "#A18AC8", hoodHi: "#E3D7F5", hoodDeep: "#9B83C9",
    cream: "#FFF0D5", creamSh: "#EAD6B4",
    pink: "#F3B9CB", pinkSh: "#E19BB4",
    skin: "#FCE3D6", skinSh: "#EBBFAE", blush: "#F7A8B8",
    eye: "#9B83C9", iris: "#7A63AE", eyeWhite: "#FAF6FF",
    shorts: "#9D8CB9", shortsSh: "#7F6F9E",
    cami: "#F5F1F7", camiSh: "#DCD3E8",
    sock: "#F5F1F7", sockSh: "#D8D0E3", sockBand: "#C9B6E8",
    shoe: "#F5F1F7", shoeSh: "#D8D0E3",
    moon: "#FFF0D5", moonSh: "#F3DDB0", moonLine: "#D9B766", butter: "#FFD36B", butterLine: "#E2A93A",
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
    if (edgeColor !== null) edge(k, edgeColor || C.line, lw);
  }
  function fillEll(k, p, rx, ry, rot, fill, edgeColor, lw) {
    const { ctx } = k;
    ctx.beginPath();
    ctx.ellipse(p[0], p[1], Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU);
    ctx.fillStyle = k.col(fill);
    ctx.fill();
    if (edgeColor !== null) edge(k, edgeColor || C.line, lw);
  }
  const cr = (a, b, c2, d2, t, t2, t3) => 0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d2) * t2 + (-a + 3 * b - 3 * c2 + d2) * t3);
  function spline(pts, n) { // Catmull-Rom, n samples per segment (open)
    if (pts.length < 3) return pts.slice();
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
      for (let j = 0; j < n; j++) { const t = j / n, t2 = t * t, t3 = t2 * t; out.push([cr(p0[0], p1[0], p2[0], p3[0], t, t2, t3), cr(p0[1], p1[1], p2[1], p3[1], t, t2, t3)]); }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  function closedSpline(pts, n) { // Catmull-Rom through a closed loop
    const m = pts.length, out = [];
    for (let i = 0; i < m; i++) {
      const p0 = pts[(i - 1 + m) % m], p1 = pts[i], p2 = pts[(i + 1) % m], p3 = pts[(i + 2) % m];
      for (let j = 0; j < n; j++) { const t = j / n, t2 = t * t, t3 = t2 * t; out.push([cr(p0[0], p1[0], p2[0], p3[0], t, t2, t3), cr(p0[1], p1[1], p2[1], p3[1], t, t2, t3)]); }
    }
    return out;
  }
  // ribbon of changing width: wf(t) gives the width (px) at t = 0..1 along the points (ears, sleeves, hair, legs)
  function ribbon(k, pts, wf, fill, edgeColor, lw) {
    const n = pts.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, n - 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      const w = wf(i / (n - 1)) / 2;
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
  function dot(k, p, r, fill, edgeColor, lw) { fillEll(k, p, r, r, 0, fill, edgeColor, lw); }
  // crescent moon as ONE closed polygon: outer disc (c0, R) with a bite (c1, r) taken out of it. n = samples per arc.
  function crescentPoly(c0, R, c1, r, n) {
    const dx = c1[0] - c0[0], dy = c1[1] - c0[1], dd = Math.hypot(dx, dy) || 1;
    const phi = Math.atan2(dy, dx), psi = phi + Math.PI;
    const al = Math.acos(clamp((R * R + dd * dd - r * r) / (2 * R * dd), -1, 1));
    const be = Math.acos(clamp((r * r + dd * dd - R * R) / (2 * r * dd), -1, 1));
    const pts = [];
    for (let i = 0; i <= n; i++) { const a = phi + al + ((TAU - 2 * al) * i) / n; pts.push([c0[0] + Math.cos(a) * R, c0[1] + Math.sin(a) * R]); }
    for (let i = 0; i <= n; i++) { const a = psi + be - (2 * be * i) / n; pts.push([c1[0] + Math.cos(a) * r, c1[1] + Math.sin(a) * r]); }
    return pts;
  }
  // a tiny sleeping-bunny head (round face + two ears). Used on the sleeve patch, the camisole print and the hair clip.
  function bunnyHead(k, p, r, fill, edgeColor, face) {
    for (const o of [-1, 1]) {
      fillEll(k, [p[0] + o * r * 0.52, p[1] - r * 1.0], r * 0.34, r * 0.9, o * 0.16, fill, edgeColor, 0.6);
      if (face && !k.isFlash) fillEll(k, [p[0] + o * r * 0.52, p[1] - r * 0.95], r * 0.16, r * 0.58, o * 0.16, C.pink, null);
    }
    fillEll(k, p, r, r * 0.88, 0, fill, edgeColor, 0.6);
    if (face && !k.isFlash) {
      for (const o of [-1, 1]) line(k, [[p[0] + o * r * 0.55 - r * 0.2, p[1] - r * 0.05], [p[0] + o * r * 0.55, p[1] + r * 0.12], [p[0] + o * r * 0.55 + r * 0.2, p[1] - r * 0.05]], C.line, 0.55, 1);
      dot(k, [p[0], p[1] + r * 0.32], r * 0.14, C.pinkSh, null);
    }
  }
  // a small ribbon bow: two loops and a knot. rot rotates it.
  function bow(k, p, s, fill, knot, rot) {
    const ca = Math.cos(rot || 0), sa = Math.sin(rot || 0), Q = (x, y) => [p[0] + x * ca - y * sa, p[1] + x * sa + y * ca];
    fillPoly(k, [Q(0, 0), Q(-s * 1.7, -s * 0.95), Q(-s * 1.4, 0.05 * s), Q(-s * 1.7, s * 0.95)], fill, C.line, 0.6);
    fillPoly(k, [Q(0, 0), Q(s * 1.7, -s * 0.95), Q(s * 1.4, 0.05 * s), Q(s * 1.7, s * 0.95)], fill, C.line, 0.6);
    dot(k, p, s * 0.5, knot, C.line, 0.5);
  }
  function star(k, p, r, fill, edgeColor) {
    const pts = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * TAU) / 10, rr = i % 2 ? r * 0.45 : r; pts.push([p[0] + Math.cos(a) * rr, p[1] + Math.sin(a) * rr]); }
    fillPoly(k, pts, fill, edgeColor, 0.8);
  }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  function legAt(pts, f) { // point at fraction f (0..1) of the hip > knee > foot length
    const l1 = dist(pts[0], pts[1]), l2 = dist(pts[1], pts[2]), s = clamp(f, 0, 1) * (l1 + l2);
    return s <= l1 ? mix(pts[0], pts[1], s / (l1 || 1)) : mix(pts[1], pts[2], (s - l1) / (l2 || 1));
  }
  function legSub(pts, f0, f1) {
    const l1 = dist(pts[0], pts[1]), fk = l1 / (l1 + dist(pts[1], pts[2]) || 1);
    const out = [legAt(pts, f0)];
    if (f0 < fk && f1 > fk) out.push(pts[1]);
    out.push(legAt(pts, f1));
    return out;
  }

  // Ear rest shapes (u, forward positive, y down), measured from the ear base on the hood. Big, soft and floppy: the base is
  // rigid for the first 6u, then the ear bends and hangs. Near ear drapes down the side of the hood, far ear flops backward.
  const EAR_NEAR = [[0, 0], [1, -4], [-1, -7], [-5, -7], [-9, -2], [-11, 7], [-11, 17], [-9, 26]];
  const EAR_FAR = [[0, 0], [-3, -5], [-8, -6.5], [-14, -2], [-17, 6], [-18, 16], [-17, 25]];

  // ── cosmetic state: once per drawn frame ──
  function update(k) {
    const A = k.A, S = MW.STATE, u = k.H / 100;
    let c = A.mochi;
    if (!c) {
      const chain = (n) => ({ x: new Array(n).fill(0), y: new Array(n).fill(0) });
      c = A.mochi = { t: -1, idle: false, idleT: 0, zs: [], zNext: 5.5, zCount: 0, ear: [chain(EAR_NEAR.length), chain(EAR_FAR.length)], hair: chain(4), charm: 0, hurt: false };
    }
    if (c.t >= 0 && Math.abs(k.now - c.t) <= 0.004) return c;
    const dt = c.t < 0 ? 1 / 60 : clamp(k.now - c.t, 0.001, 0.05);
    c.t = k.now;
    const vx = clamp(k.vx || 0, -9, 9), vy = clamp(k.vy || 0, -16, 16);
    c.idle = k.st === S.IDLE && Math.abs(vx) < 0.4 && !k.attacking && (!k.f || k.f.grounded !== false);
    c.idleT = c.idle ? c.idleT + dt : 0;
    // ears: trail opposite to the run (about 1.8 x speed on the tip), lift when falling, drop when rising, bounce on landing
    for (let e = 0; e < 2; e++) {
      const ch = c.ear[e], n = ch.x.length;
      for (let i = 2; i < n; i++) {
        const w = i / (n - 1);
        const tx = clamp(-vx * 1.8 * w * w, -9 * u, 9 * u) + Math.sin(k.now * 1.3 + e * 2 + i * 0.5) * 0.6 * w * u;
        const ty = -Math.max(0, vy) * 0.5 * w + Math.max(0, -vy) * 0.3 * w + Math.sin(k.now * 22 + i) * (k.A.land || 0) * 1.6 * w;
        const rate = 0.24 - w * 0.1;
        ch.x[i] += (tx - ch.x[i]) * rate;
        ch.y[i] += (ty - ch.y[i]) * rate;
      }
    }
    // hair (ahoge, side locks, flipped ends): same spring, never more than 2u from rest
    for (let i = 0; i < 4; i++) {
      const w = (i + 1) / 4;
      c.hair.x[i] += (clamp(-vx * 0.4 * w, -2 * u, 2 * u) + Math.sin(k.now * 2.2 + i) * 0.4 * u - c.hair.x[i]) * 0.2;
      c.hair.y[i] += (clamp(-vy * 0.18 * w, -2 * u, 2 * u) - c.hair.y[i]) * 0.2;
    }
    // star charm: swings up to 8 degrees and lags like the ears
    c.charm += (clamp(-vx * 0.02, -0.14, 0.14) + Math.sin(k.now * 2.4) * 0.025 - c.charm) * 0.18;
    // idle z: one small z rises from her head every 5 to 7 s while idling; never while moving or hurt
    if (c.idle) {
      c.zNext -= dt;
      if (c.zNext <= 0) { c.zs.push({ age: 0, ph: hash(c.zCount) }); c.zNext = 5 + 2 * hash(++c.zCount + 7); }
    } else { c.zNext = Math.max(c.zNext, 2); if (k.st !== S.IDLE) c.zs.length = 0; }
    for (const z of c.zs) z.age += dt * 60;
    c.zs = c.zs.filter((z) => z.age < 40);
    return c;
  }

  function draw(k, e) {
    const { ctx, d, now } = k;
    const F = k.isFlash;
    const { shW, hipW, hcw, armBw, armFw, windU, strike, stunned } = e;
    const H = k.H, u = H / 100, torL = k.torL, R = k.hr, A = k.A;
    const c = update(k);

    // torso frame: T(a, b) = a along the spine (0 = hip, torL = shoulders), b toward the front (both in px); Tu takes u
    let ux = shW[0] - hipW[0], uy = shW[1] - hipW[1];
    const tl = Math.hypot(ux, uy) || 1;
    ux /= tl; uy /= tl;
    let nx = -uy, ny = ux;
    if (nx * d < 0) { nx = -nx; ny = -ny; }
    const T = (a, b) => [hipW[0] + ux * a + nx * b, hipW[1] + uy * a + ny * b];
    const Tu = (a, b) => T(a * u, b * u);
    const breath = 1 + 0.02 * (0.5 + 0.5 * Math.sin(now * 1.57)) * (c.idle ? 1 : 0.4); // torso 1.00 > 1.02 over about 4 s

    // head frame: Hp(a, b) = a forward, b down (in head-radius units), tilted about 4 degrees toward the facing direction
    const drowsy = clamp((c.idleT - 5) / 1.5, 0, 1); // after about 5 s of idling the head dips and the lids drop
    const hx = hcw[0], hy = hcw[1] + 1.5 * u * drowsy;
    const th = d * (0.07 + 0.04 * drowsy), cs = Math.cos(th), sn = Math.sin(th);
    const Hp = (a, b) => { const X = d * R * a, Y = R * b; return [hx + X * cs - Y * sn, hy + X * sn + Y * cs]; };

    // first frame of a hit: soft flecks fly off her (lavender, cream, pink)
    if (stunned && !c.hurt && k.spawn && !F) {
      const cols = ["#C9B6E8", "#FFF0D5", "#F3B9CB"];
      for (let i = 0; i < 8; i++) k.spawn(A.ox + hcw[0] + (Math.random() - 0.5) * 18, A.oy + hcw[1] + 6 + Math.random() * 18, (Math.random() - 0.5) * 3.6, -Math.random() * 2 - 0.3, cols[i % 3], 20, 2.4);
    }
    c.hurt = stunned;

    // expression: stunned = annoyed, otherwise sleepy; a rare yawn and an even rarer small smile while idling
    const ph8 = c.idleT % 8;
    const yawn = c.idle && c.idleT > 6 ? Math.sin(Math.PI * clamp((ph8 - 6.4) / 1.5, 0, 1)) : 0;
    const smile = c.idle && c.idleT > 3 && ph8 > 3 && ph8 < 4 && !yawn;
    const cyc = now % 4.2;
    const blink = cyc < 0.1 ? Math.sin((Math.PI * cyc) / 0.1) : 0; // slow lid close over about 6 frames every 3 to 5 s

    // ── 1) bunny ears: big, soft, floppy. Rounded tips, a wide pink inside, a fold crease ──
    const ear = (idx, base, rest, front) => {
      const ch = c.ear[idx], pts = [];
      for (let i = 0; i < rest.length; i++) {
        let sx = ch.x[i];
        if (front) sx = d * Math.min(d * sx, 3 * u); // the near ear never crosses the face opening
        pts.push([base[0] + d * rest[i][0] * u + sx, base[1] + rest[i][1] * u + ch.y[i]]);
      }
      const sm = spline(pts, 4), n = sm.length;
      const wf = (t) => {
        let w = (t < 0.45 ? lerp(8, 10.5, t / 0.45) : lerp(10.5, 9, (t - 0.45) / 0.55)) * u;
        if (t > 0.88) w *= Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.88) / 0.12, 2))); // round tip
        return Math.max(w, 0.05);
      };
      ribbon(k, sm, wf, front ? C.hood : C.hoodSh, C.line, 1.1);
      const i0 = Math.floor(n * 0.1), i1 = Math.floor(n * 0.9);
      ribbon(k, sm.slice(i0, i1), (t) => wf(0.1 + t * 0.8) * 0.56, front ? C.pink : C.pinkSh, null);
      if (!F) {
        const m = sm[Math.floor(n * 0.45)], m2 = sm[Math.floor(n * 0.45) + 1];
        const tx = m2[0] - m[0], ty = m2[1] - m[1], l = Math.hypot(tx, ty) || 1, qx = -ty / l, qy = tx / l;
        line(k, [[m[0] - qx * 4 * u, m[1] - qy * 4 * u], [m[0] + qy * 0.9 * u, m[1] - qx * 0.9 * u], [m[0] + qx * 4 * u, m[1] + qy * 4 * u]], C.line2, 0.7, 0.7); // fold crease
        line(k, sm.slice(i0 + 1, i1 - 3).map((p) => [p[0] - d * 0.3 * u, p[1]]), front ? C.hoodHi : C.hood, 0.9, 0.7);
      }
    };
    ear(1, Hp(-0.7, -1.2), EAR_FAR, false);

    // ── 2) far arm and sleeve (hand hidden) ──
    const sleeve = (pts, front) => {
      const [s0, el, wr] = pts;
      const vx = wr[0] - el[0], vy = wr[1] - el[1], len = Math.hypot(vx, vy) || 1;
      const tx = vx / len, ty = vy / len, qx = -ty, qy = tx;
      const start = mix(s0, el, clamp((3 * u) / (dist(s0, el) || 1), 0, 0.6)); // dropped shoulder: starts 3u below the joint
      const raised = el[1] < s0[1] + 2 * u && (windU > 0.2 || strike);
      const slide = raised ? 4 * u : 0; // an arm held up lets the sleeve slide back about 4u
      const end = [wr[0] + tx * (8 * u - slide), wr[1] + ty * (8 * u - slide)];
      const wf = (t) => (t < 0.5 ? lerp(12, 17, t / 0.5) : lerp(17, 11, (t - 0.5) / 0.5)) * u; // 12u shoulder, 17u puff, 11u cuff
      ribbon(k, spline([start, el, wr, end], 5), wf, front ? C.hood : C.hoodSh, C.line, 1.1);
      if (!F && front) line(k, spline([start, el, wr], 5).map((p) => [p[0] - qx * 3.4 * u, p[1] - qy * 3.4 * u]), C.hoodHi, 1, 0.8);
      if (front) { // white bunny patch on the upper sleeve (signature detail)
        const pc = mix(start, el, 0.45);
        bunnyHead(k, [pc[0] - qx * 0.5 * u, pc[1] - qy * 0.5 * u + 1.4 * u], 2.9 * u, "#FFFFFF", C.line2, true);
      }
      const cs0 = [end[0] - tx * 5 * u, end[1] - ty * 5 * u]; // ribbed cuff, 5u tall
      ribbon(k, [cs0, end], () => 11 * u, front ? C.hoodSh : C.shortsSh, C.line, 1);
      if (!F) {
        for (const o of [1.4, 3.2]) line(k, [[cs0[0] + tx * o * u - qx * 5 * u, cs0[1] + ty * o * u - qy * 5 * u], [cs0[0] + tx * o * u + qx * 5 * u, cs0[1] + ty * o * u + qy * 5 * u]], C.cami, 0.8, 0.9); // two white stripes on the cuff
      }
      if (front) for (const q of [-3.2, 0, 3.2]) dot(k, [end[0] + tx * 1.6 * u + qx * q * u, end[1] + ty * 1.6 * u + qy * q * u], 1.25 * u, C.skin, C.line, 0.6); // fingertips peek out
      return end;
    };
    sleeve(armBw, false);

    // ── 3) crescent-moon pillow backpack with a sleepy face, and the star charm (behind the torso) ──
    {
      const c0 = Tu(14, -25), c1 = Tu(23.5, -16.5), RR = 12.4 * u, rr = 10 * u;
      const moon = crescentPoly(c0, RR, c1, rr, 18);
      fillPoly(k, moon, C.moon, C.line, 1.1);
      if (!F) {
        ctx.save(); pathOf(ctx, moon); ctx.clip();
        ctx.beginPath(); ctx.arc(c1[0], c1[1], rr + 1.6 * u, 0, TAU); ctx.strokeStyle = C.moonSh; ctx.lineWidth = 3.4 * u; ctx.stroke(); // soft shade along the inner curve
        ctx.beginPath(); ctx.arc(c0[0], c0[1], RR - 0.4 * u, Math.PI * 0.15, Math.PI * 0.85); ctx.strokeStyle = C.moonSh; ctx.lineWidth = 1.6 * u; ctx.globalAlpha = 0.7; ctx.stroke();
        ctx.restore();
        // sleepy face on the fat part of the moon: closed eyes, a tiny smile, two blush dots
        const fx = c0[0] + (c0[0] - c1[0]) * 0.22, fy = c0[1] + (c0[1] - c1[1]) * 0.22;
        for (const o of [-1, 1]) line(k, [[fx + o * 3.3 * u - 1.5 * u, fy - 0.4 * u], [fx + o * 3.3 * u, fy + 0.7 * u], [fx + o * 3.3 * u + 1.5 * u, fy - 0.4 * u]], C.line, 0.8, 1);
        line(k, [[fx - 1 * u, fy + 2.8 * u], [fx, fy + 3.5 * u], [fx + 1 * u, fy + 2.8 * u]], C.line, 0.7, 1);
        ctx.save(); ctx.globalAlpha = 0.75;
        for (const o of [-1, 1]) fillEll(k, [fx + o * 5.4 * u, fy + 2.4 * u], 1.5 * u, 1 * u, 0, C.blush, null);
        ctx.restore();
        line(k, [Tu(10, -35.6), Tu(5, -33), Tu(2, -29)], "#FFFFFF", 1, 0.8); // highlight on the back curve
      }
      // star charm on a lavender ribbon, hanging from the lower tip of the moon
      const base = Tu(2.4, -25), ang = c.charm, cl = 11 * u;
      const tip = [base[0] + Math.sin(ang) * cl - d * 0.4 * u, base[1] + Math.cos(ang) * cl];
      ribbon(k, [base, [(base[0] + tip[0]) / 2 + d * 0.5 * u, (base[1] + tip[1]) / 2], tip], () => 1.8 * u, C.hood, C.line, 0.6);
      star(k, [tip[0], tip[1] + 2.4 * u], 3.1 * u, C.butter, C.butterLine);
    }

    // ── 4-5) legs: skin gap, white thigh-high socks with a lavender band, fluffy bunny slippers ──
    const legBase = (pts, back) => {
      const len = (dist(pts[0], pts[1]) + dist(pts[1], pts[2])) || 1;
      const hipH = -pts[0][1] / u; // hip height above the ground in u (feet origin is y = 0)
      const f1 = clamp((hipH - 23) / (len / u), 0.2, 0.62); // shorts hem at 23u
      const f2 = f1 + 3 / (len / u);                       // a thin strip of skin, then the socks
      const sock = back ? C.sockSh : C.sock;
      ribbon(k, legSub(pts, 0, 1), () => 7.4 * u, C.skin, C.line, 1);
      ribbon(k, legSub(pts, f2, 0.99), (t) => lerp(9.4, 6.8, t) * u, sock, C.line, 1);
      ribbon(k, legSub(pts, f2, f2 + 3 / (len / u)), () => 9.9 * u, back ? C.hoodSh : C.sockBand, C.line, 0.8); // lavender band at the top
      const ft = pts[2], kn = pts[1];
      if (!F) { // loose, wrinkled ankle: two small fold lines, and a tiny lavender bunny on the thigh
        const a = legAt(pts, 1 - 14 / (len / u)), tx = ft[0] - kn[0], ty = ft[1] - kn[1], l = Math.hypot(tx, ty) || 1, qx = -ty / l, qy = tx / l;
        for (const o of [0, 2.4]) line(k, [[a[0] - qx * 3.4 * u + (tx / l) * o * u, a[1] - qy * 3.4 * u + (ty / l) * o * u], [a[0] + qx * 3.4 * u + (tx / l) * o * u, a[1] + qy * 3.4 * u + (ty / l) * o * u]], back ? C.line2 : C.sockSh, 0.7, 0.9);
        if (!back) bunnyHead(k, legAt(pts, f2 + 0.2), 1.5 * u, C.sockBand, null, false);
      }
      // slipper: oversized, 26u x 12u, a fluffy white bunny face with a sleeping expression
      const sl = (a, b) => [ft[0] + d * a * u, ft[1] + b * u];
      for (const [a, b, tilt] of [[8.2, -10.2, -0.16], [12.6, -9.2, 0.1]]) { // two tall ears, pink inside, behind the toe
        const p = sl(a, b);
        fillEll(k, [p[0], p[1] - 3.4 * u], 2.1 * u, 4.8 * u, d * tilt, back ? C.shoeSh : C.shoe, C.line, 0.9);
        if (!F) fillEll(k, [p[0], p[1] - 3.2 * u], 1 * u, 3.2 * u, d * tilt, C.pink, null);
      }
      const shoe = closedSpline([sl(-8, -0.4), sl(-9.4, -5), sl(-5, -10.8), sl(1, -12.4), sl(7, -11.6), sl(13, -9.8), sl(18.4, -4.6), sl(17, -0.2), sl(5, 1)], 5);
      fillPoly(k, shoe, back ? C.shoeSh : C.shoe, C.line, 1.1);
      if (!F) {
        ctx.save(); pathOf(ctx, shoe); ctx.clip(); // shadow on the lower part
        fillPoly(k, [sl(-12, -2.6), sl(22, -2.8), sl(22, 4), sl(-12, 4)], back ? "#C4BBD2" : C.shoeSh, null);
        ctx.restore();
        line(k, [sl(10.4, -9.2), sl(14, -7.6)], "#FFFFFF", 1, 0.8); // round highlight on the toe
        line(k, [sl(-4, -9.4), sl(-0.4, -11)], "#FFFFFF", 0.9, 0.6);
        // sleeping face: closed eye, pink blush, tiny nose
        line(k, [sl(11.2, -6.4), sl(12.8, -5.4), sl(14.4, -6.4)], C.line, 0.85, 1);
        ctx.save(); ctx.globalAlpha = 0.75; fillEll(k, sl(9.4, -3.6), 1.6 * u, 1 * u, 0, C.blush, null); ctx.restore();
        dot(k, sl(16.8, -3.4), 0.85 * u, C.pinkSh, null);
      }
    };
    const shortsLeg = (pts, back) => {
      const len = (dist(pts[0], pts[1]) + dist(pts[1], pts[2])) || 1;
      const f1 = clamp((-pts[0][1] / u - 23) / (len / u), 0.2, 0.62);
      ribbon(k, legSub(pts, 0, f1), (t) => lerp(12, 14, t) * u, back ? C.shortsSh : C.shorts, C.line, 1.1); // loose dusty-lavender shorts
      if (!F) { const hm = legAt(pts, f1); line(k, [[hm[0] - 6.6 * u, hm[1]], [hm[0] + 6.6 * u, hm[1]]], back ? C.line : C.shortsSh, 1, 0.8); }
    };
    legBase(k.MP(k.legB), true);
    legBase(k.MP(k.legF), false);

    // ── 6) shorts ──
    shortsLeg(k.MP(k.legB), true);
    shortsLeg(k.MP(k.legF), false);

    // ── 7) white bunny camisole, then the oversized off-the-shoulder jacket ──
    {
      const cam = closedSpline([[-6, -2], [-6, 10.5], [6, 12], [18, 11.4], [28, 9], [31.4, 4.5], [31, -2]].map(([a, b]) => Tu(a, b)), 4);
      fillPoly(k, cam, C.cami, C.line, 1);
      if (!F) {
        ctx.save(); pathOf(ctx, cam); ctx.clip();
        fillPoly(k, [Tu(-10, -3), Tu(-10, 3), Tu(34, 1), Tu(34, -3)], C.camiSh, null); // shade toward the jacket
        ctx.restore();
        bunnyHead(k, Tu(17, 8.4), 1.9 * u, C.hoodHi, null, false); // lavender bunny print
        ctx.save(); ctx.globalAlpha = 0.8; fillEll(k, Tu(31.6, 2), 5.6 * u, 3.1 * u, 0, C.skin, null); ctx.restore(); // bare shoulder and collarbone
      }
      const B = [[-6, -15], [-6, -3], [-6, 6.4], [0, 7.8], [9, 7.2], [21, 6], [29, 3.2], [32.4, -2], [33.6, -9.6], [26, -16.4], [10, -17.6]];
      const body = closedSpline(B.map(([a, b]) => Tu(a * breath, b * breath)), 5);
      fillPoly(k, body, C.hood, C.line, 1.2);
      if (!F) {
        ctx.save(); pathOf(ctx, body); ctx.clip();
        fillPoly(k, [Tu(-15, -22), Tu(-15, -1), Tu(36, -4), Tu(36, -22)], C.hoodSh, null); // shadow on the back side
        fillPoly(k, [Tu(-6, -2), Tu(30, -3), Tu(31, -1), Tu(-6, 1)], C.hood, null);
        ctx.restore();
        // ribbed hem band with two white stripes
        fillPoly(k, [Tu(-6, -15), Tu(-6, 6.4), Tu(-2, 7), Tu(-2, -15)], C.hoodSh, C.line2, 0.8);
        line(k, [Tu(-3.4, -14), Tu(-3.4, 6.2)], C.cami, 0.8, 0.9);
        line(k, [Tu(-4.8, -14), Tu(-4.8, 6.2)], C.cami, 0.8, 0.9);
        line(k, [Tu(30.4, 3.6), Tu(18, 6.4), Tu(4, 7.4), Tu(-1, 7.4)], C.line2, 0.8, 0.9); // open zip edge
        for (const [a, b, l] of [[8, -2, 5], [16, 0, 4], [-2, -6, 5]]) line(k, [Tu(a, b), Tu(a - 2.2, b + l * 0.5), Tu(a - 3.6, b + l)], C.hoodSh, 0.8, 0.9); // soft fold lines
        // pink bow and ribbon tails on the hem corner, with a tiny star charm
        const bp = Tu(-3.4, 5.4);
        for (const o of [0, 1]) ribbon(k, [bp, [bp[0] + d * (1 + o * 1.2) * u, bp[1] + 2.4 * u], [bp[0] + d * (1.6 + o * 2) * u, bp[1] + (4.6 + o * 1.6) * u]], (t) => lerp(1.8, 1.1, t) * u, C.pink, C.line, 0.5);
        bow(k, bp, 2.2 * u, C.pink, C.pinkSh, 0);
        star(k, [bp[0] + d * 3.6 * u, bp[1] + 7.2 * u], 1.5 * u, C.butter, C.butterLine);
        star(k, Tu(30.2, 4.4), 1.5 * u, C.butter, C.butterLine); // star zip pull
      }
    }

    // ── 8) near arm: puffy sleeve over the body ──
    const hand = sleeve(armFw, true);

    // ── 9) backpack strap over the near shoulder ──
    ribbon(k, spline([Tu(30, -14), Tu(33.2, -8), Tu(33.4, -1), Tu(28, 6.4)], 4), () => 2.6 * u, C.hoodSh, C.line, 0.8);

    // ── 10) neck (small, mostly hidden) ──
    fillPoly(k, [Hp(-0.1, 0.7), Hp(0.5, 0.7), Hp(0.56, 1.5), Hp(-0.3, 1.5)], C.skinSh, C.line, 0.9);

    // ── 11) long wavy mint hair: over the back, hair tips flick out, three strands for shape ──
    const hs = c.hair;
    {
      const w = (i) => hs.x[Math.min(3, i)];
      const hairBack = closedSpline([
        Hp(-0.4, -0.9), Hp(-1.5, -0.5), Hp(-1.85, 0.7), Hp(-1.95, 1.7),
        [Tu(33, -13)[0] + w(1), Tu(33, -13)[1]],
        [Tu(24, -19.4)[0] + w(2) * 1.3, Tu(24, -19.4)[1]],
        [Tu(15, -18.6)[0] + w(3) * 1.6, Tu(15, -18.6)[1]],
        [Tu(7, -21)[0] + w(3) * 2, Tu(7, -21)[1] + hs.y[3]],
        [Tu(0, -18.4)[0] + w(3) * 2.4, Tu(0, -18.4)[1] + hs.y[3]],
        [Tu(3, -13.6)[0] + w(3) * 1.6, Tu(3, -13.6)[1]],
        [Tu(10, -14)[0] + w(2), Tu(10, -14)[1]],
        [Tu(18, -13.4)[0] + w(2), Tu(18, -13.4)[1]],
        Tu(28, -10), Hp(-0.7, 1.55), Hp(-0.4, 0.7),
      ], 5);
      fillPoly(k, hairBack, C.hair, C.hairLine, 1);
      if (!F) {
        ctx.save(); pathOf(ctx, hairBack); ctx.clip();
        fillPoly(k, [Tu(-4, -26), Tu(-4, -10), Tu(14, -12), Tu(14, -26)], C.hairSh, null);            // deep-mint shade on the lower hair
        ctx.restore();
        for (const [a0, b0, a1, b1, a2, b2] of [[31, -14.5, 22, -16, 12, -15.4], [28, -13, 18, -14, 6, -16], [24, -12, 12, -12.6, 3, -13.4]]) {
          line(k, spline([Tu(a0, b0), [Tu(a1, b1)[0] + w(2), Tu(a1, b1)[1]], [Tu(a2, b2)[0] + w(3), Tu(a2, b2)[1]]], 4), a0 === 31 ? C.hairHi : C.hairLine, 0.7, a0 === 31 ? 0.9 : 0.6); // wavy strand lines
        }
      }
    }

    // ── 12) hood back shell and the collar bunch ──
    if (!F) { // a thin deep-mint strip where the back hair meets the lavender hood, so the two colours never touch flat
      ctx.save();
      fillEll(k, Hp(0.02, -0.2), R * 1.5 + 1.6 * u, R * 1.4 + 1.6 * u, th, C.hairSh, null);
      ctx.restore();
    }
    fillEll(k, Hp(0.02, -0.2), R * 1.5, R * 1.4, th, C.hoodSh, C.line, 1.2);
    fillEll(k, Hp(0.14, -0.38), R * 1.36, R * 1.24, th, C.hood, null); // lit part: the shadow stays on the lower back
    if (!F) line(k, [Hp(-0.6, -1.4), Hp(0.1, -1.56), Hp(0.8, -1.36)], C.hoodHi, 1.2, 0.8); // light lilac highlight on the upper front

    // ── 13) face (inside the hood opening) ──
    const oc = Hp(0.42, 0.13), rx = R * 0.82, ry = R * 0.9;
    {
      const face = closedSpline([Hp(-0.55, -0.7), Hp(0.2, -0.98), Hp(0.8, -0.7), Hp(0.96, -0.1), Hp(0.92, 0.36), Hp(0.78, 0.7), Hp(0.5, 0.95), Hp(0.2, 1.0), Hp(-0.2, 0.85), Hp(-0.55, 0.4)], 5);
      fillPoly(k, face, C.skin, C.line, 1.1);
      if (!F) {
        ctx.save(); pathOf(ctx, face); ctx.clip();
        fillPoly(k, [Hp(-0.9, 0.62), Hp(0.3, 0.76), Hp(1.2, 0.52), Hp(1.2, 1.4), Hp(-0.9, 1.4)], C.skinSh, null); // peach shadow under the chin
        ctx.restore();
        ctx.save(); ctx.globalAlpha = stunned ? 0.85 : 0.65;
        fillEll(k, Hp(0.4, 0.38), R * 0.22, R * 0.12, th, C.blush, null); // soft blush
        ctx.restore();
        dot(k, Hp(0.97, 0.22), 0.5, C.skinSh, null); // tiny nose dot
        // brows: low and relaxed; angled in and down when she is disturbed
        const bA = stunned ? [Hp(0.3, -0.26), Hp(0.68, -0.4)] : [Hp(0.28, -0.34), Hp(0.68, -0.29 - (yawn ? 0.08 : 0))];
        line(k, bA, C.hairLine, Math.max(0.8, R * 0.1), 1);
        // eye: half-closed, the upper lid covers about 45% of the big violet iris; the eye never opens fully wide
        const ec = Hp(0.5, 0.08), erx = R * 0.3, ery = R * 0.23 * (stunned ? 1.15 : 1);
        const lidFrac = clamp(0.45 + blink * 0.6 + yawn * 0.45 + (stunned ? 0.07 : 0) + drowsy * 0.1, 0, 1);
        ctx.save();
        ctx.beginPath(); ctx.ellipse(ec[0], ec[1], erx, ery, th, 0, TAU); ctx.clip();
        fillEll(k, ec, erx * 1.1, ery * 1.1, th, C.eyeWhite, null);
        const ic = [ec[0] + d * erx * 0.12, ec[1] + ery * 0.1];
        fillEll(k, ic, R * 0.23, R * 0.23, th, C.eye, null);
        ctx.save(); ctx.beginPath(); ctx.rect(ic[0] - R, ic[1] - R * 0.23, R * 2, R * 0.2); ctx.clip(); // darker top of the iris
        fillEll(k, ic, R * 0.23, R * 0.23, th, C.iris, null); ctx.restore();
        dot(k, [ic[0] - d * R * 0.08, ic[1] - R * 0.08], Math.max(0.55, R * 0.07), "#fff", null); // one highlight dot
        const lidY = ec[1] - ery + 2 * ery * lidFrac;
        fillPoly(k, [[ec[0] - erx * 1.3, ec[1] - ery * 1.3], [ec[0] + erx * 1.3, ec[1] - ery * 1.3], [ec[0] + erx * 1.3, lidY], [ec[0] - erx * 1.3, lidY]], C.skin, null);
        ctx.restore();
        // thick upper lid line, drooping toward the outer corner: the single most important sleepy mark
        const out = -d; // the outer corner is the one toward the back of the head
        line(k, [[ec[0] - out * erx * 1.15, lidY - R * 0.02], [ec[0], lidY - R * 0.03], [ec[0] + out * erx * 1.2, lidY + R * (stunned ? 0.0 : 0.07)]], C.line, Math.max(1.3, R * 0.18), 1);
        if (lidFrac < 0.8) line(k, [[ec[0] + out * erx * 0.1, ec[1] + ery * 0.95], [ec[0] + out * erx * 1.0, ec[1] + ery * 0.7]], C.line2, 0.5, 0.9); // thin lower lash on the outer half
        // mouth: a small flat line; open oval when yawning; short curve for the rare smile; downward kink when annoyed
        const mc = Hp(0.58, 0.54);
        if (yawn > 0.15) fillEll(k, [mc[0], mc[1] + R * 0.06], R * 0.1, R * 0.13 * yawn, th, "#C46A8A", C.line, 0.6);
        else if (stunned) line(k, [Hp(0.5, 0.56), Hp(0.58, 0.52), Hp(0.67, 0.58)], C.line, 0.8, 1);
        else if (smile) line(k, [Hp(0.48, 0.52), Hp(0.58, 0.58), Hp(0.68, 0.51)], C.line, 0.8, 1);
        else line(k, [Hp(0.49, 0.54), Hp(0.67, 0.54)], C.line, 0.8, 1);
      } else {
        const ec = Hp(0.45, 0.05); line(k, [[ec[0] - 2, ec[1]], [ec[0] + 2, ec[1]]], "#fff", 2, 1);
      }
    }

    // ── 14) bangs peek out from under the hood (clipped to the hood opening), then the soft hood rim ──
    {
      ctx.save();
      ctx.beginPath(); ctx.ellipse(oc[0], oc[1], rx + R * 0.05, ry + R * 0.05, th, 0, TAU); ctx.clip();
      const hcap = [Hp(1.12, -0.26), Hp(1.05, -1.0), Hp(0.3, -1.15), Hp(-0.7, -1.0), Hp(-0.7, -0.22), Hp(-0.3, -0.44), Hp(0.05, -0.3), Hp(0.4, -0.46), Hp(0.72, -0.3), Hp(0.95, -0.42)];
      fillPoly(k, hcap, C.hair, C.hairLine, 0.7);
      if (!F) {
        line(k, [Hp(0.95, -0.62), Hp(0.5, -0.84), Hp(-0.1, -0.88)], C.hairHi, 1.2, 0.9); // pale-mint band across the bangs
        line(k, [Hp(-0.1, -0.5), Hp(0.4, -0.54), Hp(0.9, -0.48)], C.hairSh, 1.1, 0.8); // deep-mint shadow under the bangs
      }
      ctx.restore();
      if (!F) { // soft shadow from the rim onto the hair and forehead
        ctx.save(); ctx.globalAlpha = 0.4;
        ctx.beginPath(); ctx.ellipse(oc[0], oc[1] + 1.2 * u, rx - 0.6 * u, ry - 0.6 * u, th, Math.PI * 1.05, Math.PI * 1.95);
        ctx.strokeStyle = C.hairSh; ctx.lineWidth = 1.8 * u; ctx.stroke(); ctx.restore();
      }
      ctx.beginPath(); ctx.ellipse(oc[0], oc[1], rx + R * 0.1, ry + R * 0.1, th, 0, TAU);
      ctx.strokeStyle = k.col(C.hood); ctx.lineWidth = R * 0.3; ctx.stroke(); // hood fabric around the face: same colour as the hood, so it blends in
      if (!F) {
        ctx.beginPath(); ctx.ellipse(oc[0], oc[1], rx - R * 0.02, ry - R * 0.02, th, 0, TAU);
        ctx.strokeStyle = C.hoodHi; ctx.lineWidth = R * 0.12; ctx.stroke(); // thin pale-lilac lining just inside the opening
      }
      ctx.beginPath(); ctx.ellipse(oc[0], oc[1], rx - R * 0.08, ry - R * 0.08, th, 0, TAU);
      ctx.strokeStyle = k.col(C.line); ctx.lineWidth = 0.9; ctx.stroke(); // opening edge
      // long side lock framing the cheek (the far one is hidden in side view)
      ribbon(k, [Hp(-0.18, 0.2), [Hp(-0.22, 0.9)[0] + hs.x[1] * 0.6, Hp(-0.22, 0.9)[1]], [Hp(-0.14, 1.5)[0] + hs.x[2] * 0.7, Hp(-0.14, 1.5)[1] + hs.y[2]], [Hp(-0.3, 2.0)[0] + hs.x[3] * 0.8, Hp(-0.3, 2.0)[1] + hs.y[3]]], (t) => lerp(R * 0.18, 0.5, t), C.hair, C.hairLine, 0.7);
      // ahoge: one curled tuft at the crown, in front of the hood
      ribbon(k, spline([Hp(0.2, -1.0), [Hp(0.12, -1.35)[0] + hs.x[0] * 0.5, Hp(0.12, -1.35)[1]], [Hp(0.42, -1.65)[0] + hs.x[0], Hp(0.42, -1.65)[1] + hs.y[0]], [Hp(0.72, -1.72)[0] + hs.x[0], Hp(0.72, -1.72)[1] + hs.y[0]], [Hp(0.78, -1.52)[0] + hs.x[0], Hp(0.78, -1.52)[1] + hs.y[0]]], 4), (t) => lerp(2.2 * u, 0.5 * u, t), C.hair, C.hairLine, 0.7);
    }

    // ── 15) near bunny ear (last big shape; drapes over the shoulder) ──
    ear(0, Hp(-0.2, -1.3), EAR_NEAR, true);

    // ── 16) accessories: the white bunny hair clip on the hood front ──
    bunnyHead(k, Hp(0.7, -1.02), 2.9 * u + 0.4, "#FFFFFF", C.line2, true);

    // ── 17) idle z: cream / lavender, rises from her head, fades over 40 frames ──
    if (!F) {
      for (const z of c.zs) {
        const t = z.age / 40, zx = hx + d * (R * 0.9 + 6 * t * u + Math.sin(z.age * 0.18 + z.ph * 6) * 1.5 * u), zy = hy - R * 1.3 - 16 * t * u;
        ctx.save(); ctx.globalAlpha = Math.sin(Math.PI * t) * 0.9;
        ctx.font = "bold " + Math.round(clamp(6 + 5 * t, 6, 11)) + "px sans-serif";
        ctx.fillStyle = z.ph > 0.5 ? C.cream : C.hoodHi; ctx.strokeStyle = C.line; ctx.lineWidth = 1.5;
        ctx.strokeText("z", zx, zy); ctx.fillText("z", zx, zy);
        ctx.restore();
      }
    }
    return hand;
  }

  MW.Mochi = { draw, PALETTE: C };
})(globalThis);