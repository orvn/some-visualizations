// bayesian-regression page
import type { Alpine } from 'alpinejs';
import { COLORS, alpha } from './shared/chart';
import { waitForCanvas, initHDPI } from './shared/canvas';
import { boxMuller } from './shared/stats';

const RANGE = 5;
const NUM_LINES = 50;
const ANIM_MS = 400;
const pad = { left: 35, right: 10, top: 10, bottom: 30 };

type V2 = [number, number];
type M2 = [[number, number], [number, number]];
type Params = { mean: V2; cov: M2 };

function inv2x2(m: M2): M2 {
  const det = m[0][0] * m[1][1] - m[0][1] * m[1][0];
  return [
    [m[1][1] / det, -m[0][1] / det],
    [-m[1][0] / det, m[0][0] / det],
  ];
}

function posterior(
  points: { x: number; y: number }[],
  priorVar: number,
  noiseVar: number,
): Params {
  const prec: M2 = [[1 / priorVar, 0], [0, 1 / priorVar]];
  const pm: V2 = [0, 0];

  for (const p of points) {
    prec[0][0] += p.x * p.x / noiseVar;
    prec[0][1] += p.x / noiseVar;
    prec[1][0] += p.x / noiseVar;
    prec[1][1] += 1 / noiseVar;
    pm[0] += p.x * p.y / noiseVar;
    pm[1] += p.y / noiseVar;
  }

  const cov = inv2x2(prec);
  const mean: V2 = [
    cov[0][0] * pm[0] + cov[0][1] * pm[1],
    cov[1][0] * pm[0] + cov[1][1] * pm[1],
  ];
  return { mean, cov };
}

function sampleLines(params: Params, seeds: V2[]): V2[] {
  const { mean, cov } = params;
  const L00 = Math.sqrt(Math.max(cov[0][0], 1e-10));
  const L10 = cov[1][0] / L00;
  const L11 = Math.sqrt(Math.max(cov[1][1] - L10 * L10, 1e-10));

  return seeds.map(([z0, z1]) => [
    mean[0] + L00 * z0,
    mean[1] + L10 * z0 + L11 * z1,
  ]);
}

function lerpParams(a: Params, b: Params, t: number): Params {
  return {
    mean: [a.mean[0] + (b.mean[0] - a.mean[0]) * t, a.mean[1] + (b.mean[1] - a.mean[1]) * t],
    cov: [
      [a.cov[0][0] + (b.cov[0][0] - a.cov[0][0]) * t, a.cov[0][1] + (b.cov[0][1] - a.cov[0][1]) * t],
      [a.cov[1][0] + (b.cov[1][0] - a.cov[1][0]) * t, a.cov[1][1] + (b.cov[1][1] - a.cov[1][1]) * t],
    ],
  };
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function niceStep(range: number, target: number): number {
  const raw = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const r = raw / mag;
  if (r <= 1.5) return mag;
  if (r <= 3.5) return 2 * mag;
  if (r <= 7.5) return 5 * mag;
  return 10 * mag;
}

export default function (Alpine: Alpine) {
  Alpine.data('bayesianRegression', () => {
    let canvas: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    let animRaf: number | null = null;
    let animT = 1;
    let animStart = 0;
    let animFrom: Params | null = null;
    let animTo: Params | null = null;

    // fixed random seeds so lines animate smoothly between posteriors
    const seeds: V2[] = [];
    for (let i = 0; i < NUM_LINES; i++) {
      const [a, b] = boxMuller();
      seeds.push([a, b]);
    }

    let currentParams: Params = { mean: [0, 0], cov: [[2.25, 0], [0, 2.25]] };

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

      c.strokeStyle = alpha(COLORS.pottersClay, 0.4);
      c.lineWidth = 0.5;

      // axes through origin
      const ox = toX(0), oy = toY(0);
      c.beginPath(); c.moveTo(pad.left, oy); c.lineTo(pad.left + pw, oy); c.stroke();
      c.beginPath(); c.moveTo(ox, pad.top); c.lineTo(ox, pad.top + ph); c.stroke();

      // ticks
      c.font = '9px var(--font-mono, monospace)';
      c.fillStyle = COLORS.pottersClay;
      const step = niceStep(RANGE * 2, 5);
      c.textAlign = 'center';
      for (let v = -RANGE; v <= RANGE; v += step) {
        if (v === 0) continue;
        const px = toX(v);
        c.fillText(String(v), px, oy + 14);
        c.beginPath(); c.moveTo(px, oy - 2); c.lineTo(px, oy + 2); c.stroke();
      }
      c.textAlign = 'right';
      for (let v = -RANGE; v <= RANGE; v += step) {
        if (v === 0) continue;
        const py = toY(v);
        c.fillText(String(v), ox - 6, py + 3);
        c.beginPath(); c.moveTo(ox - 2, py); c.lineTo(ox + 2, py); c.stroke();
      }

      // labels
      c.font = '11px var(--font-mono, monospace)';
      c.textAlign = 'center';
      c.fillText('x', pad.left + pw / 2, pad.top + ph + 24);
      c.save();
      c.translate(10, pad.top + ph / 2);
      c.rotate(-Math.PI / 2);
      c.fillText('y', 0, 0);
      c.restore();
    }

    function drawLines(c: CanvasRenderingContext2D, W: number, H: number, params: Params) {
      const { pw, ph, toX, toY } = makeCoords(W, H);
      const lines = sampleLines(params, seeds);

      // clip to plot area
      c.save();
      c.beginPath();
      c.rect(pad.left, pad.top, pw, ph);
      c.clip();

      // sampled lines
      for (const [slope, intercept] of lines) {
        const y1 = slope * -RANGE + intercept;
        const y2 = slope * RANGE + intercept;
        c.beginPath();
        c.moveTo(toX(-RANGE), toY(y1));
        c.lineTo(toX(RANGE), toY(y2));
        c.strokeStyle = alpha(COLORS.olivine, 0.15);
        c.lineWidth = 1;
        c.stroke();
      }

      // mean line
      const [ms, mi] = params.mean;
      c.beginPath();
      c.moveTo(toX(-RANGE), toY(ms * -RANGE + mi));
      c.lineTo(toX(RANGE), toY(ms * RANGE + mi));
      c.strokeStyle = COLORS.porsche;
      c.lineWidth = 2;
      c.stroke();

      c.restore();
    }

    function drawPoints(c: CanvasRenderingContext2D, W: number, H: number, points: { x: number; y: number }[]) {
      const { toX, toY } = makeCoords(W, H);
      for (const p of points) {
        c.beginPath();
        c.arc(toX(p.x), toY(p.y), 4, 0, Math.PI * 2);
        c.fillStyle = COLORS.sienna;
        c.fill();
        c.strokeStyle = COLORS.colonial;
        c.lineWidth = 1;
        c.stroke();
      }
    }

    function cancelAnim() {
      if (animRaf) { cancelAnimationFrame(animRaf); animRaf = null; }
      animFrom = null;
      animTo = null;
      animT = 1;
    }

    function initPrior(priorVar: number): Params {
      return { mean: [0, 0], cov: [[priorVar, 0], [0, priorVar]] };
    }

    return {
      pointCount: 0,
      priorWidth: '1.5',
      noiseLevel: '1.0',
      slopeDisplay: '',
      interceptDisplay: '',
      dataPoints: [] as { x: number; y: number }[],

      init() {
        const self = this;
        waitForCanvas('br-plot', (c) => {
          canvas = c;
          const context = initHDPI(c);
          if (context) ctx = context;

          c.addEventListener('click', (e) => {
            const rect = c.getBoundingClientRect();
            const { fromX, fromY } = makeCoords(rect.width, rect.height);
            const x = fromX(e.clientX - rect.left);
            const y = fromY(e.clientY - rect.top);
            if (x < -RANGE || x > RANGE || y < -RANGE || y > RANGE) return;
            self.addPoint(x, y);
          });

          self.render();
        });

        this.$watch('priorWidth', () => this.recompute());
        this.$watch('noiseLevel', () => this.recompute());
      },

      addPoint(x: number, y: number) {
        this.dataPoints.push({ x, y });
        this.pointCount = this.dataPoints.length;
        this.recompute();
      },

      recompute() {
        const pw = parseFloat(this.priorWidth) || 1.5;
        const nl = parseFloat(this.noiseLevel) || 1.0;
        const oldParams: Params = {
          mean: [...currentParams.mean],
          cov: [
            [...currentParams.cov[0]],
            [...currentParams.cov[1]],
          ],
        };
        currentParams = posterior(this.dataPoints, pw * pw, nl * nl);
        this.slopeDisplay = currentParams.mean[0].toFixed(2);
        this.interceptDisplay = currentParams.mean[1].toFixed(2);

        // animate from old to new posterior
        cancelAnim();
        animFrom = oldParams;
        animTo = currentParams;
        animT = 0;
        animStart = performance.now();
        const self = this;

        const tick = (now: number) => {
          animT = Math.min((now - animStart) / ANIM_MS, 1);
          self.render();
          if (animT < 1) {
            animRaf = requestAnimationFrame(tick);
          } else {
            cancelAnim();
            self.render();
          }
        };
        animRaf = requestAnimationFrame(tick);
      },

      reset() {
        cancelAnim();
        this.dataPoints = [];
        this.pointCount = 0;
        const pw = parseFloat(this.priorWidth) || 1.5;
        currentParams = initPrior(pw * pw);
        this.slopeDisplay = '';
        this.interceptDisplay = '';
        this.render();
      },

      render() {
        if (!canvas || !ctx) return;
        const W = canvas.getBoundingClientRect().width;
        const H = canvas.getBoundingClientRect().height;

        ctx.clearRect(0, 0, W * 3, H * 3);
        drawAxes(ctx, W, H);

        let params = currentParams;
        if (animFrom && animTo && animT < 1) {
          params = lerpParams(animFrom, animTo, easeInOut(animT));
        }

        drawLines(ctx, W, H, params);
        drawPoints(ctx, W, H, this.dataPoints);
      },
    };
  });
}
