
// Mechanic Wars - Errata art (render only, never touches the sim).
// Errata - The Broken Entity
//
// NORMAL FORM:
// Tall, slender man with messy split black-and-white hair, heterochromatic
// eyes, a subtle smirk, an asymmetrical black-and-ivory gothic coat,
// crimson stitching, dark trousers, and black boots.
//
// GLITCH:
// The WHOLE character is rendered into one off-screen image before corruption.
// No individual limb is independently glitched.
// Levels:
//   0 = normal
//   1 = minor
//   2 = unstable
//   3 = critical
//
// Visual only. Never changes hitboxes, physics, or simulation timing.
// MW.Errata.force = 0..3; null = automatic.

(function (g) {
  "use strict";

  const MW = (g.MW = g.MW || {});
  const TAU = Math.PI * 2;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (p, q, t) => [
    lerp(p[0], q[0], t),
    lerp(p[1], q[1], t),
  ];

  // Deterministic noise. No Math.random() inside drawing.
  const hash = (n) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  // ── NORMAL-FORM PALETTE ────────────────────────────────────────────

  const C = {
    line: "#080810",

    // Predominantly black gothic coat.
    coat: "#101016",
    coat2: "#252532",
    coatHi: "#393947",

    // Ivory is a secondary asymmetric accent.
    ivory: "#E8E8EF",
    ivory2: "#C8C8D5",
    ivorySh: "#A7A7B8",

    stitch: "#D2284C",

    pants: "#171720",
    pants2: "#252532",

    boot: "#0B0B13",
    bootHi: "#353544",

    skin: "#E8DDE0",
    skinSh: "#BCAAB2",

    // Split black-and-white hair.
    hair: "#E8E8EF",
    hair2: "#D0D0DD",
    hairSh: "#A7A7B8",
    hairBlk: "#101016",
    hairBlk2: "#292936",

    eyeRed: "#FF315A",
    eyeGray: "#C8CBD6",
    sclera: "#F3F1F2",

    lip: "#A9646E",
  };

  // Corruption colours are effects only.
  const G = {
    crimson: "#FF315A",
    cyan: "#00E5FF",
    magenta: "#FF32D2",
    violet: "#813CFF",
    white: "#FFFFFF",
    black: "#080810",
  };

  const GL = [
    G.crimson,
    G.cyan,
    G.magenta,
    G.violet,
    G.white,
  ];

  // ── DRAWING HELPERS ────────────────────────────────────────────────

  function pathOf(ctx, pts, close) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);

    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i][0], pts[i][1]);
    }

    if (close !== false) {
      ctx.closePath();
    }
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

  // Catmull-Rom spline.
  function spline(pts, n) {
    if (pts.length < 3) {
      return pts.slice();
    }

    const out = [];

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(i + 2, pts.length - 1)];

      for (let j = 0; j < n; j++) {
        const t = j / n;
        const t2 = t * t;
        const t3 = t2 * t;

        out.push([
          0.5 * (
            2 * p1[0] +
            (-p0[0] + p2[0]) * t +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
            (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
          ),
          0.5 * (
            2 * p1[1] +
            (-p0[1] + p2[1]) * t +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
          ),
        ]);
      }
    }

    out.push(pts[pts.length - 1]);
    return out;
  }

  // Ribbon with changing width.
  function taper(k, pts, w0, w1, fill, edgeColor, lw, smooth) {
    if (smooth) {
      pts = spline(pts, smooth);
    }

    const n = pts.length;
    const L = [];
    const R = [];

    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(i - 1, 0)];
      const b = pts[Math.min(i + 1, n - 1)];

      let tx = b[0] - a[0];
      let ty = b[1] - a[1];

      const len = Math.hypot(tx, ty) || 1;

      tx /= len;
      ty /= len;

      const w = lerp(w0, w1, i / (n - 1)) / 2;

      L.push([
        pts[i][0] - ty * w,
        pts[i][1] + tx * w,
      ]);

      R.push([
        pts[i][0] + ty * w,
        pts[i][1] - tx * w,
      ]);
    }

    fillPoly(k, L.concat(R.reverse()), fill, edgeColor, lw);
  }

  function line(k, pts, color, lw, alpha) {
    if (k.isFlash) {
      return;
    }

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

  function stitch(k, pts, lw) {
    if (k.isFlash) {
      return;
    }

    const { ctx } = k;

    ctx.save();
    pathOf(ctx, pts, false);

    ctx.strokeStyle = C.stitch;
    ctx.lineWidth = lw || 0.8;
    ctx.lineCap = "butt";

    if (ctx.setLineDash) {
      ctx.setLineDash([1.8, 1.5]);
    }

    ctx.stroke();
    ctx.restore();
  }

  // ═══════════════════════════════════════════════════════════════════
  // NORMAL FORM
  // ═══════════════════════════════════════════════════════════════════

  function drawBody(k, e) {
    const { ctx, d, now } = k;
    const F = k.isFlash;

    const {
      shW,
      hipW,
      hcw,
      armBw,
      armFw,
      windU,
      strike,
      stunned,
    } = e;

    const H = k.H;
    const u = H / 100;

    const torL = k.torL;
    const sw = k.sw;
    const hw = k.hw;
    const hr = k.hr;
    const legL = k.legL;

    const vx = clamp(k.vx || 0, -9, 9);
    const vy = clamp(k.vy || 0, -16, 16);

    // Torso frame.
    let ux = shW[0] - hipW[0];
    let uy = shW[1] - hipW[1];

    const tl = Math.hypot(ux, uy) || 1;

    ux /= tl;
    uy /= tl;

    let nx = -uy;
    let ny = ux;

    if (nx * d < 0) {
      nx = -nx;
      ny = -ny;
    }

    const T = (a, b) => [
      hipW[0] + ux * a + nx * b,
      hipW[1] + uy * a + ny * b,
    ];

    const J = (o, a, b) => [
      o[0] + ux * a + nx * b,
      o[1] + uy * a + ny * b,
    ];

    // Head frame.
    const hx = hcw[0];
    const hy = hcw[1];
    const hrx = hr * 1.2;

    const Hp = (a, b) => [
      hx + d * hrx * a,
      hy + hrx * b,
    ];

    // Cloth movement.
    const flut = (p, w, ph) => [
      p[0] -
        vx * 2.5 * w * w -
        d * 1.4 * w +
        Math.sin(now * 2.3 + ph) * 1.2 * w,

      p[1] -
        vy * 0.5 * w +
        Math.sin(now * 3.1 + ph * 1.3) * 0.9 * w -
        0.6 * w,
    ];

    // ── 1. BACK COAT PANEL ──────────────────────────────────────────

    {
      const pts = [
        T(torL * 0.96, -sw * 0.34),
        T(torL * 0.4, -hw * 0.66),
        T(2, -hw * 0.72),
        flut(T(-legL * 0.38, -hw * 1.0), 0.35, 0.4),
        flut(T(-legL * 0.72, -hw * 1.05), 0.8, 1.1),
        flut(T(-legL * 0.98, -hw * 0.86), 1.1, 2.0),
        flut(T(-legL * 0.7, -hw * 0.3), 0.8, 2.6),
        flut(T(-legL * 0.3, hw * 0.1), 0.4, 3.2),
        T(4, hw * 0.2),
        T(torL * 0.4, hw * 0.1),
      ];

      fillPoly(k, pts, C.coat, C.line, 1.2);

      if (!F) {
        line(
          k,
          [pts[2], pts[3], pts[4]],
          C.coat2,
          1.6,
          0.9
        );

        line(
          k,
          [
            mix(pts[2], pts[7], 0.5),
            mix(pts[3], pts[6], 0.5),
            mix(pts[4], pts[6], 0.62),
          ],
          C.coatHi,
          0.9,
          0.7
        );

        stitch(k, [pts[3], pts[4], pts[5], pts[6]], 0.9);
      }

      // Narrow ivory accent along the outer edge.
      const inset = [
        mix(pts[2], pts[3], 0.10),
        mix(pts[3], pts[4], 0.12),
        mix(pts[4], pts[5], 0.14),
        mix(pts[5], pts[6], 0.12),
        mix(pts[6], pts[7], 0.10),
      ];

      taper(
        k,
        inset,
        2.8 * u,
        1.4 * u,
        C.ivory,
        C.line,
        0.5
      );
    }

    // ── 2. BACK ARM ─────────────────────────────────────────────────

    const arm = (pts, front) => {
      const [s0, el, wr] = pts;

      const sl = front ? C.coat : C.coat;
      const sl2 = front ? C.coat2 : C.coat2;
      const cuff = front ? C.ivory : C.coat;

      taper(k, [s0, el], 6.0 * u, 4.9 * u, sl, C.line, 1.1);
      taper(k, [el, wr], 4.9 * u, 4.0 * u, sl2, C.line, 1.1);

      const vx0 = wr[0] - el[0];
      const vy0 = wr[1] - el[1];
      const len = Math.hypot(vx0, vy0) || 1;

      const tx = vx0 / len;
      const ty = vy0 / len;
      const qx = -ty;
      const qy = tx;

      const P = (t, q) => [
        el[0] + tx * len * t + qx * q * u,
        el[1] + ty * len * t + qy * q * u,
      ];

      line(
        k,
        [P(0.04, -2.3), P(0.12, 0.2), P(0.04, 2.3)],
        C.coatHi,
        0.9,
        0.75
      );

      fillPoly(
        k,
        [
          P(0.7, -3.0),
          P(1.02, -2.7),
          P(1.02, 2.7),
          P(0.7, 3.0),
        ],
        cuff,
        C.line,
        1
      );

      stitch(k, [P(0.76, -2.8), P(0.76, 2.8)], 0.7);

      // Slender hand and long fingers.
      const Gp = (t, q) => [
        wr[0] + (tx * t + qx * q) * u,
        wr[1] + (ty * t + qy * q) * u,
      ];

      fillPoly(
        k,
        [
          Gp(-1, -2.4),
          Gp(2.6, -2.6),
          Gp(7.2, -2.0),
          Gp(9.2, -0.4),
          Gp(8.2, 1.2),
          Gp(7.0, 2.2),
          Gp(2.6, 2.6),
          Gp(-1, 2.4),
        ],
        C.skin,
        C.line,
        0.9
      );

      for (const t of [5.0, 6.6]) {
        line(
          k,
          [Gp(t, -2.0), Gp(t + 0.8, 1.8)],
          C.skinSh,
          0.6,
          0.8
        );
      }

      fillPoly(
        k,
        [
          Gp(1.0, 2.2),
          Gp(4.4, 3.8),
          Gp(5.8, 3.2),
          Gp(3.0, 1.8),
        ],
        C.skin,
        C.line,
        0.6
      );

      return Gp(8.6, 0);
    };

    arm(armBw, true);

    // ── 3. BACK LEG ─────────────────────────────────────────────────

    const leg = (pts, isBack) => {
      const [h, kn, ft] = pts;

      const tr = isBack ? C.pants : C.pants2;

      taper(k, [h, kn], 9.6 * u, 6.6 * u, tr, C.line, 1.1);
      taper(k, [kn, ft], 6.6 * u, 4.8 * u, tr, C.line, 1.1);

      line(
        k,
        [mix(h, kn, 0.1), mix(h, kn, 0.9)],
        C.coatHi,
        0.8,
        0.5
      );

      const bt = mix(kn, ft, 0.4);

      taper(k, [bt, ft], 5.8 * u, 5.4 * u, C.boot, C.line, 1.1);

      fillPoly(
        k,
        [
          [ft[0] - d * 4.4 * u, ft[1] - 6 * u],
          [ft[0] + d * 4 * u, ft[1] - 6 * u],
          [ft[0] + d * 4.6 * u, ft[1] - 2.8 * u],
          [ft[0] + d * 13.4 * u, ft[1] - 0.6 * u],
          [ft[0] + d * 12.6 * u, ft[1] + 1.2 * u],
          [ft[0] - d * 5 * u, ft[1] + 1.2 * u],
        ],
        C.boot,
        C.line,
        1.1
      );

      line(
        k,
        [
          [ft[0] + d * 6 * u, ft[1] - 2.4 * u],
          [ft[0] + d * 12.4 * u, ft[1] - 0.8 * u],
        ],
        C.bootHi,
        0.9,
        0.7
      );

      const bc = mix(kn, ft, 0.38);

      stitch(
        k,
        [
          [bc[0] - d * 3.4 * u, bc[1]],
          [bc[0] + d * 3.4 * u, bc[1] + 0.6 * u],
        ],
        0.8
      );

      line(
        k,
        [
          [ft[0] - d * 3.4 * u, ft[1] - 7.6 * u],
          [ft[0] + d * 3.6 * u, ft[1] - 7.2 * u],
        ],
        C.bootHi,
        1.2,
        0.8
      );
    };

    leg(k.MP(k.legB), true);

    // ── 4. TORSO ────────────────────────────────────────────────────

    fillPoly(
      k,
      [
        T(torL * 0.98, -sw * 0.3),
        T(torL * 1.0, sw * 0.3),
        T(torL * 0.6, sw * 0.36),
        T(2, hw * 0.5),
        T(2, -hw * 0.58),
        T(torL * 0.5, -hw * 0.5),
      ],
      C.coat2,
      C.line,
      1.2
    );

    // Asymmetric ivory coat panel.
    fillPoly(
      k,
      [
        T(torL * 0.98, -sw * 0.32),
        T(torL * 1.0, -sw * 0.08),
        T(torL * 0.5, -hw * 0.1),
        T(2, -hw * 0.12),
        T(2, -hw * 0.34),
        T(torL * 0.5, -hw * 0.32),
      ],
      C.ivory,
      C.line,
      1.1
    );

    stitch(
      k,
      [
        T(torL * 1.0, -sw * 0.08),
        T(torL * 0.5, -hw * 0.1),
        T(2, -hw * 0.12),
      ],
      0.9
    );

    // Black front coat with angled lapel.
    fillPoly(
      k,
      [
        T(torL * 1.0, -sw * 0.1),
        T(torL * 1.02, sw * 0.32),
        T(torL * 0.64, sw * 0.4),
        T(2, hw * 0.56),
        T(2, -hw * 0.1),
        T(torL * 0.5, -hw * 0.12),
      ],
      C.coat,
      C.line,
      1.2
    );

    fillPoly(
      k,
      [
        T(torL * 1.0, sw * 0.02),
        T(torL * 0.74, sw * 0.18),
        T(torL * 0.52, hw * 0.1),
        T(torL * 0.8, -sw * 0.04),
      ],
      C.coat2,
      C.line,
      0.8
    );

    line(
      k,
      [
        T(torL * 0.98, sw * 0.3),
        T(torL * 0.64, sw * 0.39),
        T(4, hw * 0.55),
      ],
      C.ivory2,
      1.3,
      0.95
    );

    line(
      k,
      [
        T(torL * 0.9, sw * 0.1),
        T(torL * 0.5, hw * 0.3),
        T(6, hw * 0.36),
      ],
      C.coatHi,
      0.9,
      0.7
    );

    stitch(
      k,
      [
        T(torL * 0.94, sw * 0.24),
        T(torL * 0.62, sw * 0.33),
        T(4, hw * 0.46),
      ],
      0.8
    );

    // Belt and buckle.
    fillPoly(
      k,
      [
        T(7, -hw * 0.58),
        T(7, hw * 0.54),
        T(2, hw * 0.54),
        T(2, -hw * 0.58),
      ],
      C.coat2,
      C.line,
      1.1
    );

    fillPoly(
      k,
      [
        J(T(4.5, hw * 0.1), 1.6, -2.2),
        J(T(4.5, hw * 0.1), 1.6, 2.2),
        J(T(4.5, hw * 0.1), -1.6, 2.2),
        J(T(4.5, hw * 0.1), -1.6, -2.2),
      ],
      C.ivory2,
      C.line,
      0.8
    );

    // ── 5. FRONT LEG AND COAT FLAP ──────────────────────────────────

    leg(k.MP(k.legF), false);

    {
      const pts = [
        T(7, -hw * 0.1),
        T(7, hw * 0.62),
        flut(T(-legL * 0.1, hw * 0.84), 0.2, 0.8),
        flut(T(-legL * 0.34, hw * 0.64), 0.45, 1.5),
        flut(T(-legL * 0.5, hw * 0.06), 0.7, 2.4),
        flut(T(-legL * 0.24, -hw * 0.14), 0.4, 3.0),
      ];

      fillPoly(k, pts, C.coat, C.line, 1.2);

      if (!F) {
        line(
          k,
          [pts[0], mix(pts[3], pts[4], 0.4)],
          C.coat2,
          1.8,
          0.9
        );

        line(
          k,
          [mix(pts[1], pts[2], 0.3), mix(pts[2], pts[3], 0.5)],
          C.coatHi,
          0.8,
          0.6
        );

        stitch(k, [pts[2], pts[3], pts[4], pts[5]], 0.9);
      }
    }

    // ── 6. FRONT ARM ─────────────────────────────────────────────────

    const hand = arm(armFw, true);

    // ── 7. HEAD AND NECK ────────────────────────────────────────────

    const nb = T(torL * 1.0, 0);

    fillPoly(
      k,
      [
        Hp(-0.3, 0.4),
        Hp(0.5, 0.5),
        Hp(0.56, 1.6),
        Hp(-0.4, 1.55),
      ],
      C.skinSh,
      C.line,
      1
    );

    // High ivory collar.
    fillPoly(
      k,
      [
        J(nb, -3, -sw * 0.34),
        J(nb, 8.4 * u, -sw * 0.34),
        J(nb, 11 * u, -sw * 0.1),
        J(nb, 3 * u, sw * 0.0),
        J(nb, -3, sw * 0.04),
      ],
      C.ivory,
      C.line,
      1.1
    );

    stitch(
      k,
      [
        J(nb, 1.4, -sw * 0.3),
        J(nb, 8.6 * u, -sw * 0.28),
        J(nb, 10.4 * u, -sw * 0.1),
      ],
      0.7
    );

    // ── BACK HAIR: BEHIND THE NECK AND FACE ──────────────────────────

    {
      const lock = (a0, b0, dx, dy, w, col, ph) => {
        const p0 = Hp(a0, b0);
        const tip = Hp(a0 + dx, b0 + dy);
        const fl2 = flut(tip, 0.5, ph);

        const mid = [
          (p0[0] + fl2[0]) / 2 - d * u,
          (p0[1] + fl2[1]) / 2,
        ];

        const edgeCol =
          col === C.hairBlk || col === C.hairBlk2
            ? C.hairBlk
            : C.hair2;

        taper(
          k,
          [p0, mid, fl2],
          w * u,
          0.7 * u,
          col,
          edgeCol,
          0.5,
          4
        );
      };

      lock(-0.7, -0.3, -0.9, 1.5, 4.6, C.hairBlk2, 0.3);
      lock(-0.9, -0.5, -0.6, 1.7, 4.4, C.hair2, 1.2);
      lock(-0.5, -0.4, -0.8, 1.2, 3.8, C.hairBlk, 2.1);
      lock(-1.0, -0.2, -0.4, 1.6, 4.0, C.hair, 2.9);
    }

    // ── FACE ────────────────────────────────────────────────────────

    {
      const face = [
        Hp(-0.35, -0.95),
        Hp(0.55, -1.02),
        Hp(0.95, -0.7),
        Hp(1.0, -0.42),
        Hp(1.04, -0.18),
        Hp(1.26, 0.2),
        Hp(1.02, 0.3),
        Hp(1.04, 0.42),
        Hp(0.98, 0.54),
        Hp(0.96, 0.7),
        Hp(0.8, 1.0),
        Hp(0.5, 1.12),
        Hp(0.0, 1.0),
        Hp(-0.55, 0.55),
        Hp(-0.6, -0.3),
      ];

      fillPoly(k, face, C.skin, C.line, 1.3);

      if (!F) {
        ctx.save();
        ctx.globalAlpha = 0.4;

        pathOf(
          ctx,
          [
            Hp(0.1, 0.1),
            Hp(0.78, 0.28),
            Hp(0.86, 0.84),
            Hp(0.5, 1.06),
            Hp(-0.1, 0.95),
          ]
        );

        ctx.fillStyle = C.skinSh;
        ctx.fill();
        ctx.restore();

        // Subtle smirk.
        line(
          k,
          [Hp(0.8, 0.56), Hp(0.9, 0.58), Hp(0.99, 0.5)],
          C.lip,
          1.3,
          1
        );

        line(
          k,
          [Hp(0.99, 0.5), Hp(1.02, 0.43)],
          C.lip,
          1.1,
          1
        );

        line(
          k,
          [Hp(0.74, 0.4), Hp(0.8, 0.5)],
          C.skinSh,
          0.8,
          0.8
        );

        line(
          k,
          [Hp(0.9, 0.42), Hp(1.04, 0.36)],
          "#8c5560",
          0.7,
          0.5
        );

        // Nose.
        line(
          k,
          [Hp(1.04, -0.12), Hp(1.2, 0.18), Hp(1.02, 0.27)],
          C.skinSh,
          0.8,
          0.7
        );
      }

      // Heterochromatic eyes.
      const eye = (a, b, w, iris, glowOn) => {
        const p0 = Hp(a, b);
        const p1 = Hp(a + w, b - 0.04);
        const top = Hp(a + w * 0.5, b - 0.16);
        const bot = Hp(a + w * 0.5, b + 0.1);

        pathOf(ctx, [p0, top, p1, bot]);

        ctx.fillStyle = k.col(C.sclera);
        ctx.fill();

        edge(k, C.line, 0.8);

        if (!F) {
          const ic = Hp(a + w * 0.62, b - 0.03);

          ctx.save();

          if (glowOn) {
            ctx.shadowColor = C.eyeRed;
            ctx.shadowBlur = 5;
          }

          ctx.fillStyle = iris;

          ctx.beginPath();
          ctx.ellipse(
            ic[0],
            ic[1],
            Math.max(0.9, hrx * 0.11),
            Math.max(1.2, hrx * 0.17),
            0,
            0,
            TAU
          );
          ctx.fill();

          ctx.restore();

          ctx.fillStyle = C.line;
          ctx.beginPath();
          ctx.arc(
            ic[0] + d * 0.2,
            ic[1],
            Math.max(0.45, hrx * 0.05),
            0,
            TAU
          );
          ctx.fill();

          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(ic[0] - d * 0.5, ic[1] - 0.6, 0.35, 0, TAU);
          ctx.fill();
        }

        return top;
      };

      // Dark, tired eye shadows.
      if (!F) {
        ctx.save();
        ctx.globalAlpha = 0.75;

        pathOf(
          ctx,
          [
            Hp(0.26, -0.34),
            Hp(0.68, -0.38),
            Hp(0.72, -0.18),
            Hp(0.35, -0.12),
          ]
        );

        ctx.fillStyle = "#65545F";
        ctx.fill();

        pathOf(
          ctx,
          [
            Hp(0.7, -0.34),
            Hp(1.02, -0.34),
            Hp(1.02, -0.15),
            Hp(0.75, -0.12),
          ]
        );

        ctx.fillStyle = "#65545F";
        ctx.fill();

        ctx.restore();
      }

      eye(0.74, -0.22, 0.26, C.eyeGray, false);
      eye(0.34, -0.22, 0.32, C.eyeRed, true);

      // Eyelids and eyebrows.
      line(
        k,
        [Hp(0.32, -0.3), Hp(0.5, -0.4), Hp(0.68, -0.34)],
        C.line,
        1.4,
        1
      );

      line(
        k,
        [Hp(0.74, -0.3), Hp(0.98, -0.36)],
        C.line,
        1.2,
        1
      );

      line(
        k,
        [Hp(0.22, -0.54), Hp(0.5, -0.72), Hp(0.7, -0.62)],
        C.hairBlk,
        1.5,
        1
      );

      line(
        k,
        [Hp(0.78, -0.56), Hp(1.0, -0.52)],
        C.hairBlk,
        1.3,
        1
      );
    }

    // ── SPLIT BLACK-AND-WHITE GOTHIC HAIR ────────────────────────────
    // Drawn after the face so the fringe naturally overlaps the forehead.

    {
      // Main white hair silhouette.
      const cap = [
        Hp(1.0, -0.72),
        Hp(0.72, -1.22),
        Hp(0.1, -1.36),
        Hp(-0.7, -1.18),
        Hp(-1.14, -0.7),
        Hp(-1.18, 0.05),
        Hp(-0.96, 0.52),
        Hp(-0.62, 0.5),
        Hp(-0.44, 0.1),
        Hp(-0.1, -0.4),
        Hp(0.5, -0.66),
      ];

      fillPoly(k, cap, C.hair, C.hairSh, 1.0);

      // Large irregular black section.
      fillPoly(
        k,
        [
          Hp(-0.05, -1.34),
          Hp(-0.7, -1.18),
          Hp(-1.14, -0.7),
          Hp(-1.18, 0.05),
          Hp(-0.96, 0.52),
          Hp(-0.62, 0.5),
          Hp(-0.44, 0.1),
          Hp(-0.55, -0.18),
          Hp(-0.32, -0.42),
          Hp(-0.48, -0.65),
          Hp(-0.12, -0.83),
        ],
        C.hairBlk,
        C.hairBlk2,
        0.8
      );

      // Dark underlayer.
      fillPoly(
        k,
        [
          Hp(-1.08, -0.35),
          Hp(-0.88, 0.05),
          Hp(-0.68, 0.28),
          Hp(-0.76, 0.58),
          Hp(-1.0, 0.42),
          Hp(-1.18, 0.05),
        ],
        C.hairBlk2,
        C.hairBlk,
        0.6
      );

      // White highlights.
      line(
        k,
        [
          Hp(0.7, -1.12),
          Hp(0.25, -1.18),
          Hp(-0.05, -1.02),
        ],
        "#FFFFFF",
        1.0,
        0.8
      );

      line(
        k,
        [
          Hp(0.2, -0.98),
          Hp(0.5, -0.88),
          Hp(0.82, -0.85),
        ],
        "#FFFFFF",
        0.8,
        0.65
      );

      // Messy, uneven fringe.
      const fr = (
        a0,
        b0,
        a1,
        b1,
        a2,
        b2,
        w,
        col,
        ph
      ) => {
        const tip = flut(Hp(a2, b2), 0.18, ph);

        taper(
          k,
          [
            Hp(a0, b0),
            Hp(a1, b1),
            tip,
          ],
          w * u,
          0.6 * u,
          col,
          col === C.hairBlk ? C.hairBlk2 : C.hair2,
          0.5,
          4
        );
      };

      // White swept bangs.
      fr(0.1, -1.2, 0.55, -0.9, 0.88, -0.48, 4.2, C.hair, 0.2);
      fr(0.38, -1.2, 0.85, -0.98, 1.15, -0.62, 3.5, C.hair2, 1.0);

      // Black bangs crossing the opposite side.
      fr(-0.35, -1.2, -0.05, -0.82, 0.12, -0.35, 4.1, C.hairBlk, 1.8);
      fr(-0.65, -1.05, -0.45, -0.75, -0.28, -0.25, 3.3, C.hairBlk2, 2.5);

      // Outward-pointing locks.
      fr(-0.85, -0.92, -1.15, -0.68, -1.4, -0.48, 3.2, C.hairBlk, 3.2);
      fr(0.7, -1.08, 1.0, -0.9, 1.35, -0.72, 2.8, C.hair, 4.0);

      // Black side lock.
      taper(
        k,
        [
          Hp(-0.9, -0.45),
          Hp(-0.82, 0.05),
          flut(Hp(-0.68, 0.72), 0.12, 0.7),
        ],
        3.8 * u,
        0.8 * u,
        C.hairBlk,
        C.hairBlk2,
        0.5,
        4
      );

      // White side lock.
      taper(
        k,
        [
          Hp(0.05, -0.65),
          Hp(0.0, -0.05),
          flut(Hp(0.12, 0.65), 0.12, 1.5),
        ],
        3.0 * u,
        0.7 * u,
        C.hair,
        C.hair2,
        0.5,
        4
      );
    }

    // ── COLLAR ──────────────────────────────────────────────────────

    fillPoly(
      k,
      [
        J(nb, -2, sw * 0.3),
        J(nb, 5 * u, sw * 0.24),
        J(nb, 7 * u, sw * 0.08),
        J(nb, 0.6, sw * 0.0),
      ],
      C.coat,
      C.line,
      1
    );

    stitch(
      k,
      [
        J(nb, 0.4, sw * 0.26),
        J(nb, 5.4 * u, sw * 0.2),
        J(nb, 6.4 * u, sw * 0.08),
      ],
      0.6
    );

    return hand;
  }

  // ═══════════════════════════════════════════════════════════════════
  // GLITCH SCHEDULER
  // Pure calculation: does not mutate fighter or animation state.
  // ═══════════════════════════════════════════════════════════════════

  function makePlan(k, e) {
    const f = k.f || {};
    const A = k.A || {};
    const S = MW.STATE || {};

    const now = k.now;
    const st = k.st;

    // Deterministic fighter seed.
    const seed = ((f.id | 0) + 1) * 17.31;

    const stunned = !!e.stunned;
    const ko = st === S.KO;

    const speed = Math.abs(k.vx || 0);
    const vy = k.vy || 0;

    const air =
      f.grounded === false ||
      st === S.RISING ||
      st === S.FALLING;

    const attacking = !!k.attacking;

    const low =
      f.stats &&
      f.stats.maxHP &&
      f.hp !== undefined &&
      f.hp / f.stats.maxHP < 0.3;

    // Validate the externally controlled preview level.
    const rawForce = MW.Errata.force;

    const forced =
      rawForce == null
        ? null
        : Number.isFinite(Number(rawForce))
          ? clamp(Math.round(Number(rawForce)), 0, 3)
          : null;

    const fr = Math.floor(now * 24);

    let level = 0;
    let stutter = 0.8;

    if (forced !== null) {
      level = forced;
      stutter = 1;
    } else if (k.isFlash) {
      level = 3;
      stutter = 1;
    } else if (stunned) {
      // No animation-state mutation. Damage flash handles the critical flash.
      level = 2;
      stutter = 0.95;
    } else if (ko) {
      level = 3;
      stutter = 0.85;
    } else if ((A.land || 0) > 0.3 && !attacking) {
      level = 2;
      stutter = 0.9;
    } else if ((A.jump || 0) > 0.5) {
      level = 2;
      stutter = 0.9;
    } else {
      const walking = st === S.RUN && speed < 4.2;
      const running = st === S.RUN && speed >= 4.2;

      let p =
        air ? 0.4 :
        running ? 0.42 :
        walking ? 0.32 :
        0.14;

      if (attacking) {
        p = 0.22;
      }

      if (low) {
        p = Math.min(0.85, p * 1.8);
      }

      const slotLen = 0.5;
      const slot = Math.floor(now / slotLen);

      const r1 = hash(slot * 3.17 + seed);
      const r2 = hash(slot * 5.71 + seed + 9);
      const r3 = hash(slot * 7.13 + seed + 4);
      const rl = hash(slot * 11.9 + seed + 2);

      const tIn = now - slot * slotLen;
      const start = r2 * slotLen * 0.5;
      const dur = lerp(0.09, 0.26, r3);

      if (r1 < p && tIn >= start && tIn < start + dur) {
        level =
          air || running || walking
            ? (rl < 0.5 ? 1 : 2)
            : (rl < 0.72 ? 1 : 2);

        if (low && rl > 0.62) {
          level = 3;
        }

        if (attacking) {
          level = 1;
        }
      }
    }

    const on =
      level > 0 &&
      (stutter >= 1 || hash(fr * 1.93 + seed) < stutter);

    const trail =
      (st === S.RUN && speed > 2.2) ||
      (air && (speed > 1.5 || Math.abs(vy) > 3));

    // Force level 0 disables glitch-related landing fragments too.
    const land =
      !k.isFlash && forced === null
        ? clamp(A.land || 0, 0, 1)
        : 0;

    return {
      level: on ? level : 0,
      forcedLevel: level,
      fr,
      t: now,
      seed,
      trail,
      tvx: k.vx || 0,
      tvy: vy,
      land,
      ko,
      st,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // WHOLE-BODY GLITCH COMPOSITOR
  // ═══════════════════════════════════════════════════════════════════

  const pool = {};

  function layer(name, w, h) {
    let L = pool[name];

    if (!L) {
      L = pool[name] = {
        cv: document.createElement("canvas"),
        c: null,
        w: 0,
        h: 0,
      };
    }

    if (L.w !== w || L.h !== h) {
      L.cv.width = w;
      L.cv.height = h;

      L.w = w;
      L.h = h;

      L.c = L.cv.getContext("2d");
    }

    return L;
  }

  function composite(k, e, plan) {
    const ctx = k.ctx;

    if (
      typeof document === "undefined" ||
      !document.createElement ||
      !ctx.getTransform
    ) {
      return false;
    }

    const m = ctx.getTransform();

    if (!m || !isFinite(m.a)) {
      return false;
    }

    const sc = Math.hypot(m.a, m.b) || 1;
    const px = sc;

    const H = k.H;
    const Wd = k.Wd || 36;

    const halfW = Math.min(
      800,
      Math.ceil((H * 1.15 + 54) * sc)
    );

    const up = Math.min(
      800,
      Math.ceil((H * 1.3 + 26) * sc)
    );

    const down = Math.ceil(30 * sc);

    const w = halfW * 2;
    const h = up + down;

    const ox = halfW;
    const oy = up;

    const fx = Math.floor(m.e);
    const fy = Math.floor(m.f);

    const S = layer("src", w, h);
    const O = layer("out", w, h);
    const TA = layer("tintA", w, h);
    const TB = layer("tintB", w, h);

    // 1. Render the entire normal body into one off-screen image.
    const s = S.c;

    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalAlpha = 1;
    s.globalCompositeOperation = "source-over";
    s.clearRect(0, 0, w, h);

    s.setTransform(
      m.a,
      m.b,
      m.c,
      m.d,
      ox + (m.e - fx),
      oy + (m.f - fy)
    );

    const hand = drawBody(
      Object.assign({}, k, { ctx: s }),
      e
    );

    s.setTransform(1, 0, 0, 1, 0, 0);

    // Colour an entire rendered body image.
    const tint = (color, amt, T) => {
      const t = T.c;

      t.setTransform(1, 0, 0, 1, 0, 0);
      t.globalCompositeOperation = "source-over";
      t.globalAlpha = 1;
      t.clearRect(0, 0, w, h);

      t.drawImage(S.cv, 0, 0);

      t.globalCompositeOperation = "source-atop";
      t.globalAlpha = amt;
      t.fillStyle = color;
      t.fillRect(0, 0, w, h);

      t.globalCompositeOperation = "source-over";
      t.globalAlpha = 1;

      return T.cv;
    };

    const L = plan.level;

    const R = (n) =>
      hash(plan.fr * 12.9898 + n * 78.233 + plan.seed);

    const o = O.c;

    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalAlpha = 1;
    o.globalCompositeOperation = "source-over";
    o.clearRect(0, 0, w, h);

    const bodyTop = clamp(
      oy - Math.round(H * sc * 1.1),
      0,
      h - 2
    );

    const bodyH = oy - bodyTop + 2;
    const palIdx = Math.floor(R(1) * GL.length);

    // 2. Whole-body colour corruption.
    let bodyImg = S.cv;
    let vanish = false;

    if (L > 0) {
      const tintP = [0, 0.4, 0.62, 0.86][L];

      if (R(2) < tintP) {
        bodyImg = tint(
          GL[palIdx],
          L === 1
            ? 0.4
            : L === 2
              ? 0.58
              : (R(3) < 0.1 ? 1 : 0.66),
          TA
        );
      } else if (L === 3 && R(4) < 0.07) {
        bodyImg = tint(G.black, 1, TA);
      }

      vanish =
        (L === 3 && R(7) < (plan.ko ? 0.26 : 0.12)) ||
        (L === 2 && R(7) < 0.04);
    }

    // 3. Whole-picture shift and stretch.
    const sh = [0, 1.2, 4, 10][L];

    const dx0 =
      R(6) < 0.6
        ? (R(8) * 2 - 1) * sh * px
        : 0;

    const dy0 =
      R(9) < 0.35
        ? (R(5) * 2 - 1) * sh * 0.4 * px
        : 0;

    let sxk = 1;
    let syk = 1;

    if (L >= 2 && R(10) < (L === 3 ? 0.4 : 0.14)) {
      sxk =
        1 + (R(11) - 0.5) * (L === 3 ? 0.5 : 0.24);

      syk =
        1 + (R(12) - 0.5) * (L === 3 ? 0.34 : 0.16);
    }

    o.setTransform(
      sxk,
      0,
      0,
      syk,
      ox - ox * sxk + dx0,
      oy - oy * syk + dy0
    );

    // 4. Effects behind the body.
    if (plan.trail) {
      const a =
        clamp(Math.hypot(plan.tvx, plan.tvy) / 6, 0.25, 1) *
        (L > 0 ? 1.7 : 0.75);

      const stepx = clamp(plan.tvx * 1.5, -18, 18) * px;
      const stepy = clamp(plan.tvy, -14, 14) * px;

      for (let i = 2; i >= 1; i--) {
        o.globalAlpha = clamp(0.3 * a / i, 0, 0.5);

        o.drawImage(
          tint(i === 1 ? G.cyan : G.crimson, 1, TB),
          -stepx * i,
          -stepy * i
        );
      }

      o.globalAlpha = 1;
    }

    if (L >= 1) {
      const rgb =
        [0, 1.6, 4.5, 9][L] *
        px *
        (0.6 + 0.4 * R(13));

      o.globalCompositeOperation = "lighter";
      o.globalAlpha = [0, 0.55, 0.7, 0.85][L];

      o.drawImage(
        tint(G.crimson, 1, TB),
        -rgb,
        0
      );

      o.drawImage(
        tint(G.cyan, 1, TB),
        rgb,
        (R(14) - 0.5) * rgb * 0.5
      );

      if (L >= 2) {
        o.drawImage(
          tint(G.magenta, 1, TB),
          (R(15) - 0.5) * rgb,
          -rgb * 0.4
        );
      }

      if (L === 3) {
        o.drawImage(
          tint(G.violet, 1, TB),
          (R(16) - 0.5) * rgb * 1.6,
          rgb * 0.3
        );
      }

      o.globalCompositeOperation = "source-over";
      o.globalAlpha = 1;

      // Outline flicker.
      if (R(17) < [0, 0.55, 0.7, 0.8][L]) {
        const oc = tint(
          GL[(palIdx + 2) % GL.length],
          1,
          TB
        );

        const t = (L === 1 ? 1.2 : 2) * px;

        o.globalAlpha = 0.85;

        for (const [ax, ay] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          o.drawImage(oc, ax * t, ay * t);
        }

        o.globalAlpha = 1;
      }

      // Whole-body echoes.
      if (L >= 2) {
        const n = L === 2 ? 1 : 3;

        for (let i = 0; i < n; i++) {
          o.globalAlpha = 0.4 - i * 0.1;

          o.drawImage(
            tint(GL[(palIdx + i + 1) % GL.length], 1, TB),
            (R(20 + i) * 2 - 1) *
              (6 + 4 * L) *
              px *
              (i + 1) *
              0.55,
            (R(25 + i) - 0.5) * 6 * px
          );
        }

        o.globalAlpha = 1;
      }
    }

    // 5. Render the body as a whole, or cut it into horizontal bands.
    o.globalAlpha = vanish ? 0.12 : 1;

    if (L >= 2 && R(18) < (L === 3 ? 0.2 : 0.06)) {
      const ps = Math.max(
        3,
        Math.round(px * (L === 3 ? 4 : 3))
      );

      const pw = Math.ceil(w / ps);
      const ph = Math.ceil(h / ps);

      const P = layer("pix", pw, ph);

      P.c.setTransform(1, 0, 0, 1, 0, 0);
      P.c.clearRect(0, 0, pw, ph);
      P.c.drawImage(bodyImg, 0, 0, w, h, 0, 0, pw, ph);

      const sm = o.imageSmoothingEnabled;
      o.imageSmoothingEnabled = false;

      o.drawImage(
        P.cv,
        0,
        0,
        pw,
        ph,
        0,
        0,
        w,
        h
      );

      o.imageSmoothingEnabled = sm;
    } else if (L > 0) {
      const nb = [0, 2, 5, 9][L];
      const cuts = [0, h];

      for (let i = 0; i < nb - 1; i++) {
        cuts.push(
          clamp(
            Math.round(
              bodyTop + R(30 + i) * (oy - bodyTop)
            ),
            0,
            h
          )
        );
      }

      cuts.sort((a, b) => a - b);

      const maxDx = [0, 2.4, 7, 18][L] * px;
      const pDisp = [0, 0.5, 0.6, 0.8][L];

      for (let i = 0; i < cuts.length - 1; i++) {
        const y0 = cuts[i];
        const bh = cuts[i + 1] - y0;

        if (bh <= 0) {
          continue;
        }

        const dx =
          R(50 + i) < pDisp
            ? (R(60 + i) * 2 - 1) * maxDx
            : 0;

        o.drawImage(
          bodyImg,
          0,
          y0,
          w,
          bh,
          Math.round(dx),
          y0,
          w,
          bh
        );
      }
    } else {
      o.drawImage(bodyImg, 0, 0);
    }

    o.globalAlpha = 1;

    // 6. Detached fragments, noise, scanlines, and sweep effects.
    o.setTransform(1, 0, 0, 1, 0, 0);

    const bx0 = ox - Wd * 0.9 * px;
    const bxw = Wd * 1.8 * px;
    const by0 = bodyTop + bodyH * 0.1;
    const byh = bodyH * 0.85;

    // Rectangular fragments.
    if (L >= 2) {
      const nBlk =
        L === 2
          ? 2 + Math.floor(R(70) * 3)
          : 6 + Math.floor(R(70) * 5);

      for (let i = 0; i < nBlk; i++) {
        const bw = Math.max(
          2,
          Math.round((3 + R(71 + i) * 10) * px)
        );

        const bh = Math.max(
          2,
          Math.round((2 + R(90 + i) * 6) * px)
        );

        const x = clamp(
          Math.round(bx0 + R(110 + i) * bxw),
          0,
          w - bw
        );

        const y = clamp(
          Math.round(by0 + R(130 + i) * byh),
          0,
          h - bh
        );

        const dxb = Math.round(
          (R(150 + i) * 2 - 1) * (10 + 6 * L) * px
        );

        const dyb = Math.round(
          (R(170 + i) - 0.5) * 5 * px
        );

        if (R(190 + i) < 0.55) {
          o.clearRect(x, y, bw, bh);
        }

        const sxp = clamp(x + dxb, 0, w - bw);
        const syp = clamp(y + dyb, 0, h - bh);

        o.drawImage(
          bodyImg,
          x,
          y,
          bw,
          bh,
          sxp,
          syp,
          bw,
          bh
        );

        if (R(210 + i) < 0.3) {
          o.globalAlpha = 0.85;

          o.fillStyle =
            GL[Math.floor(R(230 + i) * GL.length)];

          o.fillRect(
            clamp(x + dxb * 1.4, 0, w - bw),
            syp,
            Math.max(2, bw * 0.7),
            Math.max(2, bh * 0.7)
          );

          o.globalAlpha = 1;
        }
      }
    }

    // Digital noise restricted to the body silhouette.
    if (L >= 2) {
      o.globalCompositeOperation = "source-atop";

      const nn = L === 2 ? 6 : 16;

      for (let i = 0; i < nn; i++) {
        o.globalAlpha = 0.75;

        o.fillStyle =
          i % 5 === 4
            ? G.black
            : GL[Math.floor(R(250 + i) * GL.length)];

        o.fillRect(
          Math.round(bx0 + R(280 + i) * bxw),
          Math.round(by0 + R(310 + i) * byh),
          Math.max(1, Math.round((1 + R(340 + i) * 4) * px)),
          Math.max(1, Math.round((1 + R(370 + i) * 2) * px))
        );
      }

      o.globalAlpha = 1;
      o.globalCompositeOperation = "source-over";

      // Bright band sweeping down the character.
      if (R(400) < 0.5) {
        const yb = Math.round(
          bodyTop +
          (((plan.t * 2.1 + plan.seed) % 1 + 1) % 1) *
          bodyH
        );

        const hb = Math.max(
          2,
          Math.round((4 + R(401) * 6) * px)
        );

        const dxb = Math.round(
          (R(402) * 2 - 1) * 16 * px
        );

        if (yb + hb < h) {
          o.globalAlpha = 0.8;

          o.drawImage(
            tint(
              R(403) < 0.5 ? G.cyan : G.white,
              0.75,
              TB
            ),
            0,
            yb,
            w,
            hb,
            dxb,
            yb,
            w,
            hb
          );

          o.globalAlpha = 1;
        }
      }
    }

    // Horizontal scanlines.
    if (L >= 1) {
      o.globalCompositeOperation = "destination-out";
      o.fillStyle = "#000";

      const nl = [0, 2, 4, 7][L];

      for (let i = 0; i < nl; i++) {
        o.fillRect(
          0,
          Math.round(bodyTop + R(420 + i) * (oy - bodyTop)),
          w,
          Math.max(
            1,
            Math.round((0.7 + R(440 + i) * 1.2) * px * 0.8)
          )
        );
      }

      o.globalCompositeOperation = "source-over";
    }

    // Landing fragments.
    if (plan.land > 0.05) {
      const q = 1.05 - plan.land;

      for (let i = 0; i < 9; i++) {
        const sx =
          (hash(i * 3.1) - 0.5) *
          2 *
          (8 + 70 * q) *
          px;

        const sy =
          -(2 + hash(i * 5.7) * 36 * q) * px;

        o.globalAlpha = clamp(plan.land * 1.3, 0, 1);

        o.fillStyle =
          i % 4 === 3
            ? G.white
            : GL[i % 4];

        o.fillRect(
          Math.round(ox + sx),
          Math.round(oy + sy),
          Math.max(2, Math.round((2 + hash(i * 9.3) * 4) * px)),
          Math.max(2, Math.round((1.5 + hash(i * 2.3) * 3) * px))
        );
      }

      o.globalAlpha = 1;
    }

    // Draw the finished image back onto the original canvas.
    ctx.save();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(O.cv, fx - ox, fy - oy);

    ctx.restore();

    return hand;
  }

  // ═══════════════════════════════════════════════════════════════════
  // PUBLIC DRAW ENTRY POINT
  // ═══════════════════════════════════════════════════════════════════

  function draw(k, e) {
    const plan = makePlan(k, e);

    if (
      plan.level > 0 ||
      plan.trail ||
      plan.land > 0.05
    ) {
      let done = false;

      try {
        done = composite(k, e, plan) !== false;
      } catch (err) {
        done = false;
      }

      // Never let a compositor error make the character disappear.
      if (done) {
        return;
      }
    }

    drawBody(k, e);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════

  MW.Errata = {
    draw,
    drawBody,
    PALETTE: C,
    GLITCH: G,
    force: null,
    _plan: makePlan,
  };

})(typeof globalThis !== "undefined" ? globalThis : this);
