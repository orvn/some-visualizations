// kernel-lift page
import type { Alpine } from 'alpinejs';
import { COLORS, alpha } from './shared/chart';
import { waitForCanvas, initHDPI } from './shared/canvas';

const RANGE = 4;
const MAX_TILT = Math.PI / 2.6;
const LIFT_MS = 900;
const Z_SCALE = 0.4;
const DEFAULT_SEED = 42;

type Pt = { x: number; y: number; label: 1 | -1 };

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

function generateRings(seed: number, n = 40): Pt[] {
  const rng = mulberry32(seed);
  const pts: Pt[] = [];
  const half = Math.floor(n / 2);
  for (let i = 0; i < half; i++) {
    const r = 0.55 + rng() * 0.75;
    const theta = rng() * Math.PI * 2;
    pts.push({ x: r * Math.cos(theta), y: r * Math.sin(theta), label: -1 });
  }
  for (let i = 0; i < n - half; i++) {
    const r = 2.35 + rng() * 0.75;
    const theta = rng() * Math.PI * 2;
    pts.push({ x: r * Math.cos(theta), y: r * Math.sin(theta), label: 1 });
  }
  return pts;
}

function liftedZ(x: number, y: number): number {
  return Z_SCALE * (x * x + y * y);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export default function (Alpine: Alpine) {
  Alpine.data('kernelLift', () => {
    let canvas: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    let animRaf: number | null = null;
    let currentTilt = 0;
    let points: Pt[] = generateRings(DEFAULT_SEED);

    function project(
      x: number, y: number, z: number, W: number, H: number,
    ): { sx: number; sy: number } {
      const ang = currentTilt * MAX_TILT;
      const scale = Math.min(W, H) * 0.09;
      const cx = W / 2;
      const cy = H * 0.56;
      const worldY = y * Math.cos(ang) - z * Math.sin(ang);
      return { sx: cx + x * scale, sy: cy + worldY * scale };
    }

    function drawFloorGrid(c: CanvasRenderingContext2D, W: number, H: number) {
      const a = 0.14 + currentTilt * 0.14;
      c.strokeStyle = alpha(COLORS.teak, a);
      c.lineWidth = 0.6;
      const step = 1;
      for (let v = -RANGE; v <= RANGE; v += step) {
        const p1 = project(-RANGE, v, 0, W, H);
        const p2 = project(RANGE, v, 0, W, H);
        c.beginPath();
        c.moveTo(p1.sx, p1.sy);
        c.lineTo(p2.sx, p2.sy);
        c.stroke();
        const q1 = project(v, -RANGE, 0, W, H);
        const q2 = project(v, RANGE, 0, W, H);
        c.beginPath();
        c.moveTo(q1.sx, q1.sy);
        c.lineTo(q2.sx, q2.sy);
        c.stroke();
      }
    }

    function drawParaboloid(c: CanvasRenderingContext2D, W: number, H: number) {
      if (currentTilt < 0.08) return;
      const a = ((currentTilt - 0.08) / 0.92) * 0.35;
      c.strokeStyle = alpha(COLORS.teak, a);
      c.lineWidth = 0.5;
      c.setLineDash([3, 2]);

      const RINGS = 6;
      for (let ri = 1; ri <= RINGS; ri++) {
        const r = (ri / RINGS) * RANGE;
        const z = liftedZ(r, 0);
        const segs = 48;
        c.beginPath();
        for (let s = 0; s <= segs; s++) {
          const theta = (s / segs) * Math.PI * 2;
          const px = r * Math.cos(theta);
          const py = r * Math.sin(theta);
          const p = project(px, py, z, W, H);
          if (s === 0) c.moveTo(p.sx, p.sy);
          else c.lineTo(p.sx, p.sy);
        }
        c.stroke();
      }

      const RADIALS = 12;
      for (let s = 0; s < RADIALS; s++) {
        const theta = (s / RADIALS) * Math.PI * 2;
        const segs = 24;
        c.beginPath();
        for (let i = 0; i <= segs; i++) {
          const r = (i / segs) * RANGE;
          const px = r * Math.cos(theta);
          const py = r * Math.sin(theta);
          const z = liftedZ(px, py);
          const p = project(px, py, z, W, H);
          if (i === 0) c.moveTo(p.sx, p.sy);
          else c.lineTo(p.sx, p.sy);
        }
        c.stroke();
      }

      c.setLineDash([]);
    }

    function drawPlane(c: CanvasRenderingContext2D, W: number, H: number, z: number) {
      if (currentTilt < 0.12) return;
      const a = ((currentTilt - 0.12) / 0.88) * 0.16;
      const corners = [
        project(-RANGE, -RANGE, z, W, H),
        project(RANGE, -RANGE, z, W, H),
        project(RANGE, RANGE, z, W, H),
        project(-RANGE, RANGE, z, W, H),
      ];
      c.fillStyle = alpha(COLORS.colonial, a);
      c.strokeStyle = alpha(COLORS.colonial, 0.45 * currentTilt);
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(corners[0]!.sx, corners[0]!.sy);
      for (let i = 1; i < 4; i++) c.lineTo(corners[i]!.sx, corners[i]!.sy);
      c.closePath();
      c.fill();
      c.stroke();
    }

    function drawBoundaryOnPlane(
      c: CanvasRenderingContext2D, W: number, H: number, r: number, z: number,
    ) {
      // The circle where the plane meets the paraboloid (drawn at height z on the plane)
      c.strokeStyle = alpha(COLORS.colonial, 0.95);
      c.lineWidth = 2;
      const segs = 96;
      c.beginPath();
      for (let s = 0; s <= segs; s++) {
        const theta = (s / segs) * Math.PI * 2;
        const px = r * Math.cos(theta);
        const py = r * Math.sin(theta);
        const p = project(px, py, z, W, H);
        if (s === 0) c.moveTo(p.sx, p.sy);
        else c.lineTo(p.sx, p.sy);
      }
      c.stroke();
    }

    function drawBoundaryShadow(
      c: CanvasRenderingContext2D, W: number, H: number, r: number,
    ) {
      // Circle at z=0 — the 2D projected boundary
      const shadowA = currentTilt > 0.1 ? 0.5 : 0.95;
      c.strokeStyle = alpha(COLORS.colonial, shadowA);
      c.lineWidth = currentTilt > 0.1 ? 1.2 : 2;
      c.setLineDash(currentTilt > 0.1 ? [4, 3] : []);
      const segs = 96;
      c.beginPath();
      for (let s = 0; s <= segs; s++) {
        const theta = (s / segs) * Math.PI * 2;
        const px = r * Math.cos(theta);
        const py = r * Math.sin(theta);
        const p = project(px, py, 0, W, H);
        if (s === 0) c.moveTo(p.sx, p.sy);
        else c.lineTo(p.sx, p.sy);
      }
      c.stroke();
      c.setLineDash([]);
    }

    function drawSpark(
      c: CanvasRenderingContext2D, cx: number, cy: number, R: number, color: string,
    ) {
      const cp = R * 0.1 * Math.SQRT1_2;
      c.beginPath();
      c.moveTo(cx, cy - R);
      c.quadraticCurveTo(cx + cp, cy - cp, cx + R, cy);
      c.quadraticCurveTo(cx + cp, cy + cp, cx, cy + R);
      c.quadraticCurveTo(cx - cp, cy + cp, cx - R, cy);
      c.quadraticCurveTo(cx - cp, cy - cp, cx, cy - R);
      c.closePath();
      c.fillStyle = color;
      c.fill();
      c.strokeStyle = COLORS.graphite;
      c.lineWidth = 0.9;
      c.stroke();

      c.save();
      c.clip();
      c.strokeStyle = alpha('#ffffff', 0.4);
      c.lineWidth = 0.6;
      c.beginPath();
      c.moveTo(cx - R * 0.08 + 0.5, cy - R * 0.4 + 0.5);
      c.quadraticCurveTo(cx - R * 0.14 + 0.5, cy - R * 0.14 + 0.5, cx - R * 0.4 + 0.5, cy - R * 0.08 + 0.5);
      c.stroke();
      c.restore();
    }

    function drawPoints(c: CanvasRenderingContext2D, W: number, H: number, planeZ: number) {
      // Painter's algorithm: sort by world y descending (further back drawn first)
      const sorted = points.slice().sort((a, b) => b.y - a.y);
      const R = 6;
      const ang = currentTilt * MAX_TILT;
      for (const p of sorted) {
        const z = liftedZ(p.x, p.y);
        const proj = project(p.x, p.y, z, W, H);
        const color = p.label === 1 ? COLORS.olivine : COLORS.sienna;
        drawSpark(c, proj.sx, proj.sy, R, color);

        // Vertical connector to floor (subtle, fades in with tilt)
        if (currentTilt > 0.15 && Math.abs(z) > 0.05) {
          const floor = project(p.x, p.y, 0, W, H);
          c.strokeStyle = alpha(color, 0.18);
          c.lineWidth = 0.8;
          c.setLineDash([2, 2]);
          c.beginPath();
          c.moveTo(proj.sx, proj.sy);
          c.lineTo(floor.sx, floor.sy);
          c.stroke();
          c.setLineDash([]);
        }
      }
      void ang;
      void planeZ;
    }

    return {
      tiltPct: '0',
      planeZ: 1.35,

      init() {
        const self = this;
        waitForCanvas('kl-plot', (c) => {
          canvas = c;
          const context = initHDPI(c);
          if (context) ctx = context;
          self.render();
        });

        this.$watch('tiltPct', () => {
          currentTilt = parseFloat(this.tiltPct) / 100;
          this.render();
        });
      },

      render() {
        if (!canvas || !ctx) return;
        const W = canvas.getBoundingClientRect().width;
        const H = canvas.getBoundingClientRect().height;

        ctx.clearRect(0, 0, W * 3, H * 3);

        drawFloorGrid(ctx, W, H);

        const boundaryR = Math.sqrt(this.planeZ / Z_SCALE);
        drawBoundaryShadow(ctx, W, H, boundaryR);

        drawParaboloid(ctx, W, H);
        drawPlane(ctx, W, H, this.planeZ);

        if (currentTilt > 0.1) {
          drawBoundaryOnPlane(ctx, W, H, boundaryR, this.planeZ);
        }

        drawPoints(ctx, W, H, this.planeZ);
      },

      toggleLift() {
        const from = parseFloat(this.tiltPct);
        const target = from > 50 ? 0 : 100;
        this.animateTiltTo(target);
      },

      animateTiltTo(target: number) {
        if (animRaf) cancelAnimationFrame(animRaf);
        const from = parseFloat(this.tiltPct);
        const start = performance.now();
        const self = this;
        const tick = (now: number) => {
          const t = Math.min((now - start) / LIFT_MS, 1);
          self.tiltPct = String(from + (target - from) * easeInOut(t));
          if (t < 1) {
            animRaf = requestAnimationFrame(tick);
          } else {
            animRaf = null;
          }
        };
        animRaf = requestAnimationFrame(tick);
      },

      randomize() {
        points = generateRings(Math.floor(Math.random() * 1e9));
        this.render();
      },
    };
  });
}
