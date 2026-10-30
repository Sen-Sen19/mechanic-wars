// Mechanic Wars - shared projectile system. One class serves the Mage bolt and the
// Hitter shockwave (and any later projectile); they differ only by attack data
// (characters.js: attack.projectile = { speed, range, size }).
(function (g) {
  const MW = (g.MW = g.MW || {});

  class Projectile {
    // owner: the firing Fighter. hit: the owner's attack data (damage, knockback, projectile).
    constructor(owner, hit) {
      const s = owner.stats;
      const p = hit.projectile;
      this.ownerId = owner.id;
      this.hit = hit;
      this.dir = owner.facing;
      this.size = p.size;
      this.speed = p.speed;
      this.range = p.range;
      this.traveled = 0;
      this.alive = true;
      // centre point: just in front of the owner, at chest height
      this.x = owner.facing > 0 ? owner.x + s.width + p.size / 2 : owner.x - p.size / 2;
      this.y = owner.y + s.height * 0.4;
      this.offsetY = p.offsetY || 0;
      this.y += this.offsetY;
      this.px = this.x; // previous-tick position, for render interpolation
      this.py = this.y;
      this.color = s.color;
      const stacks = owner.stats.id === "hitter" ? owner.gunnerStacks : 0;
      this.tier = MW.gunnerTier(stacks, owner.stats.passive);
      this.evolutionColor = MW.gunnerTierColor(this.tier, owner.stats.passive);
      // optional angle (radians, 0 = straight ahead, + = downward): shotgun pellets fly in a cone
      this.angle = p.angle || 0;
      this.vy = Math.sin(this.angle) * this.speed;
      this.batch = null;
      this.hitTargets = new Set();
      this.kind = p.kind || "shard"; // Void Mage: shard | singularity | orb (visual + damage riders live in the attack data)
    }

    box() {
      const h = this.size / 2;
      return { x: this.x - h, y: this.y - h, w: this.size, h: this.size };
    }

    step(arena) {
      this.px = this.x;
      this.py = this.y;
      this.x += this.dir * Math.cos(this.angle) * this.speed;
      this.y += this.vy;
      this.traveled += this.speed;
      const b = arena.blastZone;
      if (this.traveled >= this.range || this.x < b.left || this.x > b.right) this.alive = false;
    }
  }

  // Bullet Evolution look: 0 = plain, then one tier per threshold in passive.tiers (all tunable in characters.js).
  MW.gunnerTier = function (stacks, passive) {
    const tiers = (passive && passive.tiers) || [3, 5, 7, 10];
    let t = 0;
    for (let i = 0; i < tiers.length; i++) if (stacks >= tiers[i]) t = i + 1;
    return t;
  };
  MW.gunnerTierColor = function (tier, passive) {
    const colors = (passive && passive.tierColors) || ["#e8eef8", "#ffe04a", "#ff8b24", "#f02d45", "#21162e"];
    return colors[Math.min(tier, colors.length - 1)];
  };

  MW.Projectile = Projectile;
})(globalThis);