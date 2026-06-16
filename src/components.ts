/*
 * UP DODGE XR — ECS components
 *
 * Marker + data components for the gameplay entities. All gameplay entities are
 * plain transform entities (a Three.js Object3D wrapped by the ECS); these
 * components tag them so the systems can find and drive them.
 */

import { createComponent, Types } from '@iwsdk/core';

/** A neon obstacle rising up from the floor. Moved + recycled by ProjectileSystem. */
export const Projectile = createComponent('UpDodgeProjectile', {
  vy: { type: Types.Float32, default: 2 }, // metres / second, upward
  radius: { type: Types.Float32, default: 0.22 }, // collision radius
});

/** A win-celebration confetti chip. Driven by ConfettiSystem. */
export const Confetti = createComponent('UpDodgeConfetti', {
  vy: { type: Types.Float32, default: -1 },
  vx: { type: Types.Float32, default: 0 },
  vz: { type: Types.Float32, default: 0 },
  rx: { type: Types.Float32, default: 0 },
  ry: { type: Types.Float32, default: 0 },
  rz: { type: Types.Float32, default: 0 },
  ttl: { type: Types.Float32, default: 6 }, // seconds before it despawns
});

/** Faces the entity toward the viewer on the Y axis each frame. */
export const Billboard = createComponent('UpDodgeBillboard', {});

/** The "BEGIN" menu panel — pointing + trigger starts a run. */
export const StartButton = createComponent('UpDodgeStartButton', {});

/** The "PLAY AGAIN / RETRY" menu panel shown on win or game over. */
export const RetryButton = createComponent('UpDodgeRetryButton', {});
