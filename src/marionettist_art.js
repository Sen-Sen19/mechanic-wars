// Mechanic Wars - Marionettist art (render only, never touches the sim).
// A gentleman from a forgotten theater: ivory porcelain half-mask, black and violet split-tail coat, long gloved fingers with
// silver rings. His puppet (a little jointed doll, his "permanent theatrical partner") follows him around, hangs from thin
// lavender strings tied to his fingertips, and does the actual hitting during his 4-hit basic combo.
//   MW.Marionettist.draw(k, e)         -> the man himself (called from character_art.js DETAIL() for id === "marionettist")
//   MW.Marionettist.drawPuppet(ctx, f) -> puppet + strings, drawn by render.js right after his body
// Design document: "Marionettist - The Twisted Performer" (looks only). k = shared rig state, e = precomputed values.
(function (g) {
  const MW = (g.MW = g.MW || {});
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];
  const ease = (t) => t * t * (3 - 2 * t);

  // Palette from the design document.
  const C = {
    line: "#080710", coat: "#11101B", coat2: "#29203D", hi: "#51406D", royal: "#7955A8",
    ivory: "#D8D0C5", ash: "#77717D", silver: "#A5A0B4", silverHi: "#d9d5e6", glow: "#C5A5FF", hair: "#211B2C", hairHi: "#3a2c58",
    skin: "#e4ddea", skinSh: "#b3a9c2", boot: "#0b0a12", wood: "#8a6b4a", woodDk: "#4a3622",
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
    k.ctx.lineWidth = lw || 1.2;
    k.ctx.strokeStyle = k.isFlash ? "#fff" : edgeColor;
    k.ctx.stroke();
  }
  function fillPoly(k, pts, fill, edgeColor, lw) {
    pathOf(k.ctx, pts);
    k.ctx.fillStyle = k.col(fill);
    k.ctx.fill();
    edge(k, edgeColor || C.line, lw);
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
  function dot(k, p, r, fill, edgeColor, lw) {
    k.ctx.beginPath(); k.ctx.arc(p[0], p[1], Math.max(0.4, r), 0, TAU);
    k.ctx.fillStyle = k.col(fill); k.ctx.fill();
    if (edgeColor) edge(k, edgeColor, lw || 0.8);
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

  // coat tails + dangling charms: small spring state, once per drawn frame
  function tailUpdate(k) {
    const A = k.A;
    let c = A.mTail;
    if (!c) c = A.mTail = { x: [0, 0, 0], y: [0, 0, 0], t: -1 };
    if (c.t < 0 || Math.abs(k.now - c.t) > 0.004) {
      c.t = k.now;
      const sp = clamp(k.vx || 0, -9, 9), vy = clamp(k.vy || 0, -16, 16);
      for (let i = 0; i < 3; i++) {
        const w = (i + 1) / 3;
        const tx = -sp * 2.1 * w + Math.sin(k.now * 1.9 + i * 1.3) * 0.9 * w;
        const ty = -vy * 0.45 * w + Math.sin(k.now * 2.6 + i) * 0.5 * w;
        const rate = 0.2 - i * 0.04;
        c.x[i] += (tx - c.x[i]) * rate;
        c.y[i] += (ty - c.y[i]) * rate;
      }
    }
    return c;
  }

  // A long, slender gloved hand: palm, four separated fingers (two segments each, bare porcelain tips), a thumb and silver rings.
  // wr = wrist, dir = angle of the forearm, spread = how far the fingers fan out, wig = finger wiggle (puppeteering).
  // Returns the fingertip positions (strings are tied to them).
  function hand(k, wr, dir, spread, wig, front, u) {
    const { ctx } = k;
    const tips = [];
    const L1 = 6.2 * u, L2 = 5.2 * u;
    const base = [wr[0] + Math.cos(dir) * 2.2 * u, wr[1] + Math.sin(dir) * 2.2 * u];
    const fingers = [[-1.0, 1.0], [-0.34, 1.12], [0.34, 1.05], [1.0, 0.86]];
    const glove = front ? C.coat2 : C.coat;
    // palm
    fillPoly(k, [
      [wr[0] + Math.cos(dir - 1.5) * 2.3 * u, wr[1] + Math.sin(dir - 1.5) * 2.3 * u],
      [base[0] + Math.cos(dir - 1.1) * 2.6 * u, base[1] + Math.sin(dir - 1.1) * 2.6 * u],
      [base[0] + Math.cos(dir + 1.1) * 2.6 * u, base[1] + Math.sin(dir + 1.1) * 2.6 * u],
      [wr[0] + Math.cos(dir + 1.5) * 2.3 * u, wr[1] + Math.sin(dir + 1.5) * 2.3 * u],
    ], glove, C.line, 1);
    fingers.forEach(([off, len], i) => {
      const a0 = dir + off * spread + Math.sin(k.now * 2.2 + i * 1.7) * 0.05;
      const curl = 0.18 + (wig ? Math.sin(k.now * 14 + i * 1.9) * wig : 0) + off * 0.08;
      const p0 = [base[0] + Math.cos(dir + off * 1.0) * (off * 1.6) * u * 0.0 + Math.cos(dir + 1.5708) * off * 1.5 * u, base[1] + Math.sin(dir + 1.5708) * off * 1.5 * u];
      const p1 = [p0[0] + Math.cos(a0) * L1 * len, p0[1] + Math.sin(a0) * L1 * len];
      const p2 = [p1[0] + Math.cos(a0 + curl) * L2 * len, p1[1] + Math.sin(a0 + curl) * L2 * len];
      // outline pass, glove pass, then the bare porcelain fingertip
      ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = k.isFlash ? "#fff" : C.line; ctx.lineWidth = 2.5 * u + 0.6;
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
      ctx.strokeStyle = k.col(glove); ctx.lineWidth = 1.5 * u + 0.4;
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
      const tp = mix(p1, p2, 0.45);
      ctx.strokeStyle = k.col(C.skin); ctx.lineWidth = 1.5 * u + 0.2;
      ctx.beginPath(); ctx.moveTo(tp[0], tp[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
      ctx.restore();
      if (i === 1 || i === 3) dot(k, mix(p0, p1, 0.6), 1.0 * u + 0.25, C.silverHi, C.line, 0.5); // silver rings
      tips.push(p2);
    });
    // thumb
    const ta = dir + (front ? -1 : 1) * (1.0 + spread * 0.4);
    const t1 = [base[0] + Math.cos(ta) * 4.4 * u, base[1] + Math.sin(ta) * 4.4 * u];
    line(k, [[base[0], base[1]], t1], C.line, 2.4 * u + 0.6, 1);
    line(k, [[base[0], base[1]], t1], glove, 1.4 * u + 0.4, 1);
    // silver knuckle studs + purple stitching
    for (let i = -1; i <= 1; i++) dot(k, [base[0] + Math.cos(dir + 1.5708) * i * 1.7 * u, base[1] + Math.sin(dir + 1.5708) * i * 1.7 * u], 0.45 * u + 0.2, C.silver, null);
    return tips;
  }

  function draw(k, e) {
    const { ctx, d, now } = k;
    const F = k.isFlash;
    const { shW, hipW, hcw, armBw, armFw, windU, strike, stunned } = e;
    const H = k.H, u = H / 100;
    const torL = k.torL, sw = k.sw, hw = k.hw, hr = k.hr, legL = k.legL;
    const A = k.A;
    const pulse = 0.5 + 0.5 * Math.sin(now * 2.3);
    const en = clamp(0.35 + 0.15 * pulse + (strike ? 0.4 : 0) + windU * 0.35 + (stunned ? 0.2 : 0), 0, 1); // eye / charm glow

    // torso frame: T(a, b) = a along the spine (0 = hip, torL = shoulders), b toward the front
    let ux = shW[0] - hipW[0], uy = shW[1] - hipW[1];
    const tl = Math.hypot(ux, uy) || 1;
    ux /= tl; uy /= tl;
    let nx = -uy, ny = ux;
    if (nx * d < 0) { nx = -nx; ny = -ny; }
    const T = (a, b) => [hipW[0] + ux * a + nx * b, hipW[1] + uy * a + ny * b];
    // head frame: Hp(a, b) = a forward, b down (in head-radius units); the head is tilted a little, as if for an audience
    const hx = hcw[0], hy = hcw[1], hrx = hr * 1.25;
    const tiltA = 0.1 * d;
    const Hp = (a, b) => {
      const ca = Math.cos(tiltA), sa = Math.sin(tiltA);
      const px = d * a, py = b;
      return [hx + hrx * (px * ca - py * sa), hy + hrx * (px * sa + py * ca)];
    };
    const tail = tailUpdate(k);

    // first frame of a hit: a few violet flecks
    if (stunned && !A.mHurt && k.spawn && !F) {
      for (let i = 0; i < 7; i++) k.spawn(A.ox + hcw[0] + (Math.random() - 0.5) * 16, A.oy + hcw[1] + 6 + Math.random() * 16, (Math.random() - 0.5) * 3, -Math.random() * 2 - 0.3, i % 2 ? "#C5A5FF" : "#51406D", 18, 2.2);
    }
    A.mHurt = stunned;

    // ── 1) split coat tails: one long, one short (asymmetrical), violet lining, silver trim, charms on the tips ──
    {
      const top1 = T(10, -hw * 0.5), top2 = T(1, -hw * 0.36), topM = T(7, -hw * 0.1);
      const longTip = [hipW[0] - d * 13 * u + tail.x[2], hipW[1] + legL * 0.98 + tail.y[2] * 0.6];
      const midNotch = [hipW[0] - d * 5 * u + tail.x[1] * 0.8, hipW[1] + legL * 0.5 + tail.y[1] * 0.4];
      const shortTip = [hipW[0] + d * 1 * u + tail.x[0] * 0.6, hipW[1] + legL * 0.72 + tail.y[0] * 0.4];
      const longMid = [hipW[0] - d * 11 * u + tail.x[1], hipW[1] + legL * 0.6 + tail.y[1] * 0.5];
      // long tail (back) and short tail (front), each a pointed blade of cloth
      fillPoly(k, [top1, T(2, -hw * 0.45), longMid, longTip, [longTip[0] + d * 7 * u, longTip[1] - 5 * u], midNotch], C.coat, C.line, 1.2);
      fillPoly(k, [T(7, -hw * 0.18), topM, midNotch, shortTip, [shortTip[0] - d * 6 * u, shortTip[1] - 4 * u]], C.coat2, C.line, 1.1);
      // violet lining peeking along the inner edge of the long tail
      fillPoly(k, [midNotch, [longTip[0] + d * 7 * u, longTip[1] - 5 * u], [longTip[0] + d * 3.6 * u, longTip[1] - 9 * u], mix(midNotch, longMid, 0.5)], C.royal, C.line, 0.7);
      if (!F) {
        // asymmetric silver embroidery + the little theater emblem on the back
        line(k, [mix(top1, longTip, 0.2), mix(longMid, longTip, 0.4), mix(longMid, longTip, 0.8)], C.silver, 0.8, 0.8);
        line(k, [mix(topM, shortTip, 0.3), mix(midNotch, shortTip, 0.7)], C.silver, 0.7, 0.6);
        const em = mix(longMid, top1, 0.45);
        dot(k, em, 2.2 * u, C.coat2, C.silver, 0.7);
        line(k, [[em[0] - 1.1 * u, em[1] + 0.7 * u], [em[0], em[1] - 1.2 * u], [em[0] + 1.1 * u, em[1] + 0.7 * u]], C.silverHi, 0.6, 0.9);
        // charms hanging from both tips on thin chains
        for (const [tp, ch] of [[longTip, 5.5], [shortTip, 4]]) {
          const sw2 = Math.sin(now * 3 + tp[0] * 0.1) * 0.8;
          line(k, [tp, [tp[0] + sw2, tp[1] + ch * u * 0.7]], C.silver, 0.6, 0.9);
          dot(k, [tp[0] + sw2, tp[1] + ch * u], 1.4 * u, C.silver, C.line, 0.6);
        }
      }
    }

    // ── 3) rear leg: slim trousers, pointed boot with silver tip ──
    const leg = (pts, isBack) => {
      const [h, kn, ft] = pts;
      const col = isBack ? C.coat : C.coat2;
      taper(k, [h, kn], 8.6 * u, 6.6 * u, col, C.line, 1.1);
      taper(k, [kn, ft], 6.6 * u, 5.4 * u, col, C.line, 1.1);
      line(k, [mix(h, kn, 0.1), mix(kn, ft, 0.9)], C.royal, 0.7, 0.55); // purple seam pattern
      const bt = mix(kn, ft, 0.5);
      taper(k, [bt, ft], 6.2 * u, 5.8 * u, C.boot, C.line, 1.1);
      fillPoly(k, [
        [ft[0] - d * 3.4 * u, ft[1] - 5 * u], [ft[0] + d * 3.2 * u, ft[1] - 5 * u], [ft[0] + d * 3.6 * u, ft[1] - 2.4 * u],
        [ft[0] + d * 15 * u, ft[1] + 0.2 * u], [ft[0] + d * 14 * u, ft[1] + 1.2 * u], [ft[0] - d * 4 * u, ft[1] + 1.2 * u],
      ], C.boot, C.line, 1.1);
      line(k, [[ft[0] + d * 3.6 * u, ft[1] - 2 * u], [ft[0] + d * 14.5 * u, ft[1] + 0.5 * u]], C.silver, 0.9, 0.9); // silver toe edge
      dot(k, [bt[0] + d * 0.6 * u, bt[1]], 0.8 * u, C.silver, null);
    };
       leg(k.MP(k.legB), true);

    // ── raised puppeteering arm: now BEHIND the torso and head ──
    {
      const [s0, el, wr] = armFw;
      taper(k, [s0, el], 7.6 * u, 6.4 * u, C.coat, C.line, 1.1);
      taper(k, [el, wr], 6.4 * u, 5 * u, C.coat, C.line, 1.1);
      const dirF = Math.atan2(wr[1] - el[1], wr[0] - el[0]);
      const cuffA = mix(el, wr, 0.64);
      taper(k, [cuffA, wr], 6.6 * u, 6.0 * u, C.coat2, C.line, 0.9);
      line(k, [mix(cuffA, wr, 0.5), wr], C.royal, 0.6, 0.8);
      const busy = windU > 0 || strike;
      const tips = hand(k, wr, dirF, 0.38 + (strike ? 0.2 : 0), busy ? 0.3 : 0.07, true, u);
      A.mTips = tips.map((p) => [A.ox + p[0], A.oy + p[1]]);
      if (!F && busy) glow(k, tips[1][0], tips[1][1], 7 * u, 0.18, "197,165,255");
    }


    // ── 4) torso: fitted black high-collar shirt, violet waistcoat with silver buttons, the long tailcoat ──
    fillPoly(k, [T(2, -hw * 0.48), T(torL * 0.96, -sw * 0.36), T(torL * 1.0, sw * 0.34), T(2, hw * 0.46)], C.coat, C.line, 1.3);
    // waistcoat V
    fillPoly(k, [T(0, -hw * 0.2), T(torL * 0.86, -sw * 0.06), T(torL * 0.9, sw * 0.26), T(torL * 0.4, sw * 0.3), T(-1, hw * 0.34)], C.coat2, C.line, 1.1);
    if (!F) {
      for (let i = 0; i < 5; i++) dot(k, T(torL * (0.12 + i * 0.16), sw * 0.12), 0.8 * u + 0.15, C.silverHi, C.line, 0.4); // silver buttons
      line(k, [T(torL * 0.18, sw * 0.24), T(torL * 0.5, sw * 0.2), T(torL * 0.8, sw * 0.14)], C.royal, 0.7, 0.8); // embroidery
      line(k, [T(torL * 0.22, -sw * 0.05), T(torL * 0.55, -sw * 0.02), T(torL * 0.8, -sw * 0.0)], C.royal, 0.6, 0.6);
    }
    // sharp pointed lapels + tall collar standing behind the neck
    fillPoly(k, [T(torL * 0.55, sw * 0.32), T(torL * 0.96, sw * 0.3), T(torL * 1.02, -sw * 0.02), T(torL * 0.78, sw * 0.12)], C.coat, C.line, 1);
    fillPoly(k, [T(torL * 0.9, -sw * 0.28), T(torL * 1.22, -sw * 0.3), T(torL * 1.28, -sw * 0.14), T(torL * 1.0, -sw * 0.06)], C.coat, C.line, 1.1);
    line(k, [T(torL * 1.0, -sw * 0.28), T(torL * 1.2, -sw * 0.28), T(torL * 1.26, -sw * 0.14)], C.silver, 0.7, 0.8);
    // brooch near the upper chest
    {
      const br = T(torL * 0.8, sw * 0.18);
      dot(k, br, 1.7 * u, C.silver, C.line, 0.7);
      dot(k, br, 0.8 * u, F ? "#fff" : C.glow, null);
      glow(k, br[0], br[1], 7 * u, 0.12 + 0.14 * en, "197,165,255");
    }
    // belt: silver buckle + two wooden puppet-face charms on short chains
    fillPoly(k, [T(6, -hw * 0.5), T(6, hw * 0.48), T(1, hw * 0.48), T(1, -hw * 0.5)], C.boot, C.line, 1);
    {
      const bk = T(3.5, hw * 0.08);
      fillPoly(k, [[bk[0] - 2 * u, bk[1] - 2 * u], [bk[0] + 2 * u, bk[1] - 2 * u], [bk[0] + 2 * u, bk[1] + 2 * u], [bk[0] - 2 * u, bk[1] + 2 * u]], C.silver, C.line, 0.8);
      for (const [a, b] of [[2, -hw * 0.4], [2, hw * 0.34]]) {
        const p0 = T(a, b), sw3 = Math.sin(now * 3.2 + b) * 0.8 + tail.x[0] * 0.2;
        const p1 = [p0[0] + sw3, p0[1] + 4.6 * u];
        line(k, [p0, p1], C.silver, 0.6, 0.9);
        dot(k, [p1[0], p1[1] + 1.6 * u], 2 * u, C.wood, C.woodDk, 0.6);
        if (!F) { dot(k, [p1[0] - 0.7 * u, p1[1] + 1.3 * u], 0.3 * u + 0.15, C.line, null); dot(k, [p1[0] + 0.7 * u, p1[1] + 1.3 * u], 0.3 * u + 0.15, C.line, null); }
      }
    }
    // little silver chain on the collar
    if (!F) line(k, spline([T(torL * 0.98, -sw * 0.04), T(torL * 0.86, sw * 0.12), T(torL * 0.7, sw * 0.2), T(torL * 0.6, sw * 0.14)], 4), C.silver, 0.6, 0.85);

    leg(k.MP(k.legF), false);

    // ── 5) head: neck, porcelain face, the half-mask, glowing eye, smile, swept-back hair ──
    {
      fillPoly(k, [Hp(-0.3, 0.55), Hp(0.5, 0.6), Hp(0.55, 1.5), Hp(-0.4, 1.45)], C.skinSh, C.line, 1);
      const face = [Hp(-0.4, -0.95), Hp(0.5, -1.0), Hp(0.95, -0.66), Hp(1.02, -0.36), Hp(1.04, -0.1), Hp(1.22, 0.24), Hp(1.04, 0.32), Hp(1.04, 0.5), Hp(1.0, 0.7), Hp(0.82, 0.98), Hp(0.45, 1.08), Hp(-0.1, 0.98), Hp(-0.55, 0.55), Hp(-0.65, -0.3)];
      // creepy porcelain-white face (no mask): chalk white, faint lilac shading under the brow and cheek
      fillPoly(k, face, F ? C.skin : "#f7f4f9", C.line, 1.2);
      if (!F) {
        ctx.save(); ctx.globalAlpha = 0.5;
        pathOf(ctx, [Hp(-0.5, 0.2), Hp(0.1, 0.55), Hp(0.6, 0.95), Hp(0.1, 1.04), Hp(-0.3, 0.8)]);
        ctx.fillStyle = C.skinSh; ctx.fill();
        ctx.restore();
        line(k, [Hp(0.3, -0.62), Hp(0.62, -0.7), Hp(1.0, -0.56)], C.skinSh, 0.9, 0.8); // faint brow shadow
        // thin, raised, too-pleased brows
        line(k, [Hp(0.5, -0.56), Hp(0.74, -0.68), Hp(0.98, -0.52)], C.hair, 0.9, 0.95);
        line(k, [Hp(-0.02, -0.52), Hp(0.2, -0.62), Hp(0.4, -0.5)], C.hair, 0.8, 0.9);
        // hollow shadows under the eyes
        line(k, [Hp(0.5, 0.02), Hp(0.72, 0.1), Hp(0.94, 0.0)], C.skinSh, 0.9, 0.85);
        line(k, [Hp(-0.04, 0.0), Hp(0.14, 0.08), Hp(0.32, 0.0)], C.skinSh, 0.8, 0.8);
      }
      // eyes: wide, hollow black doll eyes with a tiny lavender pinprick of light (no friendly pupil)
      {
        const eyes = [[Hp(0.72, -0.24), 1], [Hp(0.17, -0.22), 0.78]], wide = stunned ? 1.35 : 1;
        for (const [e, sz] of eyes) {
          ctx.beginPath();
          ctx.ellipse(e[0], e[1], Math.max(1.3, hrx * 0.2) * sz * wide, Math.max(1.7, hrx * 0.28) * sz * wide, tiltA, 0, TAU);
          ctx.fillStyle = F ? "#ffffff" : "#07040c"; ctx.fill();
          if (!F) {
            glow(k, e[0], e[1], 6 * u * sz, 0.22 + 0.25 * en, "197,165,255");
            ctx.fillStyle = stunned ? "#ffffff" : C.glow;
            ctx.beginPath(); ctx.arc(e[0] + d * 0.3 * u, e[1] - 0.2 * u, Math.max(0.5, hrx * 0.045) * sz, 0, TAU); ctx.fill();
          }
        }
      }
      // the stitched, impossibly wide grin: a dark crescent running from the front corner almost to the ear,
      // crossed by black thread stitches, with little cut-lines at both corners
      {
        const mp = (t) => { // quadratic curve: front corner -> low middle -> back corner
          const x0 = 0.98, y0 = 0.5, cx = 0.42, cy = 1.02, x1 = -0.28, y1 = 0.26, w0 = (1 - t) * (1 - t), w1 = 2 * t * (1 - t), w2 = t * t;
          return [w0 * x0 + w1 * cx + w2 * x1, w0 * y0 + w1 * cy + w2 * y1];
        };
        const top = [], low = [];
        for (let i = 0; i <= 14; i++) {
          const t = i / 14, p = mp(t), th = 0.03 + 0.1 * Math.sin(Math.PI * t); // thin slit, opening a little in the middle
          top.push(Hp(p[0], p[1] - 0.02)); low.unshift(Hp(p[0] + 0.02 * (1 - t), p[1] + th));
        }
        fillPoly(k, top.concat(low), F ? "#ffffff" : "#12081a", C.line, 0.9);
        if (!F) {
          // thread stitches across the grin (spaced out so the mouth stays readable)
          for (let i = 1; i < 14; i += 2) {
            const p = mp(i / 14), lean = 0.05 * (i % 4 === 1 ? 1 : -1);
            line(k, [Hp(p[0] + lean, p[1] - 0.12), Hp(p[0] - lean, p[1] + 0.22)], "#0a0610", 0.75, 1);
          }
          // cut corners at both ends
          const e0 = mp(0), e1 = mp(1);
          line(k, [Hp(e0[0], e0[1]), Hp(e0[0] + 0.12, e0[1] - 0.22)], "#0a0610", 0.9, 0.95);
          line(k, [Hp(e1[0], e1[1]), Hp(e1[0] - 0.1, e1[1] - 0.2)], "#0a0610", 0.9, 0.95);
          line(k, [Hp(e0[0] - 0.05, e0[1] + 0.12), Hp(e0[0] + 0.1, e0[1] - 0.04)], "#0a0610", 0.8, 0.9);
        }
      }
      // swept-back, slightly messy black-violet hair with a few loose strands over the forehead
      fillPoly(k, [Hp(1.0, -0.78), Hp(0.62, -1.18), Hp(0.0, -1.3), Hp(-0.72, -1.1), Hp(-1.18, -0.4), Hp(-1.26, 0.3), Hp(-0.92, 0.76), Hp(-0.6, 0.3), Hp(-0.42, -0.2), Hp(0.0, -0.58), Hp(0.5, -0.8)], C.hair, C.line, 1.1);
      if (!F) {
        for (const [x0, y0, x1, y1] of [[0.9, -0.84, -0.7, -0.7], [0.55, -1.08, -0.9, -0.2], [0.1, -1.18, -1.05, 0.4]]) line(k, [Hp(x0, y0), Hp((x0 + x1) / 2, (y0 + y1) / 2 - 0.1), Hp(x1, y1)], C.hairHi, 0.9, 0.8);
        const jig = Math.sin(now * 2.6) * 0.04;
        taper(k, [Hp(0.8, -0.95), Hp(0.95 + jig, -0.7), Hp(0.86, -0.38)], 1.8 * u, 0.5 * u, C.hair, C.line, 0.5, 3); // loose strand
        taper(k, [Hp(0.5, -1.0), Hp(0.66 + jig, -0.72), Hp(0.58, -0.5)], 1.5 * u, 0.4 * u, C.hair, C.line, 0.5, 3);
        // silver hair ornament above the temple
        fillPoly(k, [Hp(0.0, -0.78), Hp(0.14, -0.9), Hp(0.28, -0.78), Hp(0.14, -0.62)], C.silverHi, C.line, 0.7);
        // dangling theater-bell earring
        const er = Hp(-0.12, 0.45), sw4 = Math.sin(now * 3.4 + tail.x[0]) * 0.8;
        line(k, [er, [er[0] + sw4, er[1] + 3 * u]], C.silver, 0.6, 1);
        fillPoly(k, [[er[0] + sw4 - 1.3 * u, er[1] + 5 * u], [er[0] + sw4, er[1] + 2.7 * u], [er[0] + sw4 + 1.3 * u, er[1] + 5 * u]], C.silverHi, C.line, 0.5);
      }
    }

       // ── idle arm: drawn LAST, on top of the body, head and everything else ──
    {
      const [s0, el, wr] = armBw;
      taper(k, [s0, el], 7.4 * u, 6.2 * u, C.coat, C.line, 1.1);
      taper(k, [el, wr], 6.2 * u, 5 * u, C.coat, C.line, 1.1);
      const dirB = Math.atan2(wr[1] - el[1], wr[0] - el[0]);
      taper(k, [mix(el, wr, 0.66), wr], 5.6 * u, 5 * u, C.coat2, C.line, 0.8); // long cuff over the wrist
      hand(k, wr, dirB, 0.34, 0, false, u);
    }


    // a few violet motes while he puppeteers
    if (!F && k.spawn && (windU > 0 || strike) && Math.random() < 0.25 && A.mTips) {
      const p = A.mTips[(Math.random() * 4) | 0];
      k.spawn(p[0], p[1], (Math.random() - 0.5) * 0.6, -0.3 - Math.random() * 0.5, "#C5A5FF", 16, 1.6);
    }
  }

  // ═════════════ the puppet ═════════════
  // A small jointed doll in a miniature violet coat: ivory head with a painted face, silver joint studs, wooden hands.
  // Its position and pose are driven by Marionettist's real attack state (f.state / f.chainIndex / f.hit); this file only draws.
  // Lives next to him (home), glides out on the wind-up, strikes where the real hit shape is, and floats back on recovery.
  const KINDS = ["jab", "cross", "kick", "slam"];
  const ang = (deg) => (deg * Math.PI) / 180;

  function drawPuppet(ctx, f, fx) {
    const S = MW.STATE, s = f.stats, A = f._art;
    if (!A) return;
    const d = f.facing < 0 ? -1 : 1;
    const nowS = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
    const P = f._pup || (f._pup = { x: null, y: 0, t: nowS, spawnedSlam: -1 });
    const dt = clamp(nowS - P.t, 0, 0.05);
    P.t = nowS;
    const cx = f.x + s.width / 2, fy = f.y + s.height;
    const st = f.state;
    const ko = st === S.KO, stun = st === S.HITSTUN;
    const atk = f.hit && f.hit.puppet && (st === S.ATTACK_STARTUP || st === S.ATTACK_ACTIVE || st === S.ATTACK_RECOVERY);

    // jerky, stop-motion idle: the sway only changes ten times a second
    const jt = Math.floor(nowS * 9);
    const jerk = Math.sin(jt * 1.9) * 1.6, jerk2 = Math.sin(jt * 2.7 + 1);
    const hx = cx + d * (s.width / 2 + 30) + jerk * 0.6;
    const hy = fy - 6 - 2.5 * Math.sin(nowS * 2.1) - (f.grounded === false ? 4 : 0);

    // ---- target position and pose ----
    let tx = hx, ty = hy, kind = "idle", ph = "idle", t = 0, fast = 9;
    if (atk) {
      const idx = clamp(f.chainIndex | 0, 0, 3);
      kind = KINDS[idx];
      const front = cx + d * (s.width / 2 + (f.hit.puppetReach || f.hit.range * 0.7)); // out to the enemy (puppetReach is set per hit in fighter.js)
      fast = 28;
      if (st === S.ATTACK_STARTUP) { ph = "wind"; t = clamp(1 - f.stateTimer / Math.max(1, f.hit.startup), 0, 1); tx = lerp(hx, front, ease(clamp(t * 1.25, 0, 1))); }
      else if (st === S.ATTACK_ACTIVE) { ph = "strike"; t = clamp(1 - f.stateTimer / Math.max(1, f.hit.active), 0, 1); tx = front; }
      else { ph = "rec"; t = clamp(1 - f.stateTimer / Math.max(1, f.hit.recovery), 0, 1); tx = lerp(front, hx, ease(t)); }
      if (kind === "slam") { // yanked up on the strings, then driven down at the enemy
        const up = 46;
        if (ph === "wind") ty = hy - up * ease(t);
        else if (ph === "strike") ty = hy - up * (1 - clamp(t * 3.5, 0, 1));
      }
    } else if (ko) { tx = hx - d * 8; ty = hy + 6; kind = "limp"; }
    else if (stun) { tx = hx - d * 14; ty = hy + 4; kind = "dizzy"; fast = 14; }

    if (P.x === null || Math.abs(P.x - cx) > 400) { P.x = tx; P.y = ty; }
    const a = 1 - Math.exp(-dt * fast);
    P.x += (tx - P.x) * a;
    P.y += (ty - P.y) * a;
    // slam landing: dust and chips the first drawn frame of the strike
    if (kind === "slam" && ph === "strike" && P.y > fy - 14 && P.spawnedSlam !== f.chainIndex + 1000 * (f.stateTimer > 0 ? 1 : 0) && fx && fx.spawn) {
      P.spawnedSlam = f.chainIndex + 1000 * (f.stateTimer > 0 ? 1 : 0);
      for (let i = 0; i < 8; i++) fx.spawn(P.x + d * 8 + (Math.random() - 0.5) * 20, fy - 2, (Math.random() - 0.5) * 3.4, -Math.random() * 2.4, i % 2 ? "#C5A5FF" : "#9a93ab", 18, 2.8);
    }
    if (!atk) P.spawnedSlam = -1;

    // ---- the pose, as segment angles (0 = forward, 90 = down, in puppet space facing +x) ----
    let lean = 0, rot = 0, headTilt = 0;
    let lu = 80, ll = 72, bu = 100, bl = 92; // lead / back arm: upper + lower segment
    let legA = [6, -6];                      // lead / back leg angle from straight down
    const sway = jerk2 * 6;
    if (kind === "idle") { lu = 78 + sway; ll = 66 + sway; bu = 104 - sway; bl = 96; legA = [4, -4]; lean = 0.04 * jerk2; headTilt = 0.1; }
    else if (kind === "jab") {
      if (ph === "wind") { lu = lerp(70, 165, ease(t)); ll = lerp(60, 215, ease(t)); lean = -0.12 * t; }
      else if (ph === "strike") { lu = lerp(165, 0, clamp(t * 4, 0, 1)); ll = lerp(215, 0, clamp(t * 4, 0, 1)); lean = 0.22; bu = 140; bl = 160; }
      else { lu = lerp(0, 70, ease(t)); ll = lerp(0, 60, ease(t)); lean = 0.22 * (1 - t); }
    } else if (kind === "cross") {
      if (ph === "wind") { bu = lerp(100, -150, ease(t)); bl = lerp(92, -130, ease(t)); lean = -0.18 * t; }
      else if (ph === "strike") { bu = lerp(-150, 25, clamp(t * 3, 0, 1)); bl = lerp(-130, 5, clamp(t * 3, 0, 1)); lean = 0.3; lu = 150; ll = 120; }
      else { bu = lerp(25, 100, ease(t)); bl = lerp(5, 92, ease(t)); lean = 0.3 * (1 - t); }
    } else if (kind === "kick") {
      if (ph === "wind") { rot = ease(t) * Math.PI; legA = [lerp(5, 135, ease(t)), -8]; lu = 20; ll = 10; bu = 160; bl = 150; }
      else if (ph === "strike") { rot = Math.PI + t * Math.PI; legA = [lerp(90, 85, t), -10]; lu = 15; ll = 0; bu = 165; bl = 160; }
      else { rot = 0; legA = [lerp(85, 5, ease(t)), -6]; lu = lerp(15, 78, ease(t)); ll = lerp(0, 66, ease(t)); }
    } else if (kind === "slam") {
      if (ph === "wind") { lu = lerp(70, -95, ease(t)); ll = lerp(60, -88, ease(t)); bu = lerp(100, -85, ease(t)); bl = lerp(92, -92, ease(t)); legA = [lerp(5, 14, t), lerp(-5, -14, t)]; lean = -0.1 * t; }
      else if (ph === "strike") { const q = clamp(t * 3.5, 0, 1); lu = lerp(-95, 35, q); ll = lerp(-88, 25, q); bu = lerp(-85, 50, q); bl = lerp(-92, 40, q); lean = lerp(-0.1, 0.9, q); legA = [30, 10]; }
      else { lean = lerp(0.9, 0, ease(t)); lu = lerp(35, 70, ease(t)); ll = lerp(25, 60, ease(t)); bu = lerp(50, 100, ease(t)); bl = lerp(40, 92, ease(t)); legA = [lerp(30, 5, t), lerp(10, -5, t)]; }
    } else if (kind === "dizzy") {
      lu = 100 + jerk2 * 20; ll = 110 - jerk2 * 20; bu = 80 - jerk2 * 20; bl = 70 + jerk2 * 20; legA = [10 * jerk2, -10 * jerk2]; lean = -0.2 + 0.08 * jerk2; headTilt = -0.3;
    } else if (kind === "limp") {
      rot = Math.PI / 2; lu = 95; ll = 100; bu = 90; bl = 95; legA = [10, -4];
    }

    // ---- draw (puppet space: origin at the feet, facing +x, mirrored by d) ----
    const invBase = ctx.getTransform ? ctx.getTransform().inverse() : null;
    const wp = (x, y) => { // local -> world (the transform the world is drawn under)
      if (!invBase) return [x, y];
      const p = invBase.multiply(ctx.getTransform()).transformPoint(new DOMPoint(x, y));
      return [p.x, p.y];
    };
    const pts = {}; // string anchor points in world space
    ctx.save();
    ctx.translate(P.x, P.y);
    ctx.scale(d * 1.2, 1.2); // a doll about half his size
    // soft ground shadow
    if (!ko) { ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.ellipse(0, fy - P.y + 1, 9, 2.2, 0, 0, TAU); ctx.fill(); }
    ctx.translate(0, -22); ctx.rotate(rot); ctx.translate(0, 22);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const OUT = C.line;
    const seg = (x0, y0, ang0, len) => [x0 + Math.cos(ang(ang0)) * len, y0 + Math.sin(ang(ang0)) * len];
    const limb = (p0, p1, w, col) => {
      ctx.strokeStyle = OUT; ctx.lineWidth = w + 1.6; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    };
    const stud = (p, r) => { ctx.fillStyle = C.silver; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.6; ctx.stroke(); };
    const arm = (sh, a1, a2, col) => {
      const el = seg(sh[0], sh[1], a1, 8), hd = seg(el[0], el[1], a2, 7.5);
      limb(sh, el, 3, col); limb(el, hd, 2.6, col);
      stud(el, 1.3);
      ctx.fillStyle = C.ivory; ctx.beginPath(); ctx.arc(hd[0], hd[1], 2.3, 0, TAU); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.8; ctx.stroke();
      return hd;
    };
    const hip = [0, -17];
    // back arm, back leg
    const shB = [-1.5, -31];
    const handB = arm(shB, bu, bl, C.coat);
    const legFn = (angDeg, col) => {
      const a0 = ang(90 + angDeg);
      const kn = [hip[0] + Math.cos(a0) * 8, hip[1] + Math.sin(a0) * 8];
      const a1 = ang(90 + angDeg * 0.6 - (angDeg > 60 ? 50 : 0));
      const ft = [kn[0] + Math.cos(a1) * 8.2, kn[1] + Math.sin(a1) * 8.2];
      limb(hip, kn, 3.2, col); limb(kn, ft, 2.8, col); stud(kn, 1.3);
      ctx.fillStyle = C.boot; ctx.beginPath(); ctx.moveTo(ft[0] - 2, ft[1] - 1.4); ctx.lineTo(ft[0] + 5.2, ft[1] + 0.6); ctx.lineTo(ft[0] - 2, ft[1] + 1.6); ctx.closePath(); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.7; ctx.stroke();
      return kn;
    };
    legFn(legA[1], C.coat);
    // body (leans from the hips)
    ctx.save();
    ctx.translate(0, -17); ctx.rotate(lean); ctx.translate(0, 17);
    ctx.fillStyle = C.coat2; ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-5, -32); ctx.lineTo(5.2, -32); ctx.lineTo(4.2, -16); ctx.lineTo(-7.5, -10); ctx.lineTo(-3.6, -16); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.royal; ctx.beginPath(); ctx.moveTo(0.5, -31); ctx.lineTo(4.2, -31); ctx.lineTo(3.4, -17); ctx.lineTo(-0.6, -17); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.silverHi; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(2.4, -28 + i * 4.2, 0.6, 0, TAU); ctx.fill(); }
    // head: ivory painted face, a crack, a faint violet eye, a thin smile, black hair tuft, jaw hinge
    const hd0 = [1, -39];
    ctx.save();
    ctx.translate(hd0[0], hd0[1]); ctx.rotate(headTilt);
    ctx.fillStyle = C.ivory; ctx.strokeStyle = OUT; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.arc(0, 0, 6.2, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.hair; ctx.beginPath(); ctx.arc(-0.6, -1.4, 6.2, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.glow; ctx.shadowColor = C.glow; ctx.shadowBlur = 5; ctx.beginPath(); ctx.arc(2.6, -0.4, 1.1, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = C.line; ctx.beginPath(); ctx.arc(-1.6, -0.4, 0.9, 0, TAU); ctx.fill();
    ctx.strokeStyle = C.ash; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(1, -4); ctx.lineTo(-0.2, -1.4); ctx.lineTo(0.6, 0.2); ctx.stroke();
    ctx.strokeStyle = C.line; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-1.2, 3); ctx.quadraticCurveTo(1.6, 4.4, 3.4, 2.6); ctx.stroke();
    pts.head = wp(0, -6.4);
    ctx.restore();
    ctx.fillStyle = C.silver; ctx.fillRect(-0.8, -34, 2.4, 3); // neck peg
    // lead arm
    const shF = [3, -31];
    const handF = arm(shF, lu, ll, C.coat2);
    pts.handF = wp(handF[0], handF[1]);
    ctx.restore();
    // lead leg (in front of the body)
    const knF = legFn(legA[0], C.coat2);
    pts.knee = wp(knF[0], knF[1]);
    pts.handB = wp(handB[0], handB[1]);
    ctx.restore();

    // ---- strings: thin lavender lines from his fingertips to the puppet's head, hands and knee ----
    const tips = A.mTips;
    if (tips && tips.length >= 4 && pts.head) {
      const taut = atk ? 1 : ko ? 0 : stun ? 0.3 : 0.8;
      const links = [[tips[1], pts.handF], [tips[2], pts.head], [tips[3], pts.handB], [tips[0], pts.knee]];
      ctx.save();
      ctx.lineCap = "round";
      links.forEach(([from, to], i) => {
        if (!from || !to) return;
        const mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2;
        const sag = (1 - taut) * 16 + 1.5 + Math.sin(nowS * 3 + i) * 0.8;
        ctx.globalAlpha = ko ? 0.25 : 0.55;
        ctx.strokeStyle = "#C5A5FF"; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.quadraticCurveTo(mx, my + sag, to[0], to[1]); ctx.stroke();
        ctx.globalAlpha = (ko ? 0.25 : 0.55) * 0.25;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.quadraticCurveTo(mx, my + sag, to[0], to[1]); ctx.stroke();
      });
      ctx.restore();
    }
  }

  MW.Marionettist = { draw, drawPuppet, PALETTE: C };
})(globalThis);