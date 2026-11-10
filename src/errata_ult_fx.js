// Errata ultimate visuals: SYSTEM: RELOCATION ERROR (sim logic: fighter.js beginRelocation / relocationStep, numbers: characters.js).
// Draws, in world space and from the caster's `f.relocation` / `f.hit` state only (nothing here touches the simulation):
//   startup  : crimson capture mark under the enemy + a gathering glyph on Errata (the "clear capture animation")
//   emerge / lift / suspend : black-and-crimson tendrils rising from the ground and wrapping the enemy
//   fragment / travel / rebuild : thousands-feeling swarm of black / white / crimson data fragments flying to the chosen spot,
//                                 a flickering destination marker, then converging into the rebuilt body
// All randomness is a hash of relocation.seed, so a frame is stable and a headless run never grows any state.
(function () {
  const MW = (globalThis.MW = globalThis.MW || {});
  const CRIM = "#FF315A", WHITE = "#F4F1EA", BLACK = "#08080e";
  const H = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (t) => t * t * (3 - 2 * t);

  function tendril(ctx, x0, y0, x1, y1, seed, tick, w, grow) {
    const segs = 16, pts = [];
    const L = clamp(grow, 0, 1);
    for (let i = 0; i <= segs; i++) {
      const u = (i / segs) * L;
      const sway = Math.sin(u * 7 + seed * 3 + tick * 0.16) * 13 * (0.3 + u) * (1 - 0.35 * u);
      pts.push([x0 + (x1 - x0) * u + sway, y0 + (y1 - y0) * u + Math.cos(u * 5 + seed + tick * 0.12) * 4]);
    }
    for (const pass of [0, 1]) {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) i ? ctx.lineTo(pts[i][0], pts[i][1]) : ctx.moveTo(pts[i][0], pts[i][1]);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = pass ? CRIM : BLACK;
      ctx.lineWidth = pass ? Math.max(1, w * 0.32) : w;
      ctx.stroke();
    }
    const tip = pts[pts.length - 1];
    ctx.fillStyle = WHITE; ctx.fillRect(tip[0] - 1.5, tip[1] - 1.5, 3, 3);
  }

  function drawTendrils(ctx, X, tick) {
    const v = X.target, vw = v.stats.width, vh = v.stats.height;
    const e = X.phase === "emerge" ? clamp(X.t / X.cfg.emergeTicks, 0, 1) : 1;
    const retreat = X.phase === "retreat" ? 1 - clamp(X.p / Math.max(1, X.cfg.missTicks), 0, 1) : 1;
    const caught = X.phase === "lift" || X.phase === "suspend";
    const vcx = v.x + vw / 2, vcy = v.y + vh * 0.5;
    const n = 9;
    ctx.save();
    // ground rift glyph under the enemy
    ctx.globalAlpha = 0.85 * retreat;
    ctx.fillStyle = BLACK;
    ctx.beginPath(); ctx.ellipse(X.rx, X.gy + 2, (36 + 20 * e) * retreat, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = CRIM; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalAlpha = retreat;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1) - 0.5, seed = i + 1;
      const x0 = X.rx + k * 56, y0 = X.gy;
      let x1, y1;
      if (caught) { // wrap round the body: tips spiral about the chest
        const a = (i / n) * Math.PI * 2 + tick * 0.05;
        x1 = vcx + Math.cos(a) * vw * 0.62; y1 = vcy + Math.sin(a) * vh * 0.38 + (i % 2 ? -8 : 10);
      } else { x1 = X.rx + k * 14; y1 = X.gy - (70 + 50 * H(seed)) * e; }
      tendril(ctx, x0, y0, x1, y1, seed, tick, 7 + 3 * H(seed + 9), caught ? 1 : e * retreat);
    }
    ctx.restore();
  }

  function drawMarker(ctx, x, y, p, tick, strong) { // destination telegraph: a flickering crimson target on the platform
    if (Math.floor(tick / 3) % 5 === 0) return;
    const r = 34 + 10 * Math.sin(tick * 0.3), a = clamp(0.35 + 0.65 * p, 0, 1);
    ctx.save(); ctx.globalAlpha = a;
    ctx.strokeStyle = CRIM; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.22, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = WHITE; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.6, r * 0.13, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = CRIM;
    const h = 20 + 70 * p; // a thin glitch column rising from the spot
    ctx.globalAlpha = a * 0.5; ctx.fillRect(x - 2, y - h, 4, h);
    if (strong) { ctx.globalAlpha = a * 0.35; ctx.fillRect(x - 14, y - h * 0.6, 28, 2); ctx.fillRect(x - 22, y - h * 0.25, 44, 2); }
    ctx.restore();
  }

  function drawFragments(ctx, X, tick) {
    const v = X.target, vw = v.stats.width, vh = v.stats.height, d = X.dest;
    if (!d) return;
    const dcx = d.x, dfeet = d.feet;
    const N = 120;
    let stage, p;
    if (X.phase === "fragment") { stage = 0; p = clamp(X.p / Math.max(1, X.cfg.fragmentTicks), 0, 1); }
    else if (X.phase === "travel") { stage = 1; p = clamp(X.p / Math.max(1, X.cfg.travelTicks), 0, 1); }
    else { stage = 2; p = clamp(X.p / Math.max(1, X.cfg.rebuildTicks), 0, 1); }
    ctx.save();
    for (let i = 0; i < N; i++) {
      const s = X.seed * 7 + i * 13;
      const sx = X.ox + (H(s) - 0.5) * vw, sy = X.oy + (H(s + 1) - 0.5) * vh;       // where the body was
      const ang = H(s + 2) * Math.PI * 2, rad = 30 + 90 * H(s + 3);
      const bx = sx + Math.cos(ang) * rad, by = sy + Math.sin(ang) * rad * 0.8;      // scattered position
      const ex = dcx + (H(s + 4) - 0.5) * vw, ey = dfeet - H(s + 5) * vh;            // where it is rebuilt
      const cx0 = dcx + Math.cos(ang) * rad * 0.9, cy0 = ey + Math.sin(ang) * rad * 0.7; // scattered ring round the destination
      let x, y, trail = 0;
      if (stage === 0) { const q = ease(p); x = sx + (bx - sx) * q; y = sy + (by - sy) * q; }
      else if (stage === 1) {
        const q = ease(clamp(p * 1.15 - H(s + 6) * 0.15, 0, 1)); // each fragment leaves a touch apart
        x = bx + (cx0 - bx) * q; y = by + (cy0 - by) * q - Math.sin(q * Math.PI) * 60 * H(s + 7);
        trail = (1 - Math.abs(q - 0.5) * 2) * 26;
      } else { const q = ease(p); x = cx0 + (ex - cx0) * q; y = cy0 + (ey - cy0) * q; }
      const sz = 2.5 + H(s + 8) * 5 * (stage === 2 ? 1 - 0.5 * p : 1);
      const col = H(s + 9) < 0.4 ? BLACK : H(s + 9) < 0.72 ? WHITE : CRIM;
      if (trail > 1) { ctx.globalAlpha = 0.45; ctx.fillStyle = col === BLACK ? CRIM : col; ctx.fillRect(x - trail, y, trail, Math.max(1, sz * 0.4)); }
      ctx.globalAlpha = 1; ctx.fillStyle = col; ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      if (col === BLACK) { ctx.strokeStyle = CRIM; ctx.lineWidth = 1; ctx.strokeRect(x - sz / 2, y - sz / 2, sz, sz); }
    }
    if (stage === 2) { // the silhouette resolving: a thin outline that gets solid
      ctx.globalAlpha = 0.15 + 0.6 * p; ctx.strokeStyle = WHITE; ctx.lineWidth = 2;
      ctx.strokeRect(dcx - vw / 2, dfeet - vh, vw, vh);
      ctx.globalAlpha = 0.2 * p; ctx.fillStyle = CRIM; ctx.fillRect(dcx - vw / 2, dfeet - vh, vw, vh);
    }
    if (stage === 0) { // horizontal glitch slices where he shattered
      for (let i = 0; i < 6; i++) {
        const yy = X.oy - vh / 2 + H(X.seed + i) * vh, ww = 40 + 90 * H(X.seed + i + 3);
        ctx.globalAlpha = 0.8 * (1 - p); ctx.fillStyle = i % 2 ? WHITE : CRIM; ctx.fillRect(X.ox - ww / 2 + (H(i + tick) - 0.5) * 24, yy, ww, 2);
      }
    }
    ctx.restore();
    drawMarker(ctx, dcx, dfeet, stage === 2 ? 0.6 + 0.4 * p : stage === 1 ? p * 0.6 : 0.1, tick, stage === 2);
  }

  // startup tell: crimson capture mark under the enemy (it locks on when the startup ends) + a gathering glyph on Errata
  function drawStartup(ctx, f, tick) {
    const h = f.hit, v = f.foe;
    const w = clamp(1 - f.stateTimer / Math.max(1, h.startup), 0, 1);
    const s = f.stats, cx = f.x + s.width / 2, cy = f.y + s.height * 0.3;
    ctx.save();
    ctx.strokeStyle = CRIM; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { // rings collapsing onto his raised hand
      const r = (1 - ((w * 2 + i / 3) % 1)) * 46 + 8;
      ctx.globalAlpha = 0.25 + 0.5 * w; ctx.beginPath(); ctx.arc(cx + f.facing * 14, cy - 18, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = WHITE; ctx.globalAlpha = 0.9;
    for (let i = 0; i < 6; i++) { const a = H(i + Math.floor(tick / 4)) * 6.28, r = 12 + 30 * (1 - w) * H(i + 4); ctx.fillRect(cx + f.facing * 14 + Math.cos(a) * r, cy - 18 + Math.sin(a) * r, 3, 3); }
    const rg = h.relocation, inRange = v && v.state !== "ko" && Math.hypot(v.x - f.x, v.y - f.y) <= rg.range;
    if (inRange) { // the capture mark: grows and flickers, tells the enemy where to leave
      const vx = v.x + v.stats.width / 2, vy = v.y + v.stats.height, gy = f.relocGround ? f.relocGround(vx, vy) : vy;
      const rr = (rg.grabRX + 10) * (0.5 + 0.5 * w);
      if (Math.floor(tick / 2) % 4 !== 0) {
        ctx.globalAlpha = 0.4 + 0.5 * w; ctx.strokeStyle = CRIM; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(vx, gy + 2, rr, rr * 0.2, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = BLACK; ctx.globalAlpha = 0.5 * w; ctx.fill();
        ctx.fillStyle = CRIM; ctx.globalAlpha = 0.7 * w;
        for (let i = 0; i < 5; i++) { const k = i / 4 - 0.5; ctx.fillRect(vx + k * rr * 1.5 - 1.5, gy - 12 * w * (0.4 + H(i)), 3, 12 * w * (0.4 + H(i))); }
      }
    }
    ctx.restore();
  }


  // Skill 3 (Phantom Recursion) startup tell: he flickers into overlapping ghosts before the split
  function drawRushTell(ctx, f, tick) {
    const h = f.hit, s = f.stats;
    const w = clamp(1 - f.stateTimer / Math.max(1, h.startup), 0, 1);
    ctx.save();
    for (let i = 0; i < 3; i++) {
      if (Math.floor(tick / 2 + i) % 3 === 0) continue;
      const ox = (H(i * 4.1 + Math.floor(tick / 2)) - 0.5) * 22 * w, oy = (H(i * 2.3 + Math.floor(tick / 2)) - 0.5) * 12 * w;
      ctx.globalAlpha = 0.25 + 0.5 * w; ctx.strokeStyle = i % 2 ? WHITE : CRIM; ctx.lineWidth = 2;
      ctx.strokeRect(f.x + ox, f.y + oy, s.width, s.height);
    }
    ctx.restore();
  }

  // Skill 3: after the split, each copy's straight dash lane is drawn from its spawn spot through the crossing point
  function drawRushLanes(ctx, f, tick) {
    const R = f.recursion, RU = R.cfg.rush, s = f.stats;
    const hold = clamp(R.t / Math.max(1, RU.windup), 0, 1);
    ctx.save();
    for (const cp of R.copies) {
      const started = R.t >= RU.windup + cp.delay;
      if (started && R.t > RU.windup + cp.delay + RU.ticks) continue;
      const x0 = cp.sx + s.width / 2, y0 = cp.sy + s.height / 2, x1 = cp.ex + s.width / 2, y1 = cp.ey + s.height / 2;
      if (Math.floor(tick / 2) % 5 === 0) continue;
      ctx.globalAlpha = started ? 0.9 : 0.2 + 0.5 * hold;
      ctx.strokeStyle = CRIM; ctx.lineWidth = started ? 4 : 2;
      ctx.setLineDash(started ? [] : [10, 7]);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.4 + 0.5 * hold; ctx.strokeStyle = WHITE; ctx.lineWidth = 2; // where all three lanes cross
    const cx = R.lx + s.width / 2, cy = R.ly + s.height / 2;
    ctx.beginPath(); ctx.moveTo(cx - 12, cy); ctx.lineTo(cx + 12, cy); ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy + 12); ctx.stroke();
    ctx.restore();
  }

  function draw(ctx, f, tick) {
    if (!f || f.stats.id !== "errata") return;
    const X = f.relocation;
    if (X && !X.released) {
      if (X.phase === "emerge" || X.phase === "lift" || X.phase === "suspend" || X.phase === "retreat") drawTendrils(ctx, X, tick);
      else drawFragments(ctx, X, tick);
    } else if (f.hit && f.hit.relocation && f.state === MW.STATE.ATTACK_STARTUP) drawStartup(ctx, f, tick);
    else if (f.recursion) drawRushLanes(ctx, f, tick);
    else if (f.hit && f.hit.recursion && f.state === MW.STATE.ATTACK_STARTUP) drawRushTell(ctx, f, tick);
  }

  MW.ErrataUlt = { draw: draw };
})();
