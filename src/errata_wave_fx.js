// Errata Skill 4 visuals: DATA CORRUPTION (sim: characters.js errata skill 4 projectile; nothing here touches the simulation).
//   cast   : he raises a hand, data converges into the palm and a crimson seam opens where the wave will erupt
//   wave   : a "torn frame" - a crescent crest of horizontal slices that each jitter sideways, black / white with a crimson edge,
//            error symbol inside, white tear lines, pixel spray ahead of it
//   wake   : corrupted tiles stay in the world behind it and fade out (also after the projectile has died), so the lane stays readable
// Palette: black / white / crimson only. Randomness is a hash of world position + tick, so frames are stable and nothing accumulates.
(function () {
  const MW = (globalThis.MW = globalThis.MW || {});
  const CRIM = "#FF315A", WHITE = "#F4F1EA", BLACK = "#08080e";
  const H = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const LIFE = 40;   // ticks a wake tile survives
  const CELL = 10;   // wake grid in px

  const recs = []; // one per wave: { p, x, y, dir, speed, h, alive, endAge }
  function register(p, h) {
    let r = recs.find((q) => q.p === p);
    if (!r) { r = { p: p, endAge: 0 }; recs.push(r); if (recs.length > 8) recs.shift(); }
    r.x = p.x; r.y = p.y; r.dir = p.dir; r.speed = Math.max(1, p.speed); r.h = h; r.alive = true;
    return r;
  }

  function wake(ctx, r, extra) {
    const steps = Math.ceil((LIFE * r.speed) / CELL);
    ctx.save();
    for (let k = 0; k <= steps; k++) {
      const xc = r.x - r.dir * k * CELL, age = (k * CELL) / r.speed + extra;
      if (age >= LIFE) continue;
      const gi = Math.round(xc / CELL), f = Math.pow(1 - age / LIFE, 1.3);
      for (let m = 0; m < 3; m++) {
        const s = gi * 3.1 + m * 17.7;
        if (H(s) < 0.35) continue;
        const sz = (3 + H(s + 1) * 8) * (1 - 0.4 * (age / LIFE));
        const x = xc + (H(s + 2) - 0.5) * CELL, y = r.y + (H(s + 3) - 0.5) * r.h * 0.95 + age * 0.15;
        const c = H(s + 4);
        ctx.globalAlpha = f;
        ctx.fillStyle = c < 0.4 ? BLACK : c < 0.7 ? WHITE : CRIM;
        ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
        if (c < 0.4) { ctx.strokeStyle = CRIM; ctx.lineWidth = 1; ctx.strokeRect(x - sz / 2, y - sz / 2, sz, sz); }
      }
      if (H(gi * 5.3) > 0.9) { ctx.globalAlpha = f * 0.8; ctx.fillStyle = WHITE; ctx.fillRect(xc - 15, r.y + (H(gi) - 0.5) * r.h, 30, 2); }
    }
    ctx.restore();
  }

  function drawWave(ctx, p) {
    const dir = p.dir, h = (p.size || 140) * 1.1, ph = p.traveled / Math.max(1, p.speed), N = 16, sh = h / N;
    const r = register(p, h);
    wake(ctx, r, 0);
    const flick = Math.floor(ph / 2);
    ctx.save();
    // slices: crescent leading edge (middle slices lead), each one jittering sideways
    const crest = [];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1) - 0.5, seed = i * 7.3;
      const disp = (H(seed + flick) - 0.5) * 30;
      const fx = p.x + dir * (Math.cos(u * Math.PI) * 30 + 6) + disp * 0.35;
      const tw = 44 + 34 * H(seed + 3), y = p.y - h / 2 + i * sh;
      const x0 = dir > 0 ? fx - tw : fx;
      crest.push([fx, y + sh / 2]);
      ctx.globalAlpha = 0.5; ctx.fillStyle = CRIM; // displaced ghost of the slice
      ctx.fillRect(x0 - dir * 12 + disp, y, tw, sh - 1);
      ctx.globalAlpha = 0.95; ctx.fillStyle = BLACK;
      ctx.fillRect(x0, y, tw, sh - 1);
      ctx.fillStyle = WHITE; // data stripe inside the slice
      const sw = tw * (0.25 + 0.5 * H(seed + 5)), sx = dir > 0 ? fx - sw - 4 : fx + 4;
      if (i % 2 === 0) ctx.fillRect(sx, y + 1, sw, Math.max(1, sh * 0.35));
      ctx.fillStyle = CRIM; // crimson leading edge
      ctx.fillRect(dir > 0 ? fx - 3 : fx, y, 3, sh - 1);
      for (let j = 0; j < 3; j++) { // scrolling data bits
        const bx = fx - dir * ((ph * 3 + j * 17 + i * 5) % tw);
        ctx.globalAlpha = 0.85; ctx.fillStyle = j % 2 ? CRIM : WHITE; ctx.fillRect(bx - 1.5, y + sh * 0.3, 3, 3);
      }
    }
    // glowing crest line
    ctx.globalAlpha = 0.9; ctx.strokeStyle = WHITE; ctx.lineWidth = 2; ctx.shadowColor = CRIM; ctx.shadowBlur = 12;
    ctx.beginPath(); crest.forEach((c, i) => (i ? ctx.lineTo(c[0] + dir * 4, c[1]) : ctx.moveTo(c[0] + dir * 4, c[1]))); ctx.stroke();
    ctx.shadowBlur = 0;
    // error symbol inside the wall (flickers)
    if (Math.floor(ph / 3) % 4 !== 0) {
      const ex = p.x - dir * 30, ey = p.y;
      ctx.globalAlpha = 0.95; ctx.strokeStyle = CRIM; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(ex, ey - 18); ctx.lineTo(ex + 17, ey + 12); ctx.lineTo(ex - 17, ey + 12); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = WHITE; ctx.fillRect(ex - 1.5, ey - 7, 3, 11); ctx.fillRect(ex - 1.5, ey + 7, 3, 3);
    }
    // tear lines + pixel spray ahead
    for (let i = 0; i < 5; i++) {
      const ty = p.y - h / 2 + H(flick * 3 + i) * h, ww = 90 + 110 * H(flick + i * 2);
      ctx.globalAlpha = 0.9; ctx.fillStyle = i % 2 ? CRIM : WHITE;
      ctx.fillRect(dir > 0 ? p.x - ww * 0.6 : p.x - ww * 0.4, ty, ww, 2);
    }
    for (let i = 0; i < 9; i++) {
      const s = flick * 11 + i, sz = 3 + H(s) * 5;
      ctx.globalAlpha = 0.85; ctx.fillStyle = i % 3 === 0 ? CRIM : i % 3 === 1 ? WHITE : BLACK;
      ctx.fillRect(p.x + dir * (36 + H(s + 1) * 46), p.y + (H(s + 2) - 0.5) * h, sz, sz);
    }
    ctx.restore();
  }

  // once per frame, after the projectiles: waves that have ended keep fading out their wake
  function drawLingering(ctx) {
    for (let i = recs.length - 1; i >= 0; i--) {
      const r = recs[i];
      if (r.alive) { r.alive = false; continue; }
      r.p = null; r.endAge++;
      if (r.endAge >= LIFE) { recs.splice(i, 1); continue; }
      wake(ctx, r, r.endAge);
    }
  }

  // cast tell: data converges into the raised palm and a crimson seam opens where the wave will erupt
  function drawCast(ctx, f, tick) {
    const h = f.hit;
    if (!f || f.stats.id !== "errata" || !h || h.id !== "data_corruption" || f.state !== MW.STATE.ATTACK_STARTUP) return;
    const w = clamp(1 - f.stateTimer / Math.max(1, h.startup), 0, 1), s = f.stats, fc = f.facing;
    const hx = f.x + s.width / 2 + fc * 16, hy = f.y + s.height * 0.22;
    ctx.save();
    ctx.strokeStyle = CRIM; ctx.lineWidth = 2; ctx.globalAlpha = 0.35 + 0.6 * w;
    ctx.beginPath(); ctx.arc(hx, hy, 6 + 16 * w, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 16; i++) { // data pulled into the palm
      const a = H(i * 3.3) * 6.28, rad = (1 - w) * (30 + 50 * H(i)) + 4, k = H(i + 50);
      ctx.globalAlpha = 0.9; ctx.fillStyle = k < 0.4 ? WHITE : k < 0.75 ? CRIM : BLACK;
      ctx.fillRect(hx + Math.cos(a) * rad - 2, hy + Math.sin(a) * rad - 2, 4, 4);
    }
    for (let i = 0; i < 4; i++) { // glitch bars across his body
      const by = f.y + H(Math.floor(tick / 2) * 4 + i) * s.height;
      ctx.globalAlpha = 0.7 * w; ctx.fillStyle = i % 2 ? WHITE : CRIM; ctx.fillRect(f.x - 6, by, s.width + 12, 2);
    }
    const size = (h.projectile && h.projectile.size) || 140, sx = fc > 0 ? f.x + s.width + 10 : f.x - 10;
    if (Math.floor(tick / 2) % 4 !== 0) { // seam where the wave will open
      ctx.globalAlpha = 0.25 + 0.6 * w; ctx.fillStyle = CRIM;
      ctx.fillRect(sx - 1.5, f.y + s.height * 0.4 - size * 0.5 * w, 3, size * w);
    }
    ctx.restore();
  }

  MW.ErrataWave = { drawWave: drawWave, drawLingering: drawLingering, drawCast: drawCast };
})();
