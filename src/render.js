// Mechanic Wars - enhanced canvas renderer with stylized characters, attack trails & particles.
(function (g) {
  const MW = (g.MW = g.MW || {});

  // ─── utilities ──────────────────────────────────────────────────
  function shadeColor(color, percent) {
    const num = parseInt(color.slice(1), 16),
          amt = Math.round(2.55 * percent),
          R = (num >> 16) + amt,
          G = ((num >> 8) & 0xFF) + amt,
          B = (num & 0xFF) + amt;
    return "#" + (0x1000000
      + (R < 0 ? 0 : R > 255 ? 255 : R) * 0x10000
      + (G < 0 ? 0 : G > 255 ? 255 : G) * 0x100
      + (B < 0 ? 0 : B > 255 ? 255 : B)).toString(16).slice(1);
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // Safe gradient helpers: in Node (headless smoke tests) the mock ctx may not
  // have createLinearGradient / createRadialGradient, so fall back to a flat colour.
  function safeLinearGrad(ctx, x0, y0, x1, y1, stops) {
    if (typeof ctx.createLinearGradient === "function") {
      try {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        if (g && typeof g.addColorStop === "function") {
          for (const [offset, color] of stops) g.addColorStop(offset, color);
          return g;
        }
      } catch (e) { /* fall through */ }
    }
    return stops[stops.length - 1][1]; // fallback: last colour
  }

  function safeRadialGrad(ctx, x0, y0, r0, x1, y1, r1, stops) {
    if (typeof ctx.createRadialGradient === "function") {
      try {
        const g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
        if (g && typeof g.addColorStop === "function") {
          for (const [offset, color] of stops) g.addColorStop(offset, color);
          return g;
        }
      } catch (e) { /* fall through */ }
    }
    return stops[stops.length - 1][1];
  }

  // ─── particle system (shared, lightweight) ──────────────────────
  const particles = [];
  const MAX_PARTICLES = 200;

  function spawnParticle(x, y, vx, vy, color, life, size) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push({ x, y, vx, vy, color, life, maxLife: life, size: size || 3 });
  }

  function spawnBurst(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (0.5 + Math.random()) * (speed || 3);
      spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, color, 14 + Math.random() * 12 | 0, 2 + Math.random() * 3);
    }
  }

  function tickParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12; // gravity
      p.vx *= 0.96;
      p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles(ctx) {
    for (const p of particles) {
      const a = p.life / p.maxLife;
      ctx.globalAlpha = a * 0.85;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ─── trail system for attacks ───────────────────────────────────
  const trails = [];
  const MAX_TRAILS = 80;

  function addTrail(x, y, w, h, color, life) {
    if (trails.length >= MAX_TRAILS) trails.shift();
    trails.push({ x, y, w, h, color, life, maxLife: life });
  }

  function tickTrails() {
    for (let i = trails.length - 1; i >= 0; i--) {
      trails[i].life--;
      if (trails[i].life <= 0) trails.splice(i, 1);
    }
  }

  function drawTrails(ctx) {
    for (const t of trails) {
      const a = (t.life / t.maxLife) * 0.45;
      ctx.globalAlpha = a;
      ctx.fillStyle = t.color;
      roundRect(ctx, t.x, t.y, t.w, t.h, 3);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ─── big skill effects (Rising Fist, Iron Guard, Meteor Breaker) ─
  // The Sim sends visual events (cast / impact / block). This part turns them into rings, flame
  // pillars, ground cracks, floating damage numbers, screen shake, a screen flash and a dark
  // screen for the ultimate. Visual only: nothing here changes the fight.
  const rings = [];   // {x,y,r0,r1,life,maxLife,color,lw,sy}  expanding / shrinking rings
  const pillars = []; // {x,fy,w,h,life,maxLife,color}          upward flame spikes
  const cracks = [];  // {x,y,life,maxLife,lines}               cracks in the floor
  const floats = [];  // {x,y,text,life,maxLife,size,color}     floating damage numbers
  let shakeMag = 0, flashA = 0, flashCol = "#ffffff", darkLife = 0, banner = null;
  const DARK_MAX = 110;

  function addRing(x, y, r0, r1, life, color, lw, sy) {
    if (rings.length > 40) rings.shift();
    rings.push({ x, y, r0, r1, life, maxLife: life, color, lw: lw || 3, sy: sy === undefined ? 1 : sy });
  }
  function addShake(n) { shakeMag = Math.max(shakeMag, n); }
  function addFlash(a, col) { flashA = Math.max(flashA, a); flashCol = col || "#ffffff"; }
  MW.fxShake = addShake; // other effect files (brawler_fx.js) can shake / flash the screen too
  MW.fxFlash = addFlash;

  // Artillerist effects: Self-Destruct fireball (or the black max-stack version) and the Perfect Aim beam trail
  const blasts = [];    // {x,y,R,life,max,black,bolts}
  const aimTrails = []; // {x0,x1,y,life,max}
  const aimStart = {};  // owner id -> where the Perfect Aim bullet left the muzzle
  function addSelfDestruct(ev) {
    const R = ev.radius || 245, black = !!ev.black;
    const bolts = [];
    if (black) for (let i = 0; i < 10; i++) {
      let a = (i / 10) * Math.PI * 2 + Math.random() * 0.5, r = 0.1;
      const pts = [[Math.cos(a) * 0.1, Math.sin(a) * 0.1]];
      for (let j = 0; j < 7; j++) { a += (Math.random() - 0.5) * 0.7; r += 0.13; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
      bolts.push(pts);
    }
    blasts.push({ x: ev.x, y: ev.y, R: R, life: 60, max: 60, black: black, bolts: bolts });
    addRing(ev.x, ev.y, 10, R * 1.15, 34, black ? "#b86cff" : "#ff7a32", 9, 1);
    addRing(ev.x, ev.y, 8, R * 0.8, 28, black ? "#6a2cff" : "#ffd479", 6, 1);
    addRing(ev.x, ev.y, 6, R * 1.7, 16, "#ffffff", 3, 1);
    for (let i = 0; i < 44; i++) {
      const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 9;
      spawnParticle(ev.x, ev.y, Math.cos(a) * sp, Math.sin(a) * sp - 1.5, black ? (i % 2 ? "#21162e" : "#b86cff") : (i % 3 === 0 ? "#4a4048" : i % 3 === 1 ? "#ff9a32" : "#fff0c2"), 30 + (Math.random() * 24 | 0), 3 + Math.random() * 4);
    }
    addShake(black ? 44 : 34);
    addFlash(black ? 0.7 : 0.85, black ? "#1a0a2e" : "#fff4d0");
  }
  function addFloat(ev, big) {
    if (!ev.dmg || ev.dmg < 1) return;
    if (floats.length > 12) floats.shift();
    floats.push({ x: ev.x, y: ev.y - 30, text: String(Math.round(ev.dmg)), life: 54, maxLife: 54, size: big ? 46 : 30, color: big ? "#ff6a4a" : "#ffe27a" });
  }

  const STRIKE_SHAKE = { hook: 1.5, upper: 4, power: 7, rush: 4, rising: 0, meteor: 0, slam: 2 }; // rising / meteor shake in their own impact code
  function onSkillEvent(ev) {
    if (!ev) return;
    if (ev.aim) { // Perfect Aim shot: muzzle blast when it leaves, a beam trail + starburst when it lands
      if (ev.type === "fire") {
        aimStart[ev.ownerId] = { x: ev.x, y: ev.y };
        addRing(ev.x, ev.y, 6, 90, 14, "#fff0b0", 5, 1);
        addRing(ev.x, ev.y, 4, 150, 20, "#ffb52e", 3, 1.8);
        spawnBurst(ev.x, ev.y, "#ffd66b", 16, 8);
        addShake(10); addFlash(0.3, "#fff0b0");
      } else if (ev.type === "hit" || ev.type === "fizzle") {
        const st = aimStart[ev.ownerId];
        if (st) aimTrails.push({ x0: st.x, x1: ev.x, y: ev.y, life: 24, max: 24 });
        if (ev.type === "hit") {
          addRing(ev.x, ev.y, 6, 170, 18, "#ffffff", 6, 1);
          addRing(ev.x, ev.y, 4, 110, 14, "#ffb52e", 4, 1);
          spawnBurst(ev.x, ev.y, "#ffffff", 14, 9);
          spawnBurst(ev.x, ev.y, "#ffd66b", 20, 7);
          addShake(20); addFlash(0.45, "#fff7d0");
        }
      }
      return;
    }
    if (ev.type === "strike") {
      if (!ev.blocked) {
        addShake((STRIKE_SHAKE[ev.shape] || 0) + (ev.empowered ? 2 : 0));
        if (ev.ko) { addShake(14); addFlash(0.4, "#ffffff"); }
      }
      return;
    }
    if (ev.type === "cast") {
      if (ev.id === "rising_fist") {
        addRing(ev.x + ev.dir * 20, ev.fy, 8, 70, 18, "#ffcc44", 3, 0.22);
        for (let i = 0; i < 8; i++) spawnParticle(ev.x + (Math.random() - 0.5) * 40, ev.fy - 2, (Math.random() - 0.5) * 3, -0.5 - Math.random() * 1.2, "#c9c2b0", 16, 2.6);
      } else if (ev.id === "iron_guard") {
        addRing(ev.x, ev.y, 14, 84, 18, "#ffd700", 4, 1);
        addShake(2);
      } else if (ev.id === "meteor_breaker" || ev.id === "meteor_fist") {
        banner = { text: ev.id === "meteor_fist" ? "METEOR FIST" : "METEOR BREAKER", life: 80, maxLife: 80 };
        darkLife = DARK_MAX;
        addRing(ev.x, ev.fy, 190, 20, 28, "#ff3a2a", 4, 0.3); // closes in on the Brawler: the tell
        addRing(ev.x, ev.fy, 120, 10, 28, "#ffb066", 3, 0.3);
        addShake(4);
      }
    } else if (ev.type === "block") {
      const bx = ev.x + ev.dir * 30;
      addRing(bx, ev.y, 6, 46, 12, "#fff3b0", 3, 1);
      spawnBurst(bx, ev.y, "#ffe27a", 10, 5);
      spawnBurst(bx, ev.y, "#ffffff", 4, 3);
      addShake(3);
    } else if (ev.type === "impact") {
      if (ev.fx === "rising") {
        pillars.push({ x: ev.x, fy: ev.fy, w: 70, h: 260, life: 24, maxLife: 24, color: "#ffb02e" });
        addRing(ev.x, ev.fy, 10, 120, 22, "#ffcc44", 4, 0.25);
        addRing(ev.x, ev.y, 8, 90, 16, "#ffffff", 3, 1);
        for (let i = 0; i < 24; i++) spawnParticle(ev.x + (Math.random() - 0.5) * 40, ev.fy - Math.random() * 40, (Math.random() - 0.5) * 3, -4 - Math.random() * 6, i % 3 ? "#ffcc44" : "#ff7a3d", 26 + (Math.random() * 12 | 0), 2.5 + Math.random() * 2.5);
        spawnBurst(ev.x, ev.y, "#ffffff", 8, 5);
        addShake(8); addFlash(0.14, "#fff2c0"); addFloat(ev, false);
      } else if (ev.fx === "meteor") {
        addRing(ev.x, ev.fy, 10, 620, 44, "#ff3a2a", 10, 0.26); // the big punch lands: a far bigger shockwave and shake
        addRing(ev.x, ev.fy, 10, 460, 38, "#ffd479", 7, 0.26);
        addRing(ev.x, ev.y, 10, 340, 28, "#ffffff", 7, 1);
        addShake(40); addFlash(0.9, "#ffffff");
        addRing(ev.x, ev.fy, 10, 300, 36, "#ff3a2a", 8, 0.3);
        addRing(ev.x, ev.fy, 10, 230, 30, "#ff9a3c", 6, 0.3);
        addRing(ev.x, ev.fy, 10, 160, 24, "#ffffff", 4, 0.3);
        addRing(ev.x, ev.y, 10, 170, 22, "#ffd479", 5, 1);
        const lines = [];
        for (let i = 0; i < 9; i++) lines.push([(i / 8) * Math.PI - Math.PI, 70 + Math.random() * 110, (Math.random() - 0.5) * 0.5]);
        cracks.push({ x: ev.x, y: ev.fy, life: 70, maxLife: 70, lines });
        for (let i = 0; i < 42; i++) {
          const a = Math.random() * Math.PI, sp = 2 + Math.random() * 7;
          spawnParticle(ev.x, ev.fy - 6, Math.cos(a) * sp * (Math.random() < 0.5 ? -1 : 1), -Math.sin(a) * sp - 2, i % 3 === 0 ? "#6b5a4a" : i % 3 === 1 ? "#ff7a3d" : "#ffd479", 30 + (Math.random() * 20 | 0), 2.5 + Math.random() * 3.5);
        }
        spawnBurst(ev.x, ev.y, "#ff4444", 16, 7);
        spawnBurst(ev.x, ev.y, "#ffffff", 10, 5);
        addShake(20); addFlash(0.55, "#ffe0c0"); addFloat(ev, true);
      } else if (ev.fx === "counter") {
        addRing(ev.x, ev.y, 10, ev.empowered ? 100 : 130, 18, ev.empowered ? "#ff9a3c" : "#ffd700", 5, 1);
        spawnBurst(ev.x, ev.y, "#ffe27a", 14, 6);
        spawnBurst(ev.x, ev.y, "#ffffff", 6, 4);
        addShake(ev.empowered ? 6 : 8); addFloat(ev, false);
      } else if (ev.fx === "self_destruct") {
        addSelfDestruct(ev);
      } else if (ev.fx === "explosion") {
        const radius = ev.radius || 110;
        const dark = !!ev.black; // max-stack Self-Destruct: black energy with a violet edge
        addRing(ev.x, ev.y, 8, radius, 28, dark ? "#b86cff" : "#ff7a32", 7, 1);
        addRing(ev.x, ev.y, 5, radius * 0.68, 20, dark ? "#21162e" : "#ffd479", dark ? 8 : 4, 1);
        addRing(ev.x, ev.y, 2, radius * 0.38, 14, dark ? "#6a2cff" : "#ffffff", 3, 1);
        spawnBurst(ev.x, ev.y, dark ? "#21162e" : "#ff8b32", dark ? 44 : 30, 8);
        spawnBurst(ev.x, ev.y, dark ? "#b86cff" : "#fff0c2", 14, 5);
        addShake(radius > 200 ? 22 : 9);
        addFlash(radius > 200 ? 0.32 : 0.12, "#ffe0b0");
        addFloat(ev, radius > 200);
      }
    }
  }

  function tickSkillFx() {
    shakeMag *= 0.88; if (shakeMag < 0.3) shakeMag = 0;
    flashA *= 0.82; if (flashA < 0.01) flashA = 0;
    if (darkLife > 0) darkLife--;
    if (banner && --banner.life <= 0) banner = null;
    for (const arr of [rings, pillars, cracks, floats, blasts, aimTrails]) {
      for (let i = arr.length - 1; i >= 0; i--) if (--arr[i].life <= 0) arr.splice(i, 1);
    }
  }

  // dark screen for the ultimate: drawn before the fighters so they stay bright
  function drawDarken(ctx, ox, oy, w, h) {
    if (darkLife <= 0) return;
    const a = 0.42 * Math.min(1, darkLife / 25, (DARK_MAX - darkLife) / 8 + 0.2);
    ctx.fillStyle = "rgba(20,0,10," + a.toFixed(3) + ")";
    ctx.fillRect(-ox, -oy, w, h);
  }

  function drawSkillFxWorld(ctx) {
    ctx.save();
    ctx.lineCap = "round";
    for (const c of cracks) {
      const a = Math.min(1, c.life / 25);
      ctx.strokeStyle = rgba("#ffb066", a); ctx.lineWidth = 3.5;
      ctx.shadowColor = "#ff5a1f"; ctx.shadowBlur = 12;
      for (const L of c.lines) {
        const ang = L[0], len = L[1] * (1 - 0.35 * (c.life / c.maxLife));
        const mx = c.x + Math.cos(ang) * len * 0.55, my = c.y + 2 + L[2] * 18 * Math.sign(Math.sin(ang) || 1);
        ctx.beginPath(); ctx.moveTo(c.x, c.y + 2); ctx.lineTo(mx, my); ctx.lineTo(c.x + Math.cos(ang) * len, c.y + 3 + Math.abs(L[2]) * 8); ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;
    for (const p of pillars) {
      const k = 1 - p.life / p.maxLife; // 0 -> 1
      const h = p.h * Math.min(1, k * 3.2), w = p.w * (1 - 0.55 * k);
      const a = Math.min(1, p.life / 10);
      for (const [ww, col, aa] of [[w, p.color, 0.75], [w * 0.45, "#ffffff", 0.9]]) {
        ctx.globalAlpha = a * aa;
        ctx.fillStyle = safeLinearGrad(ctx, 0, p.fy, 0, p.fy - h, [[0, rgba(col, 0.95)], [1, rgba(col, 0)]]);
        ctx.beginPath();
        ctx.moveTo(p.x - ww / 2, p.fy);
        ctx.quadraticCurveTo(p.x - ww * 0.4, p.fy - h * 0.55, p.x, p.fy - h);
        ctx.quadraticCurveTo(p.x + ww * 0.4, p.fy - h * 0.55, p.x + ww / 2, p.fy);
        ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    for (const t of aimTrails) { // Perfect Aim: the beam it left behind, with pressure rings along the path
      const a = t.life / t.max, xa = Math.min(t.x0, t.x1), xb = Math.max(t.x0, t.x1);
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
      ctx.globalAlpha = a * 0.6; ctx.strokeStyle = "#ffb52e"; ctx.lineWidth = 16 * a; ctx.shadowColor = "#ffb52e"; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.moveTo(xa, t.y); ctx.lineTo(xb, t.y); ctx.stroke();
      ctx.globalAlpha = a; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 4 * a; ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.moveTo(xa, t.y); ctx.lineTo(xb, t.y); ctx.stroke();
      for (let x = xa + 40; x < xb; x += 110) {
        ctx.globalAlpha = a * 0.5; ctx.strokeStyle = "#fff0b0"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(x, t.y, 4 + (1 - a) * 14, 16 + (1 - a) * 50, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
    for (const b of blasts) { // Self-Destruct: fireball with streaks, or a black-violet core with lightning at max stacks
      const k = 1 - b.life / b.max, e = 1 - Math.pow(1 - Math.min(1, k * 1.7), 3);
      const R = b.R * (0.2 + 0.8 * e), a = Math.pow(1 - k, 0.8);
      ctx.save();
      if (b.black) {
        ctx.globalAlpha = a;
        ctx.fillStyle = safeRadialGrad(ctx, b.x, b.y, 4, b.x, b.y, R, [[0, "rgba(8,3,16,0.98)"], [0.6, "rgba(40,14,80,0.85)"], [0.88, "rgba(150,80,255,0.75)"], [1, "rgba(184,108,255,0)"]]);
        ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = "#d9b8ff"; ctx.lineWidth = 2.5; ctx.shadowColor = "#b86cff"; ctx.shadowBlur = 14;
        for (const pts of b.bolts) {
          ctx.beginPath();
          pts.forEach((p, i) => { const px = b.x + p[0] * R * 1.15, py = b.y + p[1] * R * 1.15; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
          ctx.stroke();
        }
      } else {
        ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = a;
        ctx.fillStyle = safeRadialGrad(ctx, b.x, b.y, 4, b.x, b.y, R, [[0, "rgba(255,244,194,1)"], [0.35, "rgba(255,154,50,0.85)"], [0.75, "rgba(255,75,30,0.35)"], [1, "rgba(255,75,30,0)"]]);
        ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, Math.PI * 2); ctx.fill();
        if (k < 0.35) { ctx.globalAlpha = (0.35 - k) / 0.35; ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(b.x, b.y, R * 0.55, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = a * 0.8; ctx.strokeStyle = "#ffd479"; ctx.lineWidth = 3; ctx.lineCap = "round";
        for (let i = 0; i < 20; i++) {
          const ang = (i / 20) * Math.PI * 2 + 0.3, len = R * (0.62 + 0.38 * (((i * 7919) % 13) / 13));
          ctx.beginPath(); ctx.moveTo(b.x + Math.cos(ang) * R * 0.3, b.y + Math.sin(ang) * R * 0.3); ctx.lineTo(b.x + Math.cos(ang) * len, b.y + Math.sin(ang) * len); ctx.stroke();
        }
      }
      ctx.restore();
    }
    for (const r of rings) {
      const k = 1 - r.life / r.maxLife;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k)); // fast start, slow end
      ctx.globalAlpha = Math.min(1, r.life / (r.maxLife * 0.6));
      ctx.strokeStyle = r.color; ctx.lineWidth = Math.max(1, r.lw * (1 - k * 0.6));
      ctx.shadowColor = r.color; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, Math.max(1, rad), Math.max(1, rad * r.sy), 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const f of floats) {
      const k = 1 - f.life / f.maxLife;
      const pop = k < 0.15 ? 0.6 + k * 2.7 : 1;
      ctx.globalAlpha = Math.min(1, f.life / 18);
      ctx.font = "bold " + Math.round(f.size * pop) + "px monospace";
      ctx.lineWidth = 5; ctx.strokeStyle = "rgba(20,10,10,0.9)";
      ctx.strokeText(f.text, f.x, f.y - k * 46);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - k * 46);
    }
    ctx.restore();
  }

  function drawSkillFxScreen(ctx, w, h) {
    if (flashA > 0) { ctx.globalAlpha = Math.min(0.7, flashA); ctx.fillStyle = flashCol; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }
  }
  function drawBanner(ctx, w, h) {
    if (!banner) return;
    const k = 1 - banner.life / banner.maxLife;
    const pop = k < 0.12 ? 1.6 - (k / 0.12) * 0.6 : 1;
    ctx.save();
    ctx.globalAlpha = Math.min(1, banner.life / 20);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "bold " + Math.round(64 * pop) + "px monospace";
    ctx.lineWidth = 8; ctx.strokeStyle = "rgba(40,0,0,0.9)";
    ctx.shadowColor = "#ff2a2a"; ctx.shadowBlur = 24;
    ctx.strokeText(banner.text, w / 2, h * 0.26);
    ctx.fillStyle = "#ffe9c4"; ctx.fillText(banner.text, w / 2, h * 0.26);
    ctx.restore();
  }

  // Draw through an offscreen canvas and composite it at `alpha` (Phantom Decoy cloak). Without a DOM it just draws normally.
  let fadeCv = null;
  function drawFaded(ctx, alpha, fn) {
    if (typeof document === "undefined" || !ctx.canvas || !ctx.getTransform) { fn(ctx); return; }
    const w = ctx.canvas.width, h = ctx.canvas.height;
    if (!fadeCv || fadeCv.width !== w || fadeCv.height !== h) { fadeCv = document.createElement("canvas"); fadeCv.width = w; fadeCv.height = h; }
    const c = fadeCv.getContext("2d");
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, w, h);
    c.setTransform(ctx.getTransform());
    fn(c);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.drawImage(fadeCv, 0, 0);
    ctx.restore();
  }

  // ─── character body drawing ─────────────────────────────────────
  // Art lives in character_art.js (procedural IK rig). Dust / jump rings go through the shared particles.
  const artFx = { spawn: spawnParticle, trail: addTrail };
  function drawCharacterBody(ctx, f, isFlash) {
    MW.CharacterArt.draw(ctx, f, isFlash, artFx);
  }

  // ─── Combat Momentum (Fighter passive) ──────────────────────────
  const MOM = "#ff9a3c", MOM_HOT = "#ffe08a";

  // Glow behind the body while momentum is full: the next skill is empowered.
  function drawMomentumAura(ctx, f) {
    if (!f.momentumFull() || f.state === MW.STATE.KO) return;
    const s = f.stats;
    const pulse = 0.65 + 0.35 * Math.sin(Date.now() * 0.012);
    const cx = f.x + s.width / 2, cy = f.y + s.height * 0.55;
    ctx.save();
    ctx.globalAlpha = 0.5 * pulse;
    ctx.fillStyle = safeRadialGrad(ctx, cx, cy, 6, cx, cy, s.height * 0.8, [[0, rgba(MOM_HOT, 0.9)], [0.5, rgba(MOM, 0.45)], [1, rgba(MOM, 0)]]);
    ctx.fillRect(cx - s.height, cy - s.height, s.height * 2, s.height * 2);
    ctx.restore();
    if (Math.random() < 0.35) {
      spawnParticle(cx + (Math.random() - 0.5) * s.width, f.y + s.height * (0.5 + Math.random() * 0.5), (Math.random() - 0.5) * 0.6, -0.8 - Math.random() * 1.2, MOM, 22, 2.2);
    }
  }

  // Pips under the floating HP bar: one per momentum point; they blaze when full.
  function drawMomentumPips(ctx, f, y) {
    const P = f.stats.passive;
    if (P && P.type === "bulletevolution") {
      const r = 3.1, gap = 7.5, x0 = f.x + f.stats.width / 2 - ((P.max - 1) * gap) / 2;
      const colors = P.tierColors || ["#e8eef8", "#ffe04a", "#ff8b24", "#f02d45", "#21162e"];
      const stage = MW.gunnerTier(f.gunnerStacks, P);
      for (let i = 0; i < P.max; i++) {
        const on = i < f.gunnerStacks;
        ctx.beginPath(); ctx.arc(x0 + i * gap, y, r, 0, Math.PI * 2);
        ctx.fillStyle = on ? colors[stage] : "rgba(20,24,40,0.75)";
        if (on) { ctx.shadowColor = colors[stage]; ctx.shadowBlur = stage === 4 ? 12 : 6; }
        ctx.fill(); ctx.shadowBlur = 0;
        ctx.strokeStyle = on ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.2)"; ctx.lineWidth = 0.8; ctx.stroke();
      }
      return;
    }
    if (!P || P.type !== "momentum") return;
    const r = 4.2, gap = 11.5;
    const x0 = f.x + f.stats.width / 2 - ((P.max - 1) * gap) / 2;
    const full = f.momentumFull();
    const pulse = full ? 0.7 + 0.3 * Math.sin(Date.now() * 0.015) : 1;
    for (let i = 0; i < P.max; i++) {
      const on = i < f.momentum;
      ctx.beginPath();
      ctx.arc(x0 + i * gap, y, r, 0, Math.PI * 2);
      ctx.fillStyle = on ? (full ? MOM_HOT : MOM) : "rgba(20,24,40,0.75)";
      ctx.globalAlpha = on ? pulse : 1;
      if (on && full) { ctx.shadowColor = MOM; ctx.shadowBlur = 10; }
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = on ? "rgba(255,255,255,0.8)" : "rgba(255,154,60,0.45)";
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }
  }

  // ─── attack effects drawing ─────────────────────────────────────
  function drawAttack(ctx, f, sim) {
    const S = MW.STATE;
    if (!f.hit) return;
    const s = f.stats;
    const cx = f.x + s.width / 2;
    const cy = f.y + s.height * 0.45;

    if (f.state === S.ATTACK_STARTUP && f.hit.gunnerAim) {
      drawGunnerAimCharge(ctx, f);
    } else if (f.state === S.ATTACK_STARTUP && f.hit.selfDestruct) {
      drawGunnerSelfDestruct(ctx, f);
    } else if (f.state === S.ATTACK_STARTUP && f.hit.dashSpeed) {
      // Fist Rush dash: speed streaks trail behind and dust kicks up
      const col = f.hit.empowered ? "#ff6a2a" : MOM_HOT;
      ctx.save();
      ctx.lineCap = "round";
      for (let i = 0; i < 4; i++) {
        const yy = f.y + s.height * (0.28 + i * 0.17);
        const len = 34 + i * 9 + Math.random() * 14;
        const x0 = cx - f.facing * (s.width * 0.45 + 6 + Math.random() * 6);
        ctx.strokeStyle = rgba(col, 0.55 - i * 0.07);
        ctx.lineWidth = 3 - i * 0.4;
        ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 - f.facing * len, yy); ctx.stroke();
      }
      ctx.restore();
      if (f.grounded && Math.random() < 0.7) spawnParticle(cx - f.facing * 14, f.y + s.height - 2, -f.facing * (1 + Math.random() * 2), -0.4 - Math.random() * 0.6, "#c9c2b0", 14, 2.6);
    } else if (f.state === S.ATTACK_STARTUP && f.hit.id === "iron_guard") {
      // the shield dome (drawGuardAura) is the whole effect
    } else if (f.state === S.ATTACK_STARTUP && f.hit.id === "meteor_breaker") {
      drawUltCharge(ctx, f);
    } else if (f.state === S.ATTACK_STARTUP && f.hit.isSkill) {
      // skill wind-up: energy gathers at the fist and a ring closes in (the opponent's tell)
      const prog = 1 - f.stateTimer / Math.max(1, f.hit.startup);
      const col = f.hit.empowered ? "#ff4a1f" : MOM;
      const ox = cx + f.facing * (s.width * 0.1), oy = cy;
      ctx.save();
      ctx.shadowColor = col;
      ctx.shadowBlur = 18;
      ctx.fillStyle = rgba(col, 0.55 + 0.3 * prog);
      ctx.beginPath(); ctx.arc(ox, oy, 5 + 15 * prog, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = rgba(MOM_HOT, 0.4 + 0.5 * prog);
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(ox, oy, 12 + 46 * (1 - prog), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      if (Math.random() < 0.6) spawnParticle(ox + (Math.random() - 0.5) * 50, oy + (Math.random() - 0.5) * 50, 0, 0, col, 10, 2);
    } else if (f.state === S.ATTACK_STARTUP) {
      // wind-up glow on the attacking hand
      const glowX = cx + f.facing * (s.width * 0.5 + 8);
      const [r, g, b] = hexToRgb(s.color);
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = "rgba(" + r + "," + g + "," + b + ",0.6)";
      ctx.beginPath();
      ctx.arc(glowX, cy, 8 + Math.sin(Date.now() * 0.02) * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (f.state === S.ATTACK_ACTIVE) {
      if (f.hit.type === "melee") drawMeleeShape(ctx, f);
    }
  }

  // Artillerist Perfect Aim charge: laser sight locked onto the enemy, a closing reticle with a progress arc
  // (gold -> red, blinking when nearly ready), and a rifle that gathers light.
  function drawGunnerAimCharge(ctx, f) {
    const s = f.stats, dir = f.facing, cx = f.x + s.width / 2, cy = f.y + s.height * 0.4;
    const prog = Math.max(0, Math.min(1, 1 - f.stateTimer / Math.max(1, f.hit.startup)));
    const foe = f.foe && f.foe.state !== MW.STATE.KO ? f.foe : null;
    const tx = foe ? foe.x + foe.stats.width / 2 : cx + dir * 520, ty = foe ? foe.y + foe.stats.height / 2 : cy;
    const mx = cx + dir * 20, my = cy, TAU2 = Math.PI * 2;
    const col = prog > 0.82 ? "#ff3a3a" : "#ffd66b";
    const blink = prog > 0.92 ? (Math.floor(Date.now() / 60) % 2 ? 1 : 0.35) : 1;
    ctx.save(); ctx.lineCap = "round"; ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgba(col, (0.18 + 0.6 * prog) * blink); ctx.lineWidth = 1 + prog * 3; ctx.shadowColor = col; ctx.shadowBlur = 8 + prog * 18;
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(tx, ty); ctx.stroke(); // laser sight
    const ang = Math.atan2(ty - my, tx - mx);
    ctx.strokeStyle = rgba(col, 0.12 * blink); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + Math.cos(ang) * 400, ty + Math.sin(ang) * 400); ctx.stroke();
    const rad = 62 - 34 * prog, rot = Date.now() * 0.004 * (1 + prog * 2);
    ctx.shadowBlur = 12; ctx.lineWidth = 2.5; ctx.strokeStyle = rgba(col, 0.9 * blink);
    ctx.beginPath(); ctx.arc(tx, ty, rad, 0, TAU2); ctx.stroke(); // reticle ring
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(tx, ty, rad + 9, -Math.PI / 2, -Math.PI / 2 + TAU2 * prog); ctx.stroke(); // lock progress
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) { // four spinning brackets
      const a = rot + i * Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(tx + Math.cos(a) * (rad - 10), ty + Math.sin(a) * (rad - 10)); ctx.lineTo(tx + Math.cos(a) * (rad + 16), ty + Math.sin(a) * (rad + 16)); ctx.stroke();
    }
    ctx.fillStyle = rgba(col, 0.95 * blink); ctx.beginPath(); ctx.arc(tx, ty, 2.5 + prog * 2, 0, TAU2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = safeRadialGrad(ctx, mx, my, 1, mx, my, 10 + 26 * prog, [[0, "rgba(255,255,255,0.95)"], [0.4, rgba(col, 0.7)], [1, rgba(col, 0)]]);
    ctx.fillRect(mx - 40, my - 40, 80, 80); // muzzle glow
    if (prog > 0.5) { // lens flare cross
      const L = 14 + 100 * (prog - 0.5);
      ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(mx - L, my); ctx.lineTo(mx + L, my); ctx.moveTo(mx, my - L * 0.6); ctx.lineTo(mx, my + L * 0.6); ctx.stroke();
    }
    ctx.restore();
    if (Math.random() < 0.3 + 0.6 * prog) { // light gathers into the muzzle
      const a = Math.random() * TAU2, d = 30 + Math.random() * 40;
      spawnParticle(mx + Math.cos(a) * d, my + Math.sin(a) * d, -Math.cos(a) * 2.6, -Math.sin(a) * 2.6, col, 11, 2.2);
    }
  }

  // Self-Destruct charge: a dashed blast-radius warning ring, a filling ring, a growing core with cracks of light,
  // energy pulled into the body, then a white-hot flicker. At max stacks everything turns black and violet.
  function drawGunnerSelfDestruct(ctx, f) {
    const s = f.stats, cx = f.x + s.width / 2, cy = f.y + s.height / 2, TAU2 = Math.PI * 2;
    const prog = Math.max(0, Math.min(1, 1 - f.stateTimer / Math.max(1, f.hit.startup)));
    const black = !!f.hit.black, R = f.hit.radius;
    const hot = black ? "#b86cff" : "#ff9a32", core = black ? "#21162e" : "#fff4c2", edge = black ? "#6a2cff" : "#ff4b22";
    const pulse = 0.75 + 0.25 * Math.sin(Date.now() * (0.02 + 0.04 * prog));
    ctx.save();
    ctx.lineWidth = 2; ctx.setLineDash([16, 10]); ctx.lineDashOffset = -Date.now() * 0.03;
    ctx.strokeStyle = rgba(hot, 0.25 + 0.4 * prog);
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU2); ctx.stroke(); // where the blast will reach
    ctx.setLineDash([]);
    ctx.lineWidth = 3 + 4 * prog; ctx.strokeStyle = rgba(hot, 0.5 + 0.4 * prog); ctx.shadowColor = hot; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(cx, cy, R * prog, 0, TAU2); ctx.stroke(); // fills up as the charge grows
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = black ? "source-over" : "lighter";
    ctx.globalAlpha = 0.35 + 0.55 * prog;
    ctx.fillStyle = safeRadialGrad(ctx, cx, cy, 4, cx, cy, s.height * (0.6 + 1.1 * prog) * pulse, [[0, rgba(core, 1)], [0.4, rgba(hot, 0.8)], [1, rgba(edge, 0)]]);
    ctx.fillRect(cx - s.height * 2, cy - s.height * 2, s.height * 4, s.height * 4);
    ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.4 + 0.5 * prog;
    ctx.strokeStyle = black ? "#d9b8ff" : "#fff0c2"; ctx.lineWidth = 1.5 + prog * 2; ctx.shadowColor = hot; ctx.shadowBlur = 10;
    for (let i = 0; i < 9; i++) { // cracks of light spreading from the body
      const a = (i / 9) * TAU2 + Date.now() * 0.0004, len = (24 + 60 * prog) * (0.6 + Math.random() * 0.5);
      let x = cx, y = cy;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) { const aa = a + (Math.random() - 0.5) * 0.7; x += Math.cos(aa) * len / 4; y += Math.sin(aa) * len / 4; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    if (prog > 0.8) { // the last moments: the whole body flickers white-hot
      ctx.shadowBlur = 0; ctx.globalAlpha = ((prog - 0.8) / 0.2) * (0.4 + 0.4 * Math.random()); ctx.fillStyle = "#ffffff";
      ctx.fillRect(f.x, f.y, s.width, s.height);
    }
    ctx.restore();
    if (Math.random() < 0.5 + 0.5 * prog) { // energy rushes into the body
      const a = Math.random() * TAU2, d = 60 + Math.random() * 70, sp = 3 + prog * 3;
      spawnParticle(cx + Math.cos(a) * d, cy + Math.sin(a) * d, -Math.cos(a) * sp, -Math.sin(a) * sp, hot, 12, 2.5);
    }
  }

  // Meteor Breaker charge: red fire ring on the floor, glowing fist, rising embers, red body glow.
  function drawUltCharge(ctx, f) {
    const s = f.stats;
    const prog = 1 - f.stateTimer / Math.max(1, f.hit.startup);
    const cx = f.x + s.width / 2, cy = f.y + s.height * 0.5, fy = f.y + s.height;
    const pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.03);
    ctx.save();
    ctx.globalAlpha = (0.35 + 0.4 * prog) * pulse;
    ctx.fillStyle = safeRadialGrad(ctx, cx, cy, 8, cx, cy, s.height * (0.7 + 0.5 * prog), [[0, rgba("#ffe0a0", 0.9)], [0.45, rgba("#ff3a2a", 0.5)], [1, rgba("#ff3a2a", 0)]]);
    ctx.fillRect(cx - s.height * 1.3, cy - s.height * 1.3, s.height * 2.6, s.height * 2.6);
    ctx.globalAlpha = 0.5 + 0.4 * prog;
    ctx.strokeStyle = "#ff5a2a"; ctx.lineWidth = 4; ctx.shadowColor = "#ff2a00"; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.ellipse(cx, fy, 34 + 46 * prog, 9 + 12 * prog, 0, 0, Math.PI * 2); ctx.stroke();
    const ox = cx + f.facing * (s.width * 0.55), oy = f.y + s.height * 0.42;
    ctx.globalAlpha = 0.6 + 0.35 * prog;
    ctx.fillStyle = "#ff6a3a"; ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.arc(ox, oy, 8 + 20 * prog, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff3d0"; ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(ox, oy, 3 + 8 * prog, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (Math.random() < 0.9) spawnParticle(cx + (Math.random() - 0.5) * s.width * 1.6, fy - 4, (Math.random() - 0.5) * 1.2, -1.5 - Math.random() * 2.5, Math.random() < 0.5 ? "#ff6a2a" : "#ffd479", 24, 2.5 + Math.random() * 2);
  }

  // Shaped melee effect. It follows the real hit shape (f.meleeShape(): a half-ellipse), so what you
  // see is what hits: no square. fxShape picks the look: jab / hook / upper / slam.
  // Characters with their own fx (Assassin "blood" slashes) are drawn by that file instead.
  function drawMeleeShape(ctx, f) {
    const h = f.hit;
    if (h.fxStyle) return;
    const s = f.stats;
    const e = f.meleeShape();
    const d = e.dir;
    const total = h.active || 1;
    const t = 1 - f.stateTimer / total; // 0 -> 1 across the active frames
    const shape = h.fxShape || "hook";
    const fxCol = shape === "power" ? (h.empowered ? "#ff4a1f" : "#ffa040")
                : shape === "rush" ? (h.empowered ? "#ff4a1f" : "#ffd479")
                : shape === "rising" ? "#ffcc44"
                : shape === "meteor" ? "#ff2a2a"
                : s.color;
    const thick = shape === "power" ? 0.55 : shape === "rush" ? 0.38 : shape === "slam" ? 0.42 : shape === "jab" ? 0.5 : 0.3; // crescent thickness (fraction of reach)
    const grow = 0.82 + 0.18 * Math.min(1, t * 2);
    const rx = e.rx * grow, ry = e.ry * grow;
    // crescent between the outer ellipse and an inner one pulled back toward the fighter
    ctx.save();
    ctx.translate(e.cx, e.cy);
    if (shape === "upper") ctx.rotate(-d * 0.35); // rising swing
    // (rising / meteor: no extra scaling, so what you see is the real hit area: range, boxH, lift)
    ctx.scale(d, 1);
    const N = 18;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / N;
      ctx.lineTo(Math.cos(a) * rx, Math.sin(a) * ry);
    }
    for (let i = N; i >= 0; i--) {
      const a = -Math.PI / 2 + (Math.PI * i) / N;
      ctx.lineTo(Math.cos(a) * rx * (1 - thick) + rx * thick * 0.35, Math.sin(a) * ry * (1 - thick * 0.7));
    }
    ctx.closePath();
    ctx.globalAlpha = 0.85 * (1 - t * 0.55);
    ctx.fillStyle = safeLinearGrad(ctx, 0, 0, rx, 0, [[0, rgba(fxCol, 0.05)], [0.7, rgba(fxCol, 0.55)], [1, "rgba(255,255,255,0.95)"]]);
    ctx.shadowColor = fxCol;
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;
    // bright leading edge
    ctx.globalAlpha = 0.9 * (1 - t * 0.5);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = shape === "slam" || shape === "power" || shape === "rush" ? 4.5 : 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 2; i <= N - 2; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / N;
      const px = Math.cos(a) * rx, py = Math.sin(a) * ry;
      if (i === 2) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    if (shape === "slam" || shape === "power" || shape === "rush") {
      // shield-bash shock rings
      ctx.strokeStyle = rgba(fxCol, 0.55);
      ctx.lineWidth = 2;
      for (const k of [0.62, 0.8]) {
        ctx.beginPath();
        ctx.ellipse(0, 0, rx * k, ry * k, 0, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    if (h.empowered && Math.random() < 0.8) spawnBurst(e.cx + d * e.rx * 0.9, e.cy, "#ff6a2a", 2, 5); // empowered: extra embers
    // sparks off the tip
    if (Math.random() < 0.5) {
      spawnParticle(e.cx + d * e.rx, e.cy, d * (1 + Math.random() * 2), (Math.random() - 0.5) * 3, fxCol, 10, 2);
    }

    // Rising Fist: three flame tongues shoot up from the fist, sparks fly upward
    if (shape === "rising") {
      ctx.save();
      const fade = 1 - t * 0.5;
      for (let i = 0; i < 3; i++) {
        const bx = e.cx + d * e.rx * (0.3 + i * 0.22), top = e.cy - e.ry * (0.9 + 0.25 * (i === 1 ? 1 : 0)), base = e.cy + e.ry * 0.6;
        const w = 20 - i * 3;
        ctx.globalAlpha = 0.85 * fade;
        ctx.fillStyle = safeLinearGrad(ctx, 0, base, 0, top, [[0, rgba("#ff7a1f", 0.9)], [0.6, rgba("#ffcc44", 0.85)], [1, rgba("#ffffff", 0)]]);
        ctx.beginPath();
        ctx.moveTo(bx - w / 2, base);
        ctx.quadraticCurveTo(bx - w * 0.4, (base + top) / 2, bx, top);
        ctx.quadraticCurveTo(bx + w * 0.4, (base + top) / 2, bx + w / 2, base);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      if (Math.random() < 0.8) spawnParticle(e.cx + d * e.rx * (0.3 + Math.random() * 0.5), e.cy + e.ry * 0.3, (Math.random() - 0.5) * 2, -3 - Math.random() * 5, Math.random() < 0.5 ? "#ffcc44" : "#ff7a3d", 20, 2.5 + Math.random() * 2);
    }
    // Meteor Breaker: a fireball at the fist and a shock ring along the floor
    if (shape === "meteor") {
      const fx = e.cx + d * e.rx * 0.6, fyb = f.y + s.height;
      const R = 34 + 46 * t;
      ctx.save();
      ctx.fillStyle = safeRadialGrad(ctx, fx, e.cy, 4, fx, e.cy, R, [[0, "rgba(255,255,255,0.95)"], [0.35, rgba("#ffb02e", 0.85)], [0.75, rgba("#ff3a2a", 0.55)], [1, rgba("#ff3a2a", 0)]]);
      ctx.fillRect(fx - R, e.cy - R, R * 2, R * 2);
      ctx.strokeStyle = rgba("#ffd479", 0.8 * (1 - t * 0.5)); ctx.lineWidth = 5;
      ctx.shadowColor = "#ff3a2a"; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.ellipse(fx, fyb, 40 + 120 * t, 10 + 22 * t, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      if (Math.random() < 0.9) spawnBurst(fx, e.cy, Math.random() < 0.5 ? "#ff4444" : "#ffcc44", 3, 6);
    }
  }

  // Iron Guard: a gold shield dome with a spinning hex ring (grows in, fades out), a white flash
  // when it takes a hit, and a glowing fist after a block (the next punch is empowered).
  function drawGuardAura(ctx, f) {
    const S = MW.STATE, s = f.stats;
    if (f.state === S.KO) return;
    const cx = f.x + s.width / 2, cy = f.y + s.height * 0.5;
    const now = Date.now() * 0.001;
    const guarding = f.hit && f.hit.id === "iron_guard" &&
      (f.state === S.ATTACK_STARTUP || f.state === S.ATTACK_ACTIVE || f.state === S.ATTACK_RECOVERY);
    if (guarding) {
      let k = 1;
      if (f.state === S.ATTACK_STARTUP) k = 1 - f.stateTimer / Math.max(1, f.hit.startup);
      else if (f.state === S.ATTACK_RECOVERY) k = f.stateTimer / Math.max(1, f.hit.recovery);
      const R = s.height * 0.66 * (0.6 + 0.4 * k);
      const pulse = 0.85 + 0.15 * Math.sin(now * 14);
      ctx.save();
      ctx.globalAlpha = 0.9 * k;
      ctx.fillStyle = safeRadialGrad(ctx, cx, cy, R * 0.3, cx, cy, R, [[0, rgba("#ffd700", 0.04)], [0.75, rgba("#ffd700", 0.2 * pulse)], [1, rgba("#fff3b0", 0.55 * pulse)]]);
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#ffd700"; ctx.lineWidth = 4; ctx.shadowColor = "#ffd700"; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0; ctx.lineWidth = 2.5; ctx.strokeStyle = rgba("#fff3b0", 0.85);
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = now * 0.9 + (i * Math.PI) / 3;
        const px = cx + Math.cos(a) * R * 0.9, py = cy + Math.sin(a) * R * 0.9;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      if (f.armorHit > 0) { // took a hit: the whole dome flashes white
        ctx.globalAlpha = f.armorHit / 8;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      if (f.state === S.ATTACK_ACTIVE && Math.random() < 0.3) {
        const a = Math.random() * Math.PI * 2;
        spawnParticle(cx + Math.cos(a) * R, cy + Math.sin(a) * R, Math.cos(a) * 0.5, Math.sin(a) * 0.5 - 0.4, "#ffe27a", 14, 2);
      }
    }
    if (f.guardEmpowered && !guarding) {
      // empowered fist: glowing orb on the front hand
      const ox = cx + f.facing * (s.width * 0.55), oy = f.y + s.height * 0.42;
      const pulse = 0.7 + 0.3 * Math.sin(now * 16);
      ctx.save();
      ctx.shadowColor = "#ff9a3c"; ctx.shadowBlur = 22;
      ctx.fillStyle = rgba("#ffb02e", 0.75 * pulse);
      ctx.beginPath(); ctx.arc(ox, oy, 11 + 4 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff3d0"; ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(ox, oy, 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (Math.random() < 0.4) spawnParticle(ox, oy, (Math.random() - 0.5) * 1.5, -1 - Math.random(), "#ffb02e", 16, 2);
    }
  }

  // ─── projectile drawing ─────────────────────────────────────────
  // Gunner bullet: bright head with a thin fading tracer streak.
  // Perfect Aim shot: a long white-hot beam with a gold glow and pressure rings trailing behind the head.
  function drawAimShot(ctx, p) {
    const L = 340, x0 = p.x - p.dir * L;
    const col = p.tier > 0 ? p.evolutionColor : "#fff0b0", glow = p.tier === 4 ? "#b86cff" : "#ffb52e";
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
    for (const [w, c, aa] of [[22, glow, 0.55], [9, p.tier === 4 ? "#d9b8ff" : col, 0.9], [3.5, "#ffffff", 1]]) {
      ctx.strokeStyle = safeLinearGrad(ctx, x0, 0, p.x, 0, [[0, rgba(c, 0)], [1, rgba(c, aa)]]); ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x0, p.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    }
    ctx.shadowColor = glow; ctx.shadowBlur = 30; ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 26, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = rgba("#ffffff", 0.55 - i * 0.13); ctx.lineWidth = 3 - i * 0.5;
      ctx.beginPath(); ctx.ellipse(p.x - p.dir * (34 + i * 46), p.y, 7 + i * 2, 26 + i * 8, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    if (Math.random() < 0.8) spawnParticle(p.x - p.dir * 30, p.y + (Math.random() - 0.5) * 20, -p.dir * 1.2, (Math.random() - 0.5) * 1.5, glow, 10, 2.4);
  }

  function drawBullet(ctx, p) {
    if (p.hit && p.hit.gunnerAim) { drawAimShot(ctx, p); return; }
    const L = p.angle ? 22 : 40, ang = p.angle || 0;
    const ux = p.dir * Math.cos(ang), uy = Math.sin(ang);
    const x0 = p.x - ux * L, y0 = p.y - uy * L;
    ctx.lineCap = "round";
    const col = p.evolutionColor || "#ffb02e";
    const black = p.tier === 4; // top tier = glowing black bullet
    ctx.strokeStyle = safeLinearGrad(ctx, x0, y0, p.x, p.y, [[0, rgba(black ? "#b86cff" : col, 0)], [1, black ? "#b86cff" : col]]);
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(p.x, p.y); ctx.stroke();
    ctx.shadowColor = black ? "#b86cff" : col;
    ctx.shadowBlur = black ? 24 : 14;
    ctx.fillStyle = black ? "#21162e" : col;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(uy, ux));
    ctx.beginPath(); ctx.ellipse(0, 0, 7, 3.2, 0, 0, Math.PI * 2); ctx.fill();
    if (black) { ctx.lineWidth = 1.6; ctx.strokeStyle = "#b86cff"; ctx.stroke(); }
    ctx.restore();
    ctx.shadowBlur = 0;
    if (Math.random() < 0.5) spawnParticle(p.x - p.dir * 10, p.y + (Math.random() - 0.5) * 3, -p.dir * 0.4, (Math.random() - 0.5) * 0.6, "#ffcf5a", 8, 1.6);
  }

  function drawProjectile(ctx, p, alpha) {
    ctx.save();
    ctx.translate((p.px - p.x) * (1 - alpha), (p.py - p.y) * (1 - alpha));
    if (p.hit && p.hit.projectile && p.hit.projectile.style === "bullet") {
      drawBullet(ctx, p);
      ctx.restore();
      return;
    }
    if (p.hit && p.hit.projectile && p.hit.projectile.style === "arcane" && MW.MageFx) {
      MW.MageFx.drawBolt(ctx, p);
      ctx.restore();
      return;
    }
    const r = p.size / 2;
    const [cr, cg, cb] = hexToRgb(p.color);

    // long fading trail
    const trailLen = 36;
    for (let i = 4; i >= 0; i--) {
      const ta = (i / 5) * 0.35;
      const tx = p.x - p.dir * (trailLen / 5) * (5 - i);
      ctx.globalAlpha = ta;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(tx, p.y, r * (0.4 + i * 0.12), 0, Math.PI * 2);
      ctx.fill();
    }

    // outer glow
    ctx.globalAlpha = 0.35;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 6, 0, Math.PI * 2);
    ctx.fill();

    // main orb with gradient
    ctx.globalAlpha = 1;
    ctx.fillStyle = safeRadialGrad(ctx, p.x - p.dir * 2, p.y - 2, 1, p.x, p.y, r,
      [[0, "#ffffff"], [0.4, p.color], [1, shadeColor(p.color, -30)]]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();

    // white core
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.arc(p.x - p.dir * 1, p.y - 1, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // spawn trail particles
    if (Math.random() < 0.6) {
      spawnParticle(
        p.x - p.dir * (r + 4), p.y + (Math.random() - 0.5) * r,
        -p.dir * (0.5 + Math.random()), (Math.random() - 0.5) * 1.5,
        p.color, 10 + Math.random() * 8 | 0, 1.5 + Math.random() * 2
      );
    }

    ctx.restore();
  }

  // ─── hit flash effect ───────────────────────────────────────────
  // Track per-fighter hit state to trigger bursts
  const lastHitTracker = {};
  function checkHitBurst(f) {
    const key = f.id;
    const prev = lastHitTracker[key];
    if (f.flash > 0 && (!prev || prev < f.flash)) {
      // new hit! spawn burst
      spawnBurst(f.x + f.stats.width / 2, f.y + f.stats.height * 0.4, f.stats.color, 12, 4);
      spawnBurst(f.x + f.stats.width / 2, f.y + f.stats.height * 0.4, "#ffffff", 6, 3);
    }
    lastHitTracker[key] = f.flash;
  }

  // ─── panel (HUD) ───────────────────────────────────────────────
  const PANEL_W = 420;

  // `tap` = true for the local touch player: the whole panel becomes the ultimate button.
  // Returns the panel rectangle (canvas pixels) so the caller can hit-test taps against it.
  function drawPanel(ctx, f, x, label, kills, rightAlign, tap) {
    const s = f.stats;
    const y = 18, bh = 20;
    const frac = Math.max(0, f.hp / s.maxHP);
    const maxMana = MW.CONFIG.combat.maxMana;
    const mf = Math.max(0, Math.min(1, f.mana / maxMana));
    const ultReady = !!tap && mf >= 1;
    const glowPulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.012);
    const panelRect = { x: x - 12, y: y - 8, w: PANEL_W + 24, h: 82 };

    // glass backing
    ctx.fillStyle = "rgba(8,10,20,0.55)";
    roundRect(ctx, x - 12, y - 8, PANEL_W + 24, 82, 12);
    ctx.fill();
    ctx.strokeStyle = s.color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    roundRect(ctx, x - 12, y - 8, PANEL_W + 24, 82, 12);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // glowing "ultimate ready" border around the whole panel
    if (ultReady) {
      ctx.save();
      ctx.shadowColor = "#ffd479";
      ctx.shadowBlur = 14 + 14 * glowPulse;
      ctx.strokeStyle = "#ffd479";
      ctx.globalAlpha = 0.6 + 0.4 * glowPulse;
      ctx.lineWidth = 4;
      roundRect(ctx, x - 12, y - 8, PANEL_W + 24, 82, 12);
      ctx.stroke();
      ctx.restore();
    }

    // name + kills
    ctx.textBaseline = "top";
    ctx.font = "bold 20px monospace";
    ctx.fillStyle = s.color;
    ctx.textAlign = rightAlign ? "right" : "left";
    const tx = rightAlign ? x + PANEL_W : x;
    ctx.fillText(label + "  " + s.name.toUpperCase(), tx, y);
    ctx.font = "bold 18px monospace";
    ctx.fillStyle = "#ffd479";
    ctx.textAlign = rightAlign ? "left" : "right";
    ctx.fillText("\u2605 " + kills, rightAlign ? x : x + PANEL_W, y + 1);

    // HP bar
    const by = y + 30;
    ctx.fillStyle = "#1a1f2e";
    roundRect(ctx, x, by, PANEL_W, bh, 10);
    ctx.fill();
    const hpColor = frac > 0.5 ? "#4cd964" : frac > 0.25 ? "#ffcc00" : "#ff453a";
    const fw = PANEL_W * frac;
    if (fw > 1) {
      const fx = rightAlign ? x + PANEL_W - fw : x;
      ctx.fillStyle = safeLinearGrad(ctx, 0, by, 0, by + bh,
        [[0, shadeColor(hpColor, 35)], [1, shadeColor(hpColor, -15)]]);
      roundRect(ctx, fx, by, fw, bh, 10);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      roundRect(ctx, fx + 3, by + 2, Math.max(0, fw - 6), 5, 3);
      ctx.fill();
    }
    // HP bar outline: glows gold while the ultimate is ready
    if (ultReady) { ctx.save(); ctx.shadowColor = "#ffd479"; ctx.shadowBlur = 10 + 10 * glowPulse; }
    ctx.strokeStyle = ultReady ? "#ffd479" : "rgba(220,228,255,0.55)";
    ctx.lineWidth = 2;
    roundRect(ctx, x, by, PANEL_W, bh, 10);
    ctx.stroke();
    if (ultReady) ctx.restore();

    ctx.font = "bold 13px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.fillText(Math.ceil(f.hp) + " / " + s.maxHP, x + PANEL_W / 2, by + 4);
    ctx.textAlign = "left";

    // mana bar (ultimate meter): fills with every hit landed, pulses when full
    const my = by + 25, mh = 10;
    ctx.fillStyle = "#141a2a";
    roundRect(ctx, x, my, PANEL_W, mh, 5);
    ctx.fill();
    if (mf > 0) {
      const mw = PANEL_W * mf;
      const ready = mf >= 1;
      const pulse = ready ? 0.75 + 0.25 * Math.sin(Date.now() * 0.012) : 1;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = ready ? "#ffd479" : "#4aa8ff";
      if (ready) { ctx.shadowColor = "#ffd479"; ctx.shadowBlur = 12; }
      roundRect(ctx, rightAlign ? x + PANEL_W - mw : x, my, mw, mh, 5);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = mf >= 1 ? "#ffd479" : "rgba(160,190,255,0.45)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, my, PANEL_W, mh, 5);
    ctx.stroke();
    if (mf >= 1) {
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#1a1200";
      ctx.fillText(tap ? "TAP FOR ULTIMATE" : "ULTIMATE READY", x + PANEL_W / 2, my + 1);
      ctx.textAlign = "left";
    }

    return panelRect; // tap area = the whole panel
  }

  // ─── themed arenas ──────────────────────────────────────────────
  function mkRnd(seed) {
    let s = seed;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  }
  const mod = (v, m) => ((v % m) + m) % m;
  function rgba(hex, a) {
    const [r, g, b] = hexToRgb(hex);
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }
  function fillSky(ctx, w, h, stops) {
    ctx.fillStyle = safeLinearGrad(ctx, 0, 0, 0, h, stops);
    ctx.fillRect(0, 0, w, h);
  }
  function drawStars(ctx, w, maxY, rnd, count, color) {
    ctx.fillStyle = color || "#fff";
    for (let i = 0; i < count; i++) {
      ctx.globalAlpha = 0.25 + rnd() * 0.65;
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * maxY, 0.5 + rnd() * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // glowing sphere (moon / sun) with a soft halo
  function glowOrb(ctx, x, y, r, inner, outer, halo, haloA) {
    ctx.fillStyle = safeRadialGrad(ctx, x, y, r * 0.8, x, y, r * 3.2,
      [[0, rgba(halo, haloA)], [1, rgba(halo, 0)]]);
    ctx.fillRect(x - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4);
    ctx.fillStyle = safeRadialGrad(ctx, x - r * 0.25, y - r * 0.25, 4, x, y, r, [[0, inner], [1, outer]]);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  function ridge(ctx, w, h, base, amp, step, color, off) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w + step; x += step) {
      const y = base - amp * (0.5 + 0.5 * Math.sin(x * 0.0061 + off)) - amp * 0.5 * Math.sin(x * 0.017 + off * 2.3);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
  function fogBand(ctx, w, y0, y1, hex, a) {
    ctx.fillStyle = safeLinearGrad(ctx, 0, y0, 0, y1, [[0, rgba(hex, 0)], [1, rgba(hex, a)]]);
    ctx.fillRect(0, y0, w, y1 - y0);
  }
  function vignette(ctx, w, h, a) {
    ctx.fillStyle = safeRadialGrad(ctx, w / 2, h / 2, h * 0.45, w / 2, h / 2, w * 0.72,
      [[0, "rgba(0,0,0,0)"], [1, "rgba(0,0,0," + a + ")"]]);
    ctx.fillRect(0, 0, w, h);
  }
  function pine(ctx, x, y, h, color) {
    ctx.fillStyle = color;
    for (let i = 0; i < 3; i++) {
      const ty = y - h + i * h * 0.28, bw = h * (0.22 + i * 0.12);
      ctx.beginPath();
      ctx.moveTo(x, ty);
      ctx.lineTo(x + bw, ty + h * 0.42);
      ctx.lineTo(x - bw, ty + h * 0.42);
      ctx.closePath();
      ctx.fill();
    }
  }

  function mushroom(ctx, x, y, h, cw, cap, stem, glow, alpha) {
    ctx.globalAlpha = alpha || 1;
    const sw = cw * 0.22;
    ctx.fillStyle = stem;
    ctx.beginPath();
    ctx.moveTo(x - sw, y);
    ctx.quadraticCurveTo(x - sw * 0.6, y - h * 0.5, x - sw * 0.5, y - h);
    ctx.lineTo(x + sw * 0.5, y - h);
    ctx.quadraticCurveTo(x + sw * 0.6, y - h * 0.5, x + sw, y);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = glow;
    ctx.shadowBlur = 18;
    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.ellipse(x, y - h, cw / 2, cw * 0.32, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.14)"; // soft highlight
    ctx.beginPath();
    ctx.ellipse(x - cw * 0.1, y - h - cw * 0.08, cw * 0.28, cw * 0.14, -0.3, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.5)"; // spots
    for (const [sx, sy, sr] of [[-0.25, -0.1, 0.06], [0.05, -0.2, 0.08], [0.27, -0.09, 0.05], [-0.08, -0.07, 0.035], [0.17, -0.15, 0.03]]) {
      ctx.beginPath();
      ctx.arc(x + cw * sx, y - h + cw * sy, cw * sr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,0.12)"; // glowing gills
    ctx.beginPath();
    ctx.ellipse(x, y - h, cw / 2, cw * 0.05, 0, 0, Math.PI);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function mesa(ctx, x, base, w, h, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.lineTo(x + w * 0.08, base - h * 0.8);
    ctx.lineTo(x + w * 0.16, base - h);
    ctx.lineTo(x + w * 0.84, base - h);
    ctx.lineTo(x + w * 0.92, base - h * 0.8);
    ctx.lineTo(x + w, base);
    ctx.closePath();
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = "rgba(0,0,0,0.13)";
    for (let i = 0; i < 6; i++) ctx.fillRect(x, base - h + h * (0.15 + i * 0.14), w, h * 0.05);
    ctx.fillStyle = "rgba(255,230,180,0.12)"; // sunlit edge
    ctx.fillRect(x, base - h, w * 0.18, h);
    ctx.restore();
  }
  function saguaro(ctx, x, y, h, color) {
    ctx.fillStyle = color;
    roundRect(ctx, x - 7, y - h, 14, h, 7);
    ctx.fill();
    roundRect(ctx, x - 26, y - h * 0.45, 20, 9, 4);
    ctx.fill();
    roundRect(ctx, x - 26, y - h * 0.7, 9, h * 0.3, 4);
    ctx.fill();
    roundRect(ctx, x + 6, y - h * 0.6, 20, 9, 4);
    ctx.fill();
    roundRect(ctx, x + 17, y - h * 0.82, 9, h * 0.31, 4);
    ctx.fill();
  }

  function castle(ctx, cx, base, s, color, glow) {
    ctx.fillStyle = color;
    const tower = (x, wd, ht, roof) => {
      ctx.fillRect(x, base - ht * s, wd * s, ht * s);
      for (let i = 0; i < 4; i++) ctx.fillRect(x + i * (wd * s / 4), base - ht * s - 14 * s, wd * s / 8, 14 * s);
      if (roof === "cone") {
        ctx.beginPath();
        ctx.moveTo(x - 8 * s, base - ht * s);
        ctx.lineTo(x + wd * s / 2, base - (ht + 90) * s);
        ctx.lineTo(x + wd * s + 8 * s, base - ht * s);
        ctx.closePath();
        ctx.fill();
      } else if (roof === "broken") {
        ctx.beginPath();
        ctx.moveTo(x, base - ht * s);
        ctx.lineTo(x + wd * 0.25 * s, base - (ht + 30) * s);
        ctx.lineTo(x + wd * 0.45 * s, base - (ht + 8) * s);
        ctx.lineTo(x + wd * 0.7 * s, base - (ht + 38) * s);
        ctx.lineTo(x + wd * s, base - ht * s);
        ctx.closePath();
        ctx.fill();
      }
    };
    ctx.fillRect(cx - 240 * s, base - 120 * s, 480 * s, 120 * s); // curtain wall
    for (let x = cx - 240 * s; x < cx + 240 * s; x += 28 * s) ctx.fillRect(x, base - 136 * s, 14 * s, 16 * s);
    tower(cx - 260 * s, 80, 250, "cone");
    tower(cx + 180 * s, 80, 210, "broken");
    tower(cx - 70 * s, 140, 320, "cone");
    // dim windows
    ctx.fillStyle = glow;
    for (const [wx, wy] of [[-232, 200], [-30, 260], [20, 200], [-30, 150], [208, 150], [-120, 70], [100, 70]]) {
      roundRect(ctx, cx + wx * s, base - wy * s, 11 * s, 20 * s, 5 * s);
      ctx.fill();
    }
    ctx.fillStyle = color; // broken gate
    ctx.beginPath();
    ctx.moveTo(cx - 24 * s, base);
    ctx.lineTo(cx - 24 * s, base - 50 * s);
    ctx.quadraticCurveTo(cx, base - 76 * s, cx + 24 * s, base - 50 * s);
    ctx.lineTo(cx + 24 * s, base);
    ctx.fill();
  }
  function deadTree(ctx, x, y, h, color) {
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 4, y - h);
    ctx.stroke();
    ctx.lineWidth = 4;
    for (const [bx, by, ex, ey] of [[0.45, 0, -0.55, 0.22], [0.6, 0, 0.5, 0.26], [0.78, 0, -0.35, 0.18], [0.3, 0, 0.45, 0.16]]) {
      ctx.beginPath();
      ctx.moveTo(x + 2, y - h * bx);
      ctx.lineTo(x + h * ex, y - h * (bx + ey));
      ctx.stroke();
    }
  }

  function jungleTree(ctx, x, base, top, tw, trunk, canopy, rnd) {
    ctx.fillStyle = trunk;
    ctx.beginPath();
    ctx.moveTo(x - tw / 2, base);
    ctx.lineTo(x - tw * 0.3, top);
    ctx.lineTo(x + tw * 0.3, top);
    ctx.lineTo(x + tw / 2, base);
    ctx.fill();
    ctx.fillStyle = canopy;
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.arc(x + (rnd() - 0.5) * 220, top + (rnd() - 0.5) * 60, 50 + rnd() * 50, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function frond(ctx, x, y, len, ang, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, -len * 0.2, len, 0);
    ctx.quadraticCurveTo(len * 0.5, len * 0.1, 0, 0);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len * 0.95, -1);
    ctx.stroke();
    ctx.restore();
  }

  function volcano(ctx, cx, base, w, h) {
    ctx.fillStyle = safeLinearGrad(ctx, 0, base - h, 0, base, [[0, "#2a1212"], [1, "#0e0505"]]);
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, base);
    ctx.lineTo(cx - w * 0.07, base - h);
    ctx.lineTo(cx + w * 0.07, base - h);
    ctx.lineTo(cx + w / 2, base);
    ctx.fill();
    ctx.shadowColor = "#ff6a1a";
    ctx.shadowBlur = 24;
    ctx.fillStyle = "#ff9a2a";
    ctx.beginPath();
    ctx.ellipse(cx, base - h, w * 0.07, h * 0.03, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ff7a1a";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    for (const dx of [-0.04, 0.0, 0.05]) { // lava streams
      ctx.beginPath();
      let px = cx + w * dx, py = base - h;
      ctx.moveTo(px, py);
      for (let i = 0; i < 6; i++) {
        px += (i % 2 ? 1 : -1) * w * 0.02 + dx * w * 0.1;
        py += h * 0.14;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(40,24,24,0.5)"; // smoke plume
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.arc(cx + Math.sin(i * 1.3) * 40 + i * 14, base - h - 30 - i * 38, 36 + i * 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function aurora(ctx, w, y0, k, c0, c1) {
    const g = safeLinearGrad(ctx, 0, y0 - 80, 0, y0 + 260, [[0, rgba(c0, 0)], [0.35, rgba(c0, 0.55)], [0.7, rgba(c1, 0.25)], [1, rgba(c1, 0)]]);
    ctx.fillStyle = g;
    ctx.beginPath();
    const top = (x) => y0 + Math.sin(x * 0.004 + k) * 55 + Math.sin(x * 0.011 + k * 2) * 22;
    ctx.moveTo(0, top(0));
    for (let x = 0; x <= w; x += 16) ctx.lineTo(x, top(x));
    for (let x = w; x >= 0; x -= 16) ctx.lineTo(x, top(x) + 190 + Math.sin(x * 0.01 + k) * 40);
    ctx.closePath();
    ctx.fill();
  }

  // ── backgrounds (drawn once into a cached canvas) ───────────────
  function bgMoonlit(ctx, w, h, rnd) {
    fillSky(ctx, w, h, [[0, "#070816"], [0.45, "#1a1245"], [0.75, "#4a1d6b"], [1, "#a8326b"]]);
    drawStars(ctx, w, h * 0.6, rnd, 140);
    glowOrb(ctx, w * 0.78, h * 0.24, 78, "#fffaf0", "#e4c8f0", "#ffe1ff", 0.35);
    ctx.fillStyle = "rgba(160,120,190,0.25)";
    for (const [cx, cy, cr] of [[-22, -12, 14], [18, 20, 10], [26, -22, 7], [-8, 30, 8]]) {
      ctx.beginPath();
      ctx.arc(w * 0.78 + cx, h * 0.24 + cy, cr, 0, Math.PI * 2);
      ctx.fill();
    }
    ridge(ctx, w, h, h * 0.70, 120, 40, "#3a1d63", 0.6);
    ridge(ctx, w, h, h * 0.78, 100, 36, "#2a1450", 2.1);
    ridge(ctx, w, h, h * 0.86, 70, 32, "#1a0d38", 4.0);
    for (let i = 0; i < 60; i++) {
      ctx.globalAlpha = 0.3 + rnd() * 0.5;
      ctx.fillStyle = rnd() < 0.5 ? "#ffd479" : "#7fd8ff";
      ctx.fillRect(rnd() * w, h * (0.82 + rnd() * 0.14), 3, 3);
    }
    ctx.globalAlpha = 1;
    fogBand(ctx, w, h * 0.72, h, "#ff78c8", 0.28);
    vignette(ctx, w, h, 0.55);
  }

  function bgMushroom(ctx, w, h, rnd) {
    fillSky(ctx, w, h, [[0, "#061126"], [0.5, "#1d1458"], [0.8, "#5a1f8a"], [1, "#c24fa8"]]);
    drawStars(ctx, w, h * 0.5, rnd, 80, "#d8f0ff");
    glowOrb(ctx, w * 0.18, h * 0.2, 34, "#e8fff4", "#8fffd0", "#5dffb0", 0.3);
    glowOrb(ctx, w * 0.82, h * 0.3, 54, "#fff0fb", "#ffb0ec", "#ff6bd6", 0.28);
    ridge(ctx, w, h, h * 0.72, 90, 40, "#3a1f6b", 1.2);
    const far = [["#3b3a9a", "#2a2a70", "#6a6aff"], ["#7a2a9a", "#3a2060", "#c26bff"], ["#2a7a8a", "#203a60", "#5dffe0"]];
    for (let i = 0; i < 8; i++) {
      const c = far[i % 3];
      mushroom(ctx, (i + 0.2 + rnd() * 0.6) * w / 8, h * 0.8, 110 + rnd() * 80, 90 + rnd() * 60, c[0], c[1], c[2], 0.8);
    }
    ridge(ctx, w, h, h * 0.84, 60, 34, "#2a1450", 3.3);
    mushroom(ctx, w * 0.07, h * 0.97, 340, 270, "#c23aa8", "#6a3a8a", "#ff6bd6");
    mushroom(ctx, w * 0.94, h * 0.98, 390, 310, "#2fb8c8", "#3a4a8a", "#5dffe0");
    mushroom(ctx, w * 0.2, h * 0.99, 130, 100, "#e0a030", "#6a4a6a", "#ffd36b");
    fogBand(ctx, w, h * 0.7, h, "#5dffd0", 0.22);
    vignette(ctx, w, h, 0.5);
  }

  function bgDesert(ctx, w, h, rnd) {
    fillSky(ctx, w, h, [[0, "#27386e"], [0.35, "#c0505a"], [0.65, "#f39a52"], [1, "#ffe0a0"]]);
    drawStars(ctx, w, h * 0.3, rnd, 30);
    glowOrb(ctx, w * 0.3, h * 0.44, 72, "#fffbe0", "#ffd36b", "#ffb050", 0.5);
    mesa(ctx, w * 0.02, h * 0.78, 320, 210, "#9a4a54");
    mesa(ctx, w * 0.58, h * 0.78, 400, 250, "#9a4a54");
    ridge(ctx, w, h, h * 0.8, 50, 40, "#c4683f", 0.8);
    mesa(ctx, w * 0.78, h * 0.86, 330, 180, "#7a3418");
    mesa(ctx, -40, h * 0.9, 260, 150, "#6a2c14");
    ridge(ctx, w, h, h * 0.88, 55, 36, "#a84f2c", 2.4);
    saguaro(ctx, w * 0.1, h * 0.93, 150, "#3a1a0c");
    saguaro(ctx, w * 0.9, h * 0.94, 190, "#3a1a0c");
    saguaro(ctx, w * 0.17, h * 0.95, 90, "#4a2210");
    ridge(ctx, w, h, h * 0.95, 30, 32, "#7a3418", 5.1);
    fogBand(ctx, w, h * 0.6, h, "#ffd9a0", 0.3);
    vignette(ctx, w, h, 0.4);
  }

  function bgCastle(ctx, w, h, rnd) {
    fillSky(ctx, w, h, [[0, "#080b10"], [0.5, "#16222a"], [0.8, "#2e4540"], [1, "#4a5e54"]]);
    drawStars(ctx, w, h * 0.5, rnd, 50, "#cfe0d8");
    glowOrb(ctx, w * 0.72, h * 0.2, 60, "#eef5e8", "#c0d0c0", "#9fd0b0", 0.25);
    ctx.fillStyle = "rgba(14,22,28,0.6)"; // drifting clouds
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.ellipse(w * (0.45 + rnd() * 0.5), h * (0.12 + rnd() * 0.14), 120 + rnd() * 120, 18 + rnd() * 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ridge(ctx, w, h, h * 0.76, 90, 40, "#18262a", 0.9);
    castle(ctx, w * 0.62, h * 0.8, 1.15, "#0d1416", "rgba(255,185,90,0.8)");
    ridge(ctx, w, h, h * 0.86, 60, 34, "#0f191b", 2.7);
    deadTree(ctx, w * 0.08, h * 0.95, 260, "#080d0e");
    deadTree(ctx, w * 0.93, h * 0.96, 300, "#080d0e");
    deadTree(ctx, w * 0.2, h * 0.97, 160, "#0a1012");
    ctx.strokeStyle = "#05090a"; // bats
    ctx.lineWidth = 3;
    for (const [bx, by] of [[0.3, 0.2], [0.36, 0.26], [0.5, 0.14], [0.88, 0.4]]) {
      ctx.beginPath();
      ctx.moveTo(w * bx - 14, h * by);
      ctx.quadraticCurveTo(w * bx - 6, h * by - 10, w * bx, h * by);
      ctx.quadraticCurveTo(w * bx + 6, h * by - 10, w * bx + 14, h * by);
      ctx.stroke();
    }
    fogBand(ctx, w, h * 0.68, h, "#9fc0b0", 0.34);
    vignette(ctx, w, h, 0.62);
  }

  function bgJungle(ctx, w, h, rnd) {
    fillSky(ctx, w, h, [[0, "#06281f"], [0.5, "#16603f"], [0.8, "#5fb858"], [1, "#d4ec8a"]]);
    for (let i = 0; i < 6; i++) { // light shafts
      const x0 = w * (0.1 + i * 0.16), x1 = x0 - 120 + rnd() * 60;
      ctx.fillStyle = safeLinearGrad(ctx, 0, 0, 0, h * 0.9, [[0, "rgba(255,255,200,0.22)"], [1, "rgba(255,255,200,0)"]]);
      ctx.beginPath();
      ctx.moveTo(x0, 0);
      ctx.lineTo(x0 + 70, 0);
      ctx.lineTo(x1 + 190, h * 0.9);
      ctx.lineTo(x1, h * 0.9);
      ctx.fill();
    }
    ridge(ctx, w, h, h * 0.74, 90, 40, "#1d6a48", 1.7);
    for (let i = 0; i < 6; i++) jungleTree(ctx, (i + 0.4) * w / 6, h * 0.86, h * (0.3 + rnd() * 0.12), 30, "#165a3a", "#237a50", rnd);
    ridge(ctx, w, h, h * 0.86, 55, 34, "#0f4a2e", 3.2);
    jungleTree(ctx, w * 0.06, h * 1.0, h * 0.2, 80, "#0b2e1c", "#0f4a2a", rnd);
    jungleTree(ctx, w * 0.95, h * 1.0, h * 0.16, 90, "#0b2e1c", "#0f4a2a", rnd);
    ctx.lineCap = "round";
    for (let i = 0; i < 16; i++) { // hanging vines
      const x = rnd() * w, len = 90 + rnd() * 220, sw = (rnd() - 0.5) * 50;
      ctx.strokeStyle = "#1f7a3a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + sw, len * 0.3, x - sw, len * 0.7, x + sw * 0.5, len);
      ctx.stroke();
      ctx.fillStyle = "#3aa04a";
      ctx.beginPath();
      ctx.ellipse(x + sw * 0.5, len, 7, 12, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 7; i++) {
      frond(ctx, w * 0.02, h * 1.0, 260, -0.2 - i * 0.2, "#0f5a2e");
      frond(ctx, w * 0.98, h * 1.0, 260, Math.PI + 0.2 + i * 0.2, "#0f5a2e");
    }
    fogBand(ctx, w, h * 0.65, h, "#d4ffb0", 0.3);
    vignette(ctx, w, h, 0.5);
  }

  function bgVolcano(ctx, w, h, rnd) {
    fillSky(ctx, w, h, [[0, "#120406"], [0.45, "#4a0d0d"], [0.75, "#a8280e"], [1, "#ff7a1a"]]);
    drawStars(ctx, w, h * 0.3, rnd, 25, "#ffb08a");
    glowOrb(ctx, w * 0.82, h * 0.2, 44, "#ffd0a0", "#ff6a3a", "#ff4a1a", 0.35);
    ridge(ctx, w, h, h * 0.78, 100, 36, "#3a0f0a", 0.4);
    volcano(ctx, w * 0.3, h * 0.88, 760, 440);
    ridge(ctx, w, h, h * 0.9, 70, 30, "#1a0808", 2.9);
    ctx.fillStyle = safeLinearGrad(ctx, 0, h * 0.93, 0, h, [[0, "#ff7a1a"], [1, "#ffd06a"]]); // lava river glow
    ctx.shadowColor = "#ff6a1a";
    ctx.shadowBlur = 30;
    ctx.fillRect(0, h * 0.96, w, h * 0.04);
    ctx.shadowBlur = 0;
    for (let i = 0; i < 9; i++) { // black spires
      const x = rnd() * w, sh = 70 + rnd() * 160;
      ctx.fillStyle = "#0c0404";
      ctx.beginPath();
      ctx.moveTo(x - 22, h);
      ctx.lineTo(x, h - sh);
      ctx.lineTo(x + 22, h);
      ctx.fill();
    }
    fogBand(ctx, w, h * 0.7, h, "#ff5a1a", 0.3);
    vignette(ctx, w, h, 0.62);
  }

  function bgFrozen(ctx, w, h, rnd) {
    fillSky(ctx, w, h, [[0, "#03081a"], [0.5, "#0a1f4a"], [0.8, "#17406e"], [1, "#3a7fa8"]]);
    drawStars(ctx, w, h * 0.7, rnd, 170, "#e8f4ff");
    ctx.globalCompositeOperation = "lighter";
    aurora(ctx, w, h * 0.18, 0.5, "#3dffb0", "#5a6bff");
    aurora(ctx, w, h * 0.3, 2.4, "#b86bff", "#3dd6ff");
    aurora(ctx, w, h * 0.12, 4.4, "#5dffd0", "#7a5aff");
    ctx.globalCompositeOperation = "source-over";
    ridge(ctx, w, h, h * 0.72, 130, 40, "#8fb4d4", 0.9);
    ridge(ctx, w, h, h * 0.8, 100, 36, "#5d86ad", 2.5);
    ridge(ctx, w, h, h * 0.88, 70, 32, "#2f4e73", 4.2);
    for (let i = 0; i < 14; i++) pine(ctx, rnd() * w, h * (0.9 + rnd() * 0.08), 80 + rnd() * 110, "#0e2540");
    fogBand(ctx, w, h * 0.72, h, "#bfe8ff", 0.3);
    vignette(ctx, w, h, 0.5);
  }

  function bgNeon(ctx, w, h, rnd) {
    fillSky(ctx, w, h, [[0, "#0a0020"], [0.45, "#2a0a5e"], [0.75, "#7a1fa2"], [1, "#ff4fa0"]]);
    drawStars(ctx, w, h * 0.4, rnd, 60);
    const sx = w * 0.5, sy = h * 0.42, sr = 140;
    ctx.fillStyle = safeRadialGrad(ctx, sx, sy, sr * 0.6, sx, sy, sr * 2.4, [[0, "rgba(255,80,200,0.4)"], [1, "rgba(255,80,200,0)"]]);
    ctx.fillRect(sx - sr * 2.4, sy - sr * 2.4, sr * 4.8, sr * 4.8);
    ctx.save(); // retro striped sun
    ctx.beginPath();
    ctx.rect(sx - sr, sy - sr, sr * 2, sr);
    for (let j = 0; j < 6; j++) ctx.rect(sx - sr, sy + j * sr * 0.17, sr * 2, sr * (0.15 - j * 0.02));
    ctx.clip();
    ctx.fillStyle = safeLinearGrad(ctx, 0, sy - sr, 0, sy + sr, [[0, "#ffe66a"], [1, "#ff3fb0"]]);
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const layers = [["#2a1450", 0.55, 90], ["#1a0c3a", 0.66, 140], ["#0e0624", 0.78, 190]];
    layers.forEach(([col, baseF, maxH], li) => {
      const base = h * (baseF + 0.28);
      for (let x = -20; x < w; ) {
        const bw = 36 + rnd() * 64, bh = 50 + rnd() * maxH * 1.6;
        ctx.fillStyle = col;
        ctx.fillRect(x, base - bh, bw, bh + 40);
        if (li === 2 && rnd() < 0.4) { // neon roof line
          ctx.fillStyle = rnd() < 0.5 ? "#3ff0ff" : "#ff3fb0";
          ctx.shadowColor = ctx.fillStyle;
          ctx.shadowBlur = 10;
          ctx.fillRect(x, base - bh, bw, 2);
          ctx.shadowBlur = 0;
        }
        for (let wy = base - bh + 8; wy < base - 10; wy += 11) {
          for (let wx = x + 6; wx < x + bw - 6; wx += 9) {
            if (rnd() < 0.3) {
              ctx.globalAlpha = 0.4 + rnd() * 0.5;
              ctx.fillStyle = ["#ffd479", "#3ff0ff", "#ff7ad0"][(rnd() * 3) | 0];
              ctx.fillRect(wx, wy, 4, 5);
            }
          }
        }
        ctx.globalAlpha = 1;
        x += bw + 2 + rnd() * 6;
      }
    });
    ctx.strokeStyle = "rgba(255,63,176,0.4)"; // perspective grid floor
    ctx.lineWidth = 1.5;
    const gy = h * 0.92;
    for (let i = -24; i <= 24; i++) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + i * 26, gy);
      ctx.lineTo(w / 2 + i * 150, h);
      ctx.stroke();
    }
    for (let k = 0; k < 5; k++) {
      const y = gy + (h - gy) * (k / 5) * (k / 5 + 0.3);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    fogBand(ctx, w, h * 0.7, h, "#ff4fa0", 0.25);
    vignette(ctx, w, h, 0.55);
  }

  // ── theme table: background + platform look + floating particles ─
  const THEMES = [
    {
      name: "Moonlit Peaks", accent: "#c9a8ff", bg: bgMoonlit,
      ambient: { kind: "firefly", color: "#c9a8ff", count: 26 },
      stage: { face: ["#6a5f94", "#4b4272", "#2c2548"], under: ["#2a2140", "#0d0a1a"], rim: ["#43e0ff", "#b86bff"], glow: "#7fd8ff",
        seam: "bricks", seamColor: "rgba(10,6,25,0.45)", decor: "crystals", decorCols: ["#7fd8ff", "#b86bff"], top: "none" },
      float: { kind: "tech", body: ["#8aa4d8", "#3a4d7a"], edge: "#d9f4ff", glow: "#7fe0ff", accent: ["#7fe0ff", "#b86bff"] },
    },
    {
      name: "Mushroom Island", accent: "#5dffb0", bg: bgMushroom,
      ambient: { kind: "spore", color: "#9dffd8", count: 46 },
      stage: { face: ["#5a3a7a", "#3e2760", "#251440"], under: ["#2a1a4a", "#0c0820"], rim: ["#5dffb0", "#2fd0ff"], glow: "#5dffb0",
        seam: "strata", seamColor: "rgba(10,4,30,0.4)", decor: "roots", decorCols: ["#5dffb0", "#ff6bd6"], top: "mushrooms" },
      float: { kind: "cap", glow: "#ff6bd6", stem: "#e8d8ff", gill: "#ffd6f2",
        variants: [["#ff6bd6", "#a02a8a"], ["#5dd6ff", "#2a6aa0"], ["#ffb85d", "#b0602a"]] },
    },
    {
      name: "Desert Valley", accent: "#ffd089", bg: bgDesert,
      ambient: { kind: "dust", color: "#ffe0a8", count: 40 },
      stage: { face: ["#d9a066", "#b87a45", "#8a5530"], under: ["#8a5530", "#3a2214"], rim: ["#ffe0a0", "#ffbf6b"], glow: "#ffd089",
        seam: "strata", seamColor: "rgba(80,40,15,0.38)", decor: "spikes", decorCols: ["#8a5530", "#6a3c20"], top: "cactus" },
      float: { kind: "stone", body: ["#e0b078", "#a8703d"], edge: "#ffe8b8", glow: "#ffd089", crack: "rgba(80,40,15,0.5)" },
    },
    {
      name: "Abandoned Castle", accent: "#9fd0b0", bg: bgCastle,
      ambient: { kind: "firefly", color: "#bfe8c8", count: 20 },
      stage: { face: ["#6f7a78", "#4c5654", "#2c3433"], under: ["#2c3433", "#0c1010"], rim: ["#aebfb6", "#7a8f84"], glow: "#9fd0b0",
        seam: "bricks", seamColor: "rgba(8,14,14,0.5)", decor: "banners", decorCols: ["#6a1f2a", "#3a4a6a"], top: "moss" },
      float: { kind: "stone", body: ["#7a8684", "#434d4b"], edge: "#aebfb6", glow: "#9fd0b0", crack: "rgba(8,14,14,0.55)", moss: "#5c7a4a" },
    },
    {
      name: "Deep Jungle", accent: "#8fff6a", bg: bgJungle,
      ambient: { kind: "firefly", color: "#d8ff7a", count: 40 },
      stage: { face: ["#6b4a2a", "#4a3019", "#2c1c0e"], under: ["#3a2412", "#120a04"], rim: ["#7fe05a", "#38b04a"], glow: "#8fff6a",
        seam: "planks", seamColor: "rgba(20,10,0,0.45)", decor: "roots", decorCols: ["#38b04a", "#ffd36b"], top: "grass" },
      float: { kind: "log", body: ["#8a5a2a", "#4f3015"], edge: "#c0904a", glow: "#8fff6a", leaf: "#4ac04a" },
    },
    {
      name: "Volcanic Forge", accent: "#ff9a2a", bg: bgVolcano,
      ambient: { kind: "ember", color: "#ffa040", count: 50 },
      stage: { face: ["#4a3a3a", "#2c2222", "#160f0f"], under: ["#2a1414", "#0a0404"], rim: ["#ff9a2a", "#ff4a1a"], glow: "#ff7a1a",
        seam: "lava", seamColor: "#ff7a1a", decor: "drips", decorCols: ["#ff7a1a", "#ffd06a"], top: "none" },
      float: { kind: "obsidian", body: ["#4a3a44", "#1a1218"], edge: "#ff9a2a", glow: "#ff6a1a" },
    },
    {
      name: "Frozen Aurora", accent: "#bfeaff", bg: bgFrozen,
      ambient: { kind: "snow", color: "#ffffff", count: 60 },
      stage: { face: ["#bfe3f5", "#8fc0de", "#5a8db3"], under: ["#6aa0c8", "#1a3a5a"], rim: ["#ffffff", "#bfeaff"], glow: "#bfeaff",
        seam: "glint", seamColor: "rgba(255,255,255,0.4)", decor: "spikes", decorCols: ["#d8f4ff", "#9fd0f0"], spikeGlow: true, top: "snow" },
      float: { kind: "ice", body: ["#d8f4ff", "#7fb8e0"], edge: "#ffffff", glow: "#bfeaff" },
    },
    {
      name: "Neon City", accent: "#ff3fb0", bg: bgNeon,
      ambient: { kind: "rain", color: "#7fe8ff", count: 60 },
      stage: { face: ["#2a2250", "#1a1438", "#0f0a24"], under: ["#1a1438", "#05030f"], rim: ["#ff3fb0", "#3ff0ff"], glow: "#ff3fb0",
        seam: "panel", seamColor: "rgba(63,240,255,0.5)", decor: "spikes", decorCols: ["#ff3fb0", "#3ff0ff"], spikeGlow: true, top: "none" },
      float: { kind: "tech", body: ["#3a2f7a", "#1a1440"], edge: "#ff3fb0", glow: "#ff3fb0", accent: ["#3ff0ff", "#ff3fb0"] },
    },
  ];

  // ── platform drawing (themed) ───────────────────────────────────
  function drawStage(ctx, p, st) {
    const rx = p.x, ry = p.y, w = p.w, h = p.h;

    ctx.fillStyle = safeLinearGrad(ctx, 0, ry + h, 0, ry + h + 150, [[0, st.under[0]], [1, st.under[1]]]);
    ctx.beginPath(); // tapered rock underside
    ctx.moveTo(rx + 6, ry + h - 2);
    ctx.lineTo(rx + w - 6, ry + h - 2);
    ctx.lineTo(rx + w - 90, ry + h + 60);
    ctx.lineTo(rx + w - 200, ry + h + 120);
    ctx.lineTo(rx + w / 2 + 40, ry + h + 150);
    ctx.lineTo(rx + w / 2 - 30, ry + h + 110);
    ctx.lineTo(rx + 200, ry + h + 125);
    ctx.lineTo(rx + 90, ry + h + 55);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = safeRadialGrad(ctx, rx + w / 2, ry + h + 20, 10, rx + w / 2, ry + h + 20, w * 0.55,
      [[0, rgba(st.glow, 0.22)], [1, rgba(st.glow, 0)]]);
    ctx.fillRect(rx - 100, ry + h - 20, w + 200, 200);

    ctx.fillStyle = safeLinearGrad(ctx, 0, ry, 0, ry + h, [[0, st.face[0]], [0.35, st.face[1]], [1, st.face[2]]]);
    roundRect(ctx, rx, ry, w, h, 8);
    ctx.fill();

    // surface pattern
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = st.seamColor;
    if (st.seam === "bricks") {
      for (let x = rx + 40; x < rx + w - 10; x += 40) { ctx.beginPath(); ctx.moveTo(x, ry + 6); ctx.lineTo(x, ry + h - 2); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(rx + 4, ry + h * 0.55); ctx.lineTo(rx + w - 4, ry + h * 0.55); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      for (let x = rx + 20; x < rx + w - 10; x += 40) { ctx.beginPath(); ctx.arc(x, ry + h * 0.78, 1.8, 0, Math.PI * 2); ctx.fill(); }
    } else if (st.seam === "strata") {
      for (const t of [0.34, 0.58, 0.8]) { ctx.beginPath(); ctx.moveTo(rx + 4, ry + h * t); ctx.lineTo(rx + w - 4, ry + h * t); ctx.stroke(); }
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      for (let x = rx + 25; x < rx + w - 10; x += 55) { ctx.beginPath(); ctx.arc(x, ry + h * 0.45, 1.6, 0, Math.PI * 2); ctx.fill(); }
    } else if (st.seam === "planks") {
      for (let x = rx + 60; x < rx + w - 10; x += 60) { ctx.beginPath(); ctx.moveTo(x, ry + 4); ctx.lineTo(x, ry + h - 2); ctx.stroke(); }
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      for (let x = rx + 30; x < rx + w - 10; x += 120) { ctx.beginPath(); ctx.ellipse(x, ry + h * 0.6, 4, 3, 0, 0, Math.PI * 2); ctx.fill(); }
    } else if (st.seam === "lava") {
      ctx.strokeStyle = "#ff7a1a";
      ctx.shadowColor = "#ff7a1a";
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rx + 8, ry + h * 0.6);
      for (let x = rx + 30, i = 0; x < rx + w - 8; x += 30, i++) ctx.lineTo(x, ry + h * (i % 2 ? 0.4 : 0.8));
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (st.seam === "glint") {
      for (let x = rx + 30; x < rx + w - 20; x += 70) { ctx.beginPath(); ctx.moveTo(x, ry + h - 4); ctx.lineTo(x + 14, ry + 4); ctx.stroke(); }
    } else if (st.seam === "panel") {
      for (let x = rx + 50; x < rx + w - 10; x += 50) { ctx.beginPath(); ctx.moveTo(x, ry + 4); ctx.lineTo(x, ry + h - 2); ctx.stroke(); }
      ctx.fillStyle = "#3ff0ff";
      for (let x = rx + 25; x < rx + w - 10; x += 50) { ctx.beginPath(); ctx.arc(x, ry + h * 0.65, 1.6, 0, Math.PI * 2); ctx.fill(); }
    }

    // glowing top rim + end caps
    ctx.fillStyle = safeLinearGrad(ctx, rx, 0, rx + w, 0, [[0, st.rim[0]], [0.5, st.rim[1]], [1, st.rim[0]]]);
    ctx.shadowColor = st.glow;
    ctx.shadowBlur = 14;
    roundRect(ctx, rx, ry - 1, w, 6, 3);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.8;
    for (const ex of [rx + 4, rx + w - 4]) { ctx.beginPath(); ctx.arc(ex, ry + 2, 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;

    // things growing on top
    const topAt = (fr) => rx + w * fr;
    if (st.top === "mushrooms") {
      mushroom(ctx, topAt(0.09), ry + 1, 24, 30, "#ff6bd6", "#e8d8ff", "#ff6bd6");
      mushroom(ctx, topAt(0.15), ry + 1, 14, 18, "#5dffb0", "#e8d8ff", "#5dffb0");
      mushroom(ctx, topAt(0.91), ry + 1, 28, 34, "#5dd6ff", "#e8d8ff", "#5dd6ff");
      mushroom(ctx, topAt(0.86), ry + 1, 15, 18, "#ffb85d", "#e8d8ff", "#ffb85d");
    } else if (st.top === "cactus") {
      saguaro(ctx, topAt(0.07), ry + 1, 44, "#3f7a4a");
      saguaro(ctx, topAt(0.94), ry + 1, 34, "#3f7a4a");
    } else if (st.top === "moss") {
      ctx.fillStyle = "#5c7a4a";
      for (let x = rx + 10, i = 0; x < rx + w - 10; x += 22, i++) {
        if ((i * 7) % 5 < 2) continue;
        ctx.beginPath(); ctx.ellipse(x, ry + 1, 12 + (i % 3) * 3, 4, 0, Math.PI, 0); ctx.fill();
      }
    } else if (st.top === "grass") {
      ctx.strokeStyle = "#4cc04a";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      for (let x = rx + 6, i = 0; x < rx + w - 6; x += 7, i++) {
        const gh = 6 + ((i * 13) % 7);
        ctx.beginPath(); ctx.moveTo(x, ry + 3); ctx.lineTo(x + ((i % 3) - 1) * 3, ry - gh); ctx.stroke();
      }
    } else if (st.top === "snow") {
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      for (let x = rx + 12, i = 0; x < rx + w - 12; x += 26, i++) {
        ctx.beginPath(); ctx.ellipse(x, ry, 18 + (i % 3) * 4, 5 + (i % 2) * 2, 0, Math.PI, 0); ctx.fill();
      }
    }

    // things hanging underneath
    const cols = st.decorCols, by = ry + h;
    if (st.decor === "crystals") {
      [[0.12, 34], [0.3, 22], [0.66, 28], [0.88, 38]].forEach(([t, len], i) => {
        const cx = rx + w * t, cy = by + 22, col = cols[i % cols.length];
        ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 12; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.moveTo(cx - 7, cy); ctx.lineTo(cx + 7, cy); ctx.lineTo(cx, cy + len); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      });
    } else if (st.decor === "roots") {
      ctx.lineCap = "round";
      [0.1, 0.27, 0.5, 0.73, 0.9].forEach((t, i) => {
        const x = rx + w * t, len = 40 + (i * 23) % 50, sw = (i % 2 ? 1 : -1) * 14;
        ctx.strokeStyle = cols[0]; ctx.lineWidth = 3; ctx.shadowColor = cols[0]; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.moveTo(x, by); ctx.bezierCurveTo(x + sw, by + len * 0.3, x - sw, by + len * 0.7, x + sw * 0.4, by + len); ctx.stroke();
        ctx.fillStyle = cols[1]; ctx.shadowColor = cols[1];
        ctx.beginPath(); ctx.arc(x + sw * 0.4, by + len, 4, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      });
    } else if (st.decor === "spikes") {
      for (let x = rx + 40, i = 0; x < rx + w - 30; x += 52, i++) {
        const len = 22 + (i * 17) % 30, col = cols[i % cols.length];
        ctx.fillStyle = col;
        if (st.spikeGlow) { ctx.shadowColor = col; ctx.shadowBlur = 10; }
        ctx.beginPath(); ctx.moveTo(x - 6, by - 2); ctx.lineTo(x + 6, by - 2); ctx.lineTo(x, by + len); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
      }
    } else if (st.decor === "drips") {
      ctx.lineCap = "round";
      [0.15, 0.4, 0.62, 0.85].forEach((t, i) => {
        const x = rx + w * t, len = 30 + (i * 19) % 40;
        ctx.strokeStyle = cols[0]; ctx.lineWidth = 4; ctx.shadowColor = cols[0]; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x, by + len); ctx.stroke();
        ctx.fillStyle = cols[1];
        ctx.beginPath(); ctx.arc(x, by + len + 3, 5, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      });
    } else if (st.decor === "banners") {
      [0.2, 0.55, 0.82].forEach((t, i) => {
        const x = rx + w * t, len = 54 + i * 8;
        ctx.fillStyle = cols[i % cols.length]; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.moveTo(x - 11, by); ctx.lineTo(x + 11, by); ctx.lineTo(x + 11, by + len);
        ctx.lineTo(x + 4, by + len - 10); ctx.lineTo(x - 2, by + len); ctx.lineTo(x - 11, by + len - 8); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      });
    }
  }

  const FLOATERS = {
    tech(ctx, p, fl) {
      const { x, y, w, h } = p;
      ctx.fillStyle = safeLinearGrad(ctx, 0, y, 0, y + h + 6, [[0, fl.body[0]], [1, fl.body[1]]]);
      roundRect(ctx, x, y, w, h + 4, 6); ctx.fill();
      ctx.fillStyle = shadeColor(fl.body[1], -25);
      roundRect(ctx, x + w * 0.2, y + h, w * 0.6, 10, 5); ctx.fill();
      ctx.fillStyle = fl.edge; ctx.shadowColor = fl.glow; ctx.shadowBlur = 12;
      roundRect(ctx, x + 2, y - 1, w - 4, 3, 2); ctx.fill(); ctx.shadowBlur = 0;
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = fl.accent[i % 2];
        ctx.beginPath(); ctx.arc(x + w * (0.12 + 0.19 * i), y + h * 0.65, 1.8, 0, Math.PI * 2); ctx.fill();
      }
      for (const tx of [x + w * 0.22, x + w * 0.78]) {
        ctx.fillStyle = rgba(fl.glow, 0.65); ctx.shadowColor = fl.glow; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.moveTo(tx - 5, y + h + 10); ctx.lineTo(tx + 5, y + h + 10); ctx.lineTo(tx, y + h + 22); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
      }
    },
    cap(ctx, p, fl, i) {
      const { x, y, w, h } = p, v = fl.variants[i % fl.variants.length];
      ctx.fillStyle = fl.stem; // stem
      roundRect(ctx, x + w / 2 - 12, y + h + 6, 24, 38, 9); ctx.fill();
      ctx.fillStyle = fl.gill; // gills under the cap
      ctx.beginPath(); ctx.ellipse(x + w / 2, y + h + 4, w / 2 - 6, 9, 0, 0, Math.PI); ctx.fill();
      ctx.fillStyle = safeLinearGrad(ctx, 0, y, 0, y + h + 8, [[0, v[0]], [1, v[1]]]);
      ctx.shadowColor = v[0]; ctx.shadowBlur = 14;
      roundRect(ctx, x, y, w, h + 8, 10); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      roundRect(ctx, x + 8, y, w - 16, 3, 2); ctx.fill();
      for (let k = 0; k < 6; k++) {
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.beginPath(); ctx.arc(x + w * (0.12 + 0.15 * k), y + h * 0.55 + (k % 2) * 2, 2.2 + (k % 3) * 0.6, 0, Math.PI * 2); ctx.fill();
      }
    },
    stone(ctx, p, fl) {
      const { x, y, w, h } = p;
      ctx.fillStyle = shadeColor(fl.body[1], -20); // rocky underside
      ctx.beginPath(); ctx.moveTo(x + 12, y + h); ctx.lineTo(x + w - 12, y + h); ctx.lineTo(x + w * 0.62, y + h + 26);
      ctx.lineTo(x + w * 0.5, y + h + 16); ctx.lineTo(x + w * 0.38, y + h + 30); ctx.closePath(); ctx.fill();
      ctx.fillStyle = safeLinearGrad(ctx, 0, y, 0, y + h + 6, [[0, fl.body[0]], [1, fl.body[1]]]);
      roundRect(ctx, x, y, w, h + 6, 6); ctx.fill();
      ctx.strokeStyle = fl.crack; ctx.lineWidth = 1.6; // cracks
      ctx.beginPath(); ctx.moveTo(x + w * 0.3, y + 2); ctx.lineTo(x + w * 0.34, y + h * 0.6); ctx.lineTo(x + w * 0.3, y + h + 4);
      ctx.moveTo(x + w * 0.7, y + 2); ctx.lineTo(x + w * 0.66, y + h * 0.5); ctx.stroke();
      ctx.fillStyle = fl.edge; ctx.shadowColor = fl.glow; ctx.shadowBlur = 5;
      roundRect(ctx, x + 2, y - 1, w - 4, 3, 2); ctx.fill(); ctx.shadowBlur = 0;
      if (fl.moss) {
        ctx.fillStyle = fl.moss;
        for (const t of [0.12, 0.3, 0.55, 0.8]) { ctx.beginPath(); ctx.ellipse(x + w * t, y, 14, 4, 0, Math.PI, 0); ctx.fill(); }
        ctx.strokeStyle = fl.moss; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x + w * 0.2, y + h + 4); ctx.lineTo(x + w * 0.2, y + h + 20); ctx.moveTo(x + w * 0.78, y + h + 4); ctx.lineTo(x + w * 0.78, y + h + 28); ctx.stroke();
      }
    },
    log(ctx, p, fl) {
      const { x, y, w, h } = p, bh = h + 10;
      ctx.strokeStyle = fl.leaf; ctx.lineWidth = 2.5; ctx.lineCap = "round"; // hanging vines
      for (const t of [0.25, 0.7]) { ctx.beginPath(); ctx.moveTo(x + w * t, y + bh); ctx.bezierCurveTo(x + w * t + 8, y + bh + 14, x + w * t - 8, y + bh + 26, x + w * t + 3, y + bh + 38); ctx.stroke(); }
      ctx.fillStyle = safeLinearGrad(ctx, 0, y, 0, y + bh, [[0, fl.body[0]], [1, fl.body[1]]]);
      roundRect(ctx, x, y, w, bh, bh / 2); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1.5;
      for (const t of [0.35, 0.6, 0.82]) { ctx.beginPath(); ctx.moveTo(x + w * t, y + 6); ctx.lineTo(x + w * t - 10, y + bh - 4); ctx.stroke(); }
      ctx.fillStyle = fl.edge; // end rings
      for (const ex of [x + bh / 2, x + w - bh / 2]) {
        ctx.beginPath(); ctx.ellipse(ex, y + bh / 2, 5, bh / 2 - 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(ex, y + bh / 2, 2.5, bh / 4, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = fl.leaf; // leafy top
      roundRect(ctx, x + 10, y - 2, w - 20, 5, 3); ctx.fill();
      for (const t of [0.15, 0.4, 0.62, 0.85]) { ctx.beginPath(); ctx.ellipse(x + w * t, y - 3, 7, 4, t * 3, 0, Math.PI * 2); ctx.fill(); }
    },
    ice(ctx, p, fl) {
      const { x, y, w, h } = p;
      ctx.fillStyle = fl.body[0]; ctx.globalAlpha = 0.9;
      for (const t of [0.15, 0.35, 0.55, 0.78]) {
        const len = 14 + ((t * 100) % 3) * 8;
        ctx.beginPath(); ctx.moveTo(x + w * t - 6, y + h); ctx.lineTo(x + w * t + 6, y + h); ctx.lineTo(x + w * t, y + h + len); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = safeLinearGrad(ctx, 0, y, 0, y + h + 6, [[0, fl.body[0]], [1, fl.body[1]]]);
      ctx.shadowColor = fl.glow; ctx.shadowBlur = 10;
      roundRect(ctx, x, y, w, h + 5, 6); ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 2;
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x + w * (0.15 + k * 0.22), y + h); ctx.lineTo(x + w * (0.15 + k * 0.22) + 10, y + 3); ctx.stroke(); }
      ctx.fillStyle = fl.edge; roundRect(ctx, x + 2, y - 1, w - 4, 3, 2); ctx.fill();
    },
    obsidian(ctx, p, fl) {
      const { x, y, w, h } = p;
      ctx.fillStyle = "rgba(255,110,30,0.85)"; ctx.shadowColor = fl.glow; ctx.shadowBlur = 14; // lava underglow
      roundRect(ctx, x + 8, y + h, w - 16, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = safeLinearGrad(ctx, 0, y, 0, y + h + 4, [[0, fl.body[0]], [1, fl.body[1]]]);
      roundRect(ctx, x, y, w, h + 4, 5); ctx.fill();
      ctx.strokeStyle = "#ff7a1a"; ctx.lineWidth = 1.5; ctx.shadowColor = "#ff7a1a"; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.moveTo(x + w * 0.2, y + h + 2); ctx.lineTo(x + w * 0.27, y + h * 0.4); ctx.lineTo(x + w * 0.33, y + 4);
      ctx.moveTo(x + w * 0.7, y + h + 2); ctx.lineTo(x + w * 0.64, y + h * 0.5); ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = fl.edge; ctx.shadowColor = fl.glow; ctx.shadowBlur = 10;
      roundRect(ctx, x + 2, y - 1, w - 4, 3, 2); ctx.fill(); ctx.shadowBlur = 0;
    },
  };

  function drawFloat(ctx, p, fl, i) {
    ctx.fillStyle = safeRadialGrad(ctx, p.x + p.w / 2, p.y + p.h + 8, 4, p.x + p.w / 2, p.y + p.h + 8, p.w * 0.6,
      [[0, rgba(fl.glow, 0.26)], [1, rgba(fl.glow, 0)]]);
    ctx.fillRect(p.x - 40, p.y, p.w + 80, 70);
    FLOATERS[fl.kind](ctx, p, fl, i);
  }

  // ─── Renderer class ────────────────────────────────────────────
  class Renderer {
    constructor(canvas, arena) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.arena = arena;
      this.p2Label = "P2 DUMMY";
      this.paused = false;
      this.tapUlt = false;  // main.js sets this true on touch devices: P1 panel = ultimate button
      this.ultRect = null;  // P1 panel rect in canvas pixels (set every frame while tapUlt is on)
      this.helpText =
        "A/D move   W jump   S drop   J attack   U I O L skills   Y ultimate   P pause   R restart   M menu";
      const b = arena.blastZone;
      this.offsetX = -b.left;
      this.offsetY = -b.top;
      canvas.width = b.right - b.left;
      canvas.height = b.bottom - b.top;
      this.setTheme(0);
    }

    // New platform layout: the cached background has the platforms baked in, so rebuild it.
    setArena(arena) {
      this.arena = arena;
      this.bg = null;
    }

    // Pick a theme by index (or name) and rebuild its cached background.
    setTheme(i) {
      if (typeof i === "string") i = Math.max(0, THEMES.findIndex((t) => t.name === i));
      this.themeIndex = i;
      this.theme = THEMES[i];
      this.bg = null;
      this.bannerStart = Date.now();
      const rnd = mkRnd(99), W = this.canvas.width, H = this.canvas.height;
      this.amb = [];
      for (let k = 0; k < this.theme.ambient.count; k++) {
        this.amb.push({ x0: rnd() * W, y0: rnd() * H, sp: 0.5 + rnd(), ph: rnd() * 6.28, sz: 1 + rnd() * 2.2 });
      }
    }

    // A different random arena every time.
    randomTheme() {
      let i;
      do i = Math.floor(Math.random() * THEMES.length);
      while (THEMES.length > 1 && i === this.themeIndex);
      this.setTheme(i);
      return THEMES[i].name;
    }

    drawStatic(ctx) {
      const { width, height } = this.canvas;
      const T = this.theme;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      T.bg(ctx, width, height, mkRnd(11));

      // blast zone border with glow
      ctx.strokeStyle = "rgba(255,77,77,0.7)";
      ctx.lineWidth = 3;
      ctx.setLineDash([14, 10]);
      ctx.shadowColor = "#ff4d4d";
      ctx.shadowBlur = 8;
      ctx.strokeRect(1.5, 1.5, width - 3, height - 3);
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      ctx.translate(this.offsetX, this.offsetY);
      this.arena.platforms.forEach((p, i) => {
        if (p.oneWay) drawFloat(ctx, p, T.float, i);
        else drawStage(ctx, p, T.stage);
      });
    }

    // Live floating bits (spores, embers, snow...) drawn over the cached background.
    drawAmbient(ctx, w, h) {
      const a = this.theme.ambient, t = Date.now() / 1000;
      ctx.fillStyle = a.color;
      ctx.strokeStyle = a.color;
      ctx.lineWidth = 1.2;
      for (const p of this.amb) {
        let x = p.x0, y = p.y0, al = 0.6;
        if (a.kind === "spore") { y = mod(p.y0 - t * p.sp * 18, h); x = p.x0 + Math.sin(t * 0.8 + p.ph) * 20; al = 0.35 + 0.35 * Math.sin(t * 2 + p.ph); }
        else if (a.kind === "ember") { y = mod(p.y0 - t * p.sp * 45, h); x = p.x0 + Math.sin(t * 1.5 + p.ph) * 14; al = 0.5 + 0.4 * Math.sin(t * 6 + p.ph); }
        else if (a.kind === "snow") { y = mod(p.y0 + t * p.sp * 32, h); x = p.x0 + Math.sin(t * 0.7 + p.ph) * 25; al = 0.85; }
        else if (a.kind === "firefly") { x = p.x0 + Math.sin(t * 0.6 + p.ph) * 50; y = p.y0 + Math.cos(t * 0.5 + p.ph * 1.3) * 35; al = 0.45 + 0.45 * Math.sin(t * 3 + p.ph); }
        else if (a.kind === "dust") { x = mod(p.x0 + t * p.sp * 70, w); y = p.y0 + Math.sin(t + p.ph) * 6; al = 0.35; }
        else if (a.kind === "rain") {
          y = mod(p.y0 + t * p.sp * 520, h); x = mod(p.x0 - t * p.sp * 90, w);
          ctx.globalAlpha = 0.35;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 18); ctx.stroke();
          continue;
        }
        ctx.globalAlpha = Math.max(0, al);
        if (a.kind === "spore" || a.kind === "firefly" || a.kind === "ember") { ctx.shadowColor = a.color; ctx.shadowBlur = 8; }
        ctx.beginPath();
        ctx.arc(x, y, p.sz, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
    }

    draw(sim, alpha) {
      if (alpha === undefined) alpha = 1;
      const ctx = this.ctx;
      const { width, height } = this.canvas;
      this.ultRect = null; // set again below each frame; never leave a stale tap area behind

      // tick effects
      tickParticles();
      tickTrails();
      tickSkillFx();
      if (MW.MageFx || MW.AssassinFx || MW.BrawlerFx) {
        // sim events (fire / hit / fizzle / swing) -> effects
        if (!sim.fx) sim.fx = [];
        for (const ev of sim.fx) {
          if (MW.MageFx) MW.MageFx.event(ev);
          if (MW.AssassinFx) MW.AssassinFx.event(ev);
          if (MW.BrawlerFx) MW.BrawlerFx.event(ev);
          onSkillEvent(ev);
        }
        sim.fx.length = 0;
        if (MW.MageFx) MW.MageFx.tick();
        if (MW.AssassinFx) { MW.AssassinFx.update(sim); MW.AssassinFx.tick(); }
        if (MW.BrawlerFx) { MW.BrawlerFx.update(sim); MW.BrawlerFx.tick(); }
      }

      if (!this.bg && typeof document !== "undefined") {
        this.bg = document.createElement("canvas");
        this.bg.width = width;
        this.bg.height = height;
        this.drawStatic(this.bg.getContext("2d"));
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (this.bg) ctx.drawImage(this.bg, 0, 0);
      else this.drawStatic(ctx);
      if (this.amb) this.drawAmbient(ctx, width, height);

      const shx = shakeMag > 0 ? (Math.random() - 0.5) * 2 * shakeMag : 0;
      const shy = shakeMag > 0 ? (Math.random() - 0.5) * 2 * shakeMag : 0;
      ctx.setTransform(1, 0, 0, 1, this.offsetX + shx, this.offsetY + shy);
      drawDarken(ctx, this.offsetX + shx, this.offsetY + shy, width, height); // ultimate: dim the arena

      // trails (behind characters)
      drawTrails(ctx);
      if (MW.AssassinFx) MW.AssassinFx.drawBehind(ctx); // red dash ghosts
      if (MW.BrawlerFx) MW.BrawlerFx.drawBehind(ctx); // blue dash ghosts

      // fighters
      const S = MW.STATE;
      for (const f of sim.fighters) {
        const s = f.stats;
        ctx.save();
        ctx.translate((f.px - f.x) * (1 - alpha), (f.py - f.y) * (1 - alpha));
        const jt = MW.BrawlerFx && MW.BrawlerFx.jitter(f); // victim trembles during hit-stop
        if (jt) ctx.translate(jt[0], jt[1]);

        // check for hit bursts
        checkHitBurst(f);

        // cloaked / vanished Assassin (Phantom Decoy, Onslaught): body and HP bar are hidden from the opponent
        const cloaked = f.fade !== undefined && f.fade < 1;
        if (f.fade !== undefined && f.fade < 0.02) { ctx.restore(); continue; }
        // HP bar above head (nicer rounded version)
        if (cloaked) ctx.globalAlpha = 0;
        const bw = s.width + 24, bx = f.x + s.width / 2 - bw / 2, bY = f.y - 54;
        ctx.fillStyle = "#1a1e2a";
        roundRect(ctx, bx - 1, bY - 1, bw + 2, 9, 4);
        ctx.fill();
        const hpFrac = Math.max(0, f.hp / s.maxHP);
        const hpCol = hpFrac > 0.5 ? "#4cd964" : hpFrac > 0.25 ? "#ffcc00" : "#ff453a";
        ctx.fillStyle = hpCol;
        if (bw * hpFrac > 0) {
          roundRect(ctx, bx, bY, bw * hpFrac, 7, 3);
          ctx.fill();
        }

        drawMomentumPips(ctx, f, bY + 15);
        ctx.globalAlpha = 1;

        if (f.invuln > 0 && Math.floor(sim.tick / 4) % 2 === 0) {
          ctx.restore();
          continue;
        }

        ctx.globalAlpha = f.state === S.KO ? 0.5 : 1;
        const isFlash = f.flash > 0;

        const paintBody = (c) => {
          if (s.id === "assassin" && MW.AssassinFx) MW.AssassinFx.drawAura(c, f);
          if (s.id === "fighter" && MW.BrawlerFx) MW.BrawlerFx.drawAura(c, f); // flame aura replaces the static glow
          else drawMomentumAura(c, f);
          // draw the full character body
          drawCharacterBody(c, f, isFlash);
        };
        if (cloaked) drawFaded(ctx, f.fade, paintBody); // cloaked Assassin: the art resets alpha itself, so fade the finished picture
        else paintBody(ctx);

        // Iron Guard aura
        drawGuardAura(ctx, f);

        ctx.globalAlpha = 1;
        drawAttack(ctx, f, sim);
        if (s.id === "hitter" && f.gunnerBomb) {
          const b = f.gunnerBomb, pulse = 0.75 + 0.25 * Math.sin(sim.tick * 0.18);
          ctx.save(); ctx.shadowColor = "#ff7b24"; ctx.shadowBlur = 12 * pulse;
          ctx.fillStyle = "#ff8b24"; ctx.beginPath(); ctx.arc(b.x, b.y - 5, 8 * pulse, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#fff0c2"; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
        }
        if (s.id === "mage" && MW.MageFx) MW.MageFx.drawFighter(ctx, f);
        if (s.id === "fighter" && MW.BrawlerFx) MW.BrawlerFx.drawFighter(ctx, f);
        ctx.restore();
      }

      // particles (between characters and projectiles for depth)
      drawParticles(ctx);
      drawSkillFxWorld(ctx);
      if (MW.MageFx) MW.MageFx.draw(ctx);
      if (MW.AssassinFx) MW.AssassinFx.draw(ctx);
      if (MW.BrawlerFx) MW.BrawlerFx.draw(ctx);

      // projectiles
      for (const p of sim.projectiles) {
        drawProjectile(ctx, p, alpha);
      }

      // HUD (screen space)
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawSkillFxScreen(ctx, width, height);
      ctx.textBaseline = "top";
      const p1Rect = drawPanel(ctx, sim.fighters[0], 40, "P1", sim.kills[0], false, this.tapUlt);
      if (this.tapUlt) this.ultRect = p1Rect; // canvas-pixel coords; main.js hit-tests taps against this
      if (sim.fighters[1]) drawPanel(ctx, sim.fighters[1], width - 40 - PANEL_W, this.p2Label, sim.kills[1], true, false);

      drawBanner(ctx, width, height); // "METEOR BREAKER" title
      if (sim.koTimer > 0) {
        ctx.textAlign = "center";
        ctx.font = "bold 72px monospace";
        ctx.shadowColor = "#ffd479";
        ctx.shadowBlur = 20;
        ctx.fillStyle = "#ffd479";
        ctx.fillText("KO!", width / 2, height * 0.3);
        ctx.shadowBlur = 0;
        ctx.textAlign = "left";
      }
      ctx.font = "18px monospace";
      ctx.fillStyle = "rgba(220,228,255,0.6)";
      ctx.textAlign = "left";
      if (this.helpText) ctx.fillText(this.helpText, 20, height - 34);

      const bt = Date.now() - this.bannerStart; // arena name fades in/out at the start
      if (bt < 2800 && !this.paused) {
        ctx.globalAlpha = bt < 300 ? bt / 300 : bt > 2200 ? (2800 - bt) / 600 : 1;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "bold 40px monospace";
        ctx.shadowColor = this.theme.accent;
        ctx.shadowBlur = 18;
        ctx.fillStyle = "#fff";
        ctx.fillText(this.theme.name.toUpperCase(), width / 2, 150);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
      }

      if (this.paused) {
        ctx.fillStyle = "rgba(5,6,16,0.6)";
        ctx.fillRect(0, 0, width, height);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "bold 84px monospace";
        ctx.shadowColor = "#7fd8ff";
        ctx.shadowBlur = 24;
        ctx.fillStyle = "#fff";
        ctx.fillText("PAUSED", width / 2, height / 2 - 20);
        ctx.shadowBlur = 0;
        ctx.font = "22px monospace";
        ctx.fillStyle = "#b9c3e0";
        ctx.fillText("tap \u25B6 or press P to resume", width / 2, height / 2 + 50);
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
      }
    }
  }

  // The select screen reuses these for the character preview cards
  Renderer.drawLook = function(ctx, f) {
    // delegate to the full body drawer for select screen previews too
    drawCharacterBody(ctx, f, false);
  };
  Renderer.drawCharacterBody = drawCharacterBody;
  MW.Renderer = Renderer;
})(globalThis);