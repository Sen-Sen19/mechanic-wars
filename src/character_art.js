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
    fighter: { main: "#c98a3a", dark: "#5c3f1f", light: "#e8a85a", accent: "#d9611a", skin: "#c98d64", skinDark: "#8f5a3b", skinLight: "#e3ae84", hair: "#1d1714", pants: "#232226", pantsDark: "#141316", boot: "#2b221b", iron: "#5a5d64", ironDark: "#2f3136", bronze: "#8a6234", bronzeDark: "#53391c", bronzeLight: "#bd8f4c", leather: "#3b2a1e", energy: "#d9611a", energyHi: "#f0a64a", scar: "#ecc7a6" },
    mage: { main: "#0c0a14", dark: "#07050d", light: "#b44bff", accent: "#e6bcff", skin: "#171229", hair: "#0c0a14", pants: "#0c0a14", boot: "#0c0a14", glow: "#b44bff" },
    assassin: { main: "#2a2d3a", dark: "#10121a", light: "#ff6b82", accent: "#ff2a45", skin: "#2b2230", hair: "#0f0f15", pants: "#181b26", boot: "#0c0d12", scarf: "#e4203f", scarfDark: "#8f1228", steel: "#e6ecf8", wrap: "#555c72", strap: "#5b2a2e" },
    hitter: { main: "#ff7a3d", dark: "#b8431a", light: "#ffb48a", accent: "#ffd24a", skin: "#e9b98f", hair: "#3a2414", pants: "#2f3a5a", boot: "#5a3a22", shirt: "#efe3cc", hat: "#8a5428", hatDark: "#4e2e14", band: "#d6342f", metal: "#aeb4c2", wood: "#6a3a1a" },
    tank: { main: "#7d8aa0", dark: "#454f62", light: "#c8d2e2", accent: "#f2b84b", skin: "#c9a98a", hair: "#303642", pants: "#3b4252", boot: "#2e3442", glow: "#ff7a2a", glowHi: "#ffd9a0" },
  };
  // leg/tor/arm = fractions of height; sw/hw/lw/aw = fractions of width; hr = head radius / height.
  const BUILD = {
    fighter: { leg: 0.40, tor: 0.31, hr: 0.125, sw: 0.92, hw: 0.56, lw: 0.25, aw: 0.245, arm: 0.34, stride: 0.45 }, // heavyweight: wide shoulders, thick limbs
    mage: { leg: 0.40, tor: 0.33, hr: 0.10, sw: 0.58, hw: 0.42, lw: 0.15, aw: 0.105, arm: 0.40, stride: 0.34 },
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
      // 3 = Power Strike (skill 1): deep crouch + fist pulled far back, then a long lunging straight
      { wind: kf([-0.6, 0.3], [0.25, 0.5], -0.34, -7, 0.07), strike: kf([1.25, 0.0], [0.0, 0.6], 0.52, 15, 0.1) },
      // 4 = Fist Rush (skill 2): body already leaning into the dash, fist cocked low, then a flat straight punch
      { wind: kf([0.0, 0.25], [0.35, 0.45], 0.4, 6, 0.05), strike: kf([1.22, -0.04], [-0.1, 0.55], 0.6, 14, 0.09) },
      // 5 = Rising Fist (skill 3): low crouching wind-up, then a vertical-lift punch
      { wind: kf([-0.2, 0.8], [0.2, 0.6], -0.25, -4, 0.08), strike: kf([0.8, -0.7], [0.1, 0.6], 0.4, 10, 0.05) },
      // 6 = Iron Guard (skill 4): brace pose
      // both gloves up in front of the face, braced low; the pose is held for the whole guard (no punch)
      { wind: kf([0.5, -0.46], [0.36, -0.4], -0.02, 0, 0.06), strike: kf([0.5, -0.46], [0.36, -0.4], -0.02, 0, 0.07) },
      // 7 = Meteor Breaker (ultimate): long, heavy wind-up, then a massive forward slam
      { wind: kf([-0.8, 0.2], [0.3, 0.7], -0.4, -10, 0.12), strike: kf([1.4, 0.0], [-0.2, 0.7], 0.7, 20, 0.15) },
    ],
    assassin: [
      { wind: kf([-0.3, -0.45], [0.1, 0.6], -0.2, -3, 0.04), strike: kf([1.05, 0.05], [0.1, 0.5], 0.4, 9, 0.05) },
      { wind: kf([-0.3, 0.6], [0.1, 0.6], -0.2, -3, 0.06), strike: kf([1.05, 0.35], [0.1, 0.5], 0.42, 9, 0.07) },
    ],
    tank: [{ wind: kf([-0.3, 0.05], [0.0, 0.5], -0.32, -5, 0.03), strike: kf([1.0, 0.1], [0.1, 0.5], 0.46, 8, 0.07) }],
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
      let key = seq.length > 1 ? (id === "fighter" ? f.chainIndex || 0 : A.atkN) % seq.length : 0;
      if (f.hit.pose !== undefined && seq[f.hit.pose]) key = f.hit.pose; // skill-specific pose
      const K = seq[Math.min(key, seq.length - 1)];
      const guard = id === "fighter" ? kf([0.62, 0.08], [0.34, 0.2], 0.08, 0, 0) : kf([0.45, 0.55], [0.12, 0.7], 0.04, 0, 0);
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
      if (st === S.ATTACK_ACTIVE && f.hit.id !== "iron_guard") { sx = 1.06; sy = 0.96; }
      if (airborne) { ff = [Wd * 0.25, -H * 0.1]; bf = [-Wd * 0.2, -H * 0.05]; }
      else { ff = [Wd * 0.3 + lunge * 0.6, 0]; bf = [-Wd * 0.28, 0]; }
    } else if (airborne) {
      const rising = vy < 0;
      lean = rising ? 0.08 : 0.02;
      ff = rising ? [Wd * 0.34, -H * 0.2] : [Wd * 0.2, -H * 0.06];
      bf = rising ? [-Wd * 0.1, -H * 0.1] : [-Wd * 0.22, -H * 0.04];
      fh = rising ? [0.7, -0.5] : [0.55, -0.6]; bh = rising ? [-0.3, -0.4] : [-0.15, -0.65];
      if (id === "fighter") { fh = rising ? [0.72, -0.3] : [0.58, -0.05]; bh = rising ? [0.4, -0.2] : [0.3, 0.1]; } // fists stay up in a guard while jumping
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
      if (id === "mage") { fh = [0.25 + sw1 * 0.4, 0.66 - 0.2 * Math.abs(sw1)]; bh = [0.05 + sw2 * 0.4, 0.7 - 0.2 * Math.abs(sw2)]; } // long arms, small swing
      if (id === "fighter") { fh = [0.5 + sw1 * 0.26, 0.14 + 0.1 * (1 - Math.abs(sw1))]; bh = [0.3 + sw2 * 0.22, 0.24 + 0.1 * (1 - Math.abs(sw2))]; lean += 0.04; } // guard up, fists pump with each step
    } else {
      bob = idle * H * 0.008;
      crouch = H * 0.012 * (1 + idle);
      fh = [0.45 + idle * 0.03, 0.55 + idle * 0.05]; bh = [0.12, 0.7 - idle * 0.04];
      tilt = idle * 0.02;
      if (id === "fighter") { // heavyweight stance: planted, gauntlets raised at chest height, slow breathing
        const pump = Math.sin(now * 2.6);
        fh = [0.66 + 0.02 * pump, 0.14 + 0.03 * idle]; bh = [0.36 - 0.02 * pump, 0.27 - 0.02 * idle];
        bob = idle * H * 0.008; crouch = H * 0.02; lean = 0.1; tilt = idle * 0.02;
        ff = [Wd * 0.22, 0]; bf = [-Wd * 0.26, 0]; // wider stance
      }
    }
    if (A.land > 0 && !attacking && !stunned) {
      crouch += A.land * H * 0.09; sx *= 1 + 0.14 * A.land; sy *= 1 - 0.13 * A.land;
      ff = [Wd * 0.28, 0]; bf = [-Wd * 0.3, 0]; fh = [0.5, 0.2]; bh = [-0.1, 0.3];
    }

    if (id === "fighter") { // hands glide between guard / run / air poses instead of snapping; strikes stay exact
      if (attacking || stunned || ko || !A.sfh) { A.sfh = fh.slice(); A.sbh = bh.slice(); }
      else {
        A.sfh = [lerp(A.sfh[0], fh[0], 0.3), lerp(A.sfh[1], fh[1], 0.3)];
        A.sbh = [lerp(A.sbh[0], bh[0], 0.3), lerp(A.sbh[1], bh[1], 0.3)];
        fh = A.sfh.slice(); bh = A.sbh.slice();
      }
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

  // ───────────── VANGUARD (id "fighter") ─────────────
  // Bare-chested gladiator-brawler. Heavy engraved gauntlets with kinetic energy channels,
  // one asymmetrical pauldron, dark combat trousers, layered waist cloth, heavy boots.
  // His power is physical: energy gathers at the knuckles on wind-up and shows as ripples on impact.
  // Gradients fall back to a flat colour if the context cannot make one (test mocks, odd browsers).
  function gradFill(g, stops) {
    if (!g || typeof g.addColorStop !== "function") return stops[Math.min(stops.length - 1, stops.length >> 1)][1];
    for (const s of stops) g.addColorStop(s[0], s[1]);
    return g;
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // Two-segment limb with a taper (thigh wider than shin). Outlines first so the knee has no seam.
  function taperLimb(ctx, pts, w1, w2, color) {
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const [a, b, w] of [[pts[0], pts[1], w1], [pts[1], pts[2], w2]]) {
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      ctx.strokeStyle = OUT; ctx.lineWidth = w + 4; ctx.stroke();
    }
    for (const [a, b, w] of [[pts[0], pts[1], w1], [pts[1], pts[2], w2]]) {
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
    }
  }

  function vanguard(k, e) {
    const { ctx, M, d, P, col, hr, A, f, now, isFlash, st } = k;
    const S = MW.STATE;
    const { shW, hipW, hcw, armBw, armFw, strike, attackingNow, stunned } = e;
    const heat = f._heat || 0;
    const blocking = !!(f.hit && f.hit.id === "iron_guard" && attackingNow);
    const heavy = !!(f.hit && (f.hit.isSkill || f.chainIndex === 2));
    const charge = st === S.ATTACK_STARTUP ? e.windU * (heavy ? 1 : 0.5) : 0; // 0..1 energy gathering at the knuckles
    const energy = clamp(0.3 + 0.45 * heat + 0.5 * charge + (strike ? 0.55 : 0) + (blocking ? 0.3 : 0), 0, 1.3);
    const lin = (x0, y0, x1, y1, stops) => {
      if (isFlash) return "#fff";
      return gradFill(ctx.createLinearGradient(x0, y0, x1, y1), stops);
    };
    const line = (a, b) => { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); };

    // ── torso axis: T(t, s) = point t of the way from shoulders to hips, s px toward the front ──
    const sh = shW, hp = hipW;
    let ux = hp[0] - sh[0], uy = hp[1] - sh[1];
    const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
    let nx = -uy, ny = ux;
    if (nx * d < 0) { nx = -nx; ny = -ny; } // n points toward the facing side
    const T = (t, s) => [sh[0] + ux * ul * t + nx * s, sh[1] + uy * ul * t + ny * s];
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

    // ── gauntlet: engraved iron sleeve + knuckle block; the front one carries a mechanical reinforcement ──
    const gauntlet = (pt, elbow, mech, power) => {
      const dx = pt[0] - elbow[0], dy = pt[1] - elbow[1];
      const len = Math.hypot(dx, dy) || 1, ang = Math.atan2(dy, dx);
      const r = k.aw * 0.78;
      const x0 = -len * 0.98;
      ctx.save();
      ctx.translate(pt[0], pt[1]); ctx.rotate(ang);
      ctx.scale(1 + power * 0.12, d * (1 - power * 0.05));
      // sleeve over the forearm
      ctx.beginPath(); ctx.moveTo(x0, -r * 0.86); ctx.lineTo(-r * 0.15, -r * 1.04); ctx.lineTo(-r * 0.15, r * 1.04); ctx.lineTo(x0, r * 0.86); ctx.closePath();
      fillOut(ctx, lin(0, -r, 0, r, [[0, "#80838a"], [0.4, P.iron], [1, P.ironDark]]), 2.2);
      // elbow cuff (dark bronze) with a worn highlight
      rr(ctx, x0 - 0.5, -r * 1.0, len * 0.17, r * 2.0, 1.6);
      fillOut(ctx, lin(0, -r, 0, r, [[0, P.bronzeLight], [0.5, P.bronze], [1, P.bronzeDark]]), 2);
      // panel seams
      if (!isFlash) {
        ctx.lineCap = "butt";
        for (const u of [0.4, 0.64]) {
          const x = x0 + len * u;
          ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x, -r * 0.96); ctx.lineTo(x, r * 0.96); ctx.stroke();
          ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 1.3, -r * 0.94); ctx.lineTo(x + 1.3, r * 0.94); ctx.stroke();
        }
        // ancient engravings: zig-zag band and rune ticks
        ctx.strokeStyle = P.bronzeLight; ctx.globalAlpha = 0.8; ctx.lineWidth = 1; ctx.lineJoin = "miter";
        ctx.beginPath();
        const zs = len * 0.07;
        for (let i = 0, x = x0 + len * 0.22; x < x0 + len * 0.56; i++, x += zs) ctx.lineTo(x, i % 2 ? r * 0.17 : -r * 0.17);
        ctx.stroke();
        ctx.beginPath();
        for (const sgn of [-1, 1]) for (const u of [0.28, 0.34, 0.5]) { const x = x0 + len * u; ctx.moveTo(x, sgn * r * 0.7); ctx.lineTo(x + 1.4, sgn * r * 0.84); }
        ctx.stroke();
        ctx.globalAlpha = 1;
        // kinetic energy channels running up the forearm into the knuckle block
        const ea = clamp(0.5 + 0.5 * energy, 0, 1);
        ctx.save();
        ctx.lineCap = "round";
        ctx.shadowColor = P.energy; ctx.shadowBlur = 5 + 7 * energy;
        ctx.strokeStyle = energy > 0.95 ? P.energyHi : P.energy; ctx.globalAlpha = ea; ctx.lineWidth = 1.7;
        for (const sgn of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(x0 + len * 0.16, sgn * r * 0.55);
          ctx.lineTo(x0 + len * 0.7, sgn * r * 0.55);
          ctx.lineTo(-r * 0.15, sgn * r * 0.3);
          ctx.stroke();
        }
        ctx.restore();
      }
      // mechanical reinforcement: bronze piston rail, linkage gear and hose
      if (mech) {
        rr(ctx, x0 + len * 0.1, -r * 1.42, len * 0.62, r * 0.4, r * 0.18);
        fillOut(ctx, lin(0, -r * 1.42, 0, -r * 1.02, [[0, P.bronzeLight], [0.55, P.bronze], [1, P.bronzeDark]]), 1.8);
        ctx.fillStyle = P.bronzeDark;
        for (const u of [0.22, 0.4, 0.58]) ctx.fillRect(x0 + len * u, -r * 1.42, 1.2, r * 0.4);
        for (const u of [0.18, 0.66]) { rr(ctx, x0 + len * u, -r * 1.06, 2.4, r * 0.2, 0.6); fillOut(ctx, col(P.ironDark), 1.2); }
        ctx.beginPath(); ctx.arc(x0 + len * 0.5, r * 0.5, r * 0.34, 0, 7); fillOut(ctx, col(P.bronze), 1.8);
        if (!isFlash) {
          ctx.save(); ctx.translate(x0 + len * 0.5, r * 0.5); ctx.rotate(now * 1.2 * (0.4 + energy));
          ctx.strokeStyle = P.bronzeDark; ctx.lineWidth = 1.3;
          ctx.beginPath(); for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3); ctx.lineTo(-Math.cos(a) * r * 0.3, -Math.sin(a) * r * 0.3); }
          ctx.stroke(); ctx.restore();
        }
        ctx.beginPath(); ctx.arc(x0 + len * 0.5, r * 0.5, r * 0.11, 0, 7); ctx.fillStyle = isFlash ? "#fff" : P.energyHi; ctx.fill();
        ctx.strokeStyle = OUT; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x0 + len * 0.72, -r * 1.24); ctx.quadraticCurveTo(-r * 0.2, -r * 1.7, r * 0.3, -r * 1.06); ctx.stroke();
        ctx.strokeStyle = isFlash ? "#fff" : "#4a3f36"; ctx.lineWidth = 1; ctx.stroke();
      }
      // knuckle block
      rr(ctx, -r * 0.5, -r * 1.12, r * 1.85, r * 2.24, r * 0.45);
      fillOut(ctx, lin(0, -r * 1.1, 0, r * 1.1, [[0, "#4b4e55"], [1, "#25272c"]]), 2.4);
      if (!isFlash) {
        ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.lineWidth = 1; ctx.beginPath(); line([-r * 0.2, -r * 0.36], [r * 0.7, -r * 0.36]); line([-r * 0.2, r * 0.36], [r * 0.7, r * 0.36]); ctx.stroke(); // finger separations
      }
      rr(ctx, r * 0.66, -r * 1.04, r * 0.66, r * 2.08, r * 0.22); // reinforced knuckle plate
      fillOut(ctx, lin(r * 0.66, 0, r * 1.32, 0, [[0, P.bronzeLight], [1, P.bronzeDark]]), 2);
      ctx.fillStyle = col(P.bronzeLight);
      for (const sy of [-0.62, 0, 0.62]) { ctx.beginPath(); ctx.arc(r * 1.04, sy * r, r * 0.17, 0, 7); fillOut(ctx, col(P.bronzeLight), 1.2); }
      ctx.beginPath(); ctx.ellipse(r * 0.1, -r * 1.03, r * 0.52, r * 0.26, -0.08, 0, 7); fillOut(ctx, col("#6b6e75"), 1.8); // thumb guard
      // energy source in the wrist plate
      if (!isFlash) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const cxn = -r * 0.1, rad = r * (0.55 + 0.35 * energy);
        ctx.fillStyle = gradFill(ctx.createRadialGradient(cxn, 0, 0.5, cxn, 0, rad), [[0, "rgba(255,200,110," + (0.55 * energy).toFixed(3) + ")"], [1, "rgba(217,97,26,0)"]]); ctx.beginPath(); ctx.arc(cxn, 0, rad, 0, 7); ctx.fill();
        // glow gathering around the knuckles
        const kr = r * (1.0 + 1.9 * charge + 0.7 * energy + (strike ? 0.8 : 0));
        ctx.fillStyle = gradFill(ctx.createRadialGradient(r * 1.3, 0, 1, r * 1.3, 0, kr), [[0, "rgba(255,214,140," + clamp(0.18 + 0.5 * energy + 0.3 * charge, 0, 0.95).toFixed(3) + ")"], [0.5, "rgba(230,120,40," + (0.22 * energy + 0.2 * charge).toFixed(3) + ")"], [1, "rgba(180,60,10,0)"]]); ctx.beginPath(); ctx.arc(r * 1.3, 0, kr, 0, 7); ctx.fill();
        // sparks of kinetic energy spiralling in
        if (charge > 0.05) {
          ctx.fillStyle = P.energyHi;
          for (let i = 0; i < 7; i++) {
            const a = now * 7 + i * 0.9, dist = r * (0.9 + (1 - charge) * 3.4) * (0.75 + 0.25 * Math.sin(i * 2.1 + now * 5));
            ctx.globalAlpha = 0.35 + 0.6 * charge;
            ctx.beginPath(); ctx.arc(r * 1.3 + Math.cos(a) * dist, Math.sin(a) * dist * 0.8, 1.1 + 0.8 * charge, 0, 7); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      }
      ctx.restore();
      return { ang, r };
    };

    // ── upper arm with a muscle bulge and (front only) a scar ──
    const upperArm = (pts, scar) => {
      limb(ctx, [pts[0], pts[1]], k.aw * 1.12, col(P.skin));
      if (isFlash) return;
      const m = mid(pts[0], pts[1]);
      const ang = Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]);
      ctx.save(); ctx.translate(m[0], m[1]); ctx.rotate(ang);
      ctx.fillStyle = P.skinLight; ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.ellipse(-1, -k.aw * 0.22, k.aw * 0.55, k.aw * 0.28, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      if (scar) { ctx.strokeStyle = P.scar; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(1, -k.aw * 0.5); ctx.lineTo(3.2, k.aw * 0.5); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-1.5, -k.aw * 0.2); ctx.lineTo(0, -k.aw * 0.05); ctx.moveTo(-0.5, k.aw * 0.15); ctx.lineTo(1, k.aw * 0.3); ctx.stroke(); }
      ctx.restore();
    };

    // ═════ BACK ARM (behind the body) ═════
    upperArm(armBw, false);
    gauntlet(armBw[2], armBw[1], false, 0);

    // ═════ CLOTH BEHIND THE LEGS (long dark layer + leather side tail) ═════
    const vxw = clamp(k.vx || 0, -9, 9), vyw = clamp(k.vy || 0, -8, 8);
    const wave = Math.sin(now * 2.3) * 1.6;
    const cloth = (ax, ay, w0, w1, L, sway, fill, trim, tips) => {
      L -= clamp(vyw * 0.7, -4, 8);
      const pts = [[ax - w0 / 2, ay], [ax + w0 / 2, ay], [ax + w1 / 2 + sway, ay + L * 0.9]];
      for (let i = 0; i <= tips; i++) pts.push([ax + sway + (0.5 - i / tips) * w1, ay + L * (i % 2 ? 0.8 : 1)]);
      pts.push([ax - w1 / 2 + sway, ay + L * 0.9]);
      poly(ctx, pts);
      fillOut(ctx, col(fill), 2);
      if (!isFlash && trim) {
        ctx.strokeStyle = trim; ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.moveTo(ax - w0 / 2 + sway * 0.1 + 1, ay + L * 0.2); ctx.lineTo(ax + w0 / 2 + sway * 0.1 - 1, ay + L * 0.2); ctx.stroke();
      }
    };
    cloth(hp[0] - d * k.hw * 0.22, hp[1] - 4, k.hw * 0.56, k.hw * 0.62, k.legL * 0.76, -vxw * 1.1 + wave * 1.4, "#2a2320", P.bronzeDark, 4);
    cloth(hp[0] - d * k.hw * 0.52, hp[1] - 4, 6.5, 6, k.legL * 0.6, -vxw * 1.5 - d * 2 + wave * 2.2, P.leather, null, 2);

    // ═════ LEGS: dark reinforced trousers, knee guards, heavy boots ═════
    for (const [leg, back] of [[k.legB, true], [k.legF, false]]) {
      const pts = MP2(leg, M);
      const ankle = [pts[2][0], pts[2][1] - k.lw * 0.55];
      taperLimb(ctx, [pts[0], pts[1], ankle], k.lw * 1.08, k.lw * 0.86, col(back ? P.pantsDark : P.pants));
      if (!isFlash) { // trouser fold / seam highlights
        ctx.strokeStyle = "rgba(255,255,255,0.07)"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1] + 3); ctx.lineTo(pts[1][0], pts[1][1]); ctx.stroke();
      }
      // knee guard
      if (!back) {
        ctx.beginPath(); ctx.arc(pts[1][0] + d * 1.4, pts[1][1], k.lw * 0.36, 0, 7); fillOut(ctx, col(P.iron), 1.8);
        ctx.beginPath(); ctx.arc(pts[1][0] + d * 1.4, pts[1][1], k.lw * 0.15, 0, 7); fillOut(ctx, col(P.bronze), 1.1);
      }
      // boot: tall shaft, big toe box, metal toe cap, strap and cuff
      const ft = pts[2], kn = pts[1];
      const sx = ft[0] + (kn[0] - ft[0]) * 0.42, sy = ft[1] + (kn[1] - ft[1]) * 0.42; // top of the boot shaft
      limb(ctx, [[sx, sy], [ft[0], ft[1] - k.lw * 0.62]], k.lw * 0.9, col(back ? shade(P.boot, -25) : P.boot));
      const bl = k.lw * 1.3;
      ctx.beginPath(); ctx.ellipse(ft[0] + d * bl * 0.26, ft[1] - k.lw * 0.3, bl * 0.58, k.lw * 0.42, 0, 0, 7); fillOut(ctx, col(back ? shade(P.boot, -25) : P.boot), 2);
      ctx.beginPath(); ctx.ellipse(ft[0] + d * bl * 0.66, ft[1] - k.lw * 0.28, bl * 0.18, k.lw * 0.34, 0, 0, 7); fillOut(ctx, col(back ? P.ironDark : P.iron), 1.6);
      ctx.beginPath(); ctx.moveTo(sx - k.lw * 0.46, sy - 0.5); ctx.lineTo(sx + k.lw * 0.46, sy + 0.5); ctx.strokeStyle = OUT; ctx.lineWidth = 4.4; ctx.stroke();
      ctx.strokeStyle = col(P.bronze); ctx.lineWidth = 2.2; ctx.stroke(); // bronze cuff band
      if (!isFlash) { ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(ft[0] - d * bl * 0.3, ft[1] - 1.4); ctx.lineTo(ft[0] + d * bl * 0.78, ft[1] - 1.4); ctx.stroke(); } // sole
    }

    // ═════ PELVIS (trousers) ═════
    const hy = hp[1];
    poly(ctx, [[hp[0] - k.hw * 0.6, hy - 7], [hp[0] + k.hw * 0.6, hy - 7], [hp[0] + k.hw * 0.68, hy + k.legL * 0.17], [hp[0] - k.hw * 0.68, hy + k.legL * 0.17]]);
    fillOut(ctx, lin(hp[0] - k.hw * 0.6, 0, hp[0] + k.hw * 0.6, 0, [[0, P.pantsDark], [0.6, P.pants], [1, "#2d2c31"]]), 2);

    // ═════ NECK + TORSO (bare chest) ═════
    limb(ctx, [[sh[0], sh[1] - 3], [hcw[0], hcw[1] + hr * 0.5]], hr * 1.2, col(shade(P.skin, -8)));
    const wT = k.sw * 0.5, wM = k.sw * 0.47, wB = k.hw * 0.5;
    const tp = [T(-0.14, -wT * 0.4), T(0.03, -wT * 1.02), T(0.34, -wM), T(1.0, -wB), T(1.0, wB), T(0.34, wM), T(0.03, wT * 1.02), T(-0.14, wT * 0.4)];
    const torso = () => {
      ctx.beginPath();
      const m0 = mid(tp[7], tp[0]);
      ctx.moveTo(m0[0], m0[1]);
      for (let i = 0; i < 8; i++) { const m1 = mid(tp[i], tp[(i + 1) % 8]); ctx.quadraticCurveTo(tp[i][0], tp[i][1], m1[0], m1[1]); }
      ctx.closePath();
    };
    torso();
    const bk = T(0.5, -wM), fr = T(0.5, wM);
    fillOut(ctx, lin(bk[0], bk[1], fr[0], fr[1], [[0, P.skinDark], [0.45, P.skin], [0.8, P.skinLight], [1, P.skin]]), 2.6);
    if (!isFlash) {
      ctx.save();
      torso(); ctx.clip();
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      // pecs, sternum, abs, obliques
      ctx.strokeStyle = "rgba(92,46,28,0.75)"; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const sg of [-1, 1]) {
        const a = T(0.3, sg * 1.2), b = T(0.4, sg * wM * 0.55), c = T(0.2, sg * wM * 0.92);
        ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(b[0], b[1], c[0], c[1]);
      }
      ctx.stroke();
      ctx.lineWidth = 1.1; ctx.strokeStyle = "rgba(92,46,28,0.55)";
      ctx.beginPath();
      line(T(0.07, 0), T(0.3, 0)); line(T(0.4, 0), T(0.98, 0)); // sternum + linea alba
      for (const t of [0.52, 0.67, 0.82]) { line(T(t, -wB * 0.5), T(t, -1.5)); line(T(t, 1.5), T(t, wB * 0.5)); }
      ctx.stroke();
      // light on the front pec, shade under the pecs and at the waist
      ctx.fillStyle = P.skinLight; ctx.globalAlpha = 0.22;
      const hl = T(0.18, wM * 0.38); ctx.beginPath(); ctx.ellipse(hl[0], hl[1], wM * 0.3, ul * 0.14, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#4a2414"; ctx.globalAlpha = 0.16;
      const ps = T(0.4, 0); ctx.beginPath(); ctx.ellipse(ps[0], ps[1], wM * 0.8, ul * 0.05, 0, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      // battle scars: pale ridges with stitch marks
      const scar = (a, b, w) => {
        ctx.strokeStyle = "rgba(70,30,20,0.55)"; ctx.lineWidth = w + 1.2; ctx.beginPath(); line(a, b); ctx.stroke();
        ctx.strokeStyle = "rgba(240,200,165,0.95)"; ctx.lineWidth = w; ctx.beginPath(); line(a, b); ctx.stroke();
        const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
        ctx.lineWidth = 0.9; ctx.beginPath();
        for (let i = 1; i <= 3; i++) { const p = [a[0] + dx * (i / 4), a[1] + dy * (i / 4)]; ctx.moveTo(p[0] - dy / l * 2.2, p[1] + dx / l * 2.2); ctx.lineTo(p[0] + dy / l * 2.2, p[1] - dx / l * 2.2); }
        ctx.stroke();
      };
      scar(T(0.1, -wM * 0.7), T(0.56, wM * 0.3), 1.5);
      scar(T(0.66, wM * 0.35), T(0.92, wM * 0.78), 1.3);
      scar(T(0.5, -wM * 0.78), T(0.68, -wM * 0.46), 1.2);
      ctx.restore();
    }

    // ═════ BELT, BUCKLE, FRONT CLOTH ═════
    const bw = k.hw * 1.22;
    rr(ctx, hp[0] - bw / 2, hy - 11.5, bw, 9, 1.8);
    fillOut(ctx, lin(0, hy - 11, 0, hy - 3, [[0, "#4a3526"], [1, "#241a13"]]), 2);
    ctx.fillStyle = col(P.bronzeLight);
    for (const u of [-0.42, -0.26, 0.26, 0.42]) { ctx.beginPath(); ctx.arc(hp[0] + u * bw, hy - 7, 1.3, 0, 7); ctx.fill(); }
    rr(ctx, hp[0] - 6.5 + d * 1, hy - 13, 13, 12.5, 2.2); // buckle plate
    fillOut(ctx, lin(0, hy - 13, 0, hy, [[0, P.bronzeLight], [0.6, P.bronze], [1, P.bronzeDark]]), 2);
    if (!isFlash) {
      ctx.strokeStyle = P.bronzeDark; ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(hp[0] + d * 1 - 3.4, hy - 9); ctx.lineTo(hp[0] + d * 1 + 3.4, hy - 9); ctx.moveTo(hp[0] + d * 1, hy - 11.5); ctx.lineTo(hp[0] + d * 1, hy - 2.5); ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = gradFill(ctx.createRadialGradient(hp[0] + d, hy - 6.5, 0, hp[0] + d, hy - 6.5, 6), [[0, "rgba(255,170,70," + (0.5 * energy).toFixed(3) + ")"], [1, "rgba(217,97,26,0)"]]); ctx.beginPath(); ctx.arc(hp[0] + d, hy - 6.5, 6, 0, 7); ctx.fill(); ctx.restore();
    }
    ctx.beginPath(); ctx.arc(hp[0] + d * 1, hy - 6.5, 1.9, 0, 7); ctx.fillStyle = isFlash ? "#fff" : P.energyHi; ctx.fill();
    // front layers of cloth: dark trouser flap with bronze hem, plus a short leather tassel
    cloth(hp[0] + d * k.hw * 0.26, hy - 2, k.hw * 0.5, k.hw * 0.56, k.legL * 0.52, -vxw * 0.9 + wave, "#1d1c20", P.bronze, 3);

    // ═════ HEAD ═════
    const hx = hcw[0], hyy = hcw[1];
    circle(ctx, hx - d * hr * 0.05, hyy, hr, col(P.skin), 2.4); // cranium
    ctx.beginPath(); ctx.ellipse(hx + d * hr * 0.28, hyy + hr * 0.42, hr * 0.78, hr * 0.62, 0, 0, 7); fillOut(ctx, col(P.skin), 2.4); // heavy jaw
    ctx.fillStyle = col(P.skin); // fill over the cranium/jaw seam so the head reads as one shape
    ctx.beginPath(); ctx.arc(hx - d * hr * 0.05, hyy, hr - 1.2, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx + d * hr * 0.28, hyy + hr * 0.42, hr * 0.78 - 1.2, hr * 0.62 - 1.2, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx - d * hr * 0.8, hyy + hr * 0.2, hr * 0.15, hr * 0.26, 0, 0, 7); fillOut(ctx, col(shade(P.skin, -16)), 1); // ear
    if (!isFlash) { // stubble shadow over the jaw
      ctx.fillStyle = P.hair; ctx.globalAlpha = 0.28;
      ctx.beginPath(); ctx.ellipse(hx + d * hr * 0.3, hyy + hr * 0.56, hr * 0.7, hr * 0.38, 0, 0, Math.PI); ctx.fill(); ctx.globalAlpha = 1;
    }
    // short rugged hair with a ragged top edge
    {
      const pts = [];
      for (let i = 0; i <= 8; i++) { const a = Math.PI * (1.04 + (0.92 * i) / 8), rr0 = hr * (1.06 + (i % 2 ? 0.16 : 0)); pts.push([hx - d * hr * 0.05 + Math.cos(a) * rr0, hyy - hr * 0.08 + Math.sin(a) * rr0 * 0.98]); }
      pts.push([hx + d * hr * 0.78, hyy - hr * 0.34], [hx + d * hr * 0.3, hyy - hr * 0.5], [hx - d * hr * 0.4, hyy - hr * 0.3], [hx - d * hr * 0.95, hyy - hr * 0.1]);
      poly(ctx, pts); fillOut(ctx, col(P.hair), 2);
      if (!isFlash) { // cropped strands
        ctx.strokeStyle = "#3d322b"; ctx.lineWidth = 1; ctx.lineCap = "round"; ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = Math.PI * (1.18 + i * 0.12), r0 = hr * 0.72, r1 = hr * 1.0; ctx.moveTo(hx - d * hr * 0.05 + Math.cos(a) * r0, hyy - hr * 0.08 + Math.sin(a) * r0); ctx.lineTo(hx - d * hr * 0.05 + Math.cos(a + 0.08) * r1, hyy - hr * 0.08 + Math.sin(a + 0.08) * r1); }
        ctx.stroke();
      }
    }
    const ex = hx + d * hr * 0.48, ey = hyy + hr * 0.1;
    // eye, heavy brow, scar through the brow and cheek, nose, hard mouth
    if (stunned) { ctx.strokeStyle = "#1a0f0c"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ex - hr * 0.22, ey - hr * 0.1); ctx.lineTo(ex + hr * 0.22, ey + hr * 0.1); ctx.moveTo(ex - hr * 0.22, ey + hr * 0.1); ctx.lineTo(ex + hr * 0.22, ey - hr * 0.1); ctx.stroke(); }
    else {
      ctx.fillStyle = col("#f1e6d6"); ctx.beginPath(); ctx.ellipse(ex, ey, hr * 0.24, hr * 0.17, 0, 0, 7); ctx.fill();
      ctx.fillStyle = isFlash ? "#fff" : (energy > 0.9 ? "#f0a64a" : "#2a1a10"); ctx.beginPath(); ctx.arc(ex + d * hr * 0.07, ey, hr * 0.12, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = isFlash ? "#fff" : "#140d0a"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(ex - hr * 0.42, ey - hr * 0.5); ctx.lineTo(ex + hr * 0.38, ey - hr * 0.2); ctx.stroke(); // furrowed brow
    if (!isFlash) {
      ctx.strokeStyle = P.scar; ctx.lineWidth = 1.05; ctx.beginPath(); ctx.moveTo(ex - d * hr * 0.32, ey - hr * 0.6); ctx.quadraticCurveTo(ex - d * hr * 0.1, ey, ex - d * hr * 0.28, ey + hr * 0.6); ctx.stroke();
      ctx.strokeStyle = "#7a4a30"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(hx + d * hr * 0.42, hyy + hr * 0.68); ctx.lineTo(hx + d * hr * 0.88, hyy + hr * 0.62); ctx.lineTo(hx + d * hr * 0.98, hyy + hr * 0.52); ctx.stroke(); // confident half-smirk
    }
    const nx0 = hx + d * hr * 0.96, ny0 = hyy + hr * 0.28;
    ctx.beginPath(); ctx.moveTo(nx0 - d * hr * 0.2, ny0 - hr * 0.3); ctx.quadraticCurveTo(nx0 + d * hr * 0.3, ny0 - hr * 0.1, nx0 + d * hr * 0.12, ny0 + hr * 0.16); ctx.lineTo(nx0 - d * hr * 0.2, ny0 + hr * 0.2); ctx.closePath(); fillOut(ctx, col(shade(P.skin, -6)), 1.2);

    // ═════ FRONT ARM, PAULDRON, GAUNTLET ═════
    upperArm(armFw, true);
    const shF = M(k.shF);
    {
      // one asymmetrical pauldron: three overlapping plates over the front shoulder (the back shoulder stays bare)
      const pw = k.aw * 0.86, ph = k.aw * 0.46;
      for (let i = 2; i >= 0; i--) {
        ctx.save();
        ctx.translate(shF[0] + d * (0.8 - i * 0.5), shF[1] - 2.2 + i * ph * 0.7);
        ctx.rotate(-d * 0.28);
        ctx.beginPath(); ctx.ellipse(0, 0, pw * (1 - i * 0.12), ph, 0, 0, 7);
        fillOut(ctx, lin(0, -ph, 0, ph, [[0, i === 0 ? "#6d7077" : "#54575e"], [1, "#2b2d32"]]), 2);
        if (!isFlash) { ctx.strokeStyle = P.bronze; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(0, 0, pw * (1 - i * 0.12) - 1, ph - 1, 0, Math.PI * 0.12, Math.PI * 0.88); ctx.stroke(); }
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(shF[0] - d * 0.4, shF[1] - 3.4, 1.2, 0, 7); fillOut(ctx, col(P.bronzeLight), 1);
      ctx.beginPath(); ctx.arc(shF[0] + d * 4.2, shF[1] - 2.4, 1, 0, 7); fillOut(ctx, col(P.bronzeLight), 1);
    }
    const G = gauntlet(armFw[2], armFw[1], true, strike && !blocking ? 1 : 0);
    // knuckle anchors used by brawler_fx.js (glow, embers, ghosts)
    A.fist = [A.ox + armFw[2][0] + Math.cos(G.ang) * G.r * 0.9, A.oy + armFw[2][1] + Math.sin(G.ang) * G.r * 0.9];
    A.fistB = [A.ox + armBw[2][0], A.oy + armBw[2][1]];

    // ═════ Iron Guard: a kinetic energy barrier (no equipment) held out from the gauntlets ═════
    if (blocking) {
      const g = armFw[2];
      const prog = st === S.ATTACK_STARTUP ? clamp(1 - f.stateTimer / Math.max(1, f.hit.startup), 0, 1) : st === S.ATTACK_RECOVERY ? clamp(f.stateTimer / Math.max(1, f.hit.recovery), 0, 1) : 1;
      const R = k.H * 0.3 * (0.5 + 0.5 * prog);
      const cx0 = g[0] + d * R * 0.55, cy0 = g[1] - k.H * 0.02;
      const pulse = 0.8 + 0.2 * Math.sin(now * 16);
      const hex = (rad, ph) => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = ph + (i * Math.PI) / 3; const x = cx0 + Math.cos(a) * rad * 0.62, y = cy0 + Math.sin(a) * rad; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); };
      ctx.save();
      ctx.globalAlpha = (0.3 + 0.7 * prog) * (isFlash ? 1 : 1);
      hex(R, Math.PI / 6);
      ctx.fillStyle = isFlash ? "#fff" : "rgba(217,97,26," + (0.2 * pulse).toFixed(3) + ")"; ctx.fill();
      ctx.shadowColor = P.energy; ctx.shadowBlur = isFlash ? 0 : 14;
      ctx.strokeStyle = isFlash ? "#fff" : P.energyHi; ctx.lineWidth = 3 * pulse; ctx.stroke();
      ctx.shadowBlur = 0;
      if (!isFlash) {
        hex(R * 0.62, Math.PI / 6); ctx.strokeStyle = "rgba(240,166,74,0.7)"; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; ctx.moveTo(cx0 + Math.cos(a) * R * 0.62 * 0.62, cy0 + Math.sin(a) * R * 0.62); ctx.lineTo(cx0 + Math.cos(a) * R * 0.62, cy0 + Math.sin(a) * R); }
        ctx.strokeStyle = "rgba(240,166,74,0.5)"; ctx.lineWidth = 1.2; ctx.stroke();
      }
      ctx.restore();
    } else if (strike) {
      // kinetic distortion: ripples of displaced air ahead of the fist and a smeared streak behind it
      const g = A.fist ? [A.fist[0] - A.ox, A.fist[1] - A.oy] : armFw[2];
      const up = f.chainIndex === 2 || (f.hit && f.hit.id === "rising_fist");
      const prog = f.hit ? clamp(1 - f.stateTimer / Math.max(1, f.hit.active || 1), 0, 1) : 0;
      const dir = up ? -Math.PI / 2 : (d > 0 ? 0 : Math.PI);
      const sc = heavy ? 1.5 : 1;
      ctx.save();
      ctx.lineCap = "round";
      for (let i = 0; i < 3; i++) {
        const rad = k.aw * (1.1 + i * 0.85 + prog * 1.1) * sc;
        ctx.globalAlpha = clamp((1 - i * 0.28) * (1 - prog * 0.55), 0, 1);
        ctx.strokeStyle = isFlash ? "#fff" : i === 0 ? P.energyHi : P.energy; ctx.lineWidth = Math.max(1, 2.8 - i * 0.7);
        ctx.beginPath(); ctx.arc(g[0], g[1], rad, dir - 0.75, dir + 0.75); ctx.stroke();
      }
      ctx.globalAlpha = 0.55; ctx.strokeStyle = isFlash ? "#fff" : P.energy;
      for (const off of [-4, 0, 4]) {
        const bx = -Math.cos(dir), by = -Math.sin(dir), px = -by * off, py = bx * off;
        ctx.lineWidth = off ? 1.6 : 2.6;
        ctx.beginPath(); ctx.moveTo(g[0] + px + bx * 4, g[1] + py + by * 4); ctx.lineTo(g[0] + px + bx * (24 * sc - Math.abs(off) * 2), g[1] + py + by * (24 * sc - Math.abs(off) * 2)); ctx.stroke();
      }
      ctx.restore();
    }
  }
  // maps an IK joint list through the facing mirror (same as MP in draw())
  function MP2(arr, M) { return arr.map(M); }

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

    // ───────────── VANGUARD ─────────────
    // Drawn in vanguard() above: bare-chested gladiator with engraved kinetic gauntlets.
    if (id === "fighter") {
      vanguard(k, { shW, hipW, hcw, armBw, armFw, windU, strike, attackingNow, stunned });
      return;
    }

    // ───────────── VOID MAGE ─────────────
    // Drawn in void_mage_art.js (faceless, obsidian, half-consumed by a dimensional void).
    if (id === "mage" && MW.VoidMage) {
      MW.VoidMage.draw(k, { shW, hipW, hcw, armBw, armFw, windU, strike, pulse, stunned });
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
      // long duster coat: tails flap behind him and stream out when he runs
      {
        const flap = clamp(k.vx * d, -6, 6) * 1.3 + Math.sin(now * 5) * 1.6, ty = hipW[1] + k.legL * 0.85, by = hipW[1] - 6;
        ctx.beginPath();
        ctx.moveTo(shW[0] - d * k.sw * 0.3, shW[1] + 2);
        ctx.lineTo(hipW[0] - d * k.hw * 0.1, by);
        ctx.lineTo(hipW[0] - d * (k.hw * 0.05 + flap * 0.4), ty);
        ctx.lineTo(hipW[0] - d * (k.hw * 1.0 + flap), ty - 4);
        ctx.lineTo(hipW[0] - d * (k.hw * 1.35 + flap * 1.2), ty + 3);
        ctx.quadraticCurveTo(hipW[0] - d * (k.hw * 1.0 + flap * 0.5), (ty + by) / 2, shW[0] - d * k.sw * 0.5, shW[1] + 6);
        ctx.closePath(); fillOut(ctx, col("#8a5530"), 2.2);
        ctx.strokeStyle = col("#c88a52"); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hipW[0] - d * (k.hw * 1.0 + flap), ty - 4); ctx.lineTo(hipW[0] - d * (k.hw * 1.35 + flap * 1.2), ty + 3); ctx.stroke(); // hem trim
        ctx.strokeStyle = col(P.hatDark); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(hipW[0] - d * (k.hw * 0.3 + flap * 0.5), by + 4); ctx.lineTo(hipW[0] - d * (k.hw * 0.4 + flap * 0.7), ty - 2); ctx.stroke();
      }
      legsAndFeet(k, P.pants, P.boot);
      torsoShape(k, k.sw * 0.84, k.hw, 0, 0, P.shirt, "#8a7a60", 5);
      // leather vest panels, belt + gold buckle
      for (const sgn of [-1, 1]) { const px = shW[0] + sgn * k.sw * 0.3; ctx.beginPath(); ctx.moveTo(px - 5, shW[1]); ctx.lineTo(px + 5, shW[1]); ctx.lineTo(hipW[0] + sgn * k.hw * 0.4 + 4, hipW[1]); ctx.lineTo(hipW[0] + sgn * k.hw * 0.4 - 4, hipW[1]); ctx.closePath(); fillOut(ctx, col(P.main), 1.8); }
      ctx.beginPath(); ctx.rect(hipW[0] - k.hw * 0.5, hipW[1] - 6, k.hw, 5); fillOut(ctx, col("#3a2414"), 1.4);
      ctx.fillStyle = col(P.accent); ctx.fillRect(hipW[0] - 2.5, hipW[1] - 6, 5, 5);
      ctx.beginPath(); ctx.rect(hipW[0] - d * k.hw * 0.62 - 4, hipW[1] - 4, 8, 14); fillOut(ctx, col("#3a2414"), 1.6); // back holster
      ctx.beginPath(); ctx.moveTo(shW[0] - k.sw * 0.42, shW[1] - 1); ctx.lineTo(shW[0] - k.sw * 0.1, shW[1] - 1); ctx.lineTo(shW[0] - k.sw * 0.3, shW[1] + 9); ctx.closePath(); fillOut(ctx, col("#6b4226"), 1.8); // collar
      ctx.beginPath(); ctx.moveTo(shW[0] + k.sw * 0.42, shW[1] - 1); ctx.lineTo(shW[0] + k.sw * 0.1, shW[1] - 1); ctx.lineTo(shW[0] + k.sw * 0.3, shW[1] + 9); ctx.closePath(); fillOut(ctx, col("#6b4226"), 1.8);
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
      const gh = armFw[2], gs = (k.H / 74) * 1.45; // oversized six-shooter so it reads at game size
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
        ctx.save(); ctx.globalAlpha = m; ctx.shadowColor = "#ffb02e"; ctx.shadowBlur = 22;
        ctx.strokeStyle = "#ffe9a0"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(30, -4, 8 + (1 - m) * 16, 0, 7); ctx.stroke(); // shock ring
        for (const [r0, r1, c] of [[21, 7, "#ffb02e"], [11, 4, "#fff3b0"]]) {
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

    // ───────────── BULWARK ─────────────
    // Horned great-helm, gold-trimmed plate, tower shield. The shield glows while super armor is on.
    {
      const armorOn = !!(f.hit && f.hit.superArmor && (st === S.ATTACK_STARTUP || st === S.ATTACK_ACTIVE));
      const spark = f.armorHit > 0;
      limb(ctx, armBw, k.aw, col(P.dark));
      circle(ctx, armBw[2][0], armBw[2][1], k.aw * 0.72, col(P.main), 2.4);
      legsAndFeet(k, P.dark, P.boot, k.lw * 1.5);
      for (const leg of [k.legB, k.legF]) { const kp = M(leg[1]); ctx.beginPath(); ctx.ellipse(kp[0], kp[1], k.lw * 0.62, k.lw * 0.45, 0, 0, 7); fillOut(ctx, col(P.main), 1.8); ctx.strokeStyle = col(P.accent); ctx.lineWidth = 1.6; ctx.stroke(); }
      torsoShape(k, k.sw * 0.86, k.hw, 0, 0, P.main, P.dark, 6);
      // gold-trimmed breastplate: trim lines + cross + belt
      ctx.strokeStyle = col(P.accent); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(shW[0] - k.sw * 0.38, shW[1] + 3); ctx.lineTo(shW[0] + k.sw * 0.38, shW[1] + 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(shW[0], shW[1] + 4); ctx.lineTo(hipW[0], hipW[1] - 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(shW[0] - 10, shW[1] + 16); ctx.lineTo(shW[0] + 10, shW[1] + 16); ctx.stroke();
      ctx.beginPath(); ctx.rect(hipW[0] - k.hw * 0.5, hipW[1] - 8, k.hw, 7); fillOut(ctx, col(P.pants), 1.6);
      ctx.fillStyle = col(P.accent); ctx.beginPath(); ctx.arc(hipW[0], hipW[1] - 4.5, 2.6, 0, 7); ctx.fill();
      // horned great-helm
      const hrx = hr * 1.2;
      for (const sgn of [-1, 1]) {
        const bx = hcw[0] + sgn * hrx * 0.85, by = hcw[1] - hrx * 0.5;
        ctx.beginPath(); ctx.moveTo(bx - sgn * 3, by + 3); ctx.quadraticCurveTo(bx + sgn * hrx * 0.9, by - hrx * 0.2, bx + sgn * hrx * 0.55, by - hrx * 1.5); ctx.quadraticCurveTo(bx + sgn * hrx * 0.2, by - hrx * 0.5, bx - sgn * 3, by - 3); ctx.closePath(); fillOut(ctx, col("#e9e2cf"), 2);
      }
      ctx.beginPath(); ctx.moveTo(hcw[0] - hrx, hcw[1] + hrx * 0.9); ctx.lineTo(hcw[0] - hrx, hcw[1] - hrx * 0.2); ctx.quadraticCurveTo(hcw[0], hcw[1] - hrx * 1.5, hcw[0] + hrx, hcw[1] - hrx * 0.2); ctx.lineTo(hcw[0] + hrx, hcw[1] + hrx * 0.9); ctx.closePath(); fillOut(ctx, col(P.main), 2.6);
      ctx.beginPath(); ctx.moveTo(hcw[0], hcw[1] - hrx * 1.25); ctx.lineTo(hcw[0], hcw[1] + hrx * 0.9); ctx.strokeStyle = col(P.accent); ctx.lineWidth = 2; ctx.stroke(); // crest seam
      ctx.save(); ctx.shadowColor = P.glow; ctx.shadowBlur = k.isFlash ? 0 : 8 + (armorOn ? 8 : 0);
      ctx.beginPath(); ctx.rect(hcw[0] + (d > 0 ? -hrx * 0.1 : -hrx * 1.0), hcw[1] - hrx * 0.1, hrx * 1.1, hrx * 0.3); fillOut(ctx, col(stunned ? "#ff2020" : armorOn ? P.glowHi : P.glow), 1.8);
      ctx.restore();
      for (const [sp, front] of [[M(k.shB), false], [M(k.shF), true]]) { ctx.beginPath(); ctx.ellipse(sp[0], sp[1] + 1, k.aw * 0.95, k.aw * 0.75, 0, 0, 7); fillOut(ctx, col(front ? P.light : P.main), 2.2); ctx.strokeStyle = col(P.accent); ctx.lineWidth = 1.6; ctx.stroke(); }
      // front arm + tower shield
      limb(ctx, armFw, k.aw, col(P.dark));
      const g = armFw[2], sW = k.sw * 0.62, sH = k.H * 0.74, x0 = g[0] - d * sW * 0.45, x1 = x0 + d * sW, top = g[1] - sH * 0.42;
      ctx.save();
      if (!k.isFlash && (armorOn || spark)) { ctx.shadowColor = P.glow; ctx.shadowBlur = spark ? 20 : 14 + 6 * pulse; }
      ctx.beginPath(); ctx.moveTo(x0, top); ctx.lineTo(x1, top); ctx.lineTo(x1, g[1] + sH * 0.18); ctx.lineTo((x0 + x1) / 2, top + sH); ctx.lineTo(x0, g[1] + sH * 0.18); ctx.closePath();
      fillOut(ctx, col(armorOn ? "#b4642e" : P.dark), 2.8);
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(x0 + d * 3, top + 4); ctx.lineTo(x1 - d * 3, top + 4); ctx.lineTo(x1 - d * 3, g[1] + sH * 0.14); ctx.lineTo((x0 + x1) / 2, top + sH - 6); ctx.lineTo(x0 + d * 3, g[1] + sH * 0.14); ctx.closePath();
      ctx.strokeStyle = col(armorOn ? P.glowHi : P.accent); ctx.lineWidth = 2.4; ctx.stroke();
      ctx.beginPath(); ctx.moveTo((x0 + x1) / 2, top + 6); ctx.lineTo((x0 + x1) / 2, top + sH - 10); ctx.stroke();
      circle(ctx, (x0 + x1) / 2, g[1], 4, col(armorOn ? P.glowHi : P.accent), 1.8); // boss
      if (strike) { ctx.strokeStyle = col("#ffd9a0"); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x1, g[1], k.aw * 1.7, -1.2, 1.2); ctx.stroke(); }
    }
  }

  MW.CharacterArt = { draw, PAL, BUILD };
})(globalThis);