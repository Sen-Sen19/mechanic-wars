// Mechanic Wars - arena layout (world coordinates, y grows downward).
// The blast zone is also the visible camera frame (1600 x 900).
(function (g) {
  const MW = (g.MW = g.MW || {});

  MW.ARENA = {
    blastZone: { left: -160, top: -150, right: 1440, bottom: 750 },
    // Both fighters drop onto the top platform, facing each other.
    spawns: [
      { x: 580, y: 200, facing: 1 },
      { x: 700, y: 200, facing: -1 },
    ],
    // oneWay: can be jumped up through and dropped down through.
    // Solid (oneWay: false) platforms in Stage 1 are still top-surface only
    // (no side/bottom collision) and cannot be dropped through.
    platforms: [
      { x: 240, y: 560, w: 800, h: 28, oneWay: false }, // main stage
      { x: 300, y: 430, w: 220, h: 12, oneWay: true }, // left
      { x: 760, y: 430, w: 220, h: 12, oneWay: true }, // right
      { x: 530, y: 300, w: 220, h: 12, oneWay: true }, // top
    ],
  };

  // Random layout for a match. The main stage is always the same; the floating one-way
  // platforms get a random COUNT (2-5), random positions and random widths every time.
  // Fighters spawn on the stage, P1 on the left and P2 on the right, facing each other.
  // Layout rules keep every platform reachable with jumps:
  //   - low tier (110-140px above the stage): overlaps the stage horizontally so it can be jumped to
  //   - mid tier (about 130px above a low platform): always sits near a low platform
  //   - no two platforms on a similar height overlap or crowd each other
  MW.makeArena = function makeArena(rnd) {
    rnd = rnd || Math.random;
    const R = (a, b) => a + rnd() * (b - a);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const stage = { x: 240, y: 560, w: 800, h: 28, oneWay: false };
    const X_MIN = 110, X_MAX = 1170; // keep platforms inside the camera frame
    const floaters = [];
    const free = (p) =>
      floaters.every((q) => Math.abs(p.y - q.y) > 60 || p.x + p.w + 70 < q.x || q.x + q.w + 70 < p.x);

    let nLow = 1 + Math.floor(rnd() * 3); // 1..3
    let nMid = Math.floor(rnd() * 3); // 0..2
    if (nLow + nMid < 2) nMid = 1;

    const lows = [];
    for (let k = 0; k < nLow; k++) {
      for (let tries = 0; tries < 40; tries++) {
        const w = Math.round(R(150, 250));
        const p = { x: Math.round(R(X_MIN, X_MAX - w)), y: Math.round(R(415, 450)), w, h: 12, oneWay: true };
        const overStage = Math.min(p.x + p.w, stage.x + stage.w) - Math.max(p.x, stage.x); // overlap with the stage
        if (overStage < 80 || !free(p)) continue;
        floaters.push(p);
        lows.push(p);
        break;
      }
    }
    for (let k = 0; k < nMid && lows.length; k++) {
      for (let tries = 0; tries < 40; tries++) {
        const base = lows[Math.floor(rnd() * lows.length)];
        const w = Math.round(R(150, 240));
        const cx = base.x + base.w / 2 + R(-180, 180);
        const p = { x: Math.round(clamp(cx - w / 2, X_MIN, X_MAX - w)), y: Math.round(R(285, 320)), w, h: 12, oneWay: true };
        if (!free(p)) continue;
        floaters.push(p);
        break;
      }
    }
    if (floaters.length < 2) { // very unlikely: fall back to the classic three-platform layout
      return Object.assign({}, MW.ARENA, {
        spawns: [{ x: 400, y: 450, facing: 1 }, { x: 880, y: 450, facing: -1 }],
      });
    }
    return {
      blastZone: Object.assign({}, MW.ARENA.blastZone),
      spawns: [
        { x: 400, y: 450, facing: 1 }, // P1: left side of the stage
        { x: 880, y: 450, facing: -1 }, // P2: right side of the stage
      ],
      platforms: [stage].concat(floaters),
    };
  };
})(globalThis);
