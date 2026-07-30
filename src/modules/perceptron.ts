// perceptron page
import type { Alpine } from 'alpinejs';
import { COLORS, alpha } from './shared/chart';
import { waitForCanvas, initHDPI } from './shared/canvas';

const RANGE = 5;
const pad = { left: 30, right: 15, top: 15, bottom: 28 };
const STEP_MS = 240;
const PULSE_MS = 700;
const MAX_TRAIL = 10;
const MAX_CYCLES = 5;

type Pt = { x: number; y: number; label: 1 | -1 };
type Boundary = { t1: number; t2: number; t0: number };

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const N_POINTS = 40;

function isLinearlySeparable(points: Pt[], maxPasses = 500): boolean {
  let t1 = 0, t2 = 0, t0 = 0;
  for (let pass = 0; pass < maxPasses; pass++) {
    let mistake = false;
    for (const p of points) {
      const score = p.label * (t1 * p.x + t2 * p.y + t0);
      if (score <= 0) {
        t1 += p.label * p.x;
        t2 += p.label * p.y;
        t0 += p.label;
        mistake = true;
      }
    }
    if (!mistake) return true;
  }
  return false;
}

function generateSeparable(seed: number, n = N_POINTS): Pt[] {
  const rng = mulberry32(seed);
  const angle = rng() * 2 * Math.PI;
  const nx = Math.cos(angle);
  const ny = Math.sin(angle);
  const offset = (rng() - 0.5) * RANGE * 0.4;
  const minMargin = 0.35;
  const spread = RANGE * 0.9;
  const targetPos = Math.floor(n / 2);
  const targetNeg = n - targetPos;

  const pts: Pt[] = [];
  let posCount = 0, negCount = 0;
  const maxAttempts = n * 50;
  let attempts = 0;

  while (pts.length < n && attempts < maxAttempts) {
    attempts++;
    const x = (rng() - 0.5) * 2 * spread;
    const y = (rng() - 0.5) * 2 * spread;
    const signedDist = nx * x + ny * y + offset;
    if (Math.abs(signedDist) < minMargin) continue;
    const label: 1 | -1 = signedDist > 0 ? 1 : -1;
    if (label === 1 && posCount >= targetPos) continue;
    if (label === -1 && negCount >= targetNeg) continue;
    pts.push({ x, y, label });
    if (label === 1) posCount++; else negCount++;
  }
  return pts;
}

function generateNonseparable(seed: number, n = N_POINTS): Pt[] {
  const rng = mulberry32(seed);
  const spread = RANGE * 0.9;
  const targetPos = Math.floor(n / 2);
  const maxAttempts = 200;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const pts: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const x = (rng() - 0.5) * 2 * spread;
      const y = (rng() - 0.5) * 2 * spread;
      const label: 1 | -1 = i < targetPos ? 1 : -1;
      pts.push({ x, y, label });
    }
    if (!isLinearlySeparable(pts, 800)) return pts;
  }
  return [];
}

function generatePreset(name: string, seed: number): Pt[] {
  if (name === 'separable') return generateSeparable(seed);
  if (name === 'nonseparable') return generateNonseparable(seed);
  return [];
}

const DEFAULT_SEEDS: Record<string, number> = {
  separable: 1337,
  nonseparable: 4242,
  blank: 0,
};



function classify(p: Pt, b: Boundary): number {
  return p.label * (b.t1 * p.x + b.t2 * p.y + b.t0);
}

function lerpBoundary(a: Boundary, b: Boundary, t: number): Boundary {
  return {
    t1: a.t1 + (b.t1 - a.t1) * t,
    t2: a.t2 + (b.t2 - a.t2) * t,
    t0: a.t0 + (b.t0 - a.t0) * t,
  };
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function computeMargin(points: Pt[], b: Boundary): number {
  const norm = Math.hypot(b.t1, b.t2);
  if (norm < 1e-9 || points.length === 0) return 0;
  let m = Infinity;
  for (const p of points) {
    const d = p.label * (b.t1 * p.x + b.t2 * p.y + b.t0) / norm;
    if (d < m) m = d;
  }
  return m;
}

function boundarySegment(b: Boundary): [[number, number], [number, number]] | null {
  const { t1, t2, t0 } = b;
  const norm2 = t1 * t1 + t2 * t2;
  if (norm2 < 1e-12) return null;
  const inv = 1 / Math.sqrt(norm2);
  const x0 = -t0 * t1 / norm2;
  const y0 = -t0 * t2 / norm2;
  const dx = -t2 * inv;
  const dy = t1 * inv;

  let tMinus = -Infinity;
  let tPlus = Infinity;
  if (Math.abs(dx) > 1e-9) {
    const a = (-RANGE - x0) / dx;
    const b2 = (RANGE - x0) / dx;
    const [lo, hi] = a < b2 ? [a, b2] : [b2, a];
    if (lo > tMinus) tMinus = lo;
    if (hi < tPlus) tPlus = hi;
  } else if (x0 < -RANGE || x0 > RANGE) {
    return null;
  }
  if (Math.abs(dy) > 1e-9) {
    const a = (-RANGE - y0) / dy;
    const b2 = (RANGE - y0) / dy;
    const [lo, hi] = a < b2 ? [a, b2] : [b2, a];
    if (lo > tMinus) tMinus = lo;
    if (hi < tPlus) tPlus = hi;
  } else if (y0 < -RANGE || y0 > RANGE) {
    return null;
  }
  if (tPlus <= tMinus) return null;
  return [
    [x0 + tMinus * dx, y0 + tMinus * dy],
    [x0 + tPlus * dx, y0 + tPlus * dy],
  ];
}

export default function (Alpine: Alpine) {
  Alpine.data('perceptron', () => {
    let canvas: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    let animRaf: number | null = null;
    let animT = 1;
    let animStart = 0;
    let animFrom: Boundary | null = null;
    let animTo: Boundary | null = null;
    let renderRaf: number | null = null;
    let runTimer: number | null = null;
    let cursorIdx = 0;
    let cycleClean = 0;
    let lastMistake: { idx: number; ts: number } | null = null;
    let history: Boundary[] = [];

    function makeCoords(W: number, H: number) {
      const pw = W - pad.left - pad.right;
      const ph = H - pad.top - pad.bottom;
      return {
        pw, ph,
        toX: (x: number) => pad.left + ((x + RANGE) / (2 * RANGE)) * pw,
        toY: (y: number) => pad.top + ph - ((y + RANGE) / (2 * RANGE)) * ph,
        fromX: (px: number) => ((px - pad.left) / pw) * (2 * RANGE) - RANGE,
        fromY: (py: number) => RANGE - ((py - pad.top) / ph) * (2 * RANGE),
      };
    }

    function drawAxes(c: CanvasRenderingContext2D, W: number, H: number) {
      const { pw, ph, toX, toY } = makeCoords(W, H);
      c.strokeStyle = alpha(COLORS.pottersClay, 0.35);
      c.lineWidth = 0.5;
      const ox = toX(0), oy = toY(0);
      c.beginPath(); c.moveTo(pad.left, oy); c.lineTo(pad.left + pw, oy); c.stroke();
      c.beginPath(); c.moveTo(ox, pad.top); c.lineTo(ox, pad.top + ph); c.stroke();

      c.font = '9px var(--font-mono, monospace)';
      c.fillStyle = COLORS.pottersClay;
      c.textAlign = 'center';
      for (let v = -RANGE + 1; v <= RANGE - 1; v++) {
        if (v === 0) continue;
        const px = toX(v);
        c.fillText(String(v), px, oy + 12);
        c.beginPath(); c.moveTo(px, oy - 2); c.lineTo(px, oy + 2); c.stroke();
      }
      c.textAlign = 'right';
      for (let v = -RANGE + 1; v <= RANGE - 1; v++) {
        if (v === 0) continue;
        const py = toY(v);
        c.fillText(String(v), ox - 5, py + 3);
        c.beginPath(); c.moveTo(ox - 2, py); c.lineTo(ox + 2, py); c.stroke();
      }

      c.font = '11px var(--font-mono, monospace)';
      c.textAlign = 'center';
      c.fillText('x₁', pad.left + pw / 2, pad.top + ph + 22);
      c.save();
      c.translate(10, pad.top + ph / 2);
      c.rotate(-Math.PI / 2);
      c.fillText('x₂', 0, 0);
      c.restore();
    }

    function drawShadedHalfPlanes(c: CanvasRenderingContext2D, W: number, H: number, b: Boundary) {
      const { pw, ph, toX, toY } = makeCoords(W, H);
      const { t1, t2, t0 } = b;
      if (Math.hypot(t1, t2) < 1e-9) return;

      const corners: [number, number][] = [
        [-RANGE, -RANGE], [RANGE, -RANGE], [RANGE, RANGE], [-RANGE, RANGE],
      ];

      const buildPoly = (positive: boolean): [number, number][] => {
        const poly: [number, number][] = [];
        for (let i = 0; i < 4; i++) {
          const cur = corners[i]!;
          const next = corners[(i + 1) % 4]!;
          const curSide = t1 * cur[0] + t2 * cur[1] + t0;
          const nextSide = t1 * next[0] + t2 * next[1] + t0;
          const curIn = positive ? curSide >= 0 : curSide <= 0;
          const nextIn = positive ? nextSide >= 0 : nextSide <= 0;
          if (curIn) poly.push(cur);
          if (curIn !== nextIn) {
            const s = curSide / (curSide - nextSide);
            poly.push([cur[0] + (next[0] - cur[0]) * s, cur[1] + (next[1] - cur[1]) * s]);
          }
        }
        return poly;
      };

      c.save();
      c.beginPath();
      c.rect(pad.left, pad.top, pw, ph);
      c.clip();

      for (const [positive, color] of [[true, COLORS.olivine], [false, COLORS.sienna]] as const) {
        const poly = buildPoly(positive);
        if (poly.length < 3) continue;
        c.beginPath();
        c.moveTo(toX(poly[0]![0]), toY(poly[0]![1]));
        for (let i = 1; i < poly.length; i++) c.lineTo(toX(poly[i]![0]), toY(poly[i]![1]));
        c.closePath();
        c.fillStyle = alpha(color, 0.02);
        c.fill();
      }

      c.restore();
    }

    function drawBoundary(
      c: CanvasRenderingContext2D, W: number, H: number,
      b: Boundary, color: string, width: number, alphaVal = 1,
    ) {
      const seg = boundarySegment(b);
      if (!seg) return;
      const { pw, ph, toX, toY } = makeCoords(W, H);
      c.save();
      c.beginPath();
      c.rect(pad.left, pad.top, pw, ph);
      c.clip();
      c.beginPath();
      c.moveTo(toX(seg[0][0]), toY(seg[0][1]));
      c.lineTo(toX(seg[1][0]), toY(seg[1][1]));
      c.strokeStyle = alphaVal < 1 ? alpha(color, alphaVal) : color;
      c.lineWidth = width;
      c.stroke();
      c.restore();
    }

    function drawBoundaryGlow(
      c: CanvasRenderingContext2D, W: number, H: number,
      b: Boundary, color: string, marginExtent: number,
    ) {
      const seg = boundarySegment(b);
      if (!seg) return;
      const { pw, ph, toX, toY } = makeCoords(W, H);
      const pxPerUnit = (pw / (2 * RANGE) + ph / (2 * RANGE)) / 2;
      const marginPx = Math.max(6, marginExtent * pxPerUnit);

      c.save();
      c.beginPath();
      c.rect(pad.left, pad.top, pw, ph);
      c.clip();
      c.lineCap = 'round';

      const passes: Array<[number, number]> = [
        [marginPx * 2.2, 0.05],
        [marginPx * 1.4, 0.11],
        [marginPx * 0.7, 0.22],
        [2.2, 1.0],
      ];
      for (const [w, a] of passes) {
        c.beginPath();
        c.moveTo(toX(seg[0][0]), toY(seg[0][1]));
        c.lineTo(toX(seg[1][0]), toY(seg[1][1]));
        c.strokeStyle = a < 1 ? alpha(color, a) : color;
        c.lineWidth = w;
        c.stroke();
      }
      c.restore();
    }

    type ArrowGeom = {
      sx: number; sy: number;
      nPxX: number; nPxY: number;
      bDirX: number; bDirY: number;
      pxPerUnit: number;
    };

    function computeArrowGeom(W: number, H: number, b: Boundary): ArrowGeom | null {
      const { t1, t2 } = b;
      const norm = Math.hypot(t1, t2);
      if (norm < 1e-9) return null;
      const { pw, ph, toX, toY } = makeCoords(W, H);
      const seg = boundarySegment(b);
      if (!seg) return null;
      const bpx1 = toX(seg[0][0]);
      const bpy1 = toY(seg[0][1]);
      const bpx2 = toX(seg[1][0]);
      const bpy2 = toY(seg[1][1]);
      const bdx = bpx2 - bpx1;
      const bdy = bpy2 - bpy1;
      const blen = Math.hypot(bdx, bdy);
      if (blen < 1) return null;

      const thetaPxX = (t1 / norm) * (pw / (2 * RANGE));
      const thetaPxY = -(t2 / norm) * (ph / (2 * RANGE));
      const c1x = -bdy / blen, c1y = bdx / blen;
      const c2x = bdy / blen, c2y = -bdx / blen;
      const useC1 = c1x * thetaPxX + c1y * thetaPxY >= c2x * thetaPxX + c2y * thetaPxY;
      return {
        sx: (bpx1 + bpx2) / 2,
        sy: (bpy1 + bpy2) / 2,
        nPxX: useC1 ? c1x : c2x,
        nPxY: useC1 ? c1y : c2y,
        bDirX: bdx / blen,
        bDirY: bdy / blen,
        pxPerUnit: (pw / (2 * RANGE) + ph / (2 * RANGE)) / 2,
      };
    }

    function drawNormalArrow(
      c: CanvasRenderingContext2D, W: number, H: number,
      b: Boundary, marginExtent: number, showAnnotations: boolean,
    ) {
      const g = computeArrowGeom(W, H, b);
      if (!g) return;
      const { pw, ph } = makeCoords(W, H);
      const { sx, sy, nPxX, nPxY, bDirX, bDirY, pxPerUnit } = g;

      const marginPx = marginExtent * pxPerUnit;
      const arrowLen = Math.min(150, Math.max(95, marginPx + 40));
      const ex = sx + nPxX * arrowLen;
      const ey = sy + nPxY * arrowLen;

      c.save();
      c.beginPath();
      c.rect(pad.left, pad.top, pw, ph);
      c.clip();

      if (showAnnotations) {
        const sz = 9;
        c.strokeStyle = alpha(COLORS.colonial, 0.75);
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(sx + bDirX * sz, sy + bDirY * sz);
        c.lineTo(sx + bDirX * sz + nPxX * sz, sy + bDirY * sz + nPxY * sz);
        c.lineTo(sx + nPxX * sz, sy + nPxY * sz);
        c.stroke();
      }

      c.strokeStyle = alpha(COLORS.colonial, 0.95);
      c.fillStyle = alpha(COLORS.colonial, 0.95);
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(sx, sy);
      c.lineTo(ex, ey);
      c.stroke();

      const ang = Math.atan2(ey - sy, ex - sx);
      const head = 8;
      c.beginPath();
      c.moveTo(ex, ey);
      c.lineTo(ex - head * Math.cos(ang - Math.PI / 6), ey - head * Math.sin(ang - Math.PI / 6));
      c.lineTo(ex - head * Math.cos(ang + Math.PI / 6), ey - head * Math.sin(ang + Math.PI / 6));
      c.closePath();
      c.fill();

      if (showAnnotations) {
        const labelOffset = 18;
        const lx = ex + nPxX * labelOffset;
        const ly = ey + nPxY * labelOffset;
        c.font = 'italic 34px var(--font-display, Georgia, serif)';
        c.fillStyle = COLORS.colonial;
        c.textAlign = nPxX > 0.15 ? 'left' : nPxX < -0.15 ? 'right' : 'center';
        c.textBaseline = nPxY > 0.15 ? 'top' : nPxY < -0.15 ? 'bottom' : 'middle';
        c.fillText('θ', lx, ly);
      }

      c.restore();
    }

    function drawMarginAnnotation(c: CanvasRenderingContext2D, W: number, H: number, b: Boundary, marginExtent: number) {
      const g = computeArrowGeom(W, H, b);
      if (!g) return;
      const { pw, ph } = makeCoords(W, H);
      const { sx, sy, nPxX, nPxY, bDirX, bDirY, pxPerUnit } = g;

      const marginPx = marginExtent * pxPerUnit;
      if (marginPx < 8) return;

      const tx = sx + nPxX * marginPx;
      const ty = sy + nPxY * marginPx;
      const tickSz = 6;

      c.save();
      c.beginPath();
      c.rect(pad.left, pad.top, pw, ph);
      c.clip();

      c.strokeStyle = alpha(COLORS.colonial, 0.55);
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(tx - bDirX * tickSz, ty - bDirY * tickSz);
      c.lineTo(tx + bDirX * tickSz, ty + bDirY * tickSz);
      c.stroke();

      const labelOff = 14;
      const lx = tx + bDirX * labelOff;
      const ly = ty + bDirY * labelOff;
      c.font = 'italic 26px var(--font-display, Georgia, serif)';
      c.fillStyle = alpha(COLORS.colonial, 0.9);
      c.textAlign = bDirX > 0.15 ? 'left' : bDirX < -0.15 ? 'right' : 'center';
      c.textBaseline = bDirY > 0.15 ? 'top' : bDirY < -0.15 ? 'bottom' : 'middle';
      c.fillText('γ', lx, ly);

      c.restore();
    }

    function drawBoundaryFormula(c: CanvasRenderingContext2D, W: number, H: number, b: Boundary, marginExtent: number) {
      const { t1, t2, t0 } = b;
      if (Math.hypot(t1, t2) < 1e-9) return;
      const g = computeArrowGeom(W, H, b);
      if (!g) return;
      const { pw, ph, toX, toY } = makeCoords(W, H);
      const { nPxX, nPxY, pxPerUnit } = g;
      const seg = boundarySegment(b);
      if (!seg) return;

      const fmt = (v: number) => {
        const rounded = Math.round(v * 10) / 10;
        const val = rounded === 0 ? 0 : rounded;
        return Number.isInteger(val) ? String(val) : val.toFixed(1);
      };

      const text =
        fmt(t1) + 'x₁'
        + (t2 >= 0 ? ' + ' : ' − ') + fmt(Math.abs(t2)) + 'x₂'
        + (t0 >= 0 ? ' + ' : ' − ') + fmt(Math.abs(t0))
        + ' = 0';

      const bpx1 = toX(seg[0][0]);
      const bpy1 = toY(seg[0][1]);
      const bpx2 = toX(seg[1][0]);
      const bpy2 = toY(seg[1][1]);
      // pick the topmost endpoint (smaller py) so formula lives near top of the line
      const topFirst = bpy1 <= bpy2;
      const ex = topFirst ? bpx1 : bpx2;
      const ey = topFirst ? bpy1 : bpy2;
      const dx = topFirst ? bpx2 - bpx1 : bpx1 - bpx2;
      const dy = topFirst ? bpy2 - bpy1 : bpy1 - bpy2;
      const lineLen = Math.hypot(dx, dy);
      if (lineLen < 1) return;

      c.save();
      c.beginPath();
      c.rect(pad.left, pad.top, pw, ph);
      c.clip();

      c.font = '13px var(--font-mono, monospace)';
      const tw = c.measureText(text).width;
      const halfFrac = tw / (2 * lineLen);
      const anchorFrac = Math.min(0.5, Math.max(halfFrac + 0.04, 0.14));

      const ax = ex + dx * anchorFrac;
      const ay = ey + dy * anchorFrac;

      const marginPx = marginExtent * pxPerUnit;
      const offset = Math.max(22, marginPx + 14);
      const px = ax - nPxX * offset;
      const py = ay - nPxY * offset;

      let ang = Math.atan2(dy, dx);
      if (Math.cos(ang) < 0) ang += Math.PI;

      c.translate(px, py);
      c.rotate(ang);

      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineWidth = 3.5;
      c.strokeStyle = alpha(COLORS.graphite, 0.9);
      c.strokeText(text, 0, 0);
      c.fillStyle = COLORS.colonial;
      c.fillText(text, 0, 0);

      c.restore();
    }

    function drawClassCornerLabels(c: CanvasRenderingContext2D, W: number, H: number, b: Boundary) {
      const { t1, t2 } = b;
      if (Math.hypot(t1, t2) < 1e-9) return;
      const { toX, toY } = makeCoords(W, H);
      const posX = t1 >= 0 ? RANGE - 0.5 : -RANGE + 0.5;
      const posY = t2 >= 0 ? RANGE - 0.5 : -RANGE + 0.5;
      const negX = -posX;
      const negY = -posY;

      c.save();
      c.font = 'bold 15px var(--font-mono, monospace)';
      c.textBaseline = 'middle';
      c.textAlign = 'center';
      c.fillStyle = alpha(COLORS.olivine, 0.7);
      c.fillText('+1', toX(posX), toY(posY));
      c.fillStyle = alpha(COLORS.sienna, 0.7);
      c.fillText('−1', toX(negX), toY(negY));
      c.restore();
    }

    function drawPoints(
      c: CanvasRenderingContext2D, W: number, H: number,
      points: Pt[], mistakeIdx: number | null, pulseT: number,
    ) {
      const { toX, toY } = makeCoords(W, H);
      const R = 8;
      const cp = R * 0.1 * Math.SQRT1_2;

      if (mistakeIdx !== null && pulseT < 1 && points[mistakeIdx]) {
        const p = points[mistakeIdx]!;
        const cx = toX(p.x), cy = toY(p.y);
        const posColor = p.label === 1 ? COLORS.olivine : COLORS.sienna;
        const eased = easeInOut(pulseT);
        const ringR = R + eased * 18;
        const ringA = (1 - eased) * 0.85;
        c.beginPath();
        c.arc(cx, cy, ringR, 0, Math.PI * 2);
        c.strokeStyle = alpha(posColor, ringA);
        c.lineWidth = 2;
        c.stroke();
      }

      const sparkPath = (ox: number, oy: number) => {
        c.beginPath();
        c.moveTo(ox, oy - R);
        c.quadraticCurveTo(ox + cp, oy - cp, ox + R, oy);
        c.quadraticCurveTo(ox + cp, oy + cp, ox, oy + R);
        c.quadraticCurveTo(ox - cp, oy + cp, ox - R, oy);
        c.quadraticCurveTo(ox - cp, oy - cp, ox, oy - R);
        c.closePath();
      };

      for (const p of points) {
        const cx = toX(p.x), cy = toY(p.y);
        const baseHex = p.label === 1 ? COLORS.olivine : COLORS.sienna;

        sparkPath(cx, cy);
        c.fillStyle = baseHex;
        c.fill();
        c.strokeStyle = COLORS.graphite;
        c.lineWidth = 0.9;
        c.stroke();

        c.save();
        c.clip();
        c.strokeStyle = '#ffffff';
        c.lineWidth = 0.6;
        c.beginPath();
        c.moveTo(cx - R * 0.08 + 0.5, cy - R * 0.4 + 0.5);
        c.quadraticCurveTo(cx - R * 0.14 + 0.5, cy - R * 0.14 + 0.5, cx - R * 0.4 + 0.5, cy - R * 0.08 + 0.5);
        c.stroke();
        c.restore();
      }
    }

    function cancelAnim() {
      if (animRaf) { cancelAnimationFrame(animRaf); animRaf = null; }
      animT = 1;
      animFrom = null;
      animTo = null;
    }

    function stopRun() {
      if (runTimer !== null) { clearTimeout(runTimer); runTimer = null; }
    }

    function scheduleRender(self: any) {
      if (renderRaf !== null) return;
      renderRaf = requestAnimationFrame(() => {
        renderRaf = null;
        self.render();
      });
    }

    return {
      dataset: 'separable',
      seed: DEFAULT_SEEDS.separable!,
      clickLabel: 1 as 1 | -1,
      speed: '250',
      running: false,
      converged: false,
      nonseparableFlag: false,
      stepCount: 0,
      mistakeCount: 0,
      thetaDisplay: '',
      marginDisplay: '',
      points: [] as Pt[],
      theta: { t1: 0, t2: 0, t0: 0 } as Boundary,

      init() {
        const self = this;
        waitForCanvas('pc-plot', (c) => {
          canvas = c;
          const context = initHDPI(c);
          if (context) ctx = context;

          c.addEventListener('click', (e) => {
            if (self.running) return;
            const rect = c.getBoundingClientRect();
            const { fromX, fromY } = makeCoords(rect.width, rect.height);
            const x = fromX(e.clientX - rect.left);
            const y = fromY(e.clientY - rect.top);
            if (x < -RANGE || x > RANGE || y < -RANGE || y > RANGE) return;
            self.points.push({ x, y, label: self.clickLabel });
            self.converged = false;
            self.nonseparableFlag = false;
            cycleClean = 0;
            self.render();
          });

          self.loadPreset();
        });
      },

      loadPreset() {
        this.setSeed(DEFAULT_SEEDS[this.dataset] ?? 0);
      },

      setSeed(seed: number) {
        cancelAnim();
        stopRun();
        this.running = false;
        this.seed = seed;
        this.points = generatePreset(this.dataset, seed);
        this.doReset();
      },

      randomize() {
        if (this.dataset === 'blank') return;
        this.setSeed(Math.floor(Math.random() * 1e9));
      },

      doReset() {
        cancelAnim();
        stopRun();
        this.running = false;
        this.theta = { t1: 0, t2: 0, t0: 0 };
        this.stepCount = 0;
        this.mistakeCount = 0;
        this.converged = false;
        this.nonseparableFlag = false;
        this.thetaDisplay = '';
        this.marginDisplay = '';
        cursorIdx = 0;
        cycleClean = 0;
        lastMistake = null;
        history = [];
        this.render();
      },

      reset() {
        this.doReset();
      },

      step() {
        if (this.converged || this.points.length === 0) return;
        if (animT < 1) return;

        const n = this.points.length;
        let scanned = 0;
        while (scanned < n) {
          const p = this.points[cursorIdx]!;
          const score = classify(p, this.theta);
          if (score <= 0) {
            const oldTheta = { ...this.theta };
            const newTheta: Boundary = {
              t1: oldTheta.t1 + p.label * p.x,
              t2: oldTheta.t2 + p.label * p.y,
              t0: oldTheta.t0 + p.label,
            };
            this.mistakeCount++;
            this.stepCount++;
            lastMistake = { idx: cursorIdx, ts: performance.now() };

            if (Math.hypot(oldTheta.t1, oldTheta.t2) > 1e-9) {
              history.push(oldTheta);
              if (history.length > MAX_TRAIL) history.shift();
            }

            this.theta = newTheta;
            cycleClean = 0;
            cursorIdx = (cursorIdx + 1) % n;
            this.updateDisplay();

            if (this.mistakeCount >= n * MAX_CYCLES) {
              this.nonseparableFlag = true;
              this.running = false;
              stopRun();
            }

            animFrom = oldTheta;
            animTo = newTheta;
            animT = 0;
            animStart = performance.now();
            const self = this;
            const tick = (now: number) => {
              animT = Math.min((now - animStart) / STEP_MS, 1);
              self.render();
              if (animT < 1) {
                animRaf = requestAnimationFrame(tick);
              } else {
                cancelAnim();
                self.render();
              }
            };
            animRaf = requestAnimationFrame(tick);
            return;
          }

          cursorIdx = (cursorIdx + 1) % n;
          cycleClean++;
          scanned++;

          if (cycleClean >= n) {
            this.converged = true;
            this.running = false;
            stopRun();
            this.updateDisplay();
            this.render();
            return;
          }
        }
      },

      toggleRun() {
        if (this.running) {
          this.running = false;
          stopRun();
          return;
        }
        if (this.converged || this.points.length === 0) return;
        this.running = true;
        this.nonseparableFlag = false;
        const self = this;
        const tick = () => {
          if (!self.running) return;
          if (self.converged || self.nonseparableFlag) {
            self.running = false;
            return;
          }
          self.step();
          const wait = Math.max(STEP_MS + 40, parseInt(self.speed));
          runTimer = window.setTimeout(tick, wait);
        };
        tick();
      },

      updateDisplay() {
        const { t1, t2, t0 } = this.theta;
        if (Math.hypot(t1, t2) > 1e-9) {
          this.thetaDisplay = `(${t1.toFixed(1)}, ${t2.toFixed(1)})  θ₀ = ${t0.toFixed(1)}`;
        } else {
          this.thetaDisplay = '';
        }
        if (this.converged) {
          this.marginDisplay = computeMargin(this.points, this.theta).toFixed(3);
        } else {
          this.marginDisplay = '';
        }
      },

      render() {
        if (!canvas || !ctx) return;
        const W = canvas.getBoundingClientRect().width;
        const H = canvas.getBoundingClientRect().height;

        ctx.clearRect(0, 0, W * 3, H * 3);
        drawAxes(ctx, W, H);

        let b: Boundary = this.theta;
        if (animFrom && animTo && animT < 1) {
          b = lerpBoundary(animFrom, animTo, easeInOut(animT));
        }

        for (let i = 0; i < history.length; i++) {
          const bh = history[i]!;
          const a = 0.04 + (i / MAX_TRAIL) * 0.14;
          drawBoundary(ctx, W, H, bh, COLORS.teak, 1, a);
        }

        if (Math.hypot(b.t1, b.t2) > 1e-9) {
          drawShadedHalfPlanes(ctx, W, H, b);

          const activeColor = COLORS.colonial;
          const marginNow = this.converged ? computeMargin(this.points, b) : 0.4;
          const extent = this.converged
            ? Math.max(0.4, Math.min(2.0, marginNow))
            : 0.4;
          drawBoundaryGlow(ctx, W, H, b, activeColor, extent);
          drawNormalArrow(ctx, W, H, b, extent, this.converged);
          if (this.converged) {
            drawMarginAnnotation(ctx, W, H, b, extent);
            drawClassCornerLabels(ctx, W, H, b);
          }
          drawBoundaryFormula(ctx, W, H, b, extent);
        }

        let pulseT = 1;
        let mistakeIdx: number | null = null;
        if (lastMistake) {
          const dt = (performance.now() - lastMistake.ts) / PULSE_MS;
          if (dt < 1) {
            pulseT = dt;
            mistakeIdx = lastMistake.idx;
            scheduleRender(this);
          } else {
            lastMistake = null;
          }
        }
        drawPoints(ctx, W, H, this.points, mistakeIdx, pulseT);
      },
    };
  });
}
