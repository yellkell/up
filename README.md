# UP DODGE XR

A roomscale **AR passthrough** dodge game built with the [Immersive Web SDK](https://iwsdk.dev) (Three.js + ECS).

Ported from the VR game **DOWN** — the sliding / "going down" descent phases were removed; only the rising-obstacle grid mechanic remains, now in mixed reality.

## How it plays

- A 1.5 m neon grid is pinned to your **real floor** when you press **BEGIN** (it centers under wherever you're standing).
- Neon polyhedra **erupt up out of the floor** through telegraphed quadrants (the floor tile flashes red first). **Step out of their lane** to dodge.
- Stay **inside the red ring** — wandering out ends the run.
- Survive **3 escalating timed waves** (faster spawns, more obstacles, quicker rises) and you win — confetti included.
- Get hit, or leave the ring, and it's **GAME OVER**. Point + trigger the panel to retry.

Everything is driven by physically moving in your space — there is no locomotion or controller movement.

## Run it (development)

Requires Node `>=20.19` and a WebXR-capable AR headset (e.g. Meta Quest) on the same network, or the built-in WebXR emulator.

```bash
npm install
npm run dev
```

The dev server runs over HTTPS (via `vite-plugin-mkcert`) on port **8081** and includes the IWSDK WebXR emulator. Open it on your headset's browser (same Wi‑Fi) and tap **ENTER AR**.

## Build (deploy)

```bash
npm run build      # outputs static files to dist/
npm run preview    # serve the production build locally
```

`dist/` is plain static output — drop it on any HTTPS static host. WebXR requires HTTPS (or localhost).

## Code layout

| File | Role |
| --- | --- |
| `src/index.ts` | Boots the AR `World`, registers systems, wires the 2D landing overlay. |
| `src/game-system.ts` | Game manager: state machine, wave scheduling, telegraphed spawns, collision, win/lose, audio. |
| `src/systems.ts` | `ProjectileSystem` (rising obstacles), `ConfettiSystem`, `BillboardSystem`. |
| `src/components.ts` | ECS components (`Projectile`, `Confetti`, `Billboard`, `StartButton`, `RetryButton`). |
| `src/neon.ts` | Neon-wireframe obstacle meshes + canvas-textured HUD/menu panels. |
| `public/audio/` | SFX (`begin`, `excellent`, `awesome`, `die`, `gameover`) + music (`track1‑4`). |

## Tuning

Wave difficulty (spawn interval, telegraph time, obstacle count, rise speed, duration) lives in the `WAVES` array at the top of `src/game-system.ts`. Grid size, kill-zone radius and collision radius are the constants just above it.
