/*
 * UP DODGE XR — motion systems
 *
 * Small, stateless systems that each drive one kind of entity every frame.
 * GameSystem owns the rules; these just move things.
 */

import { createSystem, Vector3 } from '@iwsdk/core';
import { Billboard, Confetti, Projectile } from './components.js';

/** World-space Y at which a rising obstacle has passed the player and is recycled.
 *  Set well above head height so shapes are seen rising all the way up and out. */
const DESPAWN_Y = 4.0;

/** Moves neon obstacles up through the play space and recycles them past the top. */
export class ProjectileSystem extends createSystem({
  projectiles: { required: [Projectile] },
}) {
  update(delta: number) {
    const dt = Math.min(delta, 0.05);
    // Snapshot: we dispose during iteration.
    const entities = Array.from(this.queries.projectiles.entities);
    for (const e of entities) {
      const obj = e.object3D;
      if (!obj) continue;
      const vy = e.getValue(Projectile, 'vy') ?? 2;
      obj.position.y += vy * dt;
      obj.rotation.x += 1.6 * dt;
      obj.rotation.y += 1.1 * dt;
      if (obj.position.y > DESPAWN_Y) e.dispose();
    }
  }
}

/** Falls + spins win-celebration confetti, despawning it after its lifetime. */
export class ConfettiSystem extends createSystem({
  confetti: { required: [Confetti] },
}) {
  update(delta: number) {
    const dt = Math.min(delta, 0.05);
    const entities = Array.from(this.queries.confetti.entities);
    for (const e of entities) {
      const obj = e.object3D;
      if (!obj) continue;
      obj.position.x += (e.getValue(Confetti, 'vx') ?? 0) * dt;
      obj.position.y += (e.getValue(Confetti, 'vy') ?? -1) * dt;
      obj.position.z += (e.getValue(Confetti, 'vz') ?? 0) * dt;
      obj.rotation.x += (e.getValue(Confetti, 'rx') ?? 0) * dt;
      obj.rotation.y += (e.getValue(Confetti, 'ry') ?? 0) * dt;
      obj.rotation.z += (e.getValue(Confetti, 'rz') ?? 0) * dt;
      const ttl = (e.getValue(Confetti, 'ttl') ?? 0) - dt;
      if (ttl <= 0 || obj.position.y < -1) {
        e.dispose();
      } else {
        e.setValue(Confetti, 'ttl', ttl);
      }
    }
  }
}

/** Rotates billboarded panels (HUD / menus) to face the viewer on the Y axis. */
export class BillboardSystem extends createSystem({
  billboards: { required: [Billboard] },
}) {
  private head = new Vector3();
  private pos = new Vector3();

  update() {
    this.player.head.getWorldPosition(this.head);
    for (const e of this.queries.billboards.entities) {
      const obj = e.object3D;
      if (!obj || !obj.visible) continue;
      obj.getWorldPosition(this.pos);
      obj.rotation.set(0, Math.atan2(this.head.x - this.pos.x, this.head.z - this.pos.z), 0);
    }
  }
}
