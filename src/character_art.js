// Mechanic Wars - procedural character art (render only, never touches the sim).
// A tiny 2-bone IK rig: pinned feet, speed-driven run cycle, attack wind-up/strike/recovery
// poses, squash & stretch, flowing scarves. Characters are data-driven by BUILD + PAL below;
// per-character details live in the DETAIL functions.
// Local space: origin = feet centre on the ground, +x = facing direction, +y = down.
(function (g) {
  const MW = (g.MW = g.MW || {});
  const OUT = "#0a0c13";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);
  const easeOut = (t) => 1 - (1 - t) * (1 - t);

  function shade(hex, p) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => clamp(Math.round(v + (p >= 0 ? (255 - v) * (p / 100) : v * (p / 100))), 0, 255);
    return "#" + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, "0")).join("");
  }

  // Palettes: main, dark, light, accent + skin/hair/misc.
  const PAL = {
    fighter: { main: "#3f8cff", dark: "#1d4fa8", light: "#8fc0ff", accent: "#ffd24a", skin: "#f0c8a0", hair: "#5a3a22", pants: "#25304e", boot: "#e8ecf5" },
    mage: { main: "#8c52ff", dark: "#4b2a96", light: "#c3a0ff", accent: "#ffd479", skin: "#f3d4b8", hair: "#e8e8f5", pants: "#3a2370", boot: "#2a1a55", glow: "#d6b8ff" },
    assassin: { main: "#2a2d3a", dark: "#10121a", light: "#ff6b82", accent: "#ff2a45", skin: "#2b2230", hair: "#0f0f15", pants: "#181b26", boot: "#0c0d12", scarf: "#e4203f", scarfDark: "#8f1228", steel: "#e6ecf8", wrap: "#555c72", strap: "#5b2a2e" },
    hitter: { main: "#ff7a3d", dark: "#b8431a", light: "#ffb48a", accent: "#ffd24a", skin: "#e9b98f", hair: "#3a2414", pants: "#2f3a5a", boot: "#5a3a22", shirt: "#efe3cc", hat: "#8a5428", hatDark: "#4e2e14", band: "#d6342f", metal: "#aeb4c2", wood: "#6a3a1a" },
    tank: { main: "#8a96a8", dark: "#4d586b", light: "#d2dae6", accent: "#ff6a3a", skin: "#c9a98a", hair: "#303642", pants: "#3b4252", boot: "#2e3442" },
  };
  // leg/tor/arm = fractions of height; sw/hw/lw/aw = fractions of width; hr = head radius / height.
  const BUILD = {
    fighter: { leg: 0.40, tor: 0.30, hr: 0.12, sw: 0.72, hw: 0.52, lw: 0.22, aw: 0.19, arm: 0.33, stride: 0.45 },
    mage: { leg: 0.36, tor: 0.33, hr: 0.115, sw: 0.66, hw: 0.56, lw: 0.17, aw: 0.15, arm: 0.32, stride: 0.30 },
    assassin: { leg: 0.43, tor: 0.27, hr: 0.105, sw: 0.66, hw: 0.46, lw: 0.21, aw: 0.17, arm: 0.34, stride: 0.55 },
    hitter: { leg: 0.40, tor: 0.29, hr: 0.12, sw: 0.72, hw: 0.50, lw: 0.21, aw: 0.19, arm: 0.32, stride: 0.42 },
    tank: { leg: 0.36, tor: 0.33, hr: 0.11, sw: 0.98, hw: 0.70, lw: 0.26, aw: 0.24, arm: 0.31, stride: 0.30 },
  };
  // Attack keyframes: fh/bh = hand target relative to the shoulder in arm lengths [forward, down].
  const kf = (fh, bh, lean, lunge, crouch) => ({ fh, bh, lean, lunge: lunge || 0, crouch: crouch || 0 });
  const ATK = {
    fighter: [
      { wind: kf([-0.35, 0.35], [0.2, 0.6], -0.12, -3, 0.01), strike: kf([1.05, -0.02], [0.1, 0.6], 0.22, 7, 0.02) },
      { wind: kf([-0.1, 0.7], [0.1, 0.5], -0.14, -3, 0.03), strike: kf([1.0, 0.3], [0.1, 0.5], 0.3, 9, 0.05) },
      { wind: kf([-0.2, -0.95], [-0.05, -0.9], -0.32, -5, 0), strike: kf([0.85, 0.6], [0.8, 0.55], 0.48, 11, 0.07) },
    ],
    assassin: [
      { wind: kf([-0.3, -0.45], [0.1, 0.6], -0.2, -3, 0.04), strike: kf([1.05, 0.05], [0.1, 0.5], 0.4, 9, 0.05) },
      { wind: kf([-0.3, 0.6], [0.1, 0.6], -0.2, -3, 0.06), strike: kf([1.05, 0.35], [0.1, 0.5], 0.42, 9, 0.07) },
    ],
    tank: [{ wind: kf([-0.1, -1.0], [0.0, -0.9], -0.35, -4, 0), strike: kf([0.9, 0.6], [0.85, 0.55], 0.5, 8, 0.08) }],
    mage: [{ wind: kf([0.15, -0.55], [0.2, 0.5], -0.16, -2, 0.02), strike: kf([0.95, -0.2], [0.2, 0.5], 0.2, 3, 0.02) }],
    hitter: [{ wind: kf([0.75, -0.2], [0.0, 0.5], -0.05, -1, 0.02), strike: kf([1.0, -0.1], [0.1, 0.5], 0.1, -3, 0.02) }],
  };

  // ── small drawing helpers ──────────────────────────────────────────
  function poly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }
  function fillOut(ctx, fill, lw) {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = lw || 2.2;
    ctx.strokeStyle = OUT;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  function circle(ctx, x, y, r, fill, lw) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2);
    fillOut(ctx, fill, lw);
  }
  function limb(ctx, pts, w, color) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = w + 4;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.stroke();
  }
  // 2-bone IK in local space; bend +1 = elbow-like (back/down), -1 = knee-like (forward).
  function ik(hx, hy, tx, ty, l1, l2, bend) {
    let dx = tx - hx, dy = ty - hy;
    let dist = Math.hypot(dx, dy) || 0.001;
    const maxd = l1 + l2 - 0.01;
    if (dist > maxd) { dx *= maxd / dist; dy *= maxd / dist; dist = maxd; }
    const a = Math.atan2(dy, dx);
    const cosA = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
    const ang = Math.acos(cosA) * bend;
    return [[hx, hy], [hx + Math.cos(a + ang) * l1, hy + Math.sin(a + ang) * l1], [hx + dx, hy + dy]];
  }
  // Follow-the-leader ribbon in world space (scarves, headband tails).
  function ribbon(A, key, ax, ay, n, seg, wx, wy) {
    // Simulated in WORLD space (so it lags behind movement); returned in local space for drawing.
    const wxA = ax + A.ox, wyA = ay + A.oy;
    let r = A.rib[key];
    if (!r || Math.hypot(r[1][0] - wxA, r[1][1] - wyA) > 160) {
      r = A.rib[key] = [];
      for (let i = 0; i <= n; i++) r.push([wxA, wyA]);
    }
    r[0][0] = wxA; r[0][1] = wyA;
    for (let i = 1; i <= n; i++) {
      const p = r[i], q = r[i - 1];
      let dx = p[0] - q[0] + wx, dy = p[1] - q[1] + wy;
      const l = Math.hypot(dx, dy) || 1;
      p[0] = q[0] + (dx / l) * seg;
      p[1] = q[1] + (dy / l) * seg;
    }
    return r.map((p) => [p[0] - A.ox, p[1] - A.oy]);
  }
  function drawRibbon(ctx, r, w0, color) {
    ctx.lineCap = "round";
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < r.length; i++) {
        const w = Math.max(1.2, w0 * (1 - (i - 1) / r.length));
        ctx.beginPath();
        ctx.moveTo(r[i - 1][0], r[i - 1][1]);
        ctx.lineTo(r[i][0], r[i][1]);
        ctx.strokeStyle = pass === 0 ? OUT : color;
        ctx.lineWidth = pass === 0 ? w + 3.5 : w;
        ctx.stroke();
      }
    }
  }

  function newArt() {
    return { phase: 0, land: 0, jump: 0, air: false, pvy: 0, ko: 0, atkN: 0, pst: "", rib: {}, dust: 0 };
  }

  // ── main entry ─────────────────────────────────────────────────────
  // fx = { spawn(x, y, vx, vy, color, life, size) } is optional (dust / jump rings).
  function draw(ctx, f, isFlash, fx) {
    const s = f.stats, S = MW.STATE, id = s.id;
    const P = PAL[id] || PAL.fighter;
    const B = BUILD[id] || BUILD.fighter;
    const A = f._art || (f._art = newArt());
    const Wd = s.width, H = s.height;
    const d = f.facing < 0 ? -1 : 1;
    const st = f.state || "idle";
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
    const vx = f.vx || 0, vy = f.vy || 0, vxa = Math.abs(vx);
    const attacking = st === S.ATTACK_STARTUP || st === S.ATTACK_ACTIVE || st === S.ATTACK_RECOVERY;
    const stunned = st === S.HITSTUN, ko = st === S.KO;
    const airborne = f.grounded === false || st === S.RISING || st === S.FALLING;
    const col = (c) => (isFlash ? "#ffffff" : c);

    const cx = f.x + Wd / 2, fy = f.y + H;
    const spawn = fx && fx.spawn;

    // --- animation events (landing / jump / double jump / dust) ---
    if (A.air && !airborne && !ko) {
      A.land = clamp(0.5 + A.pvy / 14, 0.45, 1);
      if (spawn) for (let i = 0; i < 6; i++) spawn(cx + (Math.random() - 0.5) * Wd, fy - 2, (Math.random() - 0.5) * 3, -Math.random() * 1.2, "#9aa3b8", 16, 3);
    }
    if (!A.air && airborne && vy < -5) {
      A.jump = 1;
      if (spawn) for (let i = 0; i < 4; i++) spawn(cx + (Math.random() - 0.5) * Wd * 0.6, fy - 2, (Math.random() - 0.5) * 2.4, -Math.random() * 0.8, "#9aa3b8", 12, 2.5);
    } else if (A.air && airborne && vy < A.pvy - 6 && spawn) {
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; spawn(cx + Math.cos(a) * 6, fy - H * 0.4, Math.cos(a) * 2.6, Math.sin(a) * 1.4 + 0.5, P.light, 14, 2.6); }
    }
    A.air = airborne;
    A.pvy = vy;
    A.land = Math.max(0, A.land - 0.09);
    A.jump = Math.max(0, A.jump - 0.12);
    if (st === S.RUN && !airborne) {
      A.phase += clamp(vxa, 0, 9) * 0.052;
      if (spawn && vxa > 2.5 && ++A.dust % 7 === 0) spawn(cx - d * Wd * 0.3, fy - 2, -d * 0.8, -0.3, "#8f98ad", 12, 2.2);
      if (spawn && id === "assassin" && vxa > 5) spawn(cx - d * 6, f.y + H * 0.5, 0, 0, P.accent, 9, 3);
    }
    if (id === "hitter") { // muzzle flash lingers a few frames after the shot
      if (st === S.ATTACK_ACTIVE) { if (!A.muzzle) A.fireFx = true; A.muzzle = 7; }
      else A.muzzle = Math.max(0, (A.muzzle || 0) - 1);
    }
    A.ko = ko ? A.ko + 1 : 0;
    if (st === S.ATTACK_STARTUP && A.pst !== S.ATTACK_STARTUP) A.atkN++;
    A.pst = st;

    // --- pose ---
    const legL = H * B.leg, torL = H * B.tor, hr = H * B.hr;
    const armL = H * B.arm, lw = Wd * B.lw, aw = Wd * B.aw;
    const sw = Wd * B.sw, hw = Wd * B.hw;
    let lean = 0.04, bob = 0, sx = 1, sy = 1, crouch = 0, lunge = 0, jit = 0, tilt = 0;
    let fh = [0.45, 0.55], bh = [0.12, 0.7];
    let ff = [Wd * 0.15, 0], bf = [-Wd * 0.17, 0];
    const idle = Math.sin(now * 2.4 + (f.id || 0) * 1.7);

    if (ko) {
      lean = -0.5; fh = [-0.3, -0.7]; bh = [-0.5, -0.4]; tilt = -0.4;
    } else if (stunned) {
      lean = -0.5; tilt = -0.35; sx = 0.93; sy = 1.05; fh = [-0.2, -0.75]; bh = [-0.45, -0.55];
      jit = Math.sin(now * 90) * 1.6;
      ff = airborne ? [Wd * 0.3, -H * 0.08] : [Wd * 0.28, 0]; bf = airborne ? [-Wd * 0.25, -H * 0.04] : [-Wd * 0.3, 0];
    } else if (attacking && f.hit) {
      const seq = ATK[id] || ATK.fighter;
      const key = seq.length > 1 ? (id === "fighter" ? f.chainIndex || 0 : A.atkN) % seq.length : 0;
      const K = seq[Math.min(key, seq.length - 1)];
      const guard = kf([0.45, 0.55], [0.12, 0.7], 0.04, 0, 0);
      let t, a, b;
      if (st === S.ATTACK_STARTUP) {
        t = ease(clamp(1 - f.stateTimer / Math.max(1, f.hit.startup), 0, 1)); a = guard; b = K.wind;
      } else if (st === S.ATTACK_ACTIVE) {
        t = easeOut(clamp(0.55 + 0.45 * (1 - f.stateTimer / Math.max(1, f.hit.active || 1)), 0, 1)); a = K.wind; b = K.strike;
      } else {
        t = ease(clamp((1 - f.stateTimer / Math.max(1, f.hit.recovery) - 0.2) / 0.8, 0, 1)); a = K.strike; b = guard;
      }
      fh = [lerp(a.fh[0], b.fh[0], t), lerp(a.fh[1], b.fh[1], t)];
      bh = [lerp(a.bh[0], b.bh[0], t), lerp(a.bh[1], b.bh[1], t)];
      lean = lerp(a.lean, b.lean, t); lunge = lerp(a.lunge, b.lunge, t); crouch = lerp(a.crouch, b.crouch, t) * H;
      if (st === S.ATTACK_ACTIVE) { sx = 1.06; sy = 0.96; }
      if (airborne) { ff = [Wd * 0.25, -H * 0.1]; bf = [-Wd * 0.2, -H * 0.05]; }
      else { ff = [Wd * 0.3 + lunge * 0.6, 0]; bf = [-Wd * 0.28, 0]; }
    } else if (airborne) {
      const rising = vy < 0;
      lean = rising ? 0.08 : 0.02;
      ff = rising ? [Wd * 0.34, -H * 0.2] : [Wd * 0.2, -H * 0.06];
      bf = rising ? [-Wd * 0.1, -H * 0.1] : [-Wd * 0.22, -H * 0.04];
      fh = rising ? [0.7, -0.5] : [0.55, -0.6]; bh = rising ? [-0.3, -0.4] : [-0.15, -0.65];
      sy = 1 + 0.08 * A.jump + (rising ? 0.02 : 0.03); sx = 1 - 0.05 * A.jump;
    } else if (st === S.RUN && vxa > 0.4) {
      const sp = clamp(vxa / (s.runSpeed || 5), 0, 1.3);
      const ph = A.phase, stride = Wd * B.stride * (0.6 + 0.4 * sp);
      lean = 0.14 + 0.1 * sp + (id === "assassin" ? 0.14 : 0);
      bob = Math.abs(Math.cos(ph)) * H * 0.03;
      const foot = (q) => {
        const u = ((q % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2);
        if (u < 0.5) return [stride * (1 - 4 * u), 0];
        const w = (u - 0.5) * 2;
        return [-stride + 2 * stride * ease(w), -Math.sin(Math.PI * w) * H * 0.13];
      };
      ff = foot(ph); bf = foot(ph + Math.PI);
      const sw1 = Math.sin(ph + Math.PI), sw2 = Math.sin(ph);
      fh = [sw1 * 0.72, 0.66 - 0.2 * Math.abs(sw1)]; bh = [sw2 * 0.72, 0.66 - 0.2 * Math.abs(sw2)];
      if (id === "mage") fh = [0.5, 0.5 + Math.abs(sw1) * 0.06]; // staff hand stays steady
    } else {
      bob = idle * H * 0.008;
      crouch = H * 0.012 * (1 + idle);
      fh = [0.45 + idle * 0.03, 0.55 + idle * 0.05]; bh = [0.12, 0.7 - idle * 0.04];
      tilt = idle * 0.02;
    }
    if (A.land > 0 && !attacking && !stunned) {
      crouch += A.land * H * 0.09; sx *= 1 + 0.14 * A.land; sy *= 1 - 0.13 * A.land;
      ff = [Wd * 0.28, 0]; bf = [-Wd * 0.3, 0]; fh = [0.5, 0.2]; bh = [-0.1, 0.3];
    }

    // --- joints (local space) ---
    const hipY = -legL * 0.97 + crouch - bob;
    const hip = [lunge, hipY];
    const sh = [hip[0] + Math.sin(lean) * torL, hip[1] - Math.cos(lean) * torL];
    const hl = hr + hr * 0.3;
    const hc = [sh[0] + Math.sin(lean * 1.2 + tilt) * hl, sh[1] - Math.cos(lean * 1.2 + tilt) * hl];
    const perp = [Math.cos(lean), Math.sin(lean)];
    const shF = [sh[0] + perp[0] * sw * 0.45, sh[1] + perp[1] * sw * 0.45];
    const shB = [sh[0] - perp[0] * sw * 0.45, sh[1] - perp[1] * sw * 0.45];
    const hF = [hip[0] + hw * 0.2, hip[1]], hB = [hip[0] - hw * 0.2, hip[1]];
    const legSeg = legL * 0.52, armSeg = armL * 0.52;
    const legF = ik(hF[0], hF[1], ff[0], ff[1], legSeg, legSeg, -1);
    const legB = ik(hB[0], hB[1], bf[0], bf[1], legSeg, legSeg, -1);
    const armF = ik(shF[0], shF[1], shF[0] + fh[0] * armL, shF[1] + fh[1] * armL, armSeg, armSeg, 1);
    const armB = ik(shB[0], shB[1], shB[0] + bh[0] * armL, shB[1] + bh[1] * armL, armSeg, armSeg, 1);

    // --- draw ---
    ctx.save();
    A.ox = cx + jit; A.oy = fy;
    ctx.translate(cx + jit, fy);
    if (ko) ctx.rotate(-d * 1.35 * easeOut(Math.min(1, A.ko / 20)));
    ctx.scale(sx, sy);
    // everything below uses local coords mapped through M (x flipped by facing)
    const M = (p) => [p[0] * d, p[1]];
    const MP = (arr) => arr.map(M);
    const ctxState = { spawn, ctx, M, MP, d, P, col, hr, hc, sh, hip, shF, shB, hF, hB, armF, armB, legF, legB, aw, lw, sw, hw, torL, armL, H, Wd, lean, now, A, f, isFlash, st, attacking, vx, vy, now2: now, lunge, legL, fh, bh };

    // ground shadow (world space, un-scaled feel)
    if (!airborne) {
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.ellipse(0, 2, Wd * 0.5 * (1 + 0.2 * A.land), 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    DETAIL(ctxState, id);
    ctx.restore();
  }

  // ── per-character rendering ───────────────────────────────────────
  function legsAndFeet(k, color, bootColor, bootLen) {
    const { ctx, MP, M, lw, d } = k;
    for (const [leg, back] of [[k.legB, true], [k.legF, false]]) {
      const pts = MP(leg);
      limb(ctx, pts, lw, k.col(color));
      const [fx, fyy] = pts[2];
      ctx.beginPath();
      const bl = bootLen || lw * 1.25;
      ctx.ellipse(fx + d * bl * 0.18, fyy - lw * 0.18, bl * 0.62, lw * 0.5, 0, 0, Math.PI * 2);
      fillOut(ctx, k.col(back ? shade(bootColor, -18) : bootColor), 2);
    }
  }
  function hand(k, pt, r, color) { circle(k.ctx, pt[0], pt[1], r, k.col(color), 2); }
  function torsoShape(k, wTop, wBot, topY, botY, fill, dark, round) {
    const { ctx } = k;
    const r = round || 4;
    const L = [k.sh[0] - wTop / 2, k.sh[1]], R = [k.sh[0] + wTop / 2, k.sh[1]];
    const bl = [k.hip[0] - wBot / 2, k.hip[1] + (botY || 0)], br = [k.hip[0] + wBot / 2, k.hip[1] + (botY || 0)];
    const m = k.M;
    const pts = [m([L[0], L[1] + (topY || 0)]), m([R[0], R[1] + (topY || 0)]), m(br), m(bl)];
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 4; i++) ctx.arcTo(pts[i][0], pts[i][1], pts[(i + 1) % 4][0], pts[(i + 1) % 4][1], r);
    ctx.arcTo(pts[0][0], pts[0][1], pts[1][0], pts[1][1], r);
    ctx.closePath();
    fillOut(ctx, k.col(fill), 2.4);
    if (!k.isFlash && dark) {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = dark;
      ctx.globalAlpha = 0.45;
      const back = pts[0], bb = pts[3];
      ctx.beginPath();
      ctx.moveTo(back[0], back[1]);
      ctx.lineTo((back[0] + pts[1][0]) / 2 - k.d * 0, back[1] + 0);
      ctx.lineTo((bb[0] + pts[2][0]) / 2, bb[1]);
      ctx.lineTo(bb[0], bb[1]);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  function eye(k, x, y, w, h, color) {
    const { ctx } = k;
    const p = k.M([x, y]);
    ctx.fillStyle = k.isFlash ? "#fff" : color;
    ctx.beginPath();
    ctx.ellipse(p[0], p[1], w, h, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function DETAIL(k, id) {
    const { ctx, M, MP, d, P, col, hr, hc, A, f, now, st } = k;
    const S = MW.STATE;
    const stunned = st === S.HITSTUN;
    const hcw = M(hc);
    const shW = M(k.sh);
    const hipW = M(k.hip);
    const armBw = MP(k.armB), armFw = MP(k.armF);
    const windU = st === S.ATTACK_STARTUP && f.hit ? clamp(1 - f.stateTimer / Math.max(1, f.hit.startup), 0, 1) : 0;
    const strike = st === S.ATTACK_ACTIVE;
    const attackingNow = st === S.ATTACK_STARTUP || st === S.ATTACK_ACTIVE || st === S.ATTACK_RECOVERY;
    const pulse = 0.5 + 0.5 * Math.sin(now * 8);

    // ───────────── FIGHTER ─────────────
    if (id === "fighter") {
      const tail = ribbon(A, "band", hcw[0] - d * hr * 0.9, hcw[1] - hr * 0.2, 6, hr * 0.7, -d * 0.9 - k.vx * d * 0.04, 0.55 + Math.sin(now * 7) * 0.3);
      drawRibbon(ctx, tail, 4.2, col("#ff5a3a"));
      limb(ctx, armBw, k.aw, col(P.skin));
      hand(k, armBw[2], k.aw * 0.75, "#f5f5f5");
      legsAndFeet(k, P.pants, P.boot);
      torsoShape(k, k.sw * 0.88, k.hw, 0, 0, P.main, P.dark, 5);
      // gi collar + belt
      ctx.beginPath(); ctx.moveTo(shW[0] - 5, shW[1] + 1); ctx.lineTo(shW[0] + 5, shW[1] + 1); ctx.lineTo(shW[0], shW[1] + 12); ctx.closePath(); fillOut(ctx, col(P.light), 1.6);
      ctx.beginPath(); ctx.moveTo(hipW[0] - k.hw / 2, hipW[1] - 5); ctx.lineTo(hipW[0] + k.hw / 2, hipW[1] - 5); ctx.lineTo(hipW[0] + k.hw / 2, hipW[1] + 1); ctx.lineTo(hipW[0] - k.hw / 2, hipW[1] + 1); ctx.closePath(); fillOut(ctx, col("#f2f2f2"), 1.6);
      // head
      circle(ctx, hcw[0], hcw[1], hr, col(P.skin), 2.4);
      ctx.beginPath(); ctx.arc(hcw[0], hcw[1] - hr * 0.15, hr * 1.04, Math.PI * 1.02, Math.PI * 1.98); ctx.lineTo(hcw[0] + hr, hcw[1] - hr * 0.25); ctx.closePath(); fillOut(ctx, col(P.hair), 2);
      for (let i = -1; i <= 2; i++) { const bx = hcw[0] + d * i * hr * 0.42; ctx.beginPath(); ctx.moveTo(bx - 3, hcw[1] - hr * 0.8); ctx.lineTo(bx + d * 1, hcw[1] - hr * 1.55 - i * 1.2); ctx.lineTo(bx + 4, hcw[1] - hr * 0.8); ctx.closePath(); fillOut(ctx, col(P.hair), 1.8); }
      ctx.beginPath(); ctx.rect(hcw[0] - hr * 1.02, hcw[1] - hr * 0.62, hr * 2.04, hr * 0.36); fillOut(ctx, col(P.accent), 1.8);
      const ex = hcw[0] + d * hr * 0.42, ey = hcw[1] + hr * 0.12;
      ctx.fillStyle = col("#fff"); ctx.beginPath(); ctx.ellipse(ex, ey, hr * 0.3, hr * 0.28, 0, 0, 7); ctx.fill();
      ctx.fillStyle = stunned ? "#ff4040" : "#10131a"; ctx.beginPath(); ctx.arc(ex + d * 1.4, ey, hr * 0.15, 0, 7); ctx.fill();
      ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ex - hr * 0.3, ey - hr * 0.4); ctx.lineTo(ex + hr * 0.35, ey - hr * 0.22); ctx.stroke();
      limb(ctx, armFw, k.aw, col(P.skin));
      hand(k, armFw[2], k.aw * 0.8, "#f5f5f5");
      if (strike) { ctx.strokeStyle = col("#ffe9a0"); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(armFw[2][0], armFw[2][1], k.aw * 1.3, 0, 7); ctx.stroke(); }
      return;
    }

    // ───────────── MAGE ─────────────
    if (id === "mage") {
      const robeHem = -k.legL * 0.1;
      limb(ctx, armBw, k.aw, col(P.dark));
      hand(k, armBw[2], k.aw * 0.7, P.skin);
      // feet peeking out
      legsAndFeet(k, P.pants, P.boot);
      // robe: shoulders -> flared hem (swaying)
      const sway = Math.sin(now * 3) * 1.5 - k.vx * d * 0.35;
      const rb = [M([k.sh[0] - k.sw * 0.34, k.sh[1]]), M([k.sh[0] + k.sw * 0.34, k.sh[1]]), M([k.hip[0] + k.hw * 0.78 + sway, robeHem]), M([k.hip[0] - k.hw * 0.78 + sway, robeHem])];
      ctx.beginPath(); ctx.moveTo(rb[0][0], rb[0][1]);
      ctx.quadraticCurveTo((rb[0][0] + rb[3][0]) / 2 - 2, (rb[0][1] + rb[3][1]) / 2, rb[3][0], rb[3][1]);
      for (let i = 0; i < 4; i++) ctx.lineTo(rb[3][0] + (rb[2][0] - rb[3][0]) * ((i + 0.5) / 4), robeHem - (i % 2 ? 0 : 3));
      ctx.lineTo(rb[2][0], rb[2][1]);
      ctx.quadraticCurveTo((rb[1][0] + rb[2][0]) / 2 + 2, (rb[1][1] + rb[2][1]) / 2, rb[1][0], rb[1][1]);
      ctx.closePath(); fillOut(ctx, col(P.main), 2.4);
      ctx.beginPath(); ctx.moveTo(shW[0], shW[1] + 2); ctx.lineTo(hipW[0] + sway * 0.6, robeHem - 2); ctx.strokeStyle = col(P.accent); ctx.lineWidth = 2.2; ctx.stroke();
      ctx.beginPath(); ctx.rect(hipW[0] - k.hw * 0.38, hipW[1] - 6, k.hw * 0.76, 4); fillOut(ctx, col(P.accent), 1.4);
      // head
      circle(ctx, hcw[0], hcw[1], hr, col(P.skin), 2.4);
      // beard
      ctx.beginPath(); ctx.moveTo(hcw[0] - hr * 0.7, hcw[1] + hr * 0.2); ctx.quadraticCurveTo(hcw[0] + d * hr * 0.2, hcw[1] + hr * 2, hcw[0] + hr * 0.8, hcw[1] + hr * 0.1); ctx.quadraticCurveTo(hcw[0], hcw[1] + hr * 0.5, hcw[0] - hr * 0.7, hcw[1] + hr * 0.2); ctx.closePath(); fillOut(ctx, col(P.hair), 1.8);
      const ex = hcw[0] + d * hr * 0.45, ey = hcw[1] - hr * 0.05;
      ctx.save(); ctx.shadowColor = P.glow; ctx.shadowBlur = k.isFlash ? 0 : 8; ctx.fillStyle = col(stunned ? "#ff6060" : "#c9a2ff"); ctx.beginPath(); ctx.ellipse(ex, ey, hr * 0.28, hr * 0.2, 0, 0, 7); ctx.fill(); ctx.restore();
      // hat: bent cone + brim + star
      const bx = hcw[0], by = hcw[1] - hr * 0.55;
      ctx.beginPath(); ctx.moveTo(bx - hr * 1.3, by); ctx.quadraticCurveTo(bx - hr * 0.3, by - hr * 1.4, bx + d * hr * 0.1, by - hr * 2.5); ctx.quadraticCurveTo(bx - d * hr * 0.2 - d * 8 + Math.sin(now * 4) * 2.5, by - hr * 3.0, bx - d * hr * 1.2, by - hr * 2.5); ctx.quadraticCurveTo(bx + hr * 0.6, by - hr * 1.2, bx + hr * 1.3, by); ctx.closePath(); fillOut(ctx, col("#6b3fb5"), 2.2);
      ctx.beginPath(); ctx.ellipse(bx, by + 1, hr * 1.7, hr * 0.34, 0, 0, 7); fillOut(ctx, col("#51309a"), 2);
      ctx.fillStyle = col(P.accent); ctx.beginPath(); ctx.arc(bx + d * hr * 0.15, by - hr * 0.7, hr * 0.2, 0, 7); ctx.fill();
      // front arm + staff with orb
      const hF = armFw[2];
      const tipX = hF[0] + d * (windU * -4 + (strike ? 9 : 0)), tipY = hF[1] - k.H * 0.34 + (strike ? 6 : 0);
      ctx.beginPath(); ctx.moveTo(hF[0] - d * 2, hF[1] + k.H * 0.16); ctx.lineTo(tipX, tipY); ctx.strokeStyle = OUT; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.stroke(); ctx.strokeStyle = col("#8a5a34"); ctx.lineWidth = 3; ctx.stroke();
      A.orb = [A.ox + tipX, A.oy + tipY]; // staff orb position, used by mage_fx.js
      const orbR = hr * (0.55 + 0.55 * windU + (strike ? 0.5 : 0) + 0.06 * pulse);
      ctx.save(); ctx.shadowColor = P.glow; ctx.shadowBlur = k.isFlash ? 0 : 10 + 14 * windU; circle(ctx, tipX, tipY, orbR, col(strike || windU > 0.5 ? "#ffffff" : P.glow), 2); ctx.restore();
      limb(ctx, armFw, k.aw, col(P.dark));
      hand(k, armFw[2], k.aw * 0.7, P.skin);
      return;
    }

    // ───────────── ASSASSIN ─────────────
    // Dark hooded killer: charcoal clothes, grey wraps, knife strap, long crimson scarf, red eyes.
    // fr = bloodlust 0..1 (set by assassin_fx.js): brighter eyes and blades while it is high.
    if (id === "assassin") {
      const fr = f._frenzy || 0;
      const vxa = Math.abs(k.vx);
      const glowOn = !k.isFlash;
      const mid = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
      const hotEye = stunned ? "#ffe3e3" : P.accent;

      // tattered coat tail (behind everything), streams back when running
      const drift = -clamp(k.vx * d, -6, 8) * 1.2 + Math.sin(now * 5) * 1.5;
      const cy0 = k.sh[1] + 2, cy1 = k.hip[1] + k.legL * 0.42;
      const coat = [
        [k.sh[0] - 3, cy0], [k.sh[0] + k.sw * 0.22, cy0], [k.hip[0] + k.hw * 0.3 + drift * 0.4, cy1 - 2],
        [k.hip[0] + drift * 0.7 + 6, cy1 + 5], [k.hip[0] - k.hw * 0.2 + drift, cy1 - 1],
        [k.hip[0] - k.hw * 0.55 + drift, cy1 + 8], [k.hip[0] - k.hw * 0.78 + drift, cy1 - 3], [k.sh[0] - 3 - k.sw * 0.12, cy0 + 4],
      ];
      poly(ctx, MP(coat)); fillOut(ctx, col(P.dark), 2);

      // back arm: dark sleeve, grey wrap on the forearm, gloved hand, reverse-grip dagger
      limb(ctx, armBw, k.aw, col(P.main));
      limb(ctx, [mid(armBw[1], armBw[2], 0.1), armBw[2]], k.aw * 1.08, col(P.wrap));
      const bhd = armBw[2];
      hand(k, bhd, k.aw * 0.8, P.hair);
      ctx.beginPath(); ctx.moveTo(bhd[0], bhd[1]); ctx.lineTo(bhd[0] - d * 3, bhd[1] + 13); ctx.strokeStyle = OUT; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.stroke(); ctx.strokeStyle = col(P.steel); ctx.lineWidth = 2.4; ctx.stroke();

      // legs with grey shin wraps
      legsAndFeet(k, P.pants, P.boot, k.lw * 1.4);
      for (const leg of [k.legB, k.legF]) {
        const lp = MP(leg);
        limb(ctx, [mid(lp[1], lp[2], 0.3), mid(lp[1], lp[2], 0.8)], k.lw * 1.0, col(P.wrap));
      }

      // torso + diagonal knife strap with three throwing knives
      torsoShape(k, k.sw * 0.8, k.hw * 0.9, 0, 0, P.main, P.dark, 5);
      const sA = [shW[0] - k.sw * 0.36, shW[1] + 2], sB = [hipW[0] + k.hw * 0.4, hipW[1] - 3];
      ctx.beginPath(); ctx.moveTo(sA[0], sA[1]); ctx.lineTo(sB[0], sB[1]); ctx.lineCap = "round"; ctx.strokeStyle = OUT; ctx.lineWidth = 7.5; ctx.stroke(); ctx.strokeStyle = col(P.strap); ctx.lineWidth = 4.5; ctx.stroke();
      for (const u of [0.3, 0.52, 0.74]) {
        const kx = sA[0] + (sB[0] - sA[0]) * u, ky = sA[1] + (sB[1] - sA[1]) * u;
        poly(ctx, [[kx - 2.2, ky - 5], [kx + 2.2, ky - 5], [kx, ky + 3.5]]); fillOut(ctx, col(P.steel), 1.2);
      }

      // crimson sash with a hanging tail
      ctx.beginPath(); ctx.rect(hipW[0] - k.hw * 0.46, hipW[1] - 6, k.hw * 0.92, 5); fillOut(ctx, col(P.scarf), 1.4);
      const sash = ribbon(A, "sash", hipW[0] - d * k.hw * 0.4, hipW[1] - 3, 5, 5.5, -d * 1.4 - k.vx * d * 0.15, 0.7);
      drawRibbon(ctx, sash, 4, col(P.scarfDark));

      // long scarf (the signature) + a second short tail + neck wrap
      const sc2 = ribbon(A, "scarf2", hcw[0] - d * hr * 0.1, hcw[1] + hr * 0.95, 7, hr * 1.0, -d * 2.0 - k.vx * d * 0.2, 0.55 + Math.sin(now * 7 + 1) * 0.3);
      drawRibbon(ctx, sc2, 5, col(P.scarfDark));
      const sc = ribbon(A, "scarf", hcw[0] - d * hr * 0.1, hcw[1] + hr * 0.85, 10, hr * 1.15, -d * 2.4 - k.vx * d * 0.2, 0.3 + Math.sin(now * 9) * 0.3);
      drawRibbon(ctx, sc, 8, col(P.scarf));
      ctx.beginPath(); ctx.ellipse(hcw[0], hcw[1] + hr * 0.95, hr * 1.05, hr * 0.42, 0, 0, 7); fillOut(ctx, col(P.scarf), 2);

      // hood: round cowl + a sharp peak swept backwards
      circle(ctx, hcw[0], hcw[1], hr * 1.08, col(P.main), 2.4);
      ctx.beginPath();
      ctx.moveTo(hcw[0] - d * hr * 0.2, hcw[1] - hr * 1.0);
      ctx.quadraticCurveTo(hcw[0] - d * hr * 1.2, hcw[1] - hr * 1.5, hcw[0] - d * hr * 2.2, hcw[1] - hr * 1.2 + Math.sin(now * 6) * 1.2);
      ctx.quadraticCurveTo(hcw[0] - d * hr * 1.5, hcw[1] - hr * 0.1, hcw[0] - d * hr * 1.0, hcw[1] + hr * 0.5);
      ctx.closePath(); fillOut(ctx, col(P.dark), 2);
      // dark face opening + cloth mask over the lower face
      ctx.beginPath(); ctx.ellipse(hcw[0] + d * hr * 0.32, hcw[1] + hr * 0.02, hr * 0.74, hr * 0.5, 0, 0, 7); fillOut(ctx, col("#07070b"), 1.6);
      ctx.beginPath(); ctx.ellipse(hcw[0] + d * hr * 0.32, hcw[1] + hr * 0.42, hr * 0.72, hr * 0.3, 0, 0, 7); fillOut(ctx, col("#181a24"), 1.4);
      // angry red eyes (slanted slits), brighter with frenzy
      ctx.save();
      ctx.shadowColor = P.accent; ctx.shadowBlur = glowOn ? 8 + 16 * fr : 0;
      ctx.fillStyle = col(hotEye);
      for (const ox of [0.1, 0.62]) {
        ctx.beginPath();
        ctx.moveTo(hcw[0] + d * hr * ox - 2, hcw[1] - hr * 0.22);
        ctx.lineTo(hcw[0] + d * hr * (ox + 0.4) + 2, hcw[1] - hr * 0.02);
        ctx.lineTo(hcw[0] + d * hr * (ox + 0.28), hcw[1] + hr * 0.14);
        ctx.closePath(); ctx.fill();
      }
      if (fr > 0.45 && glowOn) { // white-hot cores at high frenzy
        ctx.fillStyle = "#fff"; ctx.globalAlpha = (fr - 0.45) * 1.4;
        for (const ox of [0.2, 0.7]) { ctx.beginPath(); ctx.arc(hcw[0] + d * hr * ox + d * 2, hcw[1] - hr * 0.03, 1.6, 0, 7); ctx.fill(); }
      }
      ctx.restore();
      // eye trails: thin red streaks behind the eyes while dashing, attacking or frenzied
      if (vxa > 3.5 || fr > 0.3 || attackingNow) {
        const et = ribbon(A, "eyetr", hcw[0] + d * hr * 0.8, hcw[1] - hr * 0.05, 5, 3.2, -d * 1.3 - k.vx * d * 0.25, 0.04);
        ctx.save(); ctx.lineCap = "round"; ctx.strokeStyle = col(P.accent); ctx.globalCompositeOperation = "lighter";
        for (let i = 1; i < et.length; i++) {
          const u = 1 - i / et.length;
          ctx.globalAlpha = u * (0.45 + 0.5 * fr); ctx.lineWidth = 0.5 + 1.8 * u;
          ctx.beginPath(); ctx.moveTo(et[i - 1][0], et[i - 1][1]); ctx.lineTo(et[i][0], et[i][1]); ctx.stroke();
        }
        ctx.restore();
      }

      // front arm: sleeve + wrap + glove + blade with a red glowing edge
      limb(ctx, armFw, k.aw, col(P.main));
      limb(ctx, [mid(armFw[1], armFw[2], 0.1), armFw[2]], k.aw * 1.08, col(P.wrap));
      const fhd = armFw[2];
      hand(k, fhd, k.aw * 0.8, P.hair);
      const ax = fhd[0] - armFw[1][0], ay = fhd[1] - armFw[1][1], al = Math.hypot(ax, ay) || 1;
      const bl = k.H * 0.27, ux = ax / al, uy = ay / al;
      const tx = fhd[0] + ux * bl, ty = fhd[1] + uy * bl;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(fhd[0], fhd[1]); ctx.lineTo(tx, ty); ctx.strokeStyle = OUT; ctx.lineWidth = 6.5; ctx.stroke();
      ctx.strokeStyle = col(P.steel); ctx.lineWidth = 3.2; ctx.stroke();
      ctx.save();
      ctx.shadowColor = P.accent; ctx.shadowBlur = glowOn ? 6 + 12 * fr + (strike ? 8 : 0) : 0;
      ctx.beginPath(); ctx.moveTo(fhd[0] + ux * 6, fhd[1] + uy * 6); ctx.lineTo(tx, ty);
      ctx.strokeStyle = col(strike ? "#ffd0d8" : P.accent); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
      // crossguard
      ctx.beginPath(); ctx.moveTo(fhd[0] + ux * 3 - uy * 4, fhd[1] + uy * 3 + ux * 4); ctx.lineTo(fhd[0] + ux * 3 + uy * 4, fhd[1] + uy * 3 - ux * 4); ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.stroke();
      return;
    }

    // ───────────── GUNNER (id "hitter") ─────────────
    if (id === "hitter") {
      const strikeNow = st === S.ATTACK_ACTIVE, recov = st === S.ATTACK_RECOVERY;
      limb(ctx, armBw, k.aw, col(P.shirt));
      hand(k, armBw[2], k.aw * 0.8, P.skin);
      legsAndFeet(k, P.pants, P.boot);
      torsoShape(k, k.sw * 0.84, k.hw, 0, 0, P.shirt, "#8a7a60", 5);
      // leather vest panels, belt + gold buckle
      for (const sgn of [-1, 1]) { const px = shW[0] + sgn * k.sw * 0.3; ctx.beginPath(); ctx.moveTo(px - 5, shW[1]); ctx.lineTo(px + 5, shW[1]); ctx.lineTo(hipW[0] + sgn * k.hw * 0.4 + 4, hipW[1]); ctx.lineTo(hipW[0] + sgn * k.hw * 0.4 - 4, hipW[1]); ctx.closePath(); fillOut(ctx, col(P.main), 1.8); }
      ctx.beginPath(); ctx.rect(hipW[0] - k.hw * 0.5, hipW[1] - 6, k.hw, 5); fillOut(ctx, col("#3a2414"), 1.4);
      ctx.fillStyle = col(P.accent); ctx.fillRect(hipW[0] - 2.5, hipW[1] - 6, 5, 5);
      // bandana: knot tail + neckerchief
      const bt = ribbon(A, "bandana", hcw[0] - d * hr * 0.1, hcw[1] + hr * 0.85, 6, hr * 0.9, -d * 2.2 - k.vx * d * 0.2, 0.3 + Math.sin(now * 9) * 0.3);
      drawRibbon(ctx, bt, 6, col(P.band));
      poly(ctx, [[hcw[0] - hr * 0.85, hcw[1] + hr * 0.65], [hcw[0] + hr * 0.85, hcw[1] + hr * 0.65], [hcw[0] + d * hr * 0.1, hcw[1] + hr * 1.75]]); fillOut(ctx, col(P.band), 1.8);
      // head + squinting eye
      circle(ctx, hcw[0], hcw[1], hr, col(P.skin), 2.4);
      const ex = hcw[0] + d * hr * 0.45, ey = hcw[1] + hr * 0.12;
      ctx.fillStyle = col("#fff"); ctx.beginPath(); ctx.ellipse(ex, ey, hr * 0.3, hr * 0.22, 0, 0, 7); ctx.fill();
      ctx.fillStyle = stunned ? "#ff3030" : "#10131a"; ctx.beginPath(); ctx.arc(ex + d * 1.4, ey, hr * 0.13, 0, 7); ctx.fill();
      ctx.strokeStyle = OUT; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(ex - hr * 0.35, ey - hr * 0.4); ctx.lineTo(ex + hr * 0.4, ey - hr * 0.25); ctx.stroke();
      // cowboy hat: crown, dent, band, wide brim
      const hx = hcw[0], hy = hcw[1] - hr * 0.5;
      ctx.beginPath(); ctx.moveTo(hx - hr * 0.95, hy); ctx.lineTo(hx - hr * 0.8, hy - hr * 1.0); ctx.quadraticCurveTo(hx, hy - hr * 1.3, hx + hr * 0.8, hy - hr * 1.0); ctx.lineTo(hx + hr * 0.95, hy); ctx.closePath(); fillOut(ctx, col(P.hat), 2.2);
      ctx.strokeStyle = col(P.hatDark); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hx - hr * 0.4, hy - hr * 1.1); ctx.quadraticCurveTo(hx, hy - hr * 0.85, hx + hr * 0.4, hy - hr * 1.1); ctx.stroke();
      ctx.beginPath(); ctx.rect(hx - hr * 0.93, hy - hr * 0.34, hr * 1.86, hr * 0.3); fillOut(ctx, col("#2a1a0c"), 1.4);
      ctx.beginPath(); ctx.ellipse(hx, hy + 1, hr * 1.9, hr * 0.3, -d * 0.08, 0, 7); fillOut(ctx, col(P.hatDark), 2.2);
      // front arm + revolver. Carried low, raised to aim during the wind-up, kicks up on the shot.
      limb(ctx, armFw, k.aw, col(P.shirt));
      const gh = armFw[2], gs = k.H / 74;
      const aimT = strikeNow ? -0.32 : windU > 0 ? lerp(0.85, 0.0, easeOut(windU)) : recov ? 0.2 : 0.85;
      A.aim = A.aim == null ? aimT : lerp(A.aim, aimT, 0.4);
      const ux = d * Math.cos(A.aim), uy = Math.sin(A.aim);
      ctx.save();
      ctx.translate(gh[0], gh[1]);
      ctx.rotate(Math.atan2(uy, ux));
      ctx.scale(gs, d * gs);
      ctx.beginPath(); ctx.moveTo(-3, -1); ctx.lineTo(4, -1); ctx.lineTo(3, 10); ctx.lineTo(-5, 9); ctx.closePath(); fillOut(ctx, col(P.wood), 1.8); // grip
      ctx.beginPath(); ctx.rect(6, -6, 19, 4.5); fillOut(ctx, col(P.metal), 1.8); // barrel
      ctx.beginPath(); ctx.rect(-5, -7, 13, 8); fillOut(ctx, col("#8a90a0"), 1.8); // frame
      ctx.beginPath(); ctx.ellipse(3, -3, 4.2, 4.8, 0, 0, 7); fillOut(ctx, col("#6a7080"), 1.6); // cylinder
      ctx.beginPath(); ctx.moveTo(-5, -7); ctx.lineTo(-8, -11); ctx.lineTo(-2, -8); ctx.closePath(); fillOut(ctx, col("#6a7080"), 1.4); // hammer
      ctx.fillStyle = col("#3a3f55"); ctx.fillRect(22, -8.5, 2, 2.5); // front sight
      if (A.muzzle > 0 && !k.isFlash) { // muzzle flash
        const m = A.muzzle / 7;
        ctx.save(); ctx.globalAlpha = m; ctx.shadowColor = "#ffb02e"; ctx.shadowBlur = 16;
        for (const [r0, r1, c] of [[15, 5, "#ffb02e"], [8, 3, "#fff3b0"]]) {
          ctx.fillStyle = c; ctx.beginPath();
          for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = (i % 2 ? r1 : r0 * (0.6 + 0.4 * m)) ; ctx.lineTo(28 + Math.cos(a) * r, -4 + Math.sin(a) * r * 0.75); }
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
      ctx.restore();
      hand(k, gh, k.aw * 0.8, P.skin);
      if (A.fireFx) { // brass casing, sparks and a little smoke
        A.fireFx = false;
        const sp = k.spawn;
        if (sp) {
          const wx = A.ox + gh[0] + ux * 27 * gs, wy = A.oy + gh[1] + uy * 27 * gs;
          sp(A.ox + gh[0], A.oy + gh[1] - 4, -d * 1.3, -2.8, "#ffd24a", 26, 2.4);
          for (let i = 0; i < 4; i++) sp(wx, wy, ux * (2 + Math.random() * 3), uy * 2 + (Math.random() - 0.5) * 2, "#ffcf5a", 8, 2);
          for (let i = 0; i < 3; i++) sp(wx + ux * 4, wy + uy * 4, ux * 1.4 + (Math.random() - 0.5), uy * 1.4 - 0.5, "#d8dce6", 22, 3.2);
        }
      }
      return;
    }

    // ───────────── TANK ─────────────
    {
      limb(ctx, armBw, k.aw, col(P.dark));
      circle(ctx, armBw[2][0], armBw[2][1], k.aw * 0.72, col(P.main), 2.4);
      legsAndFeet(k, P.dark, P.boot, k.lw * 1.5);
      // greaves bands
      for (const leg of [k.legB, k.legF]) { const kp = M(leg[1]); ctx.beginPath(); ctx.ellipse(kp[0], kp[1], k.lw * 0.62, k.lw * 0.45, 0, 0, 7); fillOut(ctx, col(P.main), 1.8); }
      torsoShape(k, k.sw * 0.86, k.hw, 0, 0, P.main, P.dark, 6);
      // chest plate emblem + rivets + belt
      ctx.beginPath(); ctx.moveTo(shW[0], shW[1] + 7); ctx.lineTo(shW[0] + 9, shW[1] + 17); ctx.lineTo(shW[0], shW[1] + 27); ctx.lineTo(shW[0] - 9, shW[1] + 17); ctx.closePath(); fillOut(ctx, col(P.accent), 1.8);
      ctx.fillStyle = col(P.light); for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.arc(shW[0] + sgn * k.sw * 0.28, shW[1] + 6, 1.8, 0, 7); ctx.fill(); }
      ctx.beginPath(); ctx.rect(hipW[0] - k.hw * 0.5, hipW[1] - 7, k.hw, 6); fillOut(ctx, col(P.pants), 1.6);
      // helmet
      circle(ctx, hcw[0], hcw[1], hr * 1.18, col(P.main), 2.6);
      ctx.beginPath(); ctx.moveTo(hcw[0] - hr * 0.2, hcw[1] - hr * 1.15); ctx.lineTo(hcw[0] + hr * 0.2, hcw[1] - hr * 1.15); ctx.lineTo(hcw[0] + d * hr * 0.1 - 2, hcw[1] - hr * 2.0); ctx.lineTo(hcw[0] + d * hr * 0.1 - hr * 0.5, hcw[1] - hr * 1.15); ctx.closePath(); fillOut(ctx, col(P.accent), 2);
      ctx.save(); ctx.shadowColor = P.accent; ctx.shadowBlur = k.isFlash ? 0 : 8 + 8 * windU;
      ctx.beginPath(); ctx.rect(hcw[0] + (d > 0 ? -hr * 0.1 : -hr * 1.1), hcw[1] - hr * 0.2, hr * 1.2, hr * 0.38); fillOut(ctx, col(stunned ? "#ff2020" : windU > 0.3 ? "#ffd2a0" : P.accent), 1.8);
      ctx.restore();
      // pauldrons
      for (const [sp, front] of [[M(k.shB), false], [M(k.shF), true]]) { ctx.beginPath(); ctx.ellipse(sp[0], sp[1] + 1, k.aw * 0.95, k.aw * 0.75, 0, 0, 7); fillOut(ctx, col(front ? P.light : P.main), 2.2); ctx.fillStyle = col(P.accent); ctx.beginPath(); ctx.arc(sp[0], sp[1] + 1, 2, 0, 7); ctx.fill(); }
      limb(ctx, armFw, k.aw, col(P.dark));
      const g = armFw[2];
      circle(ctx, g[0], g[1], k.aw * 0.8, col(P.light), 2.6);
      if (strike) { ctx.strokeStyle = col("#ffd9a0"); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(g[0], g[1], k.aw * 1.6, 0, 7); ctx.stroke(); }
    }
  }

  MW.CharacterArt = { draw, PAL, BUILD };
})(globalThis);