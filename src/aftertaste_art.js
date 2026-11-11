// Mechanic Wars - Aftertaste art (render only, never touches the sim).
// Aftertaste - The Flavor of Violence: a gigantic, cheerful butcher-chef. REBUILT from the rig anchors (not patched):
//   * one wide charcoal torso with sloping shoulders, a thick neck and a big round head with a porcelain smile mask and a butcher's cap
//   * one big round belly that sticks out past the chest and hangs over the belt (it is part of the outer silhouette); the apron IS the belly
//   * thick connected arms (shoulder ball -> sleeve -> rolled cuff -> bare forearm -> leather glove), short sturdy legs, big boots
//   * FRONT hand: an oversized rectangular cleaver, the glove is drawn over the handle. BACK hand: a long three-pronged meat fork.
// Palette: dirty-white apron / porcelain, charcoal shirt, leather brown, steel, and ONE accent: crimson (smile, cap stripe, a little blood on the blades).
// Called from character_art.js DETAIL() for id === "aftertaste".
// k = the shared rig state from character_art.js, e = a few precomputed values (see DETAIL).
// Sizes are in u = H / 100 (H = his hit-box height). Torso frame Tu(a, b): a = along the spine (0 = hip, 36 = shoulder line), b = toward the front (the facing side).
// Rig anchors in that frame (idle): near shoulder (36, +19), far shoulder (36, -19), head centre (49, 0), hips (+-2, +-12), feet about 31-35 below the hips.
// Both weapons follow their FOREARM: the weapon axis runs from the elbow through the wrist, so the hand poses in character_art.js
// (ATK.aftertaste, run, idle, air) ARE the weapon angles. Outputs kept for other files: A.cleaverTip, A.forkTip, and the crimson drops on the first frame of a strike.
// Draw order: far arm + fork, far leg, near leg, torso, belly + apron, belt + knives, neck, head, near arm, cleaver, near glove.
(function (g) {
  const MW = (g.MW = g.MW || {});
  const TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];

  const C = {
    line: "#0A0A0D",
    apron: "#DAD3C0", apronSh: "#A9A28E",            // dirty-white apron (the belly)
    shirt: "#3E373F", shirtSh: "#2A252B", shirtHi: "#5A4F59", // charcoal shirt, rolled-sleeve cuffs
    skin: "#C58F72", skinSh: "#8A5A45",
    glove: "#6A4526", gloveHi: "#855A33", gloveSh: "#3F2916",
    pants: "#1F1C22", pantsHi: "#2D2A33",
    boot: "#2B2219", bootSh: "#0B0806",
    mask: "#F2EFE6", maskSh: "#C9C2AE",              // porcelain
    hair: "#2A1D18",
    blood: "#8F1D22", crimson: "#B3202F", mouth: "#4A0C14", // accent
    steel: "#C9CED4", steelSh: "#8C929A", wood: "#6A4A2A", woodSh: "#3B2A1D", brass: "#B9983A",
  };

  // ── drawing helpers (same style as foundry_art.js) ─────────────────
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
    if (edgeColor !== null) { ctx.lineJoin = "round"; ctx.lineWidth = lw || 1.4; ctx.strokeStyle = k.isFlash ? "#fff" : (edgeColor || C.line); ctx.stroke(); }
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
  // a limb / strap of changing width along a centre line
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
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
  }
  function dot(k, p, r, fill, edgeColor, lw) {
    const { ctx } = k;
    ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(0.2, r), 0, TAU);
    ctx.fillStyle = k.col(fill); ctx.fill();
    if (edgeColor) { ctx.lineWidth = lw || 1; ctx.strokeStyle = k.isFlash ? "#fff" : edgeColor; ctx.stroke(); }
  }
  // flat darker band inside a shape (volume without gradients)
  function shade(k, poly, band, color, alpha) {
    if (k.isFlash) return;
    const { ctx } = k;
    ctx.save();
    pathOf(ctx, poly); ctx.clip();
    pathOf(ctx, band);
    ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.fill();
    ctx.restore();
  }
  function blob(k, p, rx, ry, rot, fill, alpha) {
    if (k.isFlash) return;
    const { ctx } = k;
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.beginPath(); ctx.ellipse(p[0], p[1], Math.max(0.2, rx), Math.max(0.2, ry), rot || 0, 0, TAU);
    ctx.fillStyle = fill; ctx.fill();
    ctx.restore();
  }

  function draw(k, e) {
    const { d, now } = k;
    const F = k.isFlash;
    const { shW, hipW, hcw, armBw, armFw, strike, stunned } = e;
    const H = k.H, u = H / 100;
    const A = k.A, f = k.f;
    const running = k.st === (MW.STATE && MW.STATE.RUN) && Math.abs(k.vx || 0) > 0.4;
    const breathe = Math.sin(now * 1.8);
    // belly physics: it bounces on every step, squashes when he is hit and swells a little when he breathes in
    const bounce = running ? Math.sin((A.phase || 0) * 2 + 0.6) * 1.8 : 0;
    const squash = stunned ? 0.86 : 1;
    const swell = 1 + 0.012 * breathe;

    // torso frame: Tu(a, b) = a along the spine (0 = hip), b toward the front, both in u
    let ux = shW[0] - hipW[0], uy = shW[1] - hipW[1];
    const tl = Math.hypot(ux, uy) || 1;
    ux /= tl; uy /= tl;
    let nx = -uy, ny = ux;
    if (nx * d < 0) { nx = -nx; ny = -ny; }
    const Tu = (a, b) => [hipW[0] + (ux * a + nx * b) * u, hipW[1] + (uy * a + ny * b) * u];
    const Bu = (a, b) => Tu(a + bounce * 0.6, b * squash * swell); // belly frame: same axes, with its own bounce / squash

    // head frame: Hp(a, b) = a forward, b down, in head units (the mask is drawn a little bigger than the rig's head so he reads as a person, not a pinhead)
    const hx = hcw[0], hy = hcw[1], R = k.hr * 1.16;
    const Hp = (a, b) => [hx + d * R * a, hy + R * b];

    const axisOf = (pts) => {
      const ax = pts[2][0] - pts[1][0], ay = pts[2][1] - pts[1][1];
      const l = Math.hypot(ax, ay) || 1;
      return [ax / l, ay / l];
    };

    // ── one arm: shoulder ball -> sleeve -> rolled cuff -> bare forearm (the glove is drawn separately, after the weapon handle) ──
  const limb = (pts, front) => {
  const [s0, el, wr] = pts;
  const ax = axisOf(pts);
  const px = -ax[1], py = ax[0];

  const sleeve = front ? C.shirt : C.shirtSh;
  const cuff = front ? C.shirtHi : C.shirt;
  const skin = front ? C.skin : C.skinSh;

  // Forearm
  taper(k, [mix(el, wr, 0.04), wr],
    17 * u, 14 * u, skin, C.line, 1.4);

  // Upper sleeve
  taper(k, [s0, el],
    19 * u, 17 * u, sleeve, C.line, 1.4);

  // Smaller elbow joint to avoid the giant circular appearance
  dot(k, el, 7.2 * u, sleeve, C.line, 1.3);

  // Rolled cuff near the wrist
  const c = mix(el, wr, 0.78);
  const half = 8 * u;
  const thick = 2.4 * u;

  fillPoly(k, [
    [c[0] + px * half - ax[0] * thick, c[1] + py * half - ax[1] * thick],
    [c[0] - px * half - ax[0] * thick, c[1] - py * half - ax[1] * thick],
    [c[0] - px * half + ax[0] * thick, c[1] - py * half + ax[1] * thick],
    [c[0] + px * half + ax[0] * thick, c[1] + py * half + ax[1] * thick]
  ], cuff, C.line, 1.2);

  // Shoulder blends into the torso
  dot(k, s0, 8.2 * u, sleeve, C.line, 1.4);
};
    const glove = (pts, front) => {
      const wr = pts[2], ax = axisOf(pts), px = -ax[1], py = ax[0];
      const gc = [wr[0] + ax[0] * 3 * u, wr[1] + ax[1] * 3 * u];
      dot(k, gc, 8.8 * u, front ? C.glove : C.gloveSh, C.line, 1.5);                              // fist closed round the handle
      if (!F) for (const o of [-3.6, 0, 3.6]) line(k, [[gc[0] + ax[0] * 2 * u + px * o * u, gc[1] + ax[1] * 2 * u + py * o * u], [gc[0] + ax[0] * 8 * u + px * o * u, gc[1] + ax[1] * 8 * u + py * o * u]], C.line, 1, 0.6);
    };

    // ═════ BACK ARM + MEAT FORK (behind the body) ═════
    {
      // the fork is held along the back forearm: wooden handle, steel neck, a crossbar and three long prongs
   const wr = armBw[2];
const ax = axisOf(armBw);
const px = -ax[1] * d;
const py = ax[0] * d;

const Q = (x, y) => [
  wr[0] + ax[0] * x * u + px * y * u,
  wr[1] + ax[1] * x * u + py * y * u
];

// Wooden handle
taper(k, [Q(-12, 0), Q(30, 0)],
  5.5 * u, 5.5 * u, C.wood, C.line, 1.3);

// Metal neck
taper(k, [Q(30, 0), Q(38, 0)],
  4.5 * u, 4.5 * u, C.steelSh, C.line, 1.2);

// Fork head
fillPoly(k, [
  Q(37, -8),
  Q(43, -8),
  Q(43, 8),
  Q(37, 8)
], C.steel, C.line, 1.3);

// Three short, distinct tines
for (const y of [-6, 0, 6]) {
  fillPoly(k, [
    Q(42, y - 1.5),
    Q(56, y - 1.2),
    Q(62, y),
    Q(56, y + 1.2),
    Q(42, y + 1.5)
  ], C.steel, C.line, 1.1);
}

A.forkTip = [
  A.ox + Q(62, 0)[0],
  A.oy + Q(62, 0)[1]
];

limb(armBw, false);
glove(armBw, false);

} // CLOSE BACK ARM + MEAT FORK SECTION

// ═════ LEGS: short, sturdy, heavy black trousers and big butcher boots ═════
    const leg = (pts, back) => {
      const [h, kn, ft] = pts;
      const S = (x, y) => [ft[0] + d * x * u, ft[1] + y * u];
      taper(k, [h, kn], 26 * u, 22 * u, back ? C.pants : C.pantsHi, C.line, 1.5);
      taper(k, [kn, mix(kn, ft, 0.9)], 22 * u, 19 * u, back ? C.pants : C.pantsHi, C.line, 1.5);
      dot(k, kn, 10.4 * u, back ? C.pants : C.pantsHi, null);
      const boot = [S(-11, -17), S(-13, 0), S(19, 0), S(22, -6), S(17, -12), S(9, -17)];
      fillPoly(k, boot, back ? "#1F1810" : C.boot, C.line, 1.6);
      fillPoly(k, [S(-13, -3.5), S(-13, 0), S(19, 0), S(22, -6), S(21, -3.5)], C.bootSh, C.line, 1.1); // thick sole
    };
    leg(k.MP(k.legB), true);
    leg(k.MP(k.legF), false);

    // ═════ TORSO: one wide charcoal body, sloping shoulders, wide back ═════
    const torso = closedSpline([Tu(46, 0), Tu(43, 14), Tu(35, 28), Tu(20, 31), Tu(3, 25), Tu(-6, 8), Tu(-6, -8), Tu(2, -25), Tu(20, -32), Tu(35, -28), Tu(43, -14)], 4);
    fillPoly(k, torso, C.shirt, C.line, 1.7);
    shade(k, torso, [Tu(-10, -40), Tu(50, -40), Tu(50, -4), Tu(-10, -4)], C.shirtSh, 0.6);        // the far (back) half sits in shadow

    // ═════ BELLY (= the apron): a big round shape that sticks out past the chest and hangs over the belt ═════
   // ═════ BELLY + APRON ═════
const belly = closedSpline([
  Bu(35, 0),
  Bu(31, 15),
  Bu(23, 25),
  Bu(9, 29),
  Bu(-7, 27),
  Bu(-18, 18),
  Bu(-22, 5),
  Bu(-21, -11),
  Bu(-14, -23),
  Bu(0, -29),
  Bu(16, -27),
  Bu(29, -17)
], 4);

fillPoly(k, belly, C.apron, C.line, 1.8);

// Underside shadow
shade(k, belly, [
  Bu(-24, -32),
  Bu(-9, -32),
  Bu(-9, 40),
  Bu(-24, 40)
], C.apronSh, 0.55);

// Far-side shadow
shade(k, belly, [
  Bu(-20, -32),
  Bu(40, -32),
  Bu(40, -5),
  Bu(-20, -5)
], C.apronSh, 0.35);

// Apron bib
fillPoly(k, [
  Tu(42, -15),
  Tu(42, 15),
  Tu(29, 19),
  Tu(25, -19)
], C.apron, C.line, 1.4);

// Apron straps
line(k, [Tu(42, 15), Tu(37, 24)], C.apron, 3.6 * u, 1);
line(k, [Tu(42, -15), Tu(37, -24)], C.apronSh, 3.6 * u, 1);

// Small blood stains
if (!F) {
  blob(k, Bu(17, 19), 6 * u, 4 * u, 0.4, C.blood, 0.75);
  blob(k, Bu(8, 3), 4 * u, 3 * u, 0.2, C.blood, 0.65);
}
    // ═════ BELT + a few small knives ═════
    taper(k, spline([Tu(4, -27), Bu(5, -10), Bu(6.5, 8), Bu(6, 26), Bu(3, 40)], 4), 7 * u, 7 * u, "#2A1F1A", C.line, 1.5);
    fillPoly(k, [Bu(10.5, 10), Bu(10.5, 21), Bu(2.5, 21), Bu(2.5, 10)], C.brass, C.line, 1.3);   // buckle
    {
      const sway = running ? Math.sin((A.phase || 0) * 2) * 1.6 * u : 0;
      for (let i = 0; i < 3; i++) {
        const o = Tu(3, -26 + i * 5.6), len = (17 - i * 2) * u, sw2 = sway * (0.7 + i * 0.2);
        fillPoly(k, [[o[0] - 1.8 * u, o[1]], [o[0] + 1.8 * u, o[1]], [o[0] + 1.8 * u + sw2, o[1] + 8 * u], [o[0] - 1.8 * u + sw2, o[1] + 8 * u]], C.wood, C.line, 1.1);
        fillPoly(k, [[o[0] - 2 * u + sw2, o[1] + 8 * u], [o[0] + 2 * u + sw2, o[1] + 8 * u], [o[0] + sw2 * 1.4, o[1] + len]], C.steel, C.line, 1.1);
      }
    }

    // ═════ NECK + HEAD: thick neck, big round head ═════
    taper(k, [Tu(38, 0), [hx, hy + R * 0.6]], 26 * u, 22 * u, C.skin, C.line, 1.5);
    blob(k, Hp(-1.02, 0.12), R * 0.26, R * 0.4, -0.15 * d, C.hair, 1);                                // hair tuft behind the mask
    const mask = closedSpline(Array.from({ length: 12 }, (_, i) => { const t = (i / 12) * TAU; return Hp(0.08 + 1.16 * Math.cos(t), 0.04 + (Math.sin(t) < 0 ? 1.1 : 1.2) * Math.sin(t)); }), 3);
    fillPoly(k, mask, C.mask, C.line, 1.8);
    shade(k, mask, [Hp(-2, 0.62), Hp(2, 0.62), Hp(2, 2), Hp(-2, 2)], C.maskSh, 0.55);                // the lower face sits in shadow
    shade(k, mask, [Hp(-2, -2), Hp(-0.55, -2), Hp(-0.55, 2), Hp(-2, 2)], C.maskSh, 0.5);             // the far side of the face
    // small dark eye openings (they squint shut when he is hit)
    if (stunned) {
      for (const a0 of [0.1, 0.7]) { line(k, [Hp(a0 - 0.14, -0.22), Hp(a0 + 0.14, -0.04)], C.line, 1.6, 1); line(k, [Hp(a0 - 0.14, -0.04), Hp(a0 + 0.14, -0.22)], C.line, 1.6, 1); }
    } else {
      blob(k, Hp(0.72, -0.12), R * 0.2, R * 0.13, 0, "#0A0A0D", 1);
      blob(k, Hp(0.13, -0.12), R * 0.16, R * 0.12, 0, "#0A0A0D", 1);                                 // the far eye, a little smaller
    }
    // the wide, permanent painted smile: a dark crescent with a crimson edge; it opens wider when he lands a heavy blow
    {
      const open = strike ? 1 : 0;
      const top = [Hp(-0.16, 0.36), Hp(0.45, 0.5), Hp(1.1, 0.34)];
      const low = [Hp(1.1, 0.34), Hp(0.5, 0.86 + 0.34 * open), Hp(-0.16, 0.36)];
      fillPoly(k, spline(top, 4).concat(spline(low, 4)), C.mouth, k.isFlash ? "#fff" : C.crimson, 1.8);
      line(k, [Hp(1.1, 0.34), Hp(1.2, 0.2)], C.crimson, 1.8, 1);                                      // the smile curls up at the cheek
      line(k, [Hp(-0.16, 0.36), Hp(-0.24, 0.24)], C.crimson, 1.8, 1);
    }
    // butcher's cap: white dome with a crimson stripe
    {
      const cap = closedSpline([Hp(-1.28, -0.4), Hp(-1.18, -1.2), Hp(-0.5, -1.72), Hp(0.5, -1.74), Hp(1.2, -1.24), Hp(1.34, -0.4), Hp(0.05, -0.56)], 3);
      fillPoly(k, cap, "#F1ECDC", C.line, 1.7);
      shade(k, cap, [Hp(-2, -2), Hp(-0.7, -2), Hp(-0.7, 0), Hp(-2, 0)], C.maskSh, 0.5);
      fillPoly(k, [Hp(-1.3, -0.84), Hp(1.36, -0.84), Hp(1.36, -0.5), Hp(-1.3, -0.5)], C.crimson, C.line, 1.4);  // crimson stripe round the base
    }

    // ═════ NEAR ARM + OVERSIZED CLEAVER (last, on top of everything) ═════
    limb(armFw, true);
    {
      const wr = armFw[2], ax = axisOf(armFw), px = -ax[1] * d, py = ax[0] * d;
      // cleaver: a heavy rectangle; the edge is the +y side (it leads the swing), the thick spine is the -y side
      const Q = (x, y) => [wr[0] + ax[0] * x * u + px * y * u, wr[1] + ax[1] * x * u + py * y * u];
    // Short, thick wooden handle
taper(k, [Q(-9, 0), Q(23, 0)],
  6 * u, 6 * u, C.woodSh, C.line, 1.4);

// Proper butcher cleaver silhouette
const blade = [
  Q(20, -8),
  Q(29, -12),
  Q(49, -12),
  Q(53, -7),
  Q(53, 16),
  Q(49, 21),
  Q(27, 21),
  Q(20, 16)
];

fillPoly(k, blade, C.steel, C.line, 1.8);

// Dark spine
shade(k, blade, [
  Q(19, -13),
  Q(54, -13),
  Q(54, -3),
  Q(19, -3)
], C.steelSh, 0.8);

// Bright cutting edge
shade(k, blade, [
  Q(19, 15),
  Q(54, 15),
  Q(54, 23),
  Q(19, 23)
], "#FFFFFF", 0.5);

if (!F) {
  dot(k, Q(30, 4), 2.2 * u, "#141824", C.line, 1.1);
  blob(k, Q(47, 16), 3.5 * u, 1.8 * u,
    Math.atan2(ax[1], ax[0]), C.blood, 0.8);
}

const tip = Q(53, 16);
      if (strike && A.atHit !== f.hit) {
        A.atHit = f.hit;
        if (k.spawn && !F) for (let i = 0; i < 8; i++) k.spawn(A.ox + tip[0], A.oy + tip[1], d * (0.6 + Math.random() * 3.4), -1.4 - Math.random() * 2.6, i % 3 ? C.crimson : C.blood, 20 + (Math.random() * 10 | 0), 2 + Math.random() * 2);
      }
      A.cleaverTip = [A.ox + tip[0], A.oy + tip[1]];
    }
    glove(armFw, true);                                                                                // the fist closes over the handle
  }

  MW.Aftertaste = { draw, C };
})(typeof window !== "undefined" ? window : globalThis);