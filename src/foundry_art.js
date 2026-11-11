// Mechanic Wars - Foundry art (render only, never touches the sim).
// Foundry - The Molten Core: a walking forge. A heavyweight in dark forged-iron plate with a big glowing furnace built into his chest,
// a small helmeted head with one narrow orange eye slit, one shoulder bigger than the other, and a huge blacksmith sledgehammer.
// Palette: charcoal iron, gunmetal, burnt copper / aged bronze, molten orange and amber, soot black. The furnace gives most of the color.
// He is "hot" by default and gets hotter the more damage he has taken (heat = 0..1): the furnace, the seam cracks, the hammer faces and the
// eye slit all brighten with heat, and more steam / embers escape. f.tempered === true forces full heat (hook for the Tempered Steel skill later).
// Called from character_art.js DETAIL() for id === "foundry".
// k = the shared rig state from character_art.js, e = a few precomputed values (see DETAIL).
// Sizes are in u = H / 100 (H = his hit-box height); head sizes are in head-radius units (R = k.hr).
// The hammer is held by BOTH hands: the handle runs from the back hand through the front hand, the head sits past the front hand,
// so the hand poses in character_art.js (ATK.foundry, run, air) ARE the hammer angle.
// EXCEPTION (idle): when he stands still the hammer rests on his shoulder (armFw hand grips the handle, armBw hand hangs free). hs.c.rest = 0..1 blend.
// Draw order follows the Frozen Monarch: armFw + big shoulder FIRST (behind the torso), ..., head, then armBw + small shoulder LAST (on top of everything).
(function (g) {
  const MW = (g.MW = g.MW || {});
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];

  const C = {
    line: "#0A0A0D",
    coal: "#2A2C34", coalHi: "#454957",          // charcoal iron (main plate) and its lit edge
    gun: "#4A4D57", gunHi: "#6C707C", gunSh: "#30333B", // gunmetal
    soot: "#15161B",
    copper: "#B8672E", copperHi: "#E08A4A", copperSh: "#7A3F18", // burnt copper
    bronze: "#8C6A34", bronzeSh: "#5A4220",
    ember: "#FF7A1A", amber: "#FFB028", hot: "#FFE08A", deep: "#9A2E08",
    steam: "#D8DCE4",
  };

  // ── tiny drawing helpers ───────────────────────────────────────────
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
    if (edgeColor !== null) { ctx.lineJoin = "round"; ctx.lineWidth = lw || 1.2; ctx.strokeStyle = k.isFlash ? "#fff" : (edgeColor || C.line); ctx.stroke(); }
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
  // a glowing crack / seam: a wide soft stroke under a thin bright one
  function glowLine(k, pts, heat, lw) {
    if (k.isFlash) return;
    const a = 0.35 + 0.65 * heat;
    line(k, pts, C.ember, (lw || 1) * 2.6, 0.22 * a);
    line(k, pts, heat > 0.65 ? C.hot : C.amber, lw || 1, 0.9 * a);
  }
  function dot(k, p, r, fill, edgeColor, lw) {
    const { ctx } = k;
    ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(0.2, r), 0, TAU);
    ctx.fillStyle = k.col(fill); ctx.fill();
    if (edgeColor) { ctx.lineWidth = lw || 0.8; ctx.strokeStyle = k.isFlash ? "#fff" : edgeColor; ctx.stroke(); }
  }
  function rivet(k, p, r) { if (k.isFlash) return; dot(k, p, r, C.gunHi, C.line, 0.5); }
  // a soft darker band inside a shape (gives the flat plates a little volume)
  function shade(k, poly, band, color, alpha) {
    if (k.isFlash) return;
    const { ctx } = k;
    ctx.save();
    pathOf(ctx, poly); ctx.clip();
    pathOf(ctx, band);
    ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.fill();
    ctx.restore();
  }
  function glowSpot(k, p, r, rgb, a) {
    if (k.isFlash || !(a > 0.01)) return;
    const { ctx } = k;
    const gr = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
    gr.addColorStop(0, "rgba(" + rgb + "," + a.toFixed(3) + ")");
    gr.addColorStop(1, "rgba(" + rgb + ",0)");
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU); ctx.fill();
  }
  // heat color ramp: dull red-orange -> molten orange -> amber -> pale yellow
  function heatCol(t) {
    const stops = [[110, 32, 8], [235, 100, 20], [255, 170, 40], [255, 226, 140]];
    const x = clamp(t, 0, 1) * 3, i = Math.min(2, Math.floor(x)), f = x - i;
    const a = stops[i], b = stops[i + 1];
    return "rgb(" + Math.round(lerp(a[0], b[0], f)) + "," + Math.round(lerp(a[1], b[1], f)) + "," + Math.round(lerp(a[2], b[2], f)) + ")";
  }

  // is he standing relaxed (no attack, no hit, not running, not in the air)? then the hammer rests on his shoulder
  function wantsRest(k) {
    const S = MW.STATE, st = k.st, f = k.f;
    if (!S) return false;
    if (k.attacking) return false;
    if (st === S.HITSTUN || st === S.KO || st === S.RISING || st === S.FALLING) return false;
    if (f.grounded === false) return false;
    return true; // walking too: the hammer stays on his shoulder (it used to be held up in the air, which looked awkward)
  }

  // heat 0..1 from the damage he has taken, with a short flare when he gets hit; tempered = full heat.
  // Also eases c.rest (0 = hammer driven by the hands, 1 = hammer resting on the shoulder).
  function heatState(k) {
    const A = k.A, f = k.f;
    // the select screen / previews may draw a stand-in fighter without hp: treat that as full health
    const maxHP = f.stats && Number.isFinite(f.stats.maxHP) && f.stats.maxHP > 0 ? f.stats.maxHP : 1;
    const hp = Number.isFinite(f.hp) ? f.hp : maxHP;
    let c = A.mFoundry;
    if (!c) c = A.mFoundry = { flare: 0, hp, hurt: false, t: -1, rest: wantsRest(k) ? 1 : 0 };
    if (c.t < 0 || Math.abs(k.now - c.t) > 0.004) {
      c.t = k.now;
      if (hp < c.hp) c.flare = Math.min(1, c.flare + (c.hp - hp) / (maxHP * 0.12));
      c.hp = hp;
      c.flare = Math.max(0, c.flare - 0.025);
      c.rest += ((wantsRest(k) ? 1 : 0) - c.rest) * 0.16;
    }
    const lost = clamp(1 - hp / maxHP, 0, 1);
    const base = f.tempered ? 1 : 0.26 + 0.55 * lost;
    return { heat: clamp(base + 0.3 * c.flare, 0, 1), flare: c.flare, c };
  }

  function draw(k, e) {
    const { ctx, d, now } = k;
    const F = k.isFlash;
    const { shW, hipW, hcw, armBw, armFw, windU, strike, stunned } = e;
    const H = k.H, u = H / 100;
    const hs = heatState(k);
    const heat = hs.heat, breathe = 0.5 + 0.5 * Math.sin(now * 2.2);
    const glow = clamp(heat * 0.85 + 0.12 * breathe + (strike ? 0.15 : 0), 0, 1);
    const rest = clamp(hs.c.rest, 0, 1);

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

    // first frame of a hit: the armor throws sparks and embers
    if (stunned && !hs.c.hurt && k.spawn && !F) {
      const cols = [C.hot, C.amber, C.ember, C.hot];
      for (let i = 0; i < 12; i++) k.spawn(k.A.ox + hcw[0] + (Math.random() - 0.5) * 22, k.A.oy + hcw[1] + 8 + Math.random() * 26, (Math.random() - 0.5) * 4.4 + d * 0.8, -Math.random() * 2.6 - 0.4, cols[i % 4], 22, 2.2);
    }
    hs.c.hurt = stunned;

    // ── ambient furnace light spilling around the body ──
    glowSpot(k, Tu(16, 6), 46 * u, "255,120,30", 0.10 + 0.34 * glow);

    // ── legs: thick greaves, riveted knee plates, heavy boots with a glowing sole seam ──
    const leg = (pts, back) => {
      const [h, kn, ft] = pts;
      const S = (x, y) => [ft[0] + d * x * u, ft[1] + y * u];
      const body = back ? C.coal : C.gun;
      taper(k, [h, kn], 19 * u, 16.5 * u, body, C.line, 1.2);
      taper(k, [kn, mix(kn, ft, 0.88)], 16.5 * u, 14 * u, back ? C.gunSh : C.gunHi, C.line, 1.2);
      // knee plate: articulated knee cop centered on the joint
      const kp = [[kn[0] - d * 2.5 * u, kn[1] - 5 * u], [kn[0] + d * 7.5 * u, kn[1] - 3.5 * u], [kn[0] + d * 8.5 * u, kn[1] + 3.5 * u], [kn[0] - d * 1.5 * u, kn[1] + 5 * u]];
      fillPoly(k, kp, back ? C.gunSh : C.gunHi, C.line, 1.2);
      rivet(k, [kn[0] + d * 5 * u, kn[1] - 0.5 * u], 0.9 * u);
      // shin band
      const b0 = mix(kn, ft, 0.52);
      taper(k, [[b0[0] - d * 0.5 * u, b0[1]], [b0[0] + d * 0.5 * u, b0[1] + 0.1]], 15 * u, 15 * u, back ? C.copperSh : C.copper, C.line, 1.1);
      // boot: heavy iron sabaton with clean collar and toe cap
      const boot = [S(-9, -9), S(-10, 0), S(17, 0), S(19, -4), S(14, -8), S(6, -9)];
      fillPoly(k, boot, back ? C.coal : C.gunSh, C.line, 1.3);
      fillPoly(k, [S(7, -8), S(14, -8.5), S(19, -4), S(17, 0), S(7, 0)], back ? C.gunSh : C.gun, C.line, 1.1);
      if (!F) {
        line(k, [S(-8, -1.6), S(16, -1.6)], heatCol(0.35 + 0.5 * glow), 1.5, 0.55 + 0.45 * glow);
        rivet(k, S(-4, -6), 0.8 * u);
      }
    };
    leg(k.MP(k.legB), true);

    // ── arm: thick sleeve + massive blacksmith vambrace & flared cuff (fat forearms) ──
    const arm = (pts, front) => {
      const [s0, el, wr] = pts;
      const body = front ? C.coal : C.soot;
      taper(k, [s0, el], 22 * u, 19 * u, body, C.line, 1.3);
      dot(k, el, 9.2 * u, front ? C.gun : C.gunSh, C.line, 1.2);
      dot(k, el, 4.5 * u, front ? C.copper : C.copperSh, C.line, 0.8);
      // forearm: massive blacksmith gauntlet/vambrace (extra fat silhouette)
      taper(k, [mix(el, wr, 0.08), wr], 24 * u, 21 * u, front ? C.gun : C.gunSh, C.line, 1.4);
      // outer flared reinforcing plate along the forearm
      taper(k, [mix(el, wr, 0.22), mix(el, wr, 0.88)], 26 * u, 22.5 * u, front ? C.coalHi : C.soot, C.line, 1.1);
      // double copper reinforcing bands
      for (const t of [0.42, 0.74]) {
        const bb = mix(el, wr, t);
        taper(k, [[bb[0] - 0.2, bb[1]], [bb[0] + 0.2, bb[1] + 0.1]], 23 * u, 23 * u, front ? C.copper : C.copperSh, C.line, 1);
        if (!F) rivet(k, [bb[0], bb[1] - 8 * u], 0.85 * u);
      }
      if (!F) {
        glowLine(k, [mix(el, wr, 0.15), mix(el, wr, 0.72)], heat, 1.2);
        glowLine(k, [mix(el, wr, 0.28), mix(el, wr, 0.6)], heat, 0.8);
      }
    };

    // ── shoulder plate: a bolted dome with a copper band (big = armFw shoulder, small = armBw shoulder) ──
    const pauldron = (c, s, big) => {
      const P = (x, y) => [c[0] + d * x * s * u, c[1] + y * s * u];
      const dome = closedSpline([P(-12, 3), P(-11, -4), P(-6, -9), P(3, -10.5), P(10, -6.5), P(13, 1), P(11, 6), P(-10, 6)], 3);
      fillPoly(k, dome, big ? C.gun : C.gunSh, C.line, 1.5);
      shade(k, dome, [P(-15, 2.5), P(16, 2.5), P(16, 9), P(-15, 9)], C.soot, 0.45);
      if (!F) {
        const rim = [P(-11, 2.4), P(12, 2.4)];
        glowLine(k, rim, heat, 0.9);
        line(k, [P(-8, -6), P(0, -9), P(8, -5.5)], C.gunHi, 1, 0.65);   // lit top edge
      }
      // copper band across the dome
      fillPoly(k, [P(-1, -10), P(3.5, -10.2), P(3.8, 5.5), P(-1.3, 5.5)], big ? C.copper : C.copperSh, C.line, 1.1);
      if (!F) {
        rivet(k, P(1.2, -6), 0.8 * u); rivet(k, P(1.4, 1), 0.8 * u);
        if (big) { for (const x of [-8, -5.5, -3]) line(k, [P(x, -7), P(x - 0.4, -2.5)], C.soot, 1.2, 0.95); } // vents on the big plate
        else line(k, [P(-8, -3), P(-4, 1)], C.gunHi, 0.7, 0.4);
        // a dent on the big plate
        if (big) { ctx.save(); ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.ellipse(P(7, -2)[0], P(7, -2)[1], 2.6 * u * s, 1.6 * u * s, -0.4, 0, TAU); ctx.fillStyle = C.soot; ctx.fill(); ctx.restore(); }
      }
    };

    // FIRST (like the Frozen Monarch): armFw + its BIG shoulder plate, behind the torso
    arm(armFw, true);
    pauldron(armFw[0], 1.45, true);
    leg(k.MP(k.legF), false);



       // ── the hammer ─────────────────────────────────────────────────────
    const hb = armBw[2], hf = armFw[2];
    // normal: the handle runs from the back hand through the front hand
    let dx = hf[0] - hb[0], dy = hf[1] - hb[1];
    let dl = Math.hypot(dx, dy);
    if (dl < 2) { dx = d * 0.6; dy = -0.8; dl = 1; }
    dx /= dl; dy /= dl;
    // resting: the front hand grips the handle low, the handle leans up and back so the head sits on the shoulder
    const bob = Math.sin(now * 1.6) * 0.6 * u;
    const tgt = [armFw[0][0] - d * 6 * u, armFw[0][1] - 10 * u + bob];
    let rx = tgt[0] - hf[0], ry = tgt[1] - hf[1];
    if (rx * d > -0.01) rx = -0.01 * d;
    if (ry > -0.01) ry = -0.01;
    const rl = Math.hypot(rx, ry) || 1;
    rx /= rl; ry /= rl;
    dx = lerp(dx, rx, rest); dy = lerp(dy, ry, rest);
    const dl2 = Math.hypot(dx, dy) || 1;
    dx /= dl2; dy /= dl2;
    const dir = [dx, dy], pp = [-dy * d, dx * d];
    const along = (o, t) => [o[0] + dir[0] * t * u, o[1] + dir[1] * t * u];
    // grip base: the back hand normally; when resting, a point just behind the front hand along the handle
    const gb = [lerp(hb[0], hf[0] - dir[0] * 14 * u, rest), lerp(hb[1], hf[1] - dir[1] * 14 * u, rest)];
    const neckLen = lerp(36, Math.max(16, Math.min(36, rl / u - 3)), rest);
    const HS = 1.9, butt = along(gb, -9), neck = along(hf, neckLen);
    const hcN = along(hf, 50);
    const hc2 = [lerp(hcN[0], tgt[0], rest), lerp(hcN[1], tgt[1], rest)];
    const HM = (p, q) => [hc2[0] + (pp[0] * p + dir[0] * q) * u * HS, hc2[1] + (pp[1] * p + dir[1] * q) * u * HS];
    // handle: iron core with a leather-dark grip, a copper ferrule and a flared butt
    taper(k, [butt, neck], 5.2 * u, 5.2 * u, "#3B2A22", C.line, 1.2);
    taper(k, [along(gb, -6), along(gb, 14)], 6.2 * u, 6.2 * u, "#2A1D18", C.line, 1);
    if (!F) for (let i = 0; i < 4; i++) { const w = along(gb, -3 + i * 3.4); line(k, [[w[0] - pp[0] * 2.4 * u, w[1] - pp[1] * 2.4 * u], [w[0] + pp[0] * 2.4 * u, w[1] + pp[1] * 2.4 * u]], "#5A4034", 0.9, 0.8); }
    fillPoly(k, [along(butt, 0.5), [butt[0] + pp[0] * 3.2 * u, butt[1] + pp[1] * 3.2 * u], [butt[0] - pp[0] * 3.2 * u, butt[1] - pp[1] * 3.2 * u]].map((p, i) => i === 0 ? [p[0] - dir[0] * 2 * u, p[1] - dir[1] * 2 * u] : p), C.gun, C.line, 1);
    taper(k, [along(hf, neckLen - 5), along(hf, neckLen - 1)], 6.6 * u, 6.6 * u, C.copper, C.line, 1);

// ── hammer head: rendered BEHIND the torso ──
const heads = [
  [-14, -7.4], [-11.5, -6.8], [11.5, -6.8],
  [14, -8.8], [16.4, -8.8], [16.4, 8.8],
  [14, 8.8], [11.5, 6.8], [-11.5, 6.8], [-14, 7.4]
];
const headPoly = heads.map(([p, q]) => HM(p, q));

fillPoly(k, headPoly, C.coal, C.line, 1.6);
shade(k, headPoly,
  [HM(-20, 0), HM(20, 0), HM(20, 12), HM(-20, 12)],
  C.soot, 0.5
);

// Heat discoloration near both striking faces
if (!F) {
  ctx.save();
  pathOf(ctx, headPoly);
  ctx.clip();

  for (const [p0, p1, w] of [[16.4, 6, 1], [-14, -5, 0.8]]) {
    const a = HM(p0, 0), b = HM(p1, 0);
    const gr = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
    gr.addColorStop(0, "rgba(255,150,40," +
      (0.5 * w * (0.55 + 0.45 * heat)).toFixed(3) + ")");
    gr.addColorStop(1, "rgba(255,120,30,0)");
    ctx.fillStyle = gr;
    ctx.fillRect(hc2[0] - 40, hc2[1] - 40, 80, 80);
  }

  ctx.restore();

  line(k, [HM(16.4, -8.8), HM(16.4, 8.8)],
    heatCol(0.55 + 0.45 * heat), 1.9, 0.9);
  line(k, [HM(-14, -7.4), HM(-14, 7.4)],
    heatCol(0.4 + 0.4 * heat), 1.4, 0.8);
  line(k, [HM(-10, -6.8), HM(10, -6.8)],
    C.coalHi, 0.9, 0.7);

  // Hammer marks and worn edges
  for (const [p, q, r] of [
    [6, 1.5, 1.7],
    [-5, -1, 1.3],
    [11, -2.5, 1.2],
    [-9, 2.5, 1.0]
  ]) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    const c = HM(p, q);
    ctx.ellipse(c[0], c[1], r * u * 1.4, r * u, 0.5, 0, TAU);
    ctx.fillStyle = C.soot;
    ctx.fill();
    ctx.restore();
  }
}

// Copper collar band around the eye of the head
fillPoly(k, [
  HM(-4.2, -7.4), HM(4.2, -7.4),
  HM(4.2, 7.4), HM(-4.2, 7.4)
], C.copper, C.line, 1.2);

shade(k,
  [HM(-4.2, -7.4), HM(4.2, -7.4), HM(4.2, 7.4), HM(-4.2, 7.4)],
  [HM(-5, 1), HM(5, 1), HM(5, 9), HM(-5, 9)],
  C.copperSh, 0.55
);

if (!F) {
  rivet(k, HM(0, -5), 0.9 * u);
  rivet(k, HM(0, 5), 0.9 * u);
}

// ── ROCKET BOOSTER on the rear edge of the hammer: powers every smash with jet propulsion ──
{
  // 1. Heavy cylindrical booster thruster nozzle bell
  const boosterBell = [
    [-14, -6.0], [-19, -7.4], [-21.2, -8.0],
    [-21.2, 8.0], [-19, 7.4], [-14, 6.0]
  ].map(([p, q]) => HM(p, q));
  fillPoly(k, boosterBell, C.gunSh, C.line, 1.4);

  // Copper compression collar / reinforced nozzle throat
  const copperRim = [
    [-18.2, -7.5], [-21.4, -8.1],
    [-21.4, 8.1], [-18.2, 7.5]
  ].map(([p, q]) => HM(p, q));
  fillPoly(k, copperRim, C.copper, C.line, 1.2);
  if (!F) {
    rivet(k, HM(-19.5, -5.5), 0.7 * u);
    rivet(k, HM(-19.5, 5.5), 0.7 * u);
  }

  // Inner hollow combustor cavity
  const nozzleBore = [
    [-21.4, -6.4], [-18.5, -4.5],
    [-18.5, 4.5], [-21.4, 6.4]
  ].map(([p, q]) => HM(p, q));
  fillPoly(k, nozzleBore, C.soot, null);

  // 2. Glowing Rocket Thruster Power Plume (ignites and roars during every smash!)
  const boost = strike ? 1.0 : (windU > 0 ? clamp(0.35 + 0.65 * windU, 0, 1) : 0.15 + 0.08 * Math.sin(now * 5.5));
  if (!F && boost > 0.05) {
    const flen = (12 + 34 * boost) * (1 + 0.1 * Math.sin(now * 32));
    const fwide = 7.2 * (0.8 + 0.45 * boost);
    const nBase = HM(-21.4, 0);

    // Outer roaring rocket exhaust flame cone
    ctx.save();
    ctx.beginPath();
    const pTop = HM(-21.4, -fwide);
    const pTip = HM(-21.4 - flen, Math.sin(now * 26) * 1.5 * u);
    const pBtm = HM(-21.4, fwide);
    ctx.moveTo(pTop[0], pTop[1]);
    ctx.lineTo(pTip[0], pTip[1]);
    ctx.lineTo(pBtm[0], pBtm[1]);
    ctx.closePath();

    const grThr = ctx.createLinearGradient(nBase[0], nBase[1], pTip[0], pTip[1]);
    grThr.addColorStop(0, "rgba(255,245,180," + (0.95 * boost).toFixed(2) + ")");
    grThr.addColorStop(0.25, "rgba(255,140,25," + (0.90 * boost).toFixed(2) + ")");
    grThr.addColorStop(0.65, "rgba(220,50,10," + (0.45 * boost).toFixed(2) + ")");
    grThr.addColorStop(1, "rgba(120,20,0,0)");
    ctx.fillStyle = grThr;
    ctx.fill();

    // Inner White-Hot Mach Jet Core (during heavy swing)
    if (boost > 0.28) {
      ctx.beginPath();
      const cTop = HM(-21.4, -fwide * 0.45);
      const cTip = HM(-21.4 - flen * 0.58, 0);
      const cBtm = HM(-21.4, fwide * 0.45);
      ctx.moveTo(cTop[0], cTop[1]);
      ctx.lineTo(cTip[0], cTip[1]);
      ctx.lineTo(cBtm[0], cBtm[1]);
      ctx.closePath();
      ctx.fillStyle = "rgba(255,255,240," + (0.92 * boost).toFixed(2) + ")";
      ctx.fill();
    }
    ctx.restore();

    // Shock diamonds along the rocket plume (visible when booster is at full thrust)
    if (strike) {
      fillPoly(k, [
        HM(-21.4 - flen * 0.24, -2.6), HM(-21.4 - flen * 0.35, 0),
        HM(-21.4 - flen * 0.24, 2.6), HM(-21.4 - flen * 0.14, 0)
      ], C.hot, null);
      fillPoly(k, [
        HM(-21.4 - flen * 0.48, -1.8), HM(-21.4 - flen * 0.56, 0),
        HM(-21.4 - flen * 0.48, 1.8), HM(-21.4 - flen * 0.40, 0)
      ], C.amber, null);
    }

    // Fiery radiant bloom lighting up the back of the hammer head
    glowSpot(k, nBase, (24 + 40 * boost) * u, "255,130,25", 0.35 + 0.55 * boost);
    glowSpot(k, nBase, (12 + 20 * boost) * u, "255,230,120", 0.45 + 0.45 * boost);

    // Particle thruster sparks trailing behind during the smash
    if (strike && k.spawn && Math.random() < 0.8) {
      for (let s = 0; s < 2; s++) {
        k.spawn(
          k.A.ox + nBase[0], k.A.oy + nBase[1],
          -pp[0] * (5 + Math.random() * 8) + (Math.random() - 0.5) * 3,
          -pp[1] * (5 + Math.random() * 8) + (Math.random() - 0.5) * 3,
          C.amber, 12, 2.4
        );
      }
    }
  }
}

    // ── torso ─────────────────────────────────────────────────────────
    // exhaust pack on the back: heavy triple boiler stacks
    {
      const pack = [Tu(6, -32), Tu(32, -31), Tu(32, -16), Tu(6, -17)];
      fillPoly(k, pack, C.gunSh, C.line, 1.3);
      for (const b of [-27, -22, -17]) {
        const st = [Tu(32, b - 2.2), Tu(40, b - 1.8), Tu(40, b + 1.8), Tu(32, b + 2.2)];
        fillPoly(k, st, C.gun, C.line, 1);
        line(k, [Tu(40, b - 1.8), Tu(40, b + 1.8)], C.soot, 1.6, 1);
      }
      if (!F) for (const a of [12, 18, 24, 30]) line(k, [Tu(a, -30), Tu(a, -18)], C.soot, 1.2, 0.9);
    }
    // main mass: huge rotund barrel chest, massive boiler belly
    const mass = [
      Tu(-4, -26), Tu(-4, 25),
      Tu(8, 29), Tu(18, 31), Tu(27, 29),
      Tu(36, 22), Tu(38, -5), Tu(35, -23),
      Tu(24, -30), Tu(9, -29)
    ];
    fillPoly(k, mass, C.coal, C.line, 1.6);
    shade(k, mass, [Tu(-7, -34), Tu(42, -34), Tu(42, -7), Tu(-7, -7)], C.soot, 0.5);       // the far (back) half sits in shadow
    shade(k, mass, [Tu(23, 12), Tu(42, 12), Tu(42, 34), Tu(23, 34)], C.coalHi, 0.55);          // lit upper-front edge
    // plate seams, bolts and scars
    if (!F) {
      line(k, [Tu(10, -28), Tu(10, 28)], C.line, 1.4, 0.9);
      line(k, [Tu(27, -29), Tu(27, 28)], C.line, 1.2, 0.8);
      for (const [a, b] of [[4, -18], [4, 18], [31, -18], [31, 16]]) rivet(k, Tu(a, b), 0.9 * u);
      line(k, [Tu(30, -2), Tu(25, 3)], C.gunHi, 0.8, 0.5); // scratch
      line(k, [Tu(13, 2), Tu(11, 7)], C.gunHi, 0.7, 0.4);
    }
    // glowing seam cracks along the plate joints
    glowLine(k, [Tu(10, -26), Tu(10, -10)], heat, 0.9);
    glowLine(k, [Tu(27, -28), Tu(27, -12)], heat, 0.9);

    // ── the furnace: heavy arched blast door, diamond lattice grate & central iron damper boss ──
    {
      const fr = [
        Tu(2, -9), Tu(2, 24),
        Tu(22, 24), Tu(28, 18), Tu(32, 9), Tu(32, 4), Tu(28, -4), Tu(22, -9)
      ];
      fillPoly(k, fr, C.gunSh, C.line, 1.7);
      const win = [
        Tu(5.5, -6), Tu(5.5, 21),
        Tu(21, 21), Tu(26, 16), Tu(29.5, 8.5), Tu(29.5, 4.5), Tu(26, -1.5), Tu(21, -6)
      ];
      // interior: molten gradient, brightest at the top-middle
      const g0 = Tu(28, 7), g1 = Tu(6, 7);
      if (F) fillPoly(k, win, "#fff", null);
      else {
        const gr = ctx.createLinearGradient(g0[0], g0[1], g1[0], g1[1]);
        gr.addColorStop(0, heatCol(0.68 + 0.32 * glow));
        gr.addColorStop(1, heatCol(0.36 + 0.5 * glow));
        pathOf(ctx, win); ctx.fillStyle = gr; ctx.fill();
        // bright core
        line(k, [Tu(17, 0), Tu(17, 16)], C.hot, 5.5 * u, 0.35 + 0.55 * glow);
        glowSpot(k, Tu(17, 7.5), 20 * u, "255,240,160", 0.45 + 0.45 * glow);
      }
      // ── DIAMOND LATTICE GRATE + KILN TEETH + FORGE BOSS (no plain squares) ──
      if (!F) {
        // Triangular kiln teeth along top arch and bottom sill
        const teethTop = [
          [Tu(26, 1.5), Tu(22, 3.5), Tu(26, 5.5)],
          [Tu(29, 6), Tu(24, 7.5), Tu(29, 9)],
          [Tu(26, 9.5), Tu(22, 11.5), Tu(26, 13.5)],
          [Tu(23, 14), Tu(19.5, 16), Tu(23, 18)]
        ];
        for (const t of teethTop) fillPoly(k, t, C.soot, C.line, 1);

        const teethBtm = [
          [Tu(5.5, -3), Tu(9, -1), Tu(5.5, 1)],
          [Tu(5.5, 3.5), Tu(9.5, 5.5), Tu(5.5, 7.5)],
          [Tu(5.5, 10), Tu(9.5, 12), Tu(5.5, 14)],
          [Tu(5.5, 16.5), Tu(9, 18.5), Tu(5.5, 20.5)]
        ];
        for (const t of teethBtm) fillPoly(k, t, C.soot, C.line, 1);

        // Criss-crossing diagonal diamond bars
        line(k, [Tu(6, 0), Tu(26, 20)], C.soot, 2.2, 0.95);
        line(k, [Tu(6, -6), Tu(28, 14)], C.soot, 2.4, 0.95);
        line(k, [Tu(11, -6), Tu(29, 10)], C.soot, 2.0, 0.95);
        line(k, [Tu(6, 8), Tu(21, 21)], C.soot, 1.8, 0.95);

        line(k, [Tu(26, -2), Tu(6, 16)], C.soot, 2.2, 0.95);
        line(k, [Tu(28, 2), Tu(6, 21)], C.soot, 2.4, 0.95);
        line(k, [Tu(29, 7), Tu(12, 21)], C.soot, 2.0, 0.95);
        line(k, [Tu(21, -6), Tu(6, 8)], C.soot, 1.8, 0.95);

        // Central heavy iron damper boss (where diamond diagonals converge)
        const cCenter = Tu(17, 7.5);
        dot(k, cCenter, 4.4 * u, C.soot, C.line, 1.4);
        dot(k, cCenter, 2.8 * u, C.gunHi, C.line, 0.9);
        dot(k, cCenter, 1.2 * u, C.copper, null);
      }
      pathOf(ctx, win); ctx.lineWidth = 1.3; ctx.strokeStyle = F ? "#fff" : C.line; ctx.stroke();

      // arched copper hood above the opening, bolted
      const hood = [
        Tu(22, -10), Tu(28, -5), Tu(33, 3.5), Tu(33, 9.5), Tu(28, 19), Tu(22, 25),
        Tu(25.5, 25), Tu(31, 19), Tu(36, 9.5), Tu(36, 3.5), Tu(31, -5), Tu(25.5, -10)
      ];
      fillPoly(k, hood, C.copper, C.line, 1.3);
      if (!F) {
        rivet(k, Tu(27, -6), 0.9 * u);
        rivet(k, Tu(33, 1), 0.9 * u);
        rivet(k, Tu(34.5, 6.5), 0.9 * u);
        rivet(k, Tu(33, 12), 0.9 * u);
        rivet(k, Tu(27, 21), 0.9 * u);
      }
      // ash drawer under the opening
      fillPoly(k, [Tu(0, 1), Tu(0, 16), Tu(5, 16), Tu(5, 1)], C.gun, C.line, 1.3);
      if (!F) {
        line(k, [Tu(2.5, 4), Tu(2.5, 13)], C.copperHi, 1.4, 1);
        rivet(k, Tu(2.5, 2.5), 0.7 * u);
        rivet(k, Tu(2.5, 14.5), 0.7 * u);
      }
      // heat bloom out of the opening
      glowSpot(k, Tu(17, 7.5), 36 * u, "255,150,40", 0.28 + 0.45 * glow);
    }
    // belt + front tassets (hanging iron plates over the thighs)
    {
      const belt = [Tu(-6, -26), Tu(-6, 26), Tu(3, 27), Tu(3, -27)];
      fillPoly(k, belt, C.gun, C.line, 1.4);
      fillPoly(k, [Tu(-5, 4), Tu(-5, 15), Tu(2.5, 15), Tu(2.5, 4)], C.bronze, C.line, 1.2);   // bronze buckle block
      if (!F) { rivet(k, Tu(-1, 6.2), 0.8 * u); rivet(k, Tu(-1, 12.8), 0.8 * u); }
      fillPoly(k, [Tu(-5, 4), Tu(-5, 22), Tu(-16, 20), Tu(-16, 5)], C.gunSh, C.line, 1.3);   // front apron plate
    }
    // gorget at the base of the neck
    fillPoly(k, [Tu(32, -16), Tu(32, 16), Tu(39, 12), Tu(39, -12)], C.gun, C.line, 1.3);

 
   
    // ── fists over the handle (massive heavy gauntlets) ──
    const fist = (wr, front) => {
      const fx = wr[0] + dir[0] * 1.5 * u, fy = wr[1] + dir[1] * 1.5 * u;
      const Q = (x, y) => [fx + dir[0] * x * u + pp[0] * y * u, fy + dir[1] * x * u + pp[1] * y * u];
      const gl = [Q(-8.5, -11.5), Q(9.5, -12), Q(12, -4.5), Q(12, 4.5), Q(9.5, 12), Q(-8.5, 11.5)];
      fillPoly(k, gl, front ? C.gun : C.gunSh, C.line, 1.5);
      fillPoly(k, [Q(2, -11.8), Q(5.8, -11.8), Q(5.8, 11.8), Q(2, 11.8)], front ? C.copper : C.copperSh, C.line, 1.1);
      if (!F) { line(k, [Q(7.5, -5), Q(7.5, 5)], C.line, 1.1, 0.85); rivet(k, Q(-3, -4), 0.85 * u); rivet(k, Q(-3, 4), 0.85 * u); }
    };
  // armFw's fist, over the handle (it is the hand nearer the hammer head)

    // ── head: brutalist faceted anvil greathelm with protruding blast visor & smelter respirator jaw ──
    {
      // 1. Swept-back anvil-horn crest / thermal fin (breaks the boring round silhouette!)
      const anvilCrest = [
        Hp(0.8, -1.35), Hp(-0.3, -1.5), Hp(-1.4, -1.35),
        Hp(-1.75, -0.75), Hp(-1.3, -0.55), Hp(-0.6, -0.8), Hp(0.5, -0.95)
      ];
      fillPoly(k, anvilCrest, C.gunSh, C.line, 1.4);
      if (!F) {
        line(k, [Hp(-1.35, -1.0), Hp(-0.2, -1.2)], heatCol(0.4 + 0.4 * heat), 1.4, 0.85);
        rivet(k, Hp(-0.8, -1.1), R * 0.08);
      }

      // 2. Main faceted iron skull & brow greathelm (sharp angular planes, no boring circle)
      const helm = [
        Hp(-1.25, -0.4), Hp(-1.3, 0.4), Hp(-0.95, 0.9),
        Hp(-0.3, 1.3), Hp(0.5, 1.35), Hp(1.25, 0.9),
        Hp(1.48, 0.4), Hp(1.52, -0.05),
        Hp(1.55, -0.38),
        Hp(1.15, -0.9), Hp(0.5, -1.38), Hp(-0.4, -1.42), Hp(-1.05, -1.05)
      ];
      fillPoly(k, helm, C.coal, C.line, 1.6);
      shade(k, helm, [Hp(-2, 0.2), Hp(2, 0.2), Hp(2, 2), Hp(-2, 2)], C.soot, 0.45);
      shade(k, helm, [Hp(-1.5, -1.6), Hp(1.6, -1.6), Hp(1.6, -0.85), Hp(-1.5, -0.85)], C.coalHi, 0.4);

      // 3. Protruding chiseled blast-visor brow with bolted copper armor plate
      const browShield = [
        Hp(-0.2, -0.85), Hp(1.1, -0.85), Hp(1.55, -0.38),
        Hp(1.48, -0.05), Hp(0.9, -0.35), Hp(-0.2, -0.45)
      ];
      fillPoly(k, browShield, C.copper, C.line, 1.2);
      if (!F) {
        rivet(k, Hp(0.1, -0.65), R * 0.08);
        rivet(k, Hp(0.7, -0.6), R * 0.08);
        rivet(k, Hp(1.3, -0.35), R * 0.08);
        line(k, [Hp(-0.15, -0.82), Hp(1.5, -0.36)], C.copperHi, 0.8, 0.7);
      }

      // 4. Aggressive smelting blast-visor with molten core & vertical blast grille bars
      const slit = [Hp(0.2, -0.15), Hp(1.45, -0.12), Hp(1.42, 0.16), Hp(0.25, 0.18)];
      if (F) fillPoly(k, slit, "#fff", null);
      else {
        fillPoly(k, slit, C.soot, null);
        const a = 0.55 + 0.45 * glow;
        const pL = Hp(0.2, 0), pR = Hp(1.45, 0);
        const grS = ctx.createLinearGradient(pL[0], pL[1], pR[0], pR[1]);
        grS.addColorStop(0, "rgb(154,46,8)");
        grS.addColorStop(0.5, heatCol(0.65 + 0.35 * glow));
        grS.addColorStop(1, "rgb(255,224,138)");
        pathOf(ctx, slit); ctx.fillStyle = grS; ctx.fill();
        // Blinding molten plasma core
        line(k, [Hp(0.4, 0.0), Hp(1.35, 0.0)], "#ffffff", R * 0.22, 0.85 * a);
        glowSpot(k, Hp(1.1, 0.0), R * 1.5, "255,160,40", 0.42 * a);
        // Vertical protective blast bars across the glowing slit
        for (const vx of [0.55, 0.88, 1.18]) line(k, [Hp(vx, -0.18), Hp(vx, 0.18)], C.line, 1.4, 1);
      }
      pathOf(ctx, slit); ctx.lineWidth = 1.0; ctx.strokeStyle = F ? "#fff" : C.line; ctx.stroke();

      // 5. Heavy faceted mandible / blast mask respirator
      const jaw = [
        Hp(-0.1, 0.28), Hp(1.38, 0.24), Hp(1.42, 0.58),
        Hp(1.05, 1.25), Hp(0.4, 1.35), Hp(-0.25, 1.15)
      ];
      fillPoly(k, jaw, C.gun, C.line, 1.3);
      fillPoly(k, [Hp(0.5, 0.95), Hp(1.15, 0.65), Hp(1.0, 1.25), Hp(0.4, 1.35)], C.copper, C.line, 1.1);

      // Side circular copper damper valve / ear intake boss
      if (!F) {
        dot(k, Hp(-0.45, 0.35), R * 0.32, C.copperSh, C.line, 1.1);
        dot(k, Hp(-0.45, 0.35), R * 0.18, C.copper, null);
        rivet(k, Hp(-0.45, 0.35), R * 0.08);
        for (const b of [-0.05, 0.2, 0.45]) line(k, [Hp(-0.95, b), Hp(-0.65, b)], C.soot, R * 0.12, 0.9);
      }
    }
fist(hf, true);
    // ── LAST (like the Frozen Monarch): the rear arm (armBw), its fist and the small shoulder plate, on top of EVERYTHING ──
    arm(armBw, false);
    fist(hb, false);
    pauldron(armBw[0], 1.08, false);

    // ── steam out of the shoulder vents and the back stacks, embers off the furnace ──
    if (!F) {
      const puffs = [[Tu(37, -21), 0.0], [Tu(37, -16.5), 0.41], [[armFw[0][0] - d * 5 * u, armFw[0][1] - 12 * u], 0.17], [[hx - d * R * 0.85, hy - R * 1.1], 0.63]];
      const rate = 0.5 + 0.7 * heat;
      for (const [p, off] of puffs) {
        for (let j = 0; j < 2; j++) {
          const ph = (now * rate * 0.55 + off + j * 0.5) % 1;
          const sway = Math.sin(now * 1.7 + off * 9 + j) * 2.2 * u * ph;
          ctx.save();
          ctx.globalAlpha = (1 - ph) * (0.14 + 0.24 * heat);
          ctx.beginPath(); ctx.arc(p[0] + sway - d * 3 * u * ph, p[1] - ph * 26 * u, (1.8 + 4.4 * ph) * u, 0, TAU);
          ctx.fillStyle = C.steam; ctx.fill();
          ctx.restore();
        }
      }
      const n = 2 + Math.round(4 * heat);
      for (let i = 0; i < n; i++) {
        const ph = (now * (0.35 + 0.4 * heat) + i * 0.173) % 1;
        const o = Tu(18, 6 + Math.sin(i * 7.3) * 6), x = o[0] + Math.sin(now * 2 + i * 3.1) * 3 * u + d * ph * 4 * u, y = o[1] - ph * 30 * u;
        ctx.save();
        ctx.globalAlpha = (1 - ph) * (0.4 + 0.5 * heat);
        ctx.fillStyle = i % 2 ? C.amber : C.ember;
        ctx.fillRect(x, y, 1.5 * u + 0.4, 1.5 * u + 0.4);
        ctx.restore();
      }
    }
  }

  MW.Foundry = { draw, C };
})(typeof window !== "undefined" ? window : globalThis); 