/*
 * UP DODGE XR — entry point
 *
 * Boots an Immersive Web SDK world in AR passthrough and registers the game
 * systems. The actual scene/menus are built by GameSystem once the world is up.
 */

import { SessionMode, VisibilityState, World } from '@iwsdk/core';

import { GameSystem } from './game-system.js';
import { BillboardSystem, ConfettiSystem, ProjectileSystem } from './systems.js';

World.create(document.getElementById('scene-container') as HTMLDivElement, {
  xr: {
    sessionMode: SessionMode.ImmersiveAR,
    offer: 'once',
    features: {
      handTracking: true,
      layers: true,
    },
  },
  features: {
    locomotion: false,
    grabbing: false,
    physics: false,
    sceneUnderstanding: false,
    environmentRaycast: false,
  },
}).then((world) => {
  world
    .registerSystem(ProjectileSystem)
    .registerSystem(ConfettiSystem)
    .registerSystem(BillboardSystem)
    .registerSystem(GameSystem);

  // 2D landing overlay (shown only outside of an immersive session).
  const overlay = document.getElementById('enter-overlay');
  const enterBtn = document.getElementById('enter-btn');
  enterBtn?.addEventListener('click', () => world.launchXR());
  world.visibilityState.subscribe((vs) => {
    if (overlay) {
      overlay.style.display = vs === VisibilityState.NonImmersive ? 'flex' : 'none';
    }
  });
});
