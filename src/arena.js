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
})(globalThis);
