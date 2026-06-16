/*
 * UP DODGE XR — visual helpers
 *
 * Builds the neon-wireframe obstacle look (black core + glowing edges) and the
 * canvas-textured panels used for the HUD / menus. Everything is unlit
 * (MeshBasicMaterial) so it reads vividly against AR passthrough with no scene
 * lighting set up.
 */

import {
  BoxGeometry,
  CanvasTexture,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  SRGBColorSpace,
  TetrahedronGeometry,
} from '@iwsdk/core';

export const NEON_COLORS = ['#00ffff', '#ff00ff', '#00ff00', '#ffff00', '#ff6600', '#ff0066'];
const SHAPES = ['tetra', 'octa', 'dodeca', 'icosa'] as const;
type ShapeName = (typeof SHAPES)[number];

function geometryFor(shape: ShapeName, radius: number) {
  switch (shape) {
    case 'tetra':
      return new TetrahedronGeometry(radius);
    case 'octa':
      return new OctahedronGeometry(radius);
    case 'dodeca':
      return new DodecahedronGeometry(radius);
    case 'icosa':
    default:
      return new IcosahedronGeometry(radius);
  }
}

/** A neon obstacle: a black fill polyhedron wrapped in a glowing wireframe twin. */
export function makeNeonShape(radius: number, color: string): Group {
  const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  const group = new Group();

  const fill = new Mesh(
    geometryFor(shape, radius * 0.92),
    new MeshBasicMaterial({ color: '#000000' }),
  );
  group.add(fill);

  const wire = new Mesh(
    geometryFor(shape, radius),
    new MeshBasicMaterial({ color, wireframe: true }),
  );
  group.add(wire);

  return group;
}

/** A flat emissive-looking box used for grid lines / borders / telegraph tiles. */
export function makeLineBox(
  w: number,
  h: number,
  d: number,
  color: string,
  opacity = 1,
): Mesh {
  return new Mesh(
    new BoxGeometry(w, h, d),
    new MeshBasicMaterial({ color, transparent: opacity < 1, opacity }),
  );
}

export interface CanvasPanel {
  mesh: Mesh;
  redraw: (fn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) => void;
}

/** A world-space plane backed by a 2D canvas you can redraw on demand. */
export function makeCanvasPanel(
  worldW: number,
  worldH: number,
  pxW: number,
  pxH: number,
): CanvasPanel {
  const canvas = document.createElement('canvas');
  canvas.width = pxW;
  canvas.height = pxH;
  const ctx = canvas.getContext('2d')!;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;

  const mesh = new Mesh(
    new PlaneGeometry(worldW, worldH),
    new MeshBasicMaterial({ map: texture, transparent: true }),
  );

  return {
    mesh,
    redraw(fn) {
      fn(ctx, pxW, pxH);
      texture.needsUpdate = true;
    },
  };
}

/** Helper to draw a rounded, semi-transparent neon panel with a title + body lines. */
export function drawPanel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: {
    title?: string;
    titleColor?: string;
    titleSize?: number;
    lines?: string[];
    lineColor?: string;
    lineSize?: number;
    bg?: string;
    border?: string;
    align?: CanvasTextAlign;
  },
) {
  const {
    title,
    titleColor = '#00ffff',
    titleSize = 88,
    lines = [],
    lineColor = '#ffffff',
    lineSize = 40,
    bg = 'rgba(2,2,12,0.82)',
    border = '#00ffff',
    align = 'center',
  } = opts;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.lineWidth = 6;
  ctx.strokeStyle = border;
  ctx.strokeRect(8, 8, w - 16, h - 16);

  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  const cx = align === 'center' ? w / 2 : 48;

  let y = title ? h * 0.22 : h * 0.5 - (lines.length * lineSize * 1.35) / 2;

  if (title) {
    ctx.fillStyle = titleColor;
    ctx.font = `bold ${titleSize}px system-ui, "Segoe UI", Arial, sans-serif`;
    ctx.fillText(title, cx, y);
    y = h * 0.42;
  }

  ctx.fillStyle = lineColor;
  ctx.font = `${lineSize}px system-ui, "Segoe UI", Arial, sans-serif`;
  for (const line of lines) {
    ctx.fillText(line, cx, y);
    y += lineSize * 1.35;
  }
}
