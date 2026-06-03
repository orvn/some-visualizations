// gradient-descent page
import type { Alpine } from 'alpinejs';
import { Chart } from 'chart.js';
import { COLORS, alpha, axis } from './shared/chart';
import { waitForCanvas, initHDPI } from './shared/canvas';

interface Surface {
  fn: (t: number) => number;
  deriv: (t: number) => number;
  range: [number, number];
  yMax?: number;
}

const SURFACES: Record<string, Surface> = {
  convex: {
    fn: (t) => t * t,
    deriv: (t) => 2 * t,
    range: [-5, 5],
    yMax: 8,
  },
  nonconvex: {
    fn: (t) => t ** 4 / 20 - t * t + 5,
    deriv: (t) => t ** 3 / 5 - 2 * t,
    range: [-5, 5],
  },
  multimodal: {
    fn: (t) => t * t / 8 + Math.sin(1.5 * t) + 2,
    deriv: (t) => t / 4 + 1.5 * Math.cos(1.5 * t),
    range: [-5, 5],
  },
};

const pad = { left: 50, right: 15, top: 20, bottom: 35 };
const CURVE_SAMPLES = 400;
const HOP_MS = 250;

function getSurface(key: string): Surface {
  return SURFACES[key] ?? SURFACES.convex!;
}

function computeYRange(surf: Surface): [number, number] {
  const [tMin, tMax] = surf.range;
  let jMin = Infinity;
  let jMax = -Infinity;
  for (let i = 0; i <= CURVE_SAMPLES; i++) {
    const t = tMin + (i / CURVE_SAMPLES) * (tMax - tMin);
    const j = surf.fn(t);
    if (j < jMin) jMin = j;
    if (j > jMax) jMax = j;
  }
  if (surf.yMax !== undefined) jMax = Math.min(jMax, surf.yMax);
  const margin = (jMax - jMin) * 0.08;
  return [Math.min(0, jMin - margin), jMax + margin];
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

function formatVal(v: number): string {
  if (Math.abs(v) < 0.001) return v.toExponential(1);
  if (Math.abs(v) < 10) return v.toFixed(3);
  if (Math.abs(v) < 1000) return v.toFixed(1);
  return v.toExponential(1);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function hopControl(ax: number, ay: number, bx: number, by: number) {
  const cpx = (ax + bx) / 2;
  const topY = Math.min(ay, by);
  const lift = Math.max(25, Math.abs(bx - ax) * 0.45);
  return { cpx, cpy: topY - lift };
}

function bezAt(ax: number, ay: number, cpx: number, cpy: number, bx: number, by: number, t: number): [number, number] {
  return [
    (1 - t) ** 2 * ax + 2 * (1 - t) * t * cpx + t ** 2 * bx,
    (1 - t) ** 2 * ay + 2 * (1 - t) * t * cpy + t ** 2 * by,
  ];
}

export default function (Alpine: Alpine) {
  Alpine.data('gradientDescent', () => {
    let canvas: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    let lossChart: Chart | null = null;
    let animRaf: number | null = null;
    let animStart = 0;
    let animT = 1;
    let pending: { theta: number; loss: number } | null = null;

    // curve transition animation
    let morphRaf: number | null = null;
    let morphFrom: number[] | null = null;
    let morphTo: number[] | null = null;
    let morphYrFrom: [number, number] | null = null;
    let morphYrTo: [number, number] | null = null;
    let morphT = 1;
    let morphStart = 0;
    const MORPH_MS = 350;

    function coords(W: number, H: number, surf: Surface, yr: [number, number]) {
      const [tMin, tMax] = surf.range;
      const [jMin, jMax] = yr;
      const pw = W - pad.left - pad.right;
      const ph = H - pad.top - pad.bottom;
      return {
        pw, ph, tMin, tMax, jMin, jMax,
        toX: (t: number) => pad.left + ((t - tMin) / (tMax - tMin)) * pw,
        toY: (j: number) => pad.top + ph - ((j - jMin) / (jMax - jMin)) * ph,
        fromX: (px: number) => tMin + ((px - pad.left) / pw) * (tMax - tMin),
      };
    }

    function drawAxes(c: CanvasRenderingContext2D, W: number, H: number, surf: Surface, yr: [number, number]) {
      const { pw, ph, toX, toY, tMin, tMax, jMin, jMax } = coords(W, H, surf, yr);

      c.strokeStyle = alpha(COLORS.pottersClay, 0.4);
      c.lineWidth = 0.5;

      const xAxisY = jMin <= 0 && jMax >= 0 ? toY(0) : pad.top + ph;
      c.beginPath();
      c.moveTo(pad.left, xAxisY);
      c.lineTo(pad.left + pw, xAxisY);
      c.stroke();

      c.beginPath();
      c.moveTo(pad.left, pad.top);
      c.lineTo(pad.left, pad.top + ph);
      c.stroke();

      c.font = '11px var(--font-mono, monospace)';
      c.fillStyle = COLORS.pottersClay;
      c.textAlign = 'center';
      c.fillText('θ', pad.left + pw / 2, pad.top + ph + 28);
      c.save();
      c.translate(12, pad.top + ph / 2);
      c.rotate(-Math.PI / 2);
      c.fillText('L(θ)', 0, 0);
      c.restore();

      c.font = '9px var(--font-mono, monospace)';
      c.textAlign = 'center';
      for (let v = Math.ceil(tMin); v <= Math.floor(tMax); v++) {
        const px = toX(v);
        c.fillText(String(v), px, xAxisY + 14);
        c.beginPath(); c.moveTo(px, xAxisY - 2); c.lineTo(px, xAxisY + 2); c.stroke();
      }

      c.textAlign = 'right';
      const ys = niceStep(jMax - jMin, 5);
      for (let v = Math.ceil(jMin / ys) * ys; v <= jMax; v += ys) {
        const py = toY(v);
        if (py < pad.top - 2 || py > pad.top + ph + 2) continue;
        c.fillText(v % 1 === 0 ? String(v) : v.toFixed(1), pad.left - 6, py + 3);
        c.save(); c.globalAlpha = 0.12;
        c.beginPath(); c.moveTo(pad.left, py); c.lineTo(pad.left + pw, py); c.stroke();
        c.restore();
      }
    }

    function drawCurve(c: CanvasRenderingContext2D, W: number, H: number, surf: Surface, yr: [number, number]) {
      const { toX, toY, tMin, tMax } = coords(W, H, surf, yr);
      c.beginPath();
      for (let i = 0; i <= CURVE_SAMPLES; i++) {
        const t = tMin + (i / CURVE_SAMPLES) * (tMax - tMin);
        const j = surf.fn(t);
        if (i === 0) c.moveTo(toX(t), toY(j));
        else c.lineTo(toX(t), toY(j));
      }
      c.strokeStyle = COLORS.colonial;
      c.lineWidth = 2;
      c.stroke();
    }

    function drawPath(
      c: CanvasRenderingContext2D, W: number, H: number,
      surf: Surface, yr: [number, number],
      path: { theta: number; loss: number }[],
      highlightLast: boolean,
    ) {
      if (path.length === 0) return;
      const { toX, toY, ph } = coords(W, H, surf, yr);
      const clampY = (y: number) => Math.max(pad.top, Math.min(pad.top + ph, y));

      // arcs
      if (path.length > 1) {
        c.strokeStyle = alpha(COLORS.olivine, 0.6);
        c.lineWidth = 1.2;
        for (let i = 0; i < path.length - 1; i++) {
          const ax = toX(path[i]!.theta), ay = clampY(toY(path[i]!.loss));
          const bx = toX(path[i + 1]!.theta), by = clampY(toY(path[i + 1]!.loss));
          const { cpx, cpy } = hopControl(ax, ay, bx, by);
          c.beginPath(); c.moveTo(ax, ay); c.quadraticCurveTo(cpx, cpy, bx, by); c.stroke();
        }
      }

      // dots
      for (let i = 0; i < path.length; i++) {
        const p = path[i]!;
        const hl = i === path.length - 1 && highlightLast;
        const py = clampY(toY(p.loss));
        c.beginPath();
        c.arc(toX(p.theta), py, hl ? 5 : 2.5, 0, Math.PI * 2);
        c.fillStyle = hl ? COLORS.sienna : COLORS.olivine;
        c.fill();
        if (hl) { c.strokeStyle = COLORS.colonial; c.lineWidth = 1.5; c.stroke(); }
      }
    }

    function drawHop(
      c: CanvasRenderingContext2D, W: number, H: number,
      surf: Surface, yr: [number, number],
      from: { theta: number; loss: number },
      to: { theta: number; loss: number },
      t: number,
    ) {
      const { toX, toY, ph } = coords(W, H, surf, yr);
      const clampY = (y: number) => Math.max(pad.top, Math.min(pad.top + ph, y));
      const ax = toX(from.theta), ay = clampY(toY(from.loss));
      const bx = toX(to.theta), by = clampY(toY(to.loss));
      const { cpx, cpy } = hopControl(ax, ay, bx, by);

      // partial arc
      c.strokeStyle = alpha(COLORS.olivine, 0.6);
      c.lineWidth = 1.2;
      c.beginPath();
      const n = Math.max(2, Math.ceil(t * 30));
      for (let i = 0; i <= n; i++) {
        const s = (i / n) * t;
        const [x, y] = bezAt(ax, ay, cpx, cpy, bx, by, s);
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();

      // dot
      const [px, py] = bezAt(ax, ay, cpx, cpy, bx, by, t);
      c.beginPath();
      c.arc(px, py, 5, 0, Math.PI * 2);
      c.fillStyle = COLORS.sienna;
      c.fill();
      c.strokeStyle = COLORS.colonial;
      c.lineWidth = 1.5;
      c.stroke();
    }

    function cancelAnim() {
      if (animRaf) { cancelAnimationFrame(animRaf); animRaf = null; }
      pending = null;
      animT = 1;
    }

    function randomStart(surf: Surface): number {
      const [tMin, tMax] = surf.range;
      const yr = computeYRange(surf);
      const yTop = yr[1];
      let visMin = tMin;
      let visMax = tMax;
      for (let i = 0; i <= CURVE_SAMPLES; i++) {
        const t = tMin + (i / CURVE_SAMPLES) * (tMax - tMin);
        if (surf.fn(t) <= yTop) { visMin = t; break; }
      }
      for (let i = CURVE_SAMPLES; i >= 0; i--) {
        const t = tMin + (i / CURVE_SAMPLES) * (tMax - tMin);
        if (surf.fn(t) <= yTop) { visMax = t; break; }
      }
      const margin = (visMax - visMin) * 0.08;
      // bias toward edges (higher loss) using a power curve
      let r = Math.random();
      r = Math.pow(r, 0.4); // skew toward 1 = edges
      const half = (visMax - visMin - 2 * margin) / 2;
      const mid = (visMin + visMax) / 2;
      const side = Math.random() < 0.5 ? -1 : 1;
      return mid + side * (margin + r * half);
    }

    function cancelMorph() {
      if (morphRaf) { cancelAnimationFrame(morphRaf); morphRaf = null; }
      morphFrom = null;
      morphTo = null;
      morphT = 1;
    }

    function sampleCurve(surf: Surface): number[] {
      const [tMin, tMax] = surf.range;
      const vals: number[] = [];
      for (let i = 0; i <= CURVE_SAMPLES; i++) {
        vals.push(surf.fn(tMin + (i / CURVE_SAMPLES) * (tMax - tMin)));
      }
      return vals;
    }

    function drawMorphedCurve(
      c: CanvasRenderingContext2D, W: number, H: number,
      surf: Surface, yrFrom: [number, number], yrTo: [number, number],
      from: number[], to: number[], t: number,
    ) {
      const [tMin, tMax] = surf.range;
      const jMin = yrFrom[0] + (yrTo[0] - yrFrom[0]) * t;
      const jMax = yrFrom[1] + (yrTo[1] - yrFrom[1]) * t;
      const pw = W - pad.left - pad.right;
      const ph = H - pad.top - pad.bottom;
      const toX = (th: number) => pad.left + ((th - tMin) / (tMax - tMin)) * pw;
      const toY = (j: number) => pad.top + ph - ((j - jMin) / (jMax - jMin)) * ph;

      c.beginPath();
      for (let i = 0; i <= CURVE_SAMPLES; i++) {
        const v = from[i]! + (to[i]! - from[i]!) * t;
        const x = toX(tMin + (i / CURVE_SAMPLES) * (tMax - tMin));
        const y = toY(v);
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.strokeStyle = COLORS.colonial;
      c.lineWidth = 2;
      c.stroke();
    }

    function ensureChart(el: HTMLCanvasElement): Chart {
      if (lossChart) return lossChart;
      lossChart = new Chart(el, {
        type: 'line',
        data: {
          labels: [] as number[],
          datasets: [{
            label: 'L(θ)',
            data: [] as number[],
            borderColor: COLORS.porsche,
            backgroundColor: alpha(COLORS.porsche, 0.15),
            borderWidth: 1.5,
            pointRadius: 0,
            fill: true,
          }],
        },
        options: {
          animation: { duration: 250, easing: 'easeOutQuart' as const },
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 1.4,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: {
            x: { ...axis(), type: 'linear' as const, ticks: { display: false }, grid: { display: false } },
            y: { ...axis(), ticks: { display: false }, grid: { display: false }, min: 0 },
          },
        },
      });
      return lossChart;
    }

    return {
      surface: 'convex',
      learningRate: '0.25',
      running: false,
      stepCount: 0,
      thetaDisplay: '',
      lossDisplay: '',
      diverged: false,
      hasStart: false,
      theta: null as number | null,
      descentPath: [] as { theta: number; loss: number }[],

      init() {
        const self = this;
        waitForCanvas('gd-curve', (c) => {
          canvas = c;
          const context = initHDPI(c);
          if (context) ctx = context;

          c.addEventListener('click', (e) => {
            const rect = c.getBoundingClientRect();
            const surf = getSurface(self.surface);
            const yr = computeYRange(surf);
            const { fromX, tMin, tMax } = coords(rect.width, rect.height, surf, yr);
            const theta = fromX(e.clientX - rect.left);
            if (theta < tMin || theta > tMax) return;
            self.stop();
            self.placeStart(theta);
            self.render();
          });

          self.placeStart(randomStart(getSurface(self.surface)));
          self.render();
        });

        let prevSurface = this.surface;
        this.$watch('surface', () => {
          const oldSurf = getSurface(prevSurface);
          const newSurf = getSurface(this.surface);
          prevSurface = this.surface;

          this.resetState();
          this.placeStart(randomStart(getSurface(this.surface)));

          // animate curve morph
          cancelMorph();
          morphFrom = sampleCurve(oldSurf);
          morphTo = sampleCurve(newSurf);
          morphYrFrom = computeYRange(oldSurf);
          morphYrTo = computeYRange(newSurf);
          morphT = 0;
          morphStart = performance.now();
          const self = this;
          const tick = (now: number) => {
            morphT = Math.min((now - morphStart) / MORPH_MS, 1);
            self.render();
            if (morphT < 1) {
              morphRaf = requestAnimationFrame(tick);
            } else {
              cancelMorph();
              self.render();
            }
          };
          morphRaf = requestAnimationFrame(tick);
        });
      },

      placeStart(t: number) {
        cancelAnim();
        const surf = getSurface(this.surface);
        const [tMin, tMax] = surf.range;
        const theta = Math.max(tMin, Math.min(tMax, t));
        const loss = surf.fn(theta);
        this.theta = theta;
        this.descentPath = [{ theta, loss }];
        this.stepCount = 1;
        this.hasStart = true;
        this.diverged = false;
        this.thetaDisplay = formatVal(theta);
        this.lossDisplay = formatVal(loss);
        this.resetChart();
        this.pushChart(0, loss);
      },

      resetState() {
        this.running = false;
        if (animRaf) { cancelAnimationFrame(animRaf); animRaf = null; }
        pending = null;
        animT = 1;
        this.theta = null;
        this.descentPath = [];
        this.stepCount = 0;
        this.hasStart = false;
        this.thetaDisplay = '';
        this.lossDisplay = '';
        this.diverged = false;
        this.resetChart();
      },

      step() {
        if (!this.hasStart || this.diverged || pending) return;
        const gamma = parseFloat(this.learningRate) || 0.05;
        const surf = getSurface(this.surface);
        const g = surf.deriv(this.theta!);
        const newTheta = this.theta! - gamma * g;
        const newLoss = surf.fn(newTheta);

        pending = { theta: newTheta, loss: newLoss };
        animStart = performance.now();
        animT = 0;
        const self = this;

        const tick = (now: number) => {
          animT = Math.min((now - animStart) / HOP_MS, 1);
          self.render();

          if (animT < 1) {
            animRaf = requestAnimationFrame(tick);
            return;
          }

          // finalize
          self.theta = newTheta;
          self.descentPath.push({ theta: newTheta, loss: newLoss });
          self.stepCount = self.descentPath.length;
          self.thetaDisplay = formatVal(newTheta);
          self.lossDisplay = formatVal(newLoss);
          pending = null;

          const [tMin, tMax] = surf.range;
          if (newLoss > 1e6 || newTheta < tMin * 3 || newTheta > tMax * 3) {
            self.diverged = true;
            self.lossDisplay = 'diverged';
            self.running = false;
            self.render();
            return;
          }

          self.pushChart(self.stepCount - 1, newLoss);
          self.render();

          if (self.running) {
            animRaf = requestAnimationFrame(() => self.step());
          }
        };
        animRaf = requestAnimationFrame(tick);
      },

      start() {
        if (this.running || !this.hasStart || this.diverged) return;
        this.running = true;
        this.step();
      },

      stop() {
        this.running = false;
        if (animRaf) { cancelAnimationFrame(animRaf); animRaf = null; }
        if (pending) {
          this.theta = pending.theta;
          this.descentPath.push(pending);
          this.stepCount = this.descentPath.length;
          this.thetaDisplay = formatVal(pending.theta);
          this.lossDisplay = formatVal(pending.loss);
          this.pushChart(this.stepCount - 1, pending.loss);
          pending = null;
          animT = 1;
          this.render();
        }
      },

      reset() {
        const surf = getSurface(this.surface);
        const oldTheta = this.theta;
        const newTheta = randomStart(surf);

        // cancel any in-progress hop
        this.running = false;
        if (animRaf) { cancelAnimationFrame(animRaf); animRaf = null; }
        pending = null;
        animT = 1;

        // clear path but keep curve
        this.descentPath = [];
        this.stepCount = 0;
        this.diverged = false;
        this.resetChart();

        if (oldTheta === null) {
          this.placeStart(newTheta);
          this.render();
          return;
        }

        // animate dot sliding along the curve to new position
        const fromTheta = oldTheta;
        const slideStart = performance.now();
        const SLIDE_MS = 400;
        const self = this;

        this.theta = fromTheta;
        this.descentPath = [{ theta: fromTheta, loss: surf.fn(fromTheta) }];
        this.hasStart = true;

        const tick = (now: number) => {
          const t = Math.min((now - slideStart) / SLIDE_MS, 1);
          const eased = easeInOut(t);
          const curTheta = fromTheta + (newTheta - fromTheta) * eased;
          const curLoss = surf.fn(curTheta);

          self.theta = curTheta;
          self.descentPath = [{ theta: curTheta, loss: curLoss }];
          self.thetaDisplay = formatVal(curTheta);
          self.lossDisplay = formatVal(curLoss);
          self.render();

          if (t < 1) {
            animRaf = requestAnimationFrame(tick);
          } else {
            animRaf = null;
            self.resetChart();
            self.pushChart(0, curLoss);
          }
        };
        animRaf = requestAnimationFrame(tick);
      },

      render() {
        if (!canvas || !ctx) return;
        const W = canvas.getBoundingClientRect().width;
        const H = canvas.getBoundingClientRect().height;
        const surf = getSurface(this.surface);
        const yr = computeYRange(surf);

        ctx.clearRect(0, 0, W * 3, H * 3);

        if (morphFrom && morphTo && morphYrFrom && morphYrTo && morphT < 1) {
          const eased = easeInOut(morphT);
          const interpYr: [number, number] = [
            morphYrFrom[0] + (morphYrTo[0] - morphYrFrom[0]) * eased,
            morphYrFrom[1] + (morphYrTo[1] - morphYrFrom[1]) * eased,
          ];
          drawAxes(ctx, W, H, surf, interpYr);
          drawMorphedCurve(ctx, W, H, surf, morphYrFrom, morphYrTo, morphFrom, morphTo, eased);
        } else {
          drawAxes(ctx, W, H, surf, yr);
          drawCurve(ctx, W, H, surf, yr);
          drawPath(ctx, W, H, surf, yr, this.descentPath, !pending);

          if (pending && this.descentPath.length > 0) {
            const from = this.descentPath[this.descentPath.length - 1]!;
            drawHop(ctx, W, H, surf, yr, from, pending, easeInOut(animT));
          }
        }
      },

      resetChart() {
        if (lossChart) {
          lossChart.data.labels = [];
          lossChart.data.datasets[0]!.data = [];
          lossChart.update('none');
        }
      },

      pushChart(idx: number, loss: number) {
        const el = document.getElementById('gd-loss') as HTMLCanvasElement | null;
        if (!el) return;
        const chart = ensureChart(el);
        (chart.data.labels as number[]).push(idx);
        (chart.data.datasets[0]!.data as number[]).push(Math.min(loss, 1e4));
        chart.update();
      },
    };
  });
}
