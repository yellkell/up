/*
 * UP DODGE XR — visual helpers
 *
 * Builds the neon-wireframe obstacle look (black core + glowing edges) and the
 * canvas-textured panels used for the HUD / menus. Everything is unlit
 * (MeshBasicMaterial) so it reads vividly against AR passthrough with no scene
 * lighting set up.
 */

import {
  AdditiveBlending,
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

/**
 * A neon obstacle that GLOWS: a dark core for a readable silhouette, a
 * translucent additive inner body, a full-intensity wireframe, and two larger
 * additive "halo" wireframe shells that fake a blooming neon glow without any
 * post-processing. Reads vividly as it rises through AR passthrough.
 */
export function makeNeonShape(radius: number, color: string): Group {
  const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  const group = new Group();

  // Dark core — keeps a crisp silhouette against bright passthrough.
  group.add(
    new Mesh(
      geometryFor(shape, radius * 0.84),
      new MeshBasicMaterial({ color: '#01010a' }),
    ),
  );

  // Inner body glow — translucent neon, added to whatever is behind it.
  group.add(
    new Mesh(
      geometryFor(shape, radius * 0.99),
      new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.25,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    ),
  );

  // Crisp, full-intensity wireframe edges (never tone-mapped down).
  group.add(
    new Mesh(
      geometryFor(shape, radius),
      new MeshBasicMaterial({ color, wireframe: true, toneMapped: false }),
    ),
  );

  // Additive halo shells — larger + fainter — bloom the glow outward.
  for (const [scale, opacity] of [[1.16, 0.42], [1.4, 0.2]] as const) {
    group.add(
      new Mesh(
        geometryFor(shape, radius * scale),
        new MeshBasicMaterial({
          color,
          wireframe: true,
          transparent: true,
          opacity,
          blending: AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      ),
    );
  }

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

/** Traces a rounded-rectangle path (no reliance on ctx.roundRect availability). */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Helper to draw a rounded, glowing neon panel with a title + body lines. */
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
    bg,
    border = '#00ffff',
    align = 'center',
  } = opts;

  ctx.clearRect(0, 0, w, h);
  ctx.save();

  // Rounded panel body — vertical gradient unless a solid bg is supplied.
  const pad = 14;
  roundRectPath(ctx, pad, pad, w - pad * 2, h - pad * 2, 34);
  if (bg) {
    ctx.fillStyle = bg;
  } else {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(10,14,40,0.92)');
    grad.addColorStop(1, 'rgba(2,2,12,0.92)');
    ctx.fillStyle = grad;
  }
  ctx.fill();

  // Glowing neon border — a soft wide glow pass, then a crisp inner line.
  ctx.strokeStyle = border;
  ctx.shadowColor = border;
  ctx.shadowBlur = 34;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.shadowBlur = 14;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  const cx = align === 'center' ? w / 2 : 56;

  let y = title ? h * 0.24 : h * 0.5 - (lines.length * lineSize * 1.4) / 2;

  if (title) {
    ctx.font = `bold ${titleSize}px system-ui, "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = titleColor;
    ctx.shadowColor = titleColor;
    ctx.shadowBlur = 26;
    ctx.fillText(title, cx, y); // double-draw deepens the neon glow
    ctx.fillText(title, cx, y);
    ctx.shadowBlur = 0;
    y = h * 0.44;
  }

  ctx.font = `${lineSize}px system-ui, "Segoe UI", Arial, sans-serif`;
  ctx.fillStyle = lineColor;
  ctx.shadowColor = lineColor;
  ctx.shadowBlur = 10;
  for (const line of lines) {
    ctx.fillText(line, cx, y);
    y += lineSize * 1.4;
  }

  ctx.restore();
}
