// Mechanic Wars - Aftertaste art (render only, never touches the sim).
// Aftertaste - The Flavor of Violence: an imposing, terrifying butcher-chef.
// Masterwork overhaul matching Foundry's visual fidelity and industrial brutality:
//   * Massive hulking build with broad sloping shoulders, thick bull neck, and high-detail layered clothing
//   * Sculpted porcelain executioner mask: bone-white ceramic, dark hollow eye sockets with glowing crimson glints,
//     a chilling wide rictus grin exposing needle-sharp carved porcelain teeth, brass repair staples, and heavy leather strapping
//   * Pleated dark canvas executioner chef's cowl/toque with crimson velvet piping and brass eyelets
//   * Quilted charcoal-and-burgundy gambeson doublet with brass buttons and rolled sleeves bound by buckled leather straps
//   * Heavy waxed slaughterhouse apron: reinforced leather border trim, brass bib grommets, cross-body leather harness straps
//     with brass O-rings and buckles, deep cloth folds, and grim arterial blood splatters
//   * Heavy double-buckle leather tool belt equipped with a hanging forged-iron meat hook on a chain link,
//     a leather sheath housing 3 bone-handled carving knives with brass hilts, and a steel sharpening hone rod
//   * Heavy executioner work boots with riveted steel toe caps, thick treaded iron lug soles, and dual buckle straps
//   * BACK HAND: The Slaughterhouse Trident (a brutal blackened wrought-iron meat fork with barbed hooked tines,
//     twisted shank, brass blade-catcher crossguard, and hardwood grip)
//   * FRONT HAND: The Colossal Guillotine Cleaver (a gargantuan high-carbon steel executioner blade with notched spine,
//     circular meat-hook hole, blood fuller groove, razor-sharp mirror bevel, and arterial gore spatter)
//
// Called from character_art.js DETAIL() for id === "aftertaste".
// k = shared rig state from character_art.js, e = precomputed values (see DETAIL).
// Sizes are in u = H / 100 (H = his hitbox height); head sizes are in head-radius units (R = k.hr).
// Outputs preserved for combat logic/particles: A.cleaverTip, A.forkTip, and crimson burst particles on strike.
(function (g) {
  const MW = (g.MW = g.MW || {});
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];

  const C = {
    line: "#0A0A0D",
    lineSh: "#1A1517",

    // Apron: heavy waxed butcher's canvas, layered shading, leather hem
    apron: "#E4DCCB", apronHi: "#F3EDE1", apronSh: "#B2A790", apronDeep: "#7D725C",
    apronTrim: "#382218",

    // Tunic / gambeson: charcoal quilted wool with dark burgundy weave
    tunic: "#2E272B", tunicHi: "#453B42", tunicSh: "#1C171A",
    quiltStitch: "#574A53",

    // Leather harness, belts, straps, scabbards
    leather: "#523320", leatherHi: "#754C32", leatherSh: "#2B1A10",
    strap: "#3A2417",

    // Metalwork: burnished brass, aged copper, iron hardware
    brass: "#C89D3C", brassHi: "#E8C265", brassSh: "#7E5E1C",
    iron: "#2A2D34", ironHi: "#4B505D", ironSh: "#16171B",

    // Steel & blades: forged high-carbon damascus, razor edge
    steel: "#A2A9B4", steelHi: "#E1E6ED", steelSh: "#5D6470", steelDark: "#262930",
    wood: "#5C3E28", woodHi: "#7A5437", woodSh: "#342215",

    // Skin: brawny, scarred butcher skin
    skin: "#C88E72", skinHi: "#E0A88D", skinSh: "#915A44",

    // Porcelain mask: bone ivory, lacquered crimson, dark eye recesses
    mask: "#FBF7ED", maskHi: "#FFFFFF", maskSh: "#D0C7B2", maskDeep: "#8A816E",
    eyeHole: "#0D0A0C", eyeGlint: "#FF2B3D",
    teeth: "#FFFDF6", teethSh: "#B8B09C",
    hair: "#201815",

    // Blood & gore: fresh arterial red, clotted burgundy, dark liver
    blood: "#88151D", crimson: "#C41C2C", bloodFresh: "#E6283B", bloodGore: "#4A080E",
    stain: "#5E181E",

    // Chef's cowl / toque: heavy dark canvas with crimson piping
    toque: "#262327", toqueHi: "#3C373E", toqueSh: "#151316",
    toqueTrim: "#A81D2B",
  };

  // ── drawing helpers ────────────────────────────────────────────────
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
    if (edgeColor !== null) {
      ctx.lineJoin = "round";
      ctx.lineWidth = lw || 1.3;
      ctx.strokeStyle = k.isFlash ? "#fff" : (edgeColor || C.line);
      ctx.stroke();
    }
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
    ctx.strokeStyle = color; ctx.lineWidth = lw || 1.2; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
  }

  function dot(k, p, r, fill, edgeColor, lw) {
    const { ctx } = k;
    ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(0.2, r), 0, TAU);
    ctx.fillStyle = k.col(fill); ctx.fill();
    if (edgeColor) { ctx.lineWidth = lw || 0.8; ctx.strokeStyle = k.isFlash ? "#fff" : edgeColor; ctx.stroke(); }
  }

  function stud(k, p, r, color, hiColor) {
    if (k.isFlash) return;
    dot(k, p, r, color || C.brass, C.line, 0.6);
    dot(k, [p[0] - r * 0.3, p[1] - r * 0.3], r * 0.38, hiColor || C.brassHi, null);
  }

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

  function goreSplatter(k, center, r, color) {
    if (k.isFlash) return;
    const col = color || C.blood;
    blob(k, center, r, r * 0.7, 0.3, col, 0.85);
    dot(k, [center[0] + r * 1.2, center[1] - r * 0.4], r * 0.35, col, null);
    dot(k, [center[0] - r * 0.9, center[1] + r * 0.8], r * 0.28, col, null);
    dot(k, [center[0] + r * 0.4, center[1] + r * 1.3], r * 0.22, col, null);
  }

  // ── main draw routine ──────────────────────────────────────────────
  function draw(k, e) {
    const { d, now } = k;
    const F = k.isFlash;
    const { shW, hipW, hcw, armBw, armFw, strike, stunned } = e;
    const H = k.H, u = H / 100;
    const A = k.A, f = k.f;
    const running = k.st === (MW.STATE && MW.STATE.RUN) && Math.abs(k.vx || 0) > 0.4;
    const breathe = Math.sin(now * 2.0);

    // Dynamic belly physics: heavy jiggle when running, squash when stunned, subtle breath heave
    const bounce = running ? Math.sin((A.phase || 0) * 2 + 0.6) * 1.6 : 0;
    const squash = stunned ? 0.88 : 1;
    const swell = 1 + 0.015 * breathe;

    // Torso coordinate frame: Tu(a, b) = a along spine upward from hip, b forward in direction of facing
    let ux = shW[0] - hipW[0], uy = shW[1] - hipW[1];
    const tl = Math.hypot(ux, uy) || 1;
    ux /= tl; uy /= tl;
    let nx = -uy, ny = ux;
    if (nx * d < 0) { nx = -nx; ny = -ny; }
    const Tu = (a, b) => [hipW[0] + (ux * a + nx * b) * u, hipW[1] + (uy * a + ny * b) * u];
    const Bu = (a, b) => Tu(a + bounce * 0.5, b * squash * swell); // apron/belly frame

    // Head frame: Hp(a, b) = a forward, b downward from head center
    const hx = hcw[0], hy = hcw[1], R = k.hr * 1.14;
    const Hp = (a, b) => [hx + d * R * a, hy + R * b];

    const axisOf = (pts) => {
      const ax = pts[2][0] - pts[1][0], ay = pts[2][1] - pts[1][1];
      const l = Math.hypot(ax, ay) || 1;
      return [ax / l, ay / l];
    };

    // ── Helper to draw a brawny arm with rolled quilted sleeve and buckled bracer ──
    const drawLimb = (pts, front) => {
const [s0r, el, wr] = pts;
const s0 = [
  s0r[0] - d * 4 * u,
  s0r[1] + 8 * u
]; // shoulder sits on the side/back of the torso, not at the neck
      const ax = axisOf(pts);
      const px = -ax[1], py = ax[0];

      const sleeve = front ? C.tunic : C.tunicSh;
      const sleeveHi = front ? C.tunicHi : C.tunic;
      const skinCol = front ? C.skin : C.skinSh;
      const bracerCol = front ? C.leather : C.leatherSh;

      // 1. Muscular bare forearm
      taper(k, [mix(el, wr, 0.1), wr], 18 * u, 14.5 * u, skinCol, C.line, 1.4);
      if (!F && front) {
        // Subtle forearm muscle definition / scar
        line(k, [mix(el, wr, 0.35), mix(el, wr, 0.7)], C.skinSh, 1.5, 0.7);
        line(k, [
          [mix(el, wr, 0.45)[0] + px * 3 * u, mix(el, wr, 0.45)[1] + py * 3 * u],
          [mix(el, wr, 0.65)[0] + px * 1.5 * u, mix(el, wr, 0.65)[1] + py * 1.5 * u]
        ], C.crimson, 1.1, 0.5); // healed cut scar
      }

      // 2. Leather forearm bracer with brass buckles near wrist
      const b0 = mix(el, wr, 0.62), b1 = mix(el, wr, 0.94);
      taper(k, [b0, b1], 16.5 * u, 15 * u, bracerCol, C.line, 1.3);
      if (!F) {
        line(k, [b0, b1], front ? C.leatherHi : C.leather, 1.2, 0.8);
        const midBracer = mix(b0, b1, 0.5);
        stud(k, [midBracer[0] + px * 4 * u, midBracer[1] + py * 4 * u], 1.4 * u, C.brass, C.brassHi);
        stud(k, [midBracer[0] - px * 4 * u, midBracer[1] - py * 4 * u], 1.4 * u, C.brass, C.brassHi);
      }

      // 3. Bulky upper sleeve with quilted pleats
      taper(k, [s0, el], 21 * u, 18 * u, sleeve, C.line, 1.4);
      if (!F && front) {
        // Quilted double-stitch highlights on sleeve
        line(k, [mix(s0, el, 0.25), [mix(s0, el, 0.25)[0] + px * 6 * u, mix(s0, el, 0.25)[1] + py * 6 * u]], C.quiltStitch, 1.1, 0.7);
        line(k, [mix(s0, el, 0.6), [mix(s0, el, 0.6)[0] + px * 5.5 * u, mix(s0, el, 0.6)[1] + py * 5.5 * u]], C.quiltStitch, 1.1, 0.7);
      }

      // 4. Elbow joint with reinforced leather pad
      dot(k, el, 7.8 * u, sleeve, C.line, 1.3);
      if (!F) dot(k, el, 5.2 * u, front ? C.leather : C.leatherSh, C.line, 1.0);

      // 5. Heavy rolled sleeve cuff with strap cincher
      const c = mix(el, wr, 0.16);
      const half = 9.2 * u;
      const thick = 3.2 * u;
      fillPoly(k, [
        [c[0] + px * half - ax[0] * thick, c[1] + py * half - ax[1] * thick],
        [c[0] - px * half - ax[0] * thick, c[1] - py * half - ax[1] * thick],
        [c[0] - px * half + ax[0] * thick, c[1] - py * half + ax[1] * thick],
        [c[0] + px * half + ax[0] * thick, c[1] + py * half + ax[1] * thick]
      ], sleeveHi, C.line, 1.3);
      if (!F) {
        stud(k, [c[0] + px * 5 * u, c[1] + py * 5 * u], 1.3 * u, C.brass, C.brassHi);
      }

      // 6. Broad shoulder ball
      dot(k, s0, 9.8 * u, sleeve, C.line, 1.4);
    };

    // Heavy reinforced butcher's leather glove
    const drawGlove = (pts, front) => {
      const wr = pts[2], ax = axisOf(pts), px = -ax[1], py = ax[0];
      const gc = [wr[0] + ax[0] * 3.5 * u, wr[1] + ax[1] * 3.5 * u];
      const gCol = front ? C.leather : C.leatherSh;
      const gHi = front ? C.leatherHi : C.leather;

      // Heavy fist closed over handle
      dot(k, gc, 9.2 * u, gCol, C.line, 1.5);
      if (!F) {
        // Finger knuckle wraps & leather seams
        for (const o of [-4.2, 0, 4.2]) {
          line(k, [
            [gc[0] + ax[0] * 2 * u + px * o * u, gc[1] + ax[1] * 2 * u + py * o * u],
            [gc[0] + ax[0] * 8 * u + px * o * u, gc[1] + ax[1] * 8 * u + py * o * u]
          ], C.line, 1.2, 0.8);
          dot(k, [gc[0] + ax[0] * 7.5 * u + px * o * u, gc[1] + ax[1] * 7.5 * u + py * o * u], 1.2 * u, C.ironHi, null);
        }
        dot(k, [gc[0] - ax[0] * 2 * u, gc[1] - ax[1] * 2 * u], 4.0 * u, gHi, null);
      }
    };

    // ══════════════════════════════════════════════════════════════════
    // LAYER 1: BACK ARM + THE SLAUGHTERHOUSE TRIDENT (MEAT FORK)
    // ══════════════════════════════════════════════════════════════════
    {
      const wr = armBw[2];
      const ax = axisOf(armBw);
      const px = -ax[1] * d;
      const py = ax[0] * d;
      const Q = (x, y) => [wr[0] + ax[0] * x * u + px * y * u, wr[1] + ax[1] * x * u + py * y * u];

      // 1. Hardwood handle with brass ferrule and counterweight skull pommel
      taper(k, [Q(-14, 0), Q(26, 0)], 5.8 * u, 5.8 * u, C.wood, C.line, 1.3);
      if (!F) {
        line(k, [Q(-13, -1.2), Q(25, -1.2)], C.woodHi, 1.1, 0.8);
        stud(k, Q(-12, 0), 2.2 * u, C.brass, C.brassHi); // counterweight pommel boss
        stud(k, Q(4, 0), 1.2 * u, C.brassSh, C.brassHi); // compression pin
      }
      fillPoly(k, [Q(24, -3.2), Q(27, -3.2), Q(27, 3.2), Q(24, 3.2)], C.brass, C.line, 1.2); // brass collar

      // 2. Heavy forged blackened steel shank with decorative twisted knurling
      taper(k, [Q(27, 0), Q(40, 0)], 5.0 * u, 4.6 * u, C.iron, C.line, 1.3);
      if (!F) {
        line(k, [Q(28, -1.2), Q(39, -1.2)], C.ironHi, 1.2, 0.9);
        // Twisted iron knurls
        line(k, [Q(30, -2.5), Q(33, 2.5)], C.ironSh, 1.3, 0.9);
        line(k, [Q(34, -2.5), Q(37, 2.5)], C.ironSh, 1.3, 0.9);
      }

      // 3. Ornate wrought-iron blade-catcher crossguard with curved langets
      fillPoly(k, [
        Q(38, -10.5), Q(41, -10.5), Q(42, -5), Q(43, 0),
        Q(42, 5), Q(41, 10.5), Q(38, 10.5), Q(39, 4), Q(39, -4)
      ], C.steelDark, C.line, 1.4);
      stud(k, Q(40, 0), 2.0 * u, C.brass, C.brassHi); // center brass rosette

      // 4. Barbed hooked outer tines + long center skewer spike
      // Center tine: long double-edged piercer
      fillPoly(k, [
        Q(41, -2.2), Q(64, -1.2), Q(70, 0), Q(64, 1.2), Q(41, 2.2)
      ], C.steel, C.line, 1.3);
      if (!F) {
        line(k, [Q(42, 0), Q(68, 0)], C.steelHi, 1.2, 0.9); // center blood fuller
        // Fresh blood on spike tip
        blob(k, Q(67, 0), 2.8 * u, 1.6 * u, 0, C.bloodFresh, 0.9);
      }

      // Outer barbed hooked tines
      for (const side of [-1, 1]) {
        const y0 = side * 8;
        fillPoly(k, [
          Q(41, y0 * 0.7),
          Q(48, y0 * 1.15),
          Q(58, y0 * 1.1),
          Q(64, y0 * 0.7), // hooked tip
          Q(60, y0 * 0.4), // barb barb notch
          Q(54, y0 * 0.8),
          Q(44, y0 * 0.5)
        ], C.steel, C.line, 1.2);
        if (!F) {
          line(k, [Q(42, y0 * 0.7), Q(62, y0 * 0.8)], C.steelHi, 1.0, 0.8);
          dot(k, Q(63, y0 * 0.65), 1.2 * u, C.blood, null);
        }
      }

      A.forkTip = [A.ox + Q(70, 0)[0], A.oy + Q(70, 0)[1]];

      drawLimb(armBw, false);
      drawGlove(armBw, false);
    }

    // ══════════════════════════════════════════════════════════════════
    // LAYER 2: LEGS & HEAVY EXECUTIONER WORK BOOTS
    // ══════════════════════════════════════════════════════════════════
    const drawLeg = (pts, back) => {
      const [h, kn, ft] = pts;
      const S = (x, y) => [ft[0] + d * x * u, ft[1] + y * u];

      // Thigh & Shin trousers: thick charcoal wool with seam ridges
      taper(k, [h, kn], 27 * u, 23 * u, back ? C.tunicSh : C.tunic, C.line, 1.5);
      taper(k, [kn, mix(kn, ft, 0.88)], 23 * u, 20 * u, back ? C.tunicSh : C.tunic, C.line, 1.5);
      dot(k, kn, 10.8 * u, back ? C.tunicSh : C.tunic, null);
      if (!F && !back) {
        // Quilted knee reinforcement patch
        dot(k, kn, 8.5 * u, C.leatherSh, C.line, 1.1);
        stud(k, kn, 2.0 * u, C.brassSh, C.brassHi);
      }

      // Massive slaughterhouse boot silhouette
      const bootPoly = [
        S(-13, -19), S(-15, 0), S(22, 0), S(25, -6), S(20, -14), S(12, -19)
      ];
      fillPoly(k, bootPoly, back ? "#1A1412" : C.leatherSh, C.line, 1.6);

      // Deep lugged iron tread sole
      fillPoly(k, [S(-15, -4), S(-15, 0), S(22, 0), S(25, -5), S(23, -4)], C.iron, C.line, 1.2);
      if (!F && !back) {
        // Tread teeth cuts
        for (let tx = -11; tx <= 19; tx += 6) {
          line(k, [S(tx, -4), S(tx, 0)], C.ironHi, 1.2, 0.8);
        }
      }

      // Heavy riveted steel toe cap
      fillPoly(k, [S(14, -13), S(19, -13), S(25, -6), S(22, 0), S(15, 0), S(13, -7)], C.ironHi, C.line, 1.3);
      if (!F && !back) {
        stud(k, S(16, -10), 1.4 * u, C.brass, C.brassHi);
        stud(k, S(20, -4), 1.4 * u, C.brass, C.brassHi);
        // Blood spatter on front boot toe
        blob(k, S(21, -3), 4 * u, 2.5 * u, 0.2, C.blood, 0.8);
      }

      // Double leather straps with brass buckles over instep and shin
      taper(k, [S(-7, -15), S(11, -15)], 4.2 * u, 4.2 * u, C.leather, C.line, 1.2);
      stud(k, S(2, -15), 1.6 * u, C.brass, C.brassHi);
      taper(k, [S(-10, -8), S(14, -8)], 4.0 * u, 4.0 * u, C.leather, C.line, 1.2);
      stud(k, S(3, -8), 1.6 * u, C.brass, C.brassHi);
    };

    drawLeg(k.MP(k.legB), true);
    drawLeg(k.MP(k.legF), false);

    // ══════════════════════════════════════════════════════════════════
    // LAYER 3: TORSO & QUILTED DOUBLET (GAMBESON)
    // ══════════════════════════════════════════════════════════════════
    const torso = closedSpline([
      Tu(48, 0), Tu(45, 16), Tu(37, 30), Tu(21, 33), Tu(3, 27),
      Tu(-6, 9), Tu(-6, -9), Tu(2, -26), Tu(21, -33), Tu(37, -30), Tu(45, -16)
    ], 4);
    fillPoly(k, torso, C.tunic, C.line, 1.8);
    shade(k, torso, [Tu(-12, -42), Tu(52, -42), Tu(52, -4), Tu(-12, -4)], C.tunicSh, 0.65);

    // Double-breasted brass buttons & quilted diamond seams on chest flanks
    if (!F) {
      for (const a of [42, 34, 26]) {
        stud(k, Tu(a, 12), 2.0 * u, C.brass, C.brassHi);
        stud(k, Tu(a, -12), 2.0 * u, C.brassSh, C.brass);
        line(k, [Tu(a + 4, 22), Tu(a - 4, 8)], C.quiltStitch, 1.0, 0.6);
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // LAYER 4: THE BELLY & HEAVY WAXED SLAUGHTERHOUSE APRON
    // ══════════════════════════════════════════════════════════════════
    const belly = closedSpline([
      Bu(36, 0),
      Bu(32, 16),
      Bu(24, 28),
      Bu(9, 32),
      Bu(-8, 30),
      Bu(-20, 20),
      Bu(-25, 6),
      Bu(-24, -12),
      Bu(-16, -25),
      Bu(0, -31),
      Bu(17, -29),
      Bu(30, -18)
    ], 4);

    fillPoly(k, belly, C.apron, C.line, 1.8);

    // Heavy fabric fold shading: underside shadow & far-side core shadow
    shade(k, belly, [
      Bu(-28, -35), Bu(-9, -35), Bu(-9, 44), Bu(-28, 44)
    ], C.apronDeep, 0.65);
    shade(k, belly, [
      Bu(-22, -35), Bu(44, -35), Bu(44, -4), Bu(-22, -4)
    ], C.apronSh, 0.45);

    // Crease lines across the belly showing realistic stretched fabric tension
    if (!F) {
      line(k, [Bu(16, 27), Bu(6, 12), Bu(-3, -12)], C.apronSh, 2.0, 0.7);
      line(k, [Bu(7, 29), Bu(-4, 18), Bu(-12, -4)], C.apronSh, 2.2, 0.75);
      line(k, [Bu(25, 20), Bu(19, 5), Bu(12, -18)], C.apronHi, 1.6, 0.6); // highlight ridge
    }

    // Reinforced leather hem along bottom skirt of apron
    const apronHem = closedSpline([
      Bu(-12, 26), Bu(-20, 18), Bu(-25, 5), Bu(-23, -11), Bu(-15, -23),
      Bu(-19, -23), Bu(-27, -9), Bu(-29, 6), Bu(-23, 20), Bu(-15, 27)
    ], 3);
    fillPoly(k, apronHem, C.apronTrim, C.line, 1.2);

    // Apron Bib: upper chest shield with brass grommets
    fillPoly(k, [
      Tu(44, -16), Tu(44, 16), Tu(30, 20), Tu(26, -20)
    ], C.apron, C.line, 1.4);
    if (!F) {
      // Leather bib border
      line(k, [Tu(44, -16), Tu(44, 16)], C.apronTrim, 2.8 * u, 1);
      // Embossed brass butcher's crest / medallion on bib center
      dot(k, Tu(36, 0), 4.5 * u, C.brass, C.line, 1.2);
      stud(k, Tu(36, 0), 2.6 * u, C.brassHi, "#FFF");
    }

    // Heavy cross-body leather harness straps with brass O-rings over shoulders
    line(k, [Tu(44, 15), Tu(38, 25)], C.leather, 4.4 * u, 1);
    line(k, [Tu(44, -15), Tu(38, -25)], C.leatherSh, 4.4 * u, 1);
    if (!F) {
      stud(k, Tu(44, 14), 2.2 * u, C.brass, C.brassHi);
      stud(k, Tu(44, -14), 2.2 * u, C.brassSh, C.brassHi);
    }

    // Arterial blood splatters and gore smears across the apron
    if (!F) {
      goreSplatter(k, Bu(18, 21), 6.5 * u, C.blood);
      goreSplatter(k, Bu(6, 4), 5.0 * u, C.bloodGore);
      blob(k, Bu(-5, 14), 9.0 * u, 4.2 * u, -0.3, C.bloodFresh, 0.75); // fresh blade wipe smear
      dot(k, Bu(12, -10), 2.2 * u, C.blood, null);
      dot(k, Bu(-12, 1), 2.8 * u, C.crimson, null);
    }

    // ══════════════════════════════════════════════════════════════════
    // LAYER 5: HEAVY TOOL BELT, SCABBARD, KNIVES & MEAT HOOK
    // ══════════════════════════════════════════════════════════════════
    // Heavy weightlifter/butcher leather belt wrapping over the belly
    taper(k, spline([Tu(4, -28), Bu(5, -11), Bu(7, 8), Bu(6.5, 27), Bu(3, 41)], 4), 8.5 * u, 8.5 * u, C.leatherSh, C.line, 1.6);
    // Double brass belt buckle
    fillPoly(k, [Bu(12, 9), Bu(12, 22), Bu(2, 22), Bu(2, 9)], C.brass, C.line, 1.4);
    fillPoly(k, [Bu(9.5, 12), Bu(9.5, 19), Bu(4.5, 19), Bu(4.5, 12)], C.leatherSh, C.line, 1.1);
    stud(k, Bu(7, 15.5), 1.8 * u, C.brassHi, "#FFF");

    // Hanging tools on hip:
    {
      const sway = running ? Math.sin((A.phase || 0) * 2) * 1.8 * u : 0;

      // 1. Hanging forged-iron meat hook on a swinging chain link
      const hookBase = Tu(3, 26);
      fillPoly(k, [
        [hookBase[0] - 1.6 * u, hookBase[1]],
        [hookBase[0] + 1.6 * u, hookBase[1]],
        [hookBase[0] + 1.6 * u + sway * 0.4, hookBase[1] + 7 * u],
        [hookBase[0] - 1.6 * u + sway * 0.4, hookBase[1] + 7 * u]
      ], C.iron, C.line, 1.0); // chain link
      // Forged curved hook
      const hx0 = hookBase[0] + sway * 0.7, hy0 = hookBase[1] + 7 * u;
      fillPoly(k, [
        [hx0 - 2 * u, hy0],
        [hx0 + 2 * u, hy0],
        [hx0 + 3 * u, hy0 + 10 * u],
        [hx0 - 1 * u, hy0 + 16 * u],
        [hx0 - 7 * u, hy0 + 14 * u], // barb hook curve
        [hx0 - 8 * u, hy0 + 10 * u], // needle tip
        [hx0 - 4 * u, hy0 + 12 * u],
        [hx0 - 1 * u, hy0 + 8 * u]
      ], C.steel, C.line, 1.2);
      if (!F) {
        dot(k, [hx0 - 7.5 * u, hy0 + 10.5 * u], 1.2 * u, C.bloodFresh, null);
      }

      // 2. Leather scabbard holding 3 carved bone-handled butchering knives
      const scabbardOrigin = Tu(3, -26);
      fillPoly(k, [
        [scabbardOrigin[0] - 3 * u, scabbardOrigin[1] - 1 * u],
        [scabbardOrigin[0] + 16 * u, scabbardOrigin[1] - 1 * u],
        [scabbardOrigin[0] + 15 * u + sway * 0.5, scabbardOrigin[1] + 18 * u],
        [scabbardOrigin[0] - 2 * u + sway * 0.5, scabbardOrigin[1] + 18 * u]
      ], C.leather, C.line, 1.3);

      for (let i = 0; i < 3; i++) {
        const o = [scabbardOrigin[0] + i * 5.5 * u, scabbardOrigin[1]];
        const len = (18 - i * 2.5) * u, sw2 = sway * (0.6 + i * 0.25);
        // Bone / rosewood handle with brass pins
        fillPoly(k, [
          [o[0] - 2.0 * u, o[1]],
          [o[0] + 2.0 * u, o[1]],
          [o[0] + 2.0 * u + sw2 * 0.3, o[1] - 8 * u],
          [o[0] - 2.0 * u + sw2 * 0.3, o[1] - 8 * u]
        ], i === 1 ? C.teeth : C.wood, C.line, 1.1);
        stud(k, [o[0] + sw2 * 0.3, o[1] - 4 * u], 1.0 * u, C.brass, C.brassHi);
        // Exposed steel blade sheath tip
        fillPoly(k, [
          [o[0] - 2.0 * u + sw2, o[1] + 16 * u],
          [o[0] + 2.0 * u + sw2, o[1] + 16 * u],
          [o[0] + sw2 * 1.3, o[1] + len + 4 * u]
        ], C.steel, C.line, 1.1);
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // LAYER 6: NECK, HEAD, SCULPTED PORCELAIN MASK & EXECUTIONER COWL
    // ══════════════════════════════════════════════════════════════════
    // Thick bull neck with leather collar band
    taper(k, [Tu(40, 0), [hx, hy + R * 0.58]], 28 * u, 24 * u, C.skin, C.line, 1.5);
    taper(k, [Tu(42, -10), Tu(42, 10)], 4.2 * u, 4.2 * u, C.leatherSh, C.line, 1.1); // neck collar
    blob(k, Hp(-1.08, 0.15), R * 0.28, R * 0.44, -0.15 * d, C.hair, 1); // dark hair tufts behind neck

    // ── The Sculpted Porcelain Executioner Mask ──
    // Contoured bone-white porcelain mask with chiseled jaw, cheekbones and brow
    const mask = closedSpline([
      Hp(-1.18, -0.35),
      Hp(-0.85, -1.05),
      Hp(0.0, -1.22),
      Hp(0.85, -1.05),
      Hp(1.24, -0.32),
      Hp(1.22, 0.45),
      Hp(0.85, 0.95),
      Hp(0.2, 1.32),    // tapered chin
      Hp(-0.4, 1.25),
      Hp(-0.95, 0.85),
      Hp(-1.22, 0.35)
    ], 3);

    fillPoly(k, mask, C.mask, C.line, 1.8);
    // Smooth porcelain surface shading: cast chin shadow, cheek hollows
    shade(k, mask, [Hp(-2, 0.55), Hp(2, 0.55), Hp(2, 2.2), Hp(-2, 2.2)], C.maskSh, 0.6);
    shade(k, mask, [Hp(-2, -2), Hp(-0.5, -2), Hp(-0.5, 2), Hp(-2, 2)], C.maskDeep, 0.5);
    if (!F) {
      // Specular porcelain gloss highlights along brow and cheekbone
      line(k, [Hp(0.1, -0.9), Hp(0.7, -0.8)], C.maskHi, 2.0 * u, 0.8);
      line(k, [Hp(0.5, 0.1), Hp(0.9, 0.2)], C.maskHi, 1.6 * u, 0.7);
      // Brass repair staples / wire stitches crossing a hairline fissure on the temple
      line(k, [Hp(-0.7, -0.6), Hp(-0.4, -0.2)], C.lineSh, 1.0, 0.7); // crack
      line(k, [Hp(-0.75, -0.45), Hp(-0.55, -0.55)], C.brass, 1.4, 1.0); // staple 1
      line(k, [Hp(-0.6, -0.3), Hp(-0.4, -0.4)], C.brass, 1.4, 1.0);     // staple 2
    }

    // Hollow, sinister dark eye sockets with pinprick crimson glowing pupils
    if (stunned) {
      // Slits clamp shut with cross-hatched impact wince
      for (const a0 of [0.15, 0.72]) {
        line(k, [Hp(a0 - 0.16, -0.22), Hp(a0 + 0.16, -0.06)], C.line, 1.8, 1);
        line(k, [Hp(a0 - 0.16, -0.06), Hp(a0 + 0.16, -0.22)], C.line, 1.8, 1);
      }
    } else {
      // Near eye socket: sharp angled predatory cutout
      fillPoly(k, [
        Hp(0.52, -0.26), Hp(0.92, -0.18), Hp(0.82, 0.02), Hp(0.55, -0.04)
      ], C.eyeHole, C.line, 1.2);
      // Far eye socket
      fillPoly(k, [
        Hp(0.02, -0.24), Hp(0.32, -0.18), Hp(0.26, -0.02), Hp(0.04, -0.06)
      ], C.eyeHole, C.line, 1.2);

      if (!F) {
        // Chilling pinprick crimson glowing eyes peering out from the darkness
        dot(k, Hp(0.74, -0.14), R * 0.055, C.eyeGlint, "#FFF", 0.5);
        dot(k, Hp(0.18, -0.14), R * 0.045, C.eyeGlint, "#FFF", 0.5);
      }
    }

    // ── The Chilling Carved Rictus Smile with Needle Teeth ──
    {
      const open = strike ? 1.0 : 0.0;
      const mouthTop = [Hp(-0.25, 0.38), Hp(0.42, 0.48), Hp(1.15, 0.32)];
      const mouthLow = [Hp(1.15, 0.32), Hp(0.48, 0.88 + 0.36 * open), Hp(-0.25, 0.38)];
      const mouthPoly = spline(mouthTop, 4).concat(spline(mouthLow, 4));

      // Dark inner throat cavity with lacquered crimson border
      fillPoly(k, mouthPoly, C.bloodGore, k.isFlash ? "#fff" : C.crimson, 1.8);

      // Sharp carved porcelain needle teeth lining upper and lower jaws
      if (!F) {
        // Upper row of triangular carved teeth
        for (let t = 0; t <= 5; t++) {
          const fx = -0.12 + t * 0.22;
          fillPoly(k, [
            Hp(fx - 0.08, 0.44), Hp(fx + 0.08, 0.44), Hp(fx, 0.62 + 0.1 * open)
          ], C.teeth, C.line, 0.6);
        }
        // Lower row of triangular carved teeth
        for (let t = 0; t <= 4; t++) {
          const fx = -0.02 + t * 0.22;
          const by = 0.82 + 0.30 * open;
          fillPoly(k, [
            Hp(fx - 0.07, by), Hp(fx + 0.07, by), Hp(fx, by - 0.16)
          ], C.teeth, C.line, 0.6);
        }

        // Menacing upward-curling crimson smile slashes across the cheeks
        line(k, [Hp(1.15, 0.32), Hp(1.28, 0.16)], C.crimson, 2.0, 1.0);
        line(k, [Hp(-0.25, 0.38), Hp(-0.38, 0.22)], C.crimson, 2.0, 1.0);
        // Blood dribble from corner of mouth
        line(k, [Hp(1.12, 0.34), Hp(1.10, 0.65)], C.bloodFresh, 1.5, 0.85);
      }
    }

    // Heavy leather straps with brass buckles holding mask to skull
    line(k, [Hp(-1.18, -0.1), Hp(-1.45, -0.05)], C.leatherSh, 4.0 * u, 1);
    stud(k, Hp(-1.16, -0.1), 1.8 * u, C.brass, C.brassHi);

    // ── The Pleated Executioner Chef's Cowl / Toque ──
    {
      const cowl = closedSpline([
        Hp(-1.35, -0.38),
        Hp(-1.26, -1.25),
        Hp(-0.6, -1.85),
        Hp(0.55, -1.86),
        Hp(1.26, -1.30),
        Hp(1.38, -0.38),
        Hp(0.08, -0.58)
      ], 3);

      fillPoly(k, cowl, C.toque, C.line, 1.8);
      shade(k, cowl, [Hp(-2, -2.5), Hp(-0.7, -2.5), Hp(-0.7, 0.5), Hp(-2, 0.5)], C.toqueSh, 0.6);

      // Crimson velvet trim band along cowl base
      fillPoly(k, [
        Hp(-1.38, -0.88), Hp(1.40, -0.88), Hp(1.40, -0.52), Hp(-1.38, -0.52)
      ], C.toqueTrim, C.line, 1.4);

      if (!F) {
        // Structured pleated diagonal ridges along the crown
        for (let px = -0.8; px <= 0.8; px += 0.38) {
          line(k, [Hp(px, -0.9), Hp(px + 0.15, -1.75)], C.toqueHi, 1.6, 0.8);
        }
        // Brass eyelets along the headband
        stud(k, Hp(-0.8, -0.7), 1.4 * u, C.brass, C.brassHi);
        stud(k, Hp(0.0, -0.7), 1.4 * u, C.brass, C.brassHi);
        stud(k, Hp(0.8, -0.7), 1.4 * u, C.brass, C.brassHi);
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // LAYER 7: NEAR ARM & THE COLOSSAL GUILLOTINE CLEAVER
    // ══════════════════════════════════════════════════════════════════
    drawLimb(armFw, true);

    {
      const wr = armFw[2];
      const ax = axisOf(armFw);
      const px = -ax[1] * d;
      const py = ax[0] * d;
      const Q = (x, y) => [wr[0] + ax[0] * x * u + px * y * u, wr[1] + ax[1] * x * u + py * y * u];

      // 1. Heavy flared rosewood handle with brass compression rivets and iron skull pommel
      taper(k, [Q(-12, 0), Q(22, 0)], 6.8 * u, 6.2 * u, C.wood, C.line, 1.4);
      if (!F) {
        line(k, [Q(-11, -1.5), Q(21, -1.5)], C.woodHi, 1.3, 0.8);
        // Pommel heavy iron ring / skull boss
        stud(k, Q(-11, 0), 2.8 * u, C.ironHi, "#FFF");
        // Handle compression rivets
        stud(k, Q(-3, 0), 1.5 * u, C.brass, C.brassHi);
        stud(k, Q(7, 0), 1.5 * u, C.brass, C.brassHi);
        stud(k, Q(17, 0), 1.5 * u, C.brass, C.brassHi);
      }

      // 2. Heavy burnished brass bolster / ferrule collar
      fillPoly(k, [
        Q(20, -5), Q(24, -5), Q(24, 5), Q(20, 5)
      ], C.brass, C.line, 1.3);
      if (!F) line(k, [Q(22, -4.5), Q(22, 4.5)], C.brassHi, 1.2, 0.9);

      // 3. Colossal Guillotine Cleaver Blade Silhouette
      // Heavy high-carbon forged damascus blade with notched back spine and hanging hole
      const blade = [
        Q(22, -9),   // hilt top spine
        Q(30, -14),  // notched spine stepped back
        Q(42, -15),  // spine ridge
        Q(54, -14),  // spine near corner
        Q(58, -9),   // clipped corner bevel
        Q(58, 19),   // front cutting tip
        Q(53, 24),   // front belly flare
        Q(29, 23),   // cutting heel
        Q(22, 17)    // hilt heel
      ];

      fillPoly(k, blade, C.steelDark, C.line, 1.8);

      // Dark forged texture / hammer pit tone on spine
      shade(k, blade, [
        Q(21, -16), Q(59, -16), Q(59, -3), Q(21, -3)
      ], C.steelSh, 0.85);

      // Polished blood fuller (groove) running horizontally through the middle
      if (!F) {
        fillPoly(k, [
          Q(28, 2), Q(50, 2), Q(49, 6), Q(27, 6)
        ], C.steelSh, C.line, 1.0);
        line(k, [Q(28, 4), Q(49, 4)], C.steelHi, 1.2, 0.8);
      }

      // Wide razor-sharp mirror ground primary bevel & cutting edge
      fillPoly(k, [
        Q(24, 15), Q(52, 17), Q(58, 19), Q(53, 24), Q(29, 23), Q(22, 17)
      ], C.steelHi, C.line, 1.3);

      if (!F) {
        // Serrated edge notches / nicked blade teeth
        line(k, [Q(22, 17), Q(58, 19)], "#FFFFFF", 2.0, 0.9); // glistening razor glint
        line(k, [Q(36, 19), Q(37, 23)], C.steelDark, 1.4, 0.9); // battle notch 1
        line(k, [Q(46, 18), Q(47, 22)], C.steelDark, 1.4, 0.9); // battle notch 2

        // Circular meat-hanging hole near top front corner
        dot(k, Q(50, -7), 2.8 * u, C.steelSh, C.line, 1.2);
        dot(k, Q(50, -7), 1.6 * u, C.line, null); // cutout hole

        // Thick arterial gore and blood spatter coating the blade face and edge
        goreSplatter(k, Q(44, 15), 4.5 * u, C.blood);
        blob(k, Q(52, 20), 5.5 * u, 2.8 * u, Math.atan2(ax[1], ax[0]), C.bloodFresh, 0.9);
        dot(k, Q(34, 12), 1.8 * u, C.bloodGore, null);
      }

      // Foremost cutting tip coordinates
      const tip = Q(58, 19);

      // On active strike impact, spawn dynamic arterial droplets and gore mist
      if (strike && A.atHit !== f.hit) {
        A.atHit = f.hit;
        if (k.spawn && !F) {
          for (let i = 0; i < 14; i++) {
            k.spawn(
              A.ox + tip[0],
              A.oy + tip[1],
              d * (0.8 + Math.random() * 4.2),
              -1.8 - Math.random() * 3.2,
              i % 4 === 0 ? C.bloodFresh : (i % 2 === 0 ? C.crimson : C.bloodGore),
              24 + (Math.random() * 14 | 0),
              2.4 + Math.random() * 2.8
            );
          }
        }
      }

      A.cleaverTip = [A.ox + tip[0], A.oy + tip[1]];
    }

    drawGlove(armFw, true);
  }

  MW.Aftertaste = { draw, C };
})(typeof window !== "undefined" ? window : globalThis);
