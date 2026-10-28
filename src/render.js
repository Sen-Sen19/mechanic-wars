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

  // ─── character body drawing ─────────────────────────────────────
  // Art lives in character_art.js (procedural IK rig). Dust / jump rings go through the shared particles.
  const artFx = { spawn: spawnParticle };
  function drawCharacterBody(ctx, f, isFlash) {
    MW.CharacterArt.draw(ctx, f, isFlash, artFx);
  }

  // ─── attack effects drawing ─────────────────────────────────────
  function drawAttack(ctx, f, sim) {
    const S = MW.STATE;
    if (!f.hit) return;
    const s = f.stats;
    const cx = f.x + s.width / 2;
    const cy = f.y + s.height * 0.45;

    if (f.state === S.ATTACK_STARTUP) {
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
      if (f.hit.type === "melee") {
        const box = f.meleeBox();
        // animated slash arc
        const [r, g, b] = hexToRgb(s.color);
        // outer glow
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 16;
        ctx.strokeStyle = "rgba(" + r + "," + g + "," + b + ",0.7)";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";

        // slash sweep arc
        const arcCx = f.facing > 0 ? box.x : box.x + box.w;
        const arcCy = box.y + box.h / 2;
        const arcR = box.w * 0.9;
        const startAng = f.facing > 0 ? -0.7 : Math.PI - 0.7;
        const endAng = f.facing > 0 ? 0.7 : Math.PI + 0.7;
        ctx.beginPath();
        ctx.arc(arcCx, arcCy, arcR, startAng, endAng);
        ctx.stroke();

        // inner bright slash line
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(arcCx, arcCy, arcR * 0.7, startAng + 0.1, endAng - 0.1);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // add trail
        addTrail(box.x, box.y, box.w, box.h, s.color, 8);

        // sparks at the tip
        const tipX = f.facing > 0 ? box.x + box.w : box.x;
        const tipY = box.y + box.h / 2;
        if (Math.random() < 0.5) {
          spawnParticle(tipX, tipY, f.facing * (1 + Math.random() * 2), (Math.random() - 0.5) * 3, s.color, 10, 2);
        }
      }
    }
  }

  // ─── projectile drawing ─────────────────────────────────────────
  function drawProjectile(ctx, p, alpha) {
    ctx.save();
    ctx.translate((p.px - p.x) * (1 - alpha), (p.py - p.y) * (1 - alpha));
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
  const PANEL_W = 520;

  function drawPanel(ctx, f, x, label, kills) {
    const s = f.stats;
    ctx.textAlign = "left";
    ctx.font = "bold 22px monospace";
    ctx.fillStyle = s.color;
    ctx.fillText(label + " " + s.name.toUpperCase() + "   KILLS " + kills, x, 12);

    const by = 42, bh = 22;
    const frac = Math.max(0, f.hp / s.maxHP);
    // HP bar background
    ctx.fillStyle = "#2a2f3d";
    roundRect(ctx, x, by, PANEL_W, bh, 4);
    ctx.fill();
    // HP bar fill
    const hpColor = frac > 0.5 ? "#4cd964" : frac > 0.25 ? "#ffcc00" : "#ff453a";
    ctx.fillStyle = hpColor;
    if (PANEL_W * frac > 0) {
      roundRect(ctx, x, by, PANEL_W * frac, bh, 4);
      ctx.fill();
    }
    // HP bar border
    ctx.strokeStyle = "#cfd6e6";
    ctx.lineWidth = 2;
    roundRect(ctx, x, by, PANEL_W, bh, 4);
    ctx.stroke();

    ctx.font = "18px monospace";
    ctx.fillStyle = "#cfd6e6";
    ctx.fillText(
      "HP " + f.hp.toFixed(1) + "/" + s.maxHP + "  ARM " + s.armor + "  WGT " + s.weight + "  SPD " + s.runSpeed,
      x, 70
    );
    ctx.fillStyle = "#8b94ab";
    const hitInfo = f.hit ? "   swing " + (f.chainIndex + 1) + "/" + f.chainLength() : "";
    ctx.fillText("state: " + f.state + hitInfo, x, 92);
    const h = f.lastHit;
    ctx.fillStyle = "#ffd479";
    ctx.fillText(
      !h
        ? "last hit: -"
        : h.by === "BLAST ZONE"
          ? "last: BLAST ZONE  -" + h.dmg.toFixed(1) + " HP"
          : "last: " + h.raw + " -> " + h.dmg.toFixed(1) + " dmg  KB " + h.knockback.toFixed(1) + "  stun " + h.stun + "f",
      x, 114
    );
  }

  // ─── Renderer class ────────────────────────────────────────────
  class Renderer {
    constructor(canvas, arena) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.arena = arena;
      this.p2Label = "P2 DUMMY";
      this.helpText =
        "A/D move  W jump  S drop  J attack  1-5 you  6-0 foe  B foe AI  R reset  M menu";
      const b = arena.blastZone;
      this.offsetX = -b.left;
      this.offsetY = -b.top;
      canvas.width = b.right - b.left;
      canvas.height = b.bottom - b.top;
    }

    drawStatic(ctx) {
      const { width, height } = this.canvas;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // dark gradient background
      ctx.fillStyle = safeLinearGrad(ctx, 0, 0, 0, height,
        [[0, "#0a0c14"], [1, "#181c2a"]]);
      ctx.fillRect(0, 0, width, height);

      // blast zone border with glow
      ctx.strokeStyle = "#ff4d4d";
      ctx.lineWidth = 3;
      ctx.setLineDash([14, 10]);
      ctx.shadowColor = "#ff4d4d";
      ctx.shadowBlur = 8;
      ctx.strokeRect(1.5, 1.5, width - 3, height - 3);
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      ctx.translate(this.offsetX, this.offsetY);
      for (const p of this.arena.platforms) {
        // platform with subtle gradient
        ctx.fillStyle = safeLinearGrad(ctx, p.x, p.y, p.x, p.y + p.h,
          [[0, p.oneWay ? "#6b7da0" : "#4a5570"], [1, p.oneWay ? "#3e4d6a" : "#2a3248"]]);
        roundRect(ctx, p.x, p.y, p.w, p.h, 3);
        ctx.fill();
        // bright top edge
        ctx.fillStyle = p.oneWay ? "#a0bbee" : "#7a8ab0";
        ctx.shadowColor = p.oneWay ? "#a0bbee" : "#7a8ab0";
        ctx.shadowBlur = 4;
        roundRect(ctx, p.x, p.y, p.w, 3, 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    draw(sim, alpha) {
      if (alpha === undefined) alpha = 1;
      const ctx = this.ctx;
      const { width, height } = this.canvas;

      // tick effects
      tickParticles();
      tickTrails();

      if (!this.bg && typeof document !== "undefined") {
        this.bg = document.createElement("canvas");
        this.bg.width = width;
        this.bg.height = height;
        this.drawStatic(this.bg.getContext("2d"));
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (this.bg) ctx.drawImage(this.bg, 0, 0);
      else this.drawStatic(ctx);

      ctx.setTransform(1, 0, 0, 1, this.offsetX, this.offsetY);

      // trails (behind characters)
      drawTrails(ctx);

      // fighters
      const S = MW.STATE;
      for (const f of sim.fighters) {
        const s = f.stats;
        ctx.save();
        ctx.translate((f.px - f.x) * (1 - alpha), (f.py - f.y) * (1 - alpha));

        // check for hit bursts
        checkHitBurst(f);

        // HP bar above head (nicer rounded version)
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

        if (f.invuln > 0 && Math.floor(sim.tick / 4) % 2 === 0) {
          ctx.restore();
          continue;
        }

        ctx.globalAlpha = f.state === S.KO ? 0.5 : 1;
        const isFlash = f.flash > 0;

        // draw the full character body
        drawCharacterBody(ctx, f, isFlash);

        ctx.globalAlpha = 1;
        drawAttack(ctx, f, sim);
        ctx.restore();
      }

      // particles (between characters and projectiles for depth)
      drawParticles(ctx);

      // projectiles
      for (const p of sim.projectiles) {
        drawProjectile(ctx, p, alpha);
      }

      // HUD (screen space)
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.textBaseline = "top";
      drawPanel(ctx, sim.fighters[0], 160, "P1", sim.kills[0]);
      if (sim.fighters[1]) drawPanel(ctx, sim.fighters[1], width - 300 - PANEL_W, this.p2Label, sim.kills[1]);

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
      ctx.font = "24px monospace";
      ctx.fillStyle = "#8b94ab";
      if (this.helpText) ctx.fillText(this.helpText, 20, height - 44);
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
