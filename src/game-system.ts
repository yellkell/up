/*
 * UP DODGE XR — game manager system
 *
 * Roomscale AR dodge game. A 1.5 m grid is pinned to your real floor; neon
 * shapes rise UP out of the floor through telegraphed quadrants and you step
 * out of the way. Survive a few escalating timed waves and you win. Get hit, or
 * wander out of the ring, and it's game over.
 *
 * (Ported from the VR game "DOWN" — the sliding / descent phases were removed;
 * only the rising-obstacle grid mechanic remains, now in AR.)
 */

import {
  BoxGeometry,
  createSystem,
  DoubleSide,
  Entity,
  Group,
  Interactable,
  Mesh,
  MeshBasicMaterial,
  Pressed,
  VisibilityState,
  Vector3,
} from '@iwsdk/core';

import { Billboard, Confetti, Projectile, RetryButton, StartButton } from './components.js';
import {
  CanvasPanel,
  drawPanel,
  makeCanvasPanel,
  makeLineBox,
  makeNeonShape,
  makeTelegraph,
  NEON_COLORS,
  Telegraph,
} from './neon.js';

// ----- Play-space geometry (metres, AR local-floor: y = 0 is the floor) -----
const GRID_TOTAL = 1.5;
const HALF = GRID_TOTAL / 2; // 0.75
const KILL_HALF = 0.95; // step past this and you're out
const HEAD_R = 0.15;
const OBST_SPAWN_Y = -0.3; // emerges from just under the floor
const QUAD_LOCAL = [
  { x: -0.375, z: -0.375 },
  { x: 0.375, z: -0.375 },
  { x: -0.375, z: 0.375 },
  { x: 0.375, z: 0.375 },
];

// ----- Wave design: escalating spawn rate / count / rise speed -----
interface Wave {
  interval: number; // seconds between spawn telegraphs
  telegraph: number; // floor-flash warning duration
  maxTargets: number; // up to N of 4 quads hit (always leaves >= 1 safe)
  speed: number; // obstacle rise speed
  duration: number; // wave length in seconds
}
const WAVES: Wave[] = [
  { interval: 1.6, telegraph: 0.75, maxTargets: 2, speed: 2.0, duration: 24 },
  { interval: 1.35, telegraph: 0.62, maxTargets: 3, speed: 2.35, duration: 26 },
  { interval: 1.15, telegraph: 0.5, maxTargets: 3, speed: 2.8, duration: 28 },
];
const TRANSITION_DURATION = 2.6;

type Phase = 'INTRO' | 'START' | 'WAVE' | 'TRANSITION' | 'WIN' | 'OVER';

export class GameSystem extends createSystem({
  projectiles: { required: [Projectile] },
  confetti: { required: [Confetti] },
  startPressed: { required: [StartButton, Pressed] },
  retryPressed: { required: [RetryButton, Pressed] },
}) {
  private phase: Phase = 'INTRO';
  private wasImmersive = false;
  private startPlaced = false;
  private startWaitTimer = 0;

  // Wave state
  private waveIndex = 0;
  private timeInWave = 0;
  private transitionTimer = 0;
  private spawnTimer = 0;
  private telegraphTimer = 0;
  private spawnState: 'idle' | 'telegraph' = 'idle';
  private telegraphTargets: number[] = [];

  private origin = new Vector3();

  // Scratch vectors
  private headV = new Vector3();
  private projV = new Vector3();
  private dirV = new Vector3();

  // Visuals (transform entities)
  private gridEntity!: Entity;
  private startEntity!: Entity;
  private overEntity!: Entity;
  private hudEntity!: Entity;
  private bannerEntity!: Entity;
  private telegraphs: Telegraph[] = [];
  private startPanel!: CanvasPanel;
  private overPanel!: CanvasPanel;
  private hudPanel!: CanvasPanel;
  private bannerPanel!: CanvasPanel;
  private lastHud = '';

  // Audio
  private sfxBegin?: HTMLAudioElement;
  private sfxExcellent?: HTMLAudioElement;
  private sfxAwesome?: HTMLAudioElement;
  private sfxDie?: HTMLAudioElement;
  private sfxGameOver?: HTMLAudioElement;
  private music: HTMLAudioElement[] = [];

  init() {
    this.buildPlayArea();
    this.buildPanels();
    this.buildAudio();

    this.queries.startPressed.subscribe('qualify', () => {
      if (this.phase === 'START') this.startRun();
    });
    this.queries.retryPressed.subscribe('qualify', () => {
      if (this.phase === 'WIN' || this.phase === 'OVER') this.startRun();
    });

    this.visibilityState.subscribe((vs) => {
      const immersive = vs !== VisibilityState.NonImmersive;
      if (immersive && !this.wasImmersive) {
        this.wasImmersive = true;
        this.enterStart();
      } else if (!immersive && this.wasImmersive) {
        this.wasImmersive = false;
        this.resetToIntro();
      }
    });
  }

  // ---------------------------------------------------------------- build ----

  private buildPlayArea() {
    const g = new Group();
    const cyan = '#00ffff';
    const red = '#ff2200';
    const place = (m: Mesh, x: number, y: number, z: number) => {
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };

    // Centre cross
    place(makeLineBox(GRID_TOTAL, 0.012, 0.012, cyan), 0, 0.006, 0);
    place(makeLineBox(0.012, 0.012, GRID_TOTAL, cyan), 0, 0.006, 0);
    // Inner grid frame
    place(makeLineBox(GRID_TOTAL, 0.012, 0.012, cyan), 0, 0.006, -HALF);
    place(makeLineBox(GRID_TOTAL, 0.012, 0.012, cyan), 0, 0.006, HALF);
    place(makeLineBox(0.012, 0.012, GRID_TOTAL, cyan), -HALF, 0.006, 0);
    place(makeLineBox(0.012, 0.012, GRID_TOTAL, cyan), HALF, 0.006, 0);
    // Kill-zone border (red ring you must stay inside)
    const k = KILL_HALF;
    const kl = KILL_HALF * 2;
    place(makeLineBox(kl, 0.01, 0.03, red), 0, 0.005, -k);
    place(makeLineBox(kl, 0.01, 0.03, red), 0, 0.005, k);
    place(makeLineBox(0.03, 0.01, kl, red), -k, 0.005, 0);
    place(makeLineBox(0.03, 0.01, kl, red), k, 0.005, 0);

    // Eruption telegraphs (one per quadrant): a glowing floor portal + warning
    // beam that pulses where a shape is about to rise UP from beneath you.
    this.telegraphs = QUAD_LOCAL.map((c) => {
      const t = makeTelegraph('#ff3a00');
      t.group.position.set(c.x, 0, c.z);
      g.add(t.group);
      return t;
    });

    g.visible = false;
    this.gridEntity = this.world.createTransformEntity(g);
  }

  private buildPanels() {
    this.startPanel = makeCanvasPanel(1.4, 1.0, 900, 640);
    this.overPanel = makeCanvasPanel(1.4, 1.0, 900, 640);
    this.hudPanel = makeCanvasPanel(0.9, 0.36, 512, 205);
    this.bannerPanel = makeCanvasPanel(1.5, 0.5, 640, 215);

    this.startEntity = this.world
      .createTransformEntity(this.startPanel.mesh)
      .addComponent(Billboard)
      .addComponent(Interactable)
      .addComponent(StartButton);
    this.overEntity = this.world
      .createTransformEntity(this.overPanel.mesh)
      .addComponent(Billboard)
      .addComponent(Interactable)
      .addComponent(RetryButton);
    this.hudEntity = this.world.createTransformEntity(this.hudPanel.mesh).addComponent(Billboard);
    this.bannerEntity = this.world
      .createTransformEntity(this.bannerPanel.mesh)
      .addComponent(Billboard);

    for (const e of [this.startEntity, this.overEntity, this.hudEntity, this.bannerEntity]) {
      e.object3D!.visible = false;
    }

    this.drawStart();
  }

  private buildAudio() {
    const make = (file: string) => {
      const a = new Audio(`audio/${file}`);
      a.preload = 'auto';
      return a;
    };
    this.sfxBegin = make('begin.ogg');
    this.sfxExcellent = make('excellent.ogg');
    this.sfxAwesome = make('awesome.ogg');
    this.sfxDie = make('die.ogg');
    this.sfxGameOver = make('gameover.ogg');
    this.music = [make('track1.mp3'), make('track2.mp3'), make('track3.mp3'), make('track4.mp3')];
    this.music.forEach((m, i) => {
      m.addEventListener('ended', () => this.playMusicTrack((i + 1) % this.music.length));
    });
  }

  // --------------------------------------------------------------- phases ----

  private enterStart() {
    this.phase = 'START';
    this.startPlaced = false;
    this.startWaitTimer = 0;
    this.clearProjectiles();
    this.clearConfetti();
    this.clearTiles();
    this.overEntity.object3D!.visible = false;
    this.hudEntity.object3D!.visible = false;
    this.bannerEntity.object3D!.visible = false;
    this.drawStart();
  }

  private startRun() {
    this.player.head.getWorldPosition(this.headV);
    this.origin.set(this.headV.x, 0, this.headV.z);
    this.gridEntity.object3D!.position.copy(this.origin);

    this.clearProjectiles();
    this.clearConfetti();
    this.clearTiles();
    this.startEntity.object3D!.visible = false;
    this.overEntity.object3D!.visible = false;

    this.waveIndex = 0;
    this.lastHud = '';
    this.startMusic();
    this.playSfx(this.sfxBegin);
    this.beginWave();
  }

  private beginWave() {
    this.phase = 'WAVE';
    this.timeInWave = 0;
    this.spawnTimer = 0;
    this.telegraphTimer = 0;
    this.spawnState = 'idle';
    this.telegraphTargets = [];

    this.bannerEntity.object3D!.visible = false;
    this.gridEntity.object3D!.visible = true;
    this.hudEntity.object3D!.position.set(this.origin.x, 2.0, this.origin.z);
    this.hudEntity.object3D!.visible = true;
  }

  private startTransition() {
    this.phase = 'TRANSITION';
    this.transitionTimer = 0;
    this.playSfx(this.sfxExcellent);
    this.hudEntity.object3D!.visible = false;
    this.drawBanner(`WAVE ${this.waveIndex + 2}`, 'GET READY');
    this.placeInFront(this.bannerEntity, 1.6, 1.5);
    this.bannerEntity.object3D!.visible = true;
  }

  private winRun() {
    this.phase = 'WIN';
    this.clearProjectiles();
    this.clearTiles();
    this.hudEntity.object3D!.visible = false;
    this.stopMusic();
    this.playSfx(this.sfxAwesome);
    this.spawnConfetti();
    this.drawOver('YOU MADE IT!', ['All waves survived — nice dodging!', '', '▶  Point & press to PLAY AGAIN'], '#00ff66');
    this.placeInFront(this.overEntity, 1.5, 1.35);
    this.overEntity.object3D!.visible = true;
  }

  private gameOver(reason: string) {
    this.phase = 'OVER';
    this.clearProjectiles();
    this.clearTiles();
    this.hudEntity.object3D!.visible = false;
    this.stopMusic();
    this.playSfx(this.sfxDie);
    this.playSfx(this.sfxGameOver);
    this.drawOver('GAME OVER', [reason, '', '▶  Point & press to RETRY'], '#ff3344');
    this.placeInFront(this.overEntity, 1.5, 1.35);
    this.overEntity.object3D!.visible = true;
  }

  private resetToIntro() {
    this.phase = 'INTRO';
    this.startPlaced = false;
    this.clearProjectiles();
    this.clearConfetti();
    this.clearTiles();
    this.stopMusic();
    for (const e of [
      this.gridEntity,
      this.startEntity,
      this.overEntity,
      this.hudEntity,
      this.bannerEntity,
    ]) {
      e.object3D!.visible = false;
    }
  }

  // ----------------------------------------------------------------- loop ----

  update(delta: number) {
    const dt = Math.min(delta, 0.05);
    this.player.head.getWorldPosition(this.headV);
    const tracked = this.headV.y > 0.5; // filters the (0,0,0) pose before tracking starts

    switch (this.phase) {
      case 'START':
        this.startWaitTimer += dt;
        // Show the BEGIN panel as soon as we have a head pose — or after a short
        // fallback, so the menu always appears even if tracking reports late.
        if (!this.startPlaced && (tracked || this.startWaitTimer > 2)) {
          this.placeInFront(this.startEntity, 1.5, 1.3);
          this.startEntity.object3D!.visible = true;
          this.startPlaced = true;
        }
        if (tracked) {
          // Live preview of the ring under the player's feet.
          this.gridEntity.object3D!.visible = true;
          this.gridEntity.object3D!.position.set(this.headV.x, 0, this.headV.z);
        }
        break;
      case 'WAVE':
        this.updateWave(dt);
        break;
      case 'TRANSITION':
        this.transitionTimer += dt;
        if (this.transitionTimer >= TRANSITION_DURATION) {
          this.waveIndex++;
          this.beginWave();
        }
        break;
      // WIN / OVER / INTRO: panels billboard themselves; nothing to step.
    }
  }

  private updateWave(dt: number) {
    this.timeInWave += dt;
    const w = WAVES[this.waveIndex];

    const remaining = Math.max(0, Math.ceil(w.duration - this.timeInWave));
    this.setHud(`WAVE ${this.waveIndex + 1} / ${WAVES.length}`, `${remaining}s`);

    // Spawn scheduling: idle -> telegraph (floor flash) -> erupt
    this.spawnTimer += dt;
    if (this.spawnState === 'idle' && this.spawnTimer >= w.interval) {
      this.spawnTimer = 0;
      this.spawnState = 'telegraph';
      this.telegraphTimer = 0;
      this.telegraphTargets = this.pickTargets(w.maxTargets);
    }
    if (this.spawnState === 'telegraph') {
      this.telegraphTimer += dt;
      const pulse = 0.5 + 0.5 * Math.sin(this.telegraphTimer * 16);
      this.flashTiles(this.telegraphTargets, pulse);
      if (this.telegraphTimer >= w.telegraph) {
        for (const q of this.telegraphTargets) this.spawnObstacle(q, w.speed);
        this.clearTiles();
        this.spawnState = 'idle';
        this.telegraphTimer = 0;
      }
    }

    this.checkCollisions();
    if (this.phase !== 'WAVE') return; // a hit ended the run

    if (this.timeInWave >= w.duration) {
      this.clearProjectiles();
      this.clearTiles();
      if (this.waveIndex + 1 < WAVES.length) this.startTransition();
      else this.winRun();
    }
  }

  private checkCollisions() {
    const lx = this.headV.x - this.origin.x;
    const lz = this.headV.z - this.origin.z;
    if (Math.abs(lx) > KILL_HALF || Math.abs(lz) > KILL_HALF) {
      this.gameOver('You left the ring!');
      return;
    }
    for (const e of this.queries.projectiles.entities) {
      const obj = e.object3D;
      if (!obj) continue;
      obj.getWorldPosition(this.projV);
      const r = e.getValue(Projectile, 'radius') ?? 0.22;
      if (this.headV.distanceTo(this.projV) < HEAD_R + r) {
        this.gameOver('You got hit!');
        return;
      }
    }
  }

  // -------------------------------------------------------------- spawning ----

  /** Choose 1..min(maxTargets,3) distinct quadrants — always leaves >=1 safe. */
  private pickTargets(maxTargets: number): number[] {
    const k = 1 + Math.floor(Math.random() * Math.min(maxTargets, 3));
    const pool = [0, 1, 2, 3];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, k);
  }

  private spawnObstacle(quad: number, speed: number) {
    const c = QUAD_LOCAL[quad];
    const radius = 0.22 + Math.random() * 0.08;
    const color = NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)];
    const group = makeNeonShape(radius, color);
    group.position.set(this.origin.x + c.x, OBST_SPAWN_Y, this.origin.z + c.z);
    this.world.createTransformEntity(group).addComponent(Projectile, { vy: speed, radius });
  }

  private spawnConfetti() {
    this.player.head.getWorldPosition(this.headV);
    const rand = () => Math.random();
    for (let i = 0; i < 140; i++) {
      const size = 0.04 + rand() * 0.06;
      const color = NEON_COLORS[Math.floor(rand() * NEON_COLORS.length)];
      const m = new Mesh(
        new BoxGeometry(size, size * 0.25, size * 0.6),
        new MeshBasicMaterial({ color, side: DoubleSide }),
      );
      m.position.set(
        this.headV.x + (rand() - 0.5) * 2.4,
        this.headV.y + 1 + rand() * 2.2,
        this.headV.z + (rand() - 0.5) * 2.4,
      );
      m.rotation.set(rand() * 6, rand() * 6, rand() * 6);
      this.world.createTransformEntity(m).addComponent(Confetti, {
        vy: -0.8 - rand() * 1.4,
        vx: (rand() - 0.5) * 1.2,
        vz: (rand() - 0.5) * 1.2,
        rx: (rand() - 0.5) * 8,
        ry: (rand() - 0.5) * 8,
        rz: (rand() - 0.5) * 8,
        ttl: 4 + rand() * 3,
      });
    }
  }

  // ---------------------------------------------------------------- visuals ----

  private flashTiles(targets: number[], pulse: number) {
    for (let i = 0; i < this.telegraphs.length; i++) {
      const on = targets.includes(i);
      const t = this.telegraphs[i];
      (t.disc.material as MeshBasicMaterial).opacity = on ? pulse * 0.5 : 0;
      (t.ring.material as MeshBasicMaterial).opacity = on ? Math.min(1, pulse) : 0;
      (t.beam.material as MeshBasicMaterial).opacity = on ? pulse * 0.45 : 0;
    }
  }

  private clearTiles() {
    for (const t of this.telegraphs) {
      (t.disc.material as MeshBasicMaterial).opacity = 0;
      (t.ring.material as MeshBasicMaterial).opacity = 0;
      (t.beam.material as MeshBasicMaterial).opacity = 0;
    }
  }

  private clearProjectiles() {
    for (const e of Array.from(this.queries.projectiles.entities)) e.dispose();
  }

  private clearConfetti() {
    for (const e of Array.from(this.queries.confetti.entities)) e.dispose();
  }

  /** Place an entity ~dist metres in front of where the viewer is looking. */
  private placeInFront(entity: Entity, dist: number, y: number) {
    this.player.head.getWorldPosition(this.headV);
    this.player.head.getWorldDirection(this.dirV); // +Z (points behind viewer)
    this.dirV.y = 0;
    if (this.dirV.lengthSq() < 1e-4) this.dirV.set(0, 0, 1);
    this.dirV.normalize();
    entity.object3D!.position.set(
      this.headV.x - this.dirV.x * dist,
      y,
      this.headV.z - this.dirV.z * dist,
    );
  }

  private drawStart() {
    this.startPanel.redraw((ctx, w, h) =>
      drawPanel(ctx, w, h, {
        title: 'ALIGN YOUR PLAYSPACE',
        titleColor: '#00ffff',
        titleSize: 58,
        lines: [
          'Stand inside the ring on your floor,',
          'with room to step in every direction.',
          '',
          '▶  PRESS TRIGGER TO CONFIRM',
        ],
        lineColor: '#dffaff',
        lineSize: 40,
      }),
    );
  }

  private drawOver(title: string, lines: string[], color: string) {
    this.overPanel.redraw((ctx, w, h) =>
      drawPanel(ctx, w, h, { title, titleColor: color, titleSize: 86, lines, lineColor: '#dffaff', lineSize: 40 }),
    );
  }

  private drawBanner(title: string, sub: string) {
    this.bannerPanel.redraw((ctx, w, h) =>
      drawPanel(ctx, w, h, {
        title,
        titleColor: '#ff00ff',
        titleSize: 96,
        lines: [sub],
        lineColor: '#ffffff',
        lineSize: 44,
        bg: 'rgba(2,2,12,0.4)',
        border: '#ff00ff',
      }),
    );
  }

  private setHud(line1: string, line2: string) {
    const key = `${line1}|${line2}`;
    if (key === this.lastHud) return;
    this.lastHud = key;
    this.hudPanel.redraw((ctx, w, h) =>
      drawPanel(ctx, w, h, {
        title: line1,
        titleColor: '#00ffff',
        titleSize: 58,
        lines: [line2],
        lineColor: '#ffffff',
        lineSize: 56,
        bg: 'rgba(2,2,12,0.5)',
      }),
    );
  }

  // ----------------------------------------------------------------- audio ----

  private playSfx(a?: HTMLAudioElement) {
    if (!a) return;
    try {
      a.currentTime = 0;
      void a.play().catch(() => {});
    } catch {
      /* ignore */
    }
  }

  private startMusic() {
    this.playMusicTrack(0);
  }

  private playMusicTrack(i: number) {
    if (!this.music.length) return;
    this.music.forEach((m) => {
      try {
        m.pause();
      } catch {
        /* ignore */
      }
    });
    const t = this.music[i];
    if (!t) return;
    try {
      t.currentTime = 0;
      void t.play().catch(() => {});
    } catch {
      /* ignore */
    }
  }

  private stopMusic() {
    this.music.forEach((m) => {
      try {
        m.pause();
      } catch {
        /* ignore */
      }
    });
  }
}
