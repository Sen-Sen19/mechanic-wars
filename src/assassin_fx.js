// Mechanic Wars - Assassin "bloodlust" effects. VISUAL ONLY: the sim never reads this file.
// Fed by sim events (style "blood"): swing -> slash arc, hit -> cut marks + red sparks.
// Frenzy (0..1) rises with every hit and fades over about 2 seconds. It makes the eyes brighter
// and adds a red aura, embers and more dash ghosts. Being hit cuts it in half.
// All numbers are in the TUNE block.
(function (g) {
  const MW = (g.MW = g.MW || {});
  const TAU = Math.PI * 2;

  const TUNE = {
    maxParticles: 220,
    frenzyPerHit: 0.25, // 4 hits = full frenzy
    frenzyDecay: 0.007, // per rendered frame (about 2.4 s from full to empty at 60 fps)
    frenzyHurtMult: 0.5, // frenzy left after the Assassin takes a hit
    ghostSpeed: 3.2, // px per tick: faster than this leaves ghosts
    ghostLife: 9, // frames (more with frenzy)
    slashLife: 10,
  };

  const RED = "#ff2a45";
  const HOT = "#ffd0d8";
  const BLOOD = "#c4122f";
  const DARK = "#3a0510";

  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const parts = []; // sparks, drops, gashes, embers
  const slashes = [];
  const ghosts = [];
  const frenzy = {}; // fighter id -> 0..1
  const swingCount = {}; // fighter id -> swings so far (alternates slash direction)
  let frame = 0;

  function add(p) {
    if (parts.length >= TUNE.maxParticles) parts.shift();
    p.max = p.life;
    p.vx = p.vx || 0; p.vy = p.vy || 0; p.g = p.g || 0; p.drag = p.drag === undefined ? 0.96 : p.drag;
    parts.push(p);
  }

  // ─── events ───────────────────────────────────────────────────────
  function event(ev) {
    if (!ev || ev.style !== "blood") return;
    if (ev.type === "swing") {
      const n = (swingCount[ev.ownerId] = (swingCount[ev.ownerId] || 0) + 1);
      slashes.push({ x: ev.x, y: ev.y, dir: ev.dir, range: ev.range || 54, up: n % 2 === 0, age: 0, life: TUNE.slashLife });
      if (slashes.length > 12) slashes.shift();
    } else if (ev.type === "hit") {
      const { x, y, dir } = ev;
      frenzy[ev.ownerId] = Math.min(1, (frenzy[ev.ownerId] || 0) + TUNE.frenzyPerHit);
      if (frenzy[ev.targetId]) frenzy[ev.targetId] *= TUNE.frenzyHurtMult;
      // cut marks: two crossing gashes
      const a = rnd(-0.5, 0.5);
      for (const k of [0, 1]) {
        const ang = (k ? 0.9 : -0.9) + a;
        add({ kind: "gash", x, y, ang, len: 30 + k * 8, life: 14, drag: 1 });
      }
      add({ kind: "flare", x, y, life: 7, size: 26, drag: 1 });
      // red sparks (streaks) fly forward, droplets fall
      for (let i = 0; i < 9; i++) add({ kind: "spark", x, y, vx: dir * rnd(2, 9), vy: rnd(-4, 1.5), life: 12 + (Math.random() * 8 | 0), size: rnd(1.6, 2.8), g: 0.2, drag: 0.93 });
      for (let i = 0; i < 8; i++) add({ kind: "drop", x, y, vx: dir * rnd(0.5, 4.5) + rnd(-1, 1), vy: rnd(-4.5, -0.5), life: 22 + (Math.random() * 14 | 0), size: rnd(2, 4), g: 0.28, drag: 0.97 });
    }
  }

  // ─── per frame ────────────────────────────────────────────────────
  // Spawns dash ghosts and keeps each assassin's frenzy level on the fighter (f._frenzy) for the art to read.
  function update(sim) {
    frame++;
    for (const f of sim.fighters) {
      if (f.stats.id !== "assassin") continue;
      const v = Math.max(0, (frenzy[f.id] || 0) - TUNE.frenzyDecay);
      frenzy[f.id] = v;
      f._frenzy = v;
      if (f.state === MW.STATE.KO) { frenzy[f.id] = 0; continue; }
      const speed = Math.abs(f.x - f.px);
      const lunging = f.state === MW.STATE.ATTACK_STARTUP || f.state === MW.STATE.ATTACK_ACTIVE;
      if ((speed > TUNE.ghostSpeed || (lunging && speed > 1.5)) && frame % 2 === 0) {
        ghosts.push({ x: f.x, y: f.y, w: f.stats.width, h: f.stats.height, d: f.facing < 0 ? -1 : 1, life: TUNE.ghostLife + Math.round(5 * v) });
        if (ghosts.length > 24) ghosts.shift();
      }
    }
  }

  function tick() {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx; p.y += p.vy; p.vx *= p.drag; p.vy *= p.drag; p.vy += p.g;
      if (--p.life <= 0) parts.splice(i, 1);
    }
    for (let i = slashes.length - 1; i >= 0; i--) if (++slashes[i].age >= slashes[i].life) slashes.splice(i, 1);
    for (let i = ghosts.length - 1; i >= 0; i--) if (--ghosts[i].life <= 0) ghosts.splice(i, 1);
  }

  // ─── drawing ──────────────────────────────────────────────────────
  // Red afterimages (drawn behind the fighters): a simple hooded silhouette.
  function drawBehind(ctx) {
    if (!ghosts.length) return;
    ctx.save();
    for (const gh of ghosts) {
      const a = clamp(gh.life / TUNE.ghostLife, 0, 1);
      ctx.globalAlpha = a * 0.38;
      ctx.fillStyle = BLOOD;
      const cx = gh.x + gh.w / 2, top = gh.y, H = gh.h, W = gh.w;
      ctx.beginPath(); ctx.arc(cx, top + H * 0.2, H * 0.1, 0, TAU); ctx.fill(); // head
      ctx.beginPath(); // leaning body, tilted forward
      ctx.moveTo(cx - W * 0.3 - gh.d * 3, top + H * 0.3);
      ctx.lineTo(cx + W * 0.3 - gh.d * 3, top + H * 0.3);
      ctx.lineTo(cx + W * 0.25 + gh.d * 5, top + H * 0.62);
      ctx.lineTo(cx - W * 0.25 + gh.d * 5, top + H * 0.62);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(cx - W * 0.22 + gh.d * 5, top + H * 0.6, W * 0.44, H * 0.4); // legs
    }
    ctx.restore();
  }

  // Crescent slash: sweeps in 3 frames, then fades.
  function drawSlash(ctx, s) {
    const age = s.age;
    const sweep = clamp((age + 1) / 3, 0, 1);
    const fade = age < 3 ? 1 : clamp(1 - (age - 3) / (s.life - 3), 0, 1);
    const R = s.range + 8;
    const a0 = s.up ? 1.05 : -1.15, a1 = s.up ? -0.75 : 0.6;
    const head = sweep;
    const tail = Math.min(head, clamp((age - 1) / 7, 0, 1) * 0.85);
    if (head - tail < 0.02) return;
    const cx = s.x - s.dir * R * 0.3, cy = s.y;
    const N = 14, outer = [], inner = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const th = a0 + (a1 - a0) * (tail + (head - tail) * u);
      const thick = 16 * Math.sin(Math.PI * u) + 1;
      outer.push([cx + s.dir * Math.cos(th) * R, cy + Math.sin(th) * R]);
      inner.push([cx + s.dir * Math.cos(th) * (R - thick), cy + Math.sin(th) * (R - thick)]);
    }
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(outer[0][0], outer[0][1]);
    for (let i = 1; i <= N; i++) ctx.lineTo(outer[i][0], outer[i][1]);
    for (let i = N; i >= 0; i--) ctx.lineTo(inner[i][0], inner[i][1]);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,42,69,0.92)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = DARK;
    ctx.stroke();
    // white-hot edge
    ctx.beginPath();
    ctx.moveTo(outer[0][0], outer[0][1]);
    for (let i = 1; i <= N; i++) ctx.lineTo(outer[i][0], outer[i][1]);
    ctx.strokeStyle = HOT;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
    // sparks fly off the leading tip while it sweeps
    if (age < 3 && Math.random() < 0.9) {
      const tip = outer[N];
      add({ kind: "spark", x: tip[0], y: tip[1], vx: s.dir * rnd(0.5, 3), vy: rnd(-2, 2), life: 10, size: 1.8, g: 0.1, drag: 0.93 });
    }
  }

  function draw(ctx) {
    for (const s of slashes) drawSlash(ctx, s);
    if (!parts.length) return;
    ctx.save();
    ctx.lineCap = "round";
    for (const p of parts) {
      const a = clamp(p.life / p.max, 0, 1);
      if (p.kind === "spark") {
        ctx.globalAlpha = a;
        ctx.strokeStyle = RED; ctx.lineWidth = p.size + 1.5;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2); ctx.stroke();
        ctx.strokeStyle = HOT; ctx.lineWidth = Math.max(0.8, p.size - 0.6);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 1.4, p.y - p.vy * 1.4); ctx.stroke();
      } else if (p.kind === "drop") {
        ctx.globalAlpha = Math.min(1, a * 1.4);
        ctx.fillStyle = BLOOD;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
        ctx.fillStyle = "rgba(255,160,175,0.7)";
        ctx.beginPath(); ctx.arc(p.x - p.size * 0.3, p.y - p.size * 0.3, p.size * 0.35, 0, TAU); ctx.fill();
      } else if (p.kind === "gash") {
        const grow = clamp((1 - a) * 5, 0, 1); // draws out in the first frames, then fades
        const L = p.len * (0.35 + 0.65 * grow) / 2;
        const dx = Math.cos(p.ang) * L, dy = Math.sin(p.ang) * L;
        ctx.globalAlpha = a;
        ctx.strokeStyle = DARK; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(p.x - dx, p.y - dy); ctx.lineTo(p.x + dx, p.y + dy); ctx.stroke();
        ctx.strokeStyle = RED; ctx.lineWidth = 3.6;
        ctx.beginPath(); ctx.moveTo(p.x - dx, p.y - dy); ctx.lineTo(p.x + dx, p.y + dy); ctx.stroke();
        ctx.strokeStyle = HOT; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(p.x - dx * 0.8, p.y - dy * 0.8); ctx.lineTo(p.x + dx * 0.8, p.y + dy * 0.8); ctx.stroke();
      } else if (p.kind === "flare") {
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a * 0.5, 0, TAU); ctx.fill();
        ctx.fillStyle = RED;
        ctx.globalAlpha = a * 0.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.2 - a * 0.5), 0, TAU); ctx.fill();
      } else if (p.kind === "ember") {
        ctx.globalAlpha = a * 0.85;
        ctx.fillStyle = p.hot ? RED : BLOOD;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * a), 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

  // Red aura and rising embers around a frenzied Assassin. Drawn BEHIND the body, inside the fighter's transform.
  function drawAura(ctx, f) {
    const v = f._frenzy || 0;
    if (v < 0.03 || f.state === MW.STATE.KO) return;
    const s = f.stats;
    const cx = f.x + s.width / 2, cy = f.y + s.height * 0.5;
    const r = s.height * (0.55 + 0.25 * v);
    ctx.save();
    const gr = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
    gr.addColorStop(0, "rgba(220,20,50," + (0.35 * v).toFixed(3) + ")");
    gr.addColorStop(1, "rgba(120,0,25,0)");
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.8, r, 0, 0, TAU); ctx.fill();
    ctx.restore();
    if (Math.random() < 0.15 + 0.6 * v) {
      add({ kind: "ember", x: cx + rnd(-s.width * 0.6, s.width * 0.6), y: f.y + rnd(s.height * 0.3, s.height), vx: rnd(-0.3, 0.3), vy: rnd(-2.2, -0.8), g: -0.02, life: 18 + (Math.random() * 14 | 0), size: rnd(1.8, 3.6), hot: Math.random() < 0.5, drag: 0.98 });
    }
  }

  MW.AssassinFx = { TUNE, event, update, tick, drawBehind, draw, drawAura, frenzyOf: (id) => frenzy[id] || 0, _parts: parts, _slashes: slashes, _ghosts: ghosts };
})(globalThis);
