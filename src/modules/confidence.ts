// confidence page
import type { Alpine } from 'alpinejs';
import { waitForCanvas, initHDPI } from './shared/canvas';
import { boxMuller } from './shared/stats';

export default function (Alpine: Alpine) {
  Alpine.data('confidenceViz', () => {
    let ciCanvas: HTMLCanvasElement | null = null;
    let ciCtx: CanvasRenderingContext2D | null = null;

    const TRUE_SIGMA = 1;
    const NUM_EXPERIMENTS = 50;

    function zQuantile(p: number): number {
      if (p <= 0 || p >= 1) return 0;
      const a = p < 0.5 ? p : 1 - p;
      const t = Math.sqrt(-2 * Math.log(a));
      const z = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
      return p < 0.5 ? -z : z;
    }

    function runExperiments(n: number, confidence: number, trueMu: number) {
      const alpha = 1 - confidence;
      const z = zQuantile(1 - alpha / 2);
      const experiments: { mean: number; lo: number; hi: number; captured: boolean }[] = [];

      for (let i = 0; i < NUM_EXPERIMENTS; i++) {
        let sum = 0;
        for (let j = 0; j < n; j++) {
          sum += trueMu + TRUE_SIGMA * boxMuller()[0];
        }
        const mean = sum / n;
        const margin = z * TRUE_SIGMA / Math.sqrt(n);
        const lo = mean - margin;
        const hi = mean + margin;
        experiments.push({ mean, lo, hi, captured: lo <= trueMu && hi >= trueMu });
      }
      return experiments;
    }

    let ciAnimId: number | null = null;

    function drawCI(experiments: { mean: number; lo: number; hi: number; captured: boolean }[], trueMu: number, showCount?: number) {
      const count = showCount ?? experiments.length;
      if (!ciCtx || !ciCanvas) return;
      const W = ciCanvas.getBoundingClientRect().width;
      const H = ciCanvas.getBoundingClientRect().height;
      const ctx = ciCtx;
      ctx.clearRect(0, 0, W * 3, H * 3);

      const pad = { left: 40, right: 20, top: 28, bottom: 50 };
      const plotW = W - pad.left - pad.right;
      const plotH = H - pad.top - pad.bottom;

      let xMin = Infinity;
      let xMax = -Infinity;
      for (const e of experiments) {
        if (e.lo < xMin) xMin = e.lo;
        if (e.hi > xMax) xMax = e.hi;
      }
      const xPadding = (xMax - xMin) * 0.05;
      xMin -= xPadding;
      xMax += xPadding;

      const toX = (v: number) => pad.left + ((v - xMin) / (xMax - xMin)) * plotW;
      const gap = 3;
      const rowH = (plotH - gap * (NUM_EXPERIMENTS - 1)) / NUM_EXPERIMENTS;
      const barH = rowH;


      const trueX = toX(trueMu);
      ctx.strokeStyle = 'rgba(240,216,168,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(trueX, pad.top);
      ctx.lineTo(trueX, pad.top + plotH);
      ctx.stroke();

      ctx.fillStyle = '#f0d8a8';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('θ', trueX, pad.top + plotH + 40);

      for (let i = 0; i < count; i++) {
        const e = experiments[i]!;
        const y = pad.top + i * (rowH + gap) + rowH / 2;
        const x1 = toX(e.lo);
        const x2 = toX(e.hi);
        const col = e.captured ? '#90b878' : '#f07858';
        const colFill = e.captured ? 'rgba(144,184,120,0.45)' : 'rgba(240,120,88,0.45)';

        ctx.fillStyle = colFill;
        ctx.fillRect(x1, y - barH / 2, x2 - x1, barH);

        ctx.strokeStyle = col;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x1, y - barH / 2, x2 - x1, barH);

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(toX(e.mean), y, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      const axisY = pad.top - 2;
      ctx.strokeStyle = '#3a1a0a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, axisY);
      ctx.lineTo(pad.left + plotW, axisY);
      ctx.stroke();

      ctx.fillStyle = '#7a5a3a';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const range = xMax - xMin;
      const step = range <= 3 ? 0.5 : range <= 6 ? 1 : Math.ceil(range / 10);
      const startV = Math.ceil(xMin / step) * step;
      for (let v = startV; v <= xMax; v += step) {
        const px = toX(v);
        ctx.beginPath();
        ctx.moveTo(px, axisY - 4);
        ctx.lineTo(px, axisY + 4);
        ctx.stroke();
        ctx.fillText(step < 1 ? v.toFixed(1) : String(Math.round(v)), px, axisY - 8);
      }

      const thetaY = pad.top + plotH + 10;
      ctx.fillStyle = '#f0d8a8';
      ctx.beginPath();
      ctx.arc(trueX, thetaY, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    return {
      n: '25',
      theta: '0',
      confidence: '0.95',
      captured: 0,
      missed: 0,
      pct: '',

      init() {
        const self = this;
        waitForCanvas('ci-chart', (canvas) => {
          ciCanvas = canvas;
          ciCtx = initHDPI(canvas);
          self.simulate();
        });
      },

      simulate() {
        if (ciAnimId) { cancelAnimationFrame(ciAnimId); ciAnimId = null; }

        const n = parseInt(this.n) || 25;
        const mu = parseFloat(this.theta) || 0;
        const conf = parseFloat(this.confidence) || 0.95;
        const experiments = runExperiments(n, conf, mu);
        this.captured = experiments.filter(e => e.captured).length;
        this.missed = NUM_EXPERIMENTS - this.captured;
        this.pct = ((this.captured / NUM_EXPERIMENTS) * 100).toFixed(0);

        let shown = 0;
        const perFrame = 2;

        const tick = () => {
          shown = Math.min(shown + perFrame, NUM_EXPERIMENTS);
          drawCI(experiments, mu, shown);

          if (shown < NUM_EXPERIMENTS) {
            ciAnimId = window.setTimeout(() => {
              ciAnimId = requestAnimationFrame(tick) as any;
            }, 12) as any;
          } else {
            ciAnimId = null;
          }
        };
        tick();
      },
    };
  });
}
