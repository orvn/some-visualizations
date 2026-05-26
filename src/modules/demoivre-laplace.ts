// demoivre-laplace page
import type { Alpine } from 'alpinejs';
import { Chart } from 'chart.js';
import { makeScriptableGrad, COLORS, axis, legend } from './shared/chart';
import { createStripePattern } from './shared/canvas';
import { normalPdf, normalCdf } from './shared/stats';

export default function (Alpine: Alpine) {
  Alpine.data('normalBinomial', () => {
    let nbChart: Chart | null = null;

    function logBinom(n: number, k: number): number {
      if (k < 0 || k > n) return -Infinity;
      let r = 0;
      for (let i = 0; i < k; i++) r += Math.log(n - i) - Math.log(i + 1);
      return r;
    }

    function binomPmf(k: number, n: number, p: number): number {
      return Math.exp(logBinom(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
    }



    return {
      n: '10',
      p: '0.5',
      continuity: false,
      info: '',
      animating: false,
      _animId: null as number | null,

      init() {
        this.render();
      },

      animate() {
        if (this._animId) { cancelAnimationFrame(this._animId); this._animId = null; }
        this.animating = true;
        this.n = '2';
        const self = this;
        let current = 2;
        const maxN = 200;

        const tick = () => {
          self.n = String(current);
          self.render();

          if (current < maxN) {
            const speed = current < 20 ? 1 : current < 60 ? 2 : current < 120 ? 4 : 8;
            current += speed;
            if (current > maxN) current = maxN;
            const delay = current < 20 ? 120 : current < 60 ? 60 : 30;
            self._animId = window.setTimeout(() => {
              self._animId = requestAnimationFrame(tick) as any;
            }, delay) as any;
          } else {
            self.animating = false;
            self._animId = null;
          }
        };
        tick();
      },

      stopAnimate() {
        if (this._animId) {
          clearTimeout(this._animId);
          cancelAnimationFrame(this._animId);
          this._animId = null;
        }
        this.animating = false;
      },

      render() {
        const n = parseInt(this.n) || 10;
        const p = parseFloat(this.p) || 0.5;
        const mu = n * p;
        const sigma = Math.sqrt(n * p * (1 - p));
        const useCC = this.continuity;

        const ks: number[] = [];
        const pmf: number[] = [];
        for (let k = 0; k <= n; k++) {
          ks.push(k);
          pmf.push(binomPmf(k, n, p));
        }

        const normalApprox: number[] = [];
        for (let k = 0; k <= n; k++) {
          if (useCC) {
            normalApprox.push(normalCdf(k + 0.5, mu, sigma) - normalCdf(k - 0.5, mu, sigma));
          } else {
            normalApprox.push(normalPdf(k, mu, sigma));
          }
        }

        const normCurve: { x: number; y: number }[] = [];
        const xMin = Math.max(0, mu - 4 * sigma);
        const xMax = Math.min(n, mu + 4 * sigma);
        for (let x = xMin; x <= xMax; x += (xMax - xMin) / 200) {
          normCurve.push({ x, y: normalPdf(x, mu, sigma) });
        }

        let totalErr = 0;
        for (let k = 0; k <= n; k++) {
          totalErr += Math.abs(pmf[k]! - normalApprox[k]!);
        }
        this.info = `μ = ${mu.toFixed(1)}  σ = ${sigma.toFixed(2)}  total |error| = ${totalErr.toFixed(4)}`;

        const canvas = document.getElementById('nb-chart') as HTMLCanvasElement | null;
        if (!canvas) return;

        const lo = Math.max(0, mu - 4 * sigma - 1);
        const hi = Math.min(n, mu + 4 * sigma + 1);

        if (!nbChart) {
          nbChart = new Chart(canvas, {
            type: 'bar',
            data: {
              labels: ks,
              datasets: [
                {
                  type: 'bar',
                  label: 'Binomial PMF',
                  data: pmf,
                  backgroundColor: createStripePattern(COLORS.colonial),
                  borderColor: COLORS.colonial,
                  borderWidth: 1,
                  barPercentage: 0.7,
                  categoryPercentage: 0.7,
                },
                {
                  type: 'line',
                  label: 'Normal approx',
                  data: normCurve as any,
                  borderColor: COLORS.olivine,
                  borderWidth: 2,
                  pointRadius: 0,
                  fill: true,
                  backgroundColor: makeScriptableGrad('#90b878', 0.25, 0.01),
                  tension: 0.4,
                  xAxisID: 'xLine',
                },
              ],
            },
            options: {
              animation: { duration: 300, easing: 'easeOutQuart' as const },
              responsive: true, maintainAspectRatio: true, aspectRatio: 2.2,
              plugins: {
                legend: legend(),
                tooltip: { enabled: false },
              },
              scales: {
                x: axis({
                  type: 'linear', min: lo, max: hi,
                  ticks: { stepSize: n <= 20 ? 1 : undefined },
                  title: { display: true, text: 'k', color: COLORS.pottersClay },
                }),
                xLine: {
                  type: 'linear', display: false,
                  min: lo, max: hi,
                },
                y: axis({
                  min: 0,
                  title: { display: true, text: 'ℙ(X = k)', color: COLORS.pottersClay },
                }),
              },
            },
          });
        } else {
          nbChart.data.labels = ks;
          nbChart.data.datasets[0]!.data = pmf;
          nbChart.data.datasets[1]!.data = normCurve as any;
          (nbChart.options.scales!.x as any).min = xMin;
          (nbChart.options.scales!.x as any).max = xMax;
          (nbChart.options.scales!.x as any).ticks.stepSize = n <= 20 ? 1 : undefined;
          (nbChart.options.scales!.xLine as any).min = xMin;
          (nbChart.options.scales!.xLine as any).max = xMax;
          nbChart.update();
        }
      },
    };
  });
}
