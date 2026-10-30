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
      this.px = this.x; // previous-tick position, for render interpolation
      this.py = this.y;
      this.color = s.color;
      this.kind = p.kind || "shard"; // Void Mage: shard | singularity | orb (visual + damage riders live in the attack data)
    }

    box() {
      const h = this.size / 2;
      return { x: this.x - h, y: this.y - h, w: this.size, h: this.size };
    }

    step(arena) {
      this.px = this.x;
      this.py = this.y;
      this.x += this.dir * this.speed;
      this.traveled += this.speed;
      const b = arena.blastZone;
      if (this.traveled >= this.range || this.x < b.left || this.x > b.right) this.alive = false;
    }
  }

  MW.Projectile = Projectile;
})(globalThis);
