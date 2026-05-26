// clt page
import type { Alpine } from 'alpinejs';
import { Chart } from 'chart.js';
import { makeScriptableGrad, COLORS, axis, legend } from './shared/chart';
import { normalPdf } from './shared/stats';

export default function (Alpine: Alpine) {
  Alpine.data('cltViz', () => {
    let histChart: Chart | null = null;
    const TRIALS = 2000;
    const BINS = 50;

    let animId: number | null = null;

    function ensureChart() {
      if (histChart) return;
      const canvas = document.getElementById('clt-chart') as HTMLCanvasElement | null;
      if (!canvas) return;
      const existing = Chart.getChart('clt-chart');
      if (existing) existing.destroy();

      histChart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: [],
          datasets: [
            {
              type: 'bar',
              label: 'Sₙ histogram',
              data: [],
              backgroundColor: COLORS.colonial,
              borderColor: 'transparent',
              borderWidth: 0,
              barPercentage: 0.5,
              categoryPercentage: 0.5,
            },
            {
              type: 'line',
              label: 'N(0,1)',
              data: [],
              borderColor: COLORS.olivine,
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.4,
              fill: true,
              backgroundColor: makeScriptableGrad('#90b878', 0.35, 0.01),
              spanGaps: false,
              xAxisID: 'xLine',
            },
          ],
        },
        options: {
          animation: false,
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 2.2,
          plugins: {
            legend: legend({ labels: { font: { size: 12 }, boxWidth: 12 } }),
            tooltip: { enabled: false },
          },
          scales: {
            x: axis({
              type: 'linear',
              display: true,
              ticks: { callback: (v: any) => typeof v === 'number' ? v.toFixed(1) : v },
              title: { display: true, text: 'Zₙ', color: COLORS.pottersClay },
            }),
            xLine: {
              type: 'linear',
              display: false,
            },
            y: axis({
              min: 0,
              title: { display: true, text: 'density', color: COLORS.pottersClay },
            }),
          },
        },
      });
    }

    function animateHist(zScores: number[]) {
      if (animId) { cancelAnimationFrame(animId); animId = null; }
      ensureChart();
      if (!histChart) return;

      const min = Math.min(...zScores);
      const max = Math.max(...zScores);
      const range = max - min || 1;
      const binW = range / BINS;

      const counts = new Array(BINS).fill(0);
      zScores.forEach(z => {
        const idx = Math.min(Math.floor((z - min) / binW), BINS - 1);
        counts[idx]++;
      });
      const density = counts.map(c => c / (zScores.length * binW));
      const centers = counts.map((_, i) => min + (i + 0.5) * binW);

      const normX: number[] = [];
      const normY: number[] = [];
      for (let x = min; x <= max; x += range / 200) {
        normX.push(x);
        normY.push(normalPdf(x, 0, 1));
      }
      const normData = normX.map((x, i) => ({ x, y: normY[i] }));

      (histChart.options.scales!.x as any).min = min;
      (histChart.options.scales!.x as any).max = max;
      (histChart.options.scales!.xLine as any).min = min;
      (histChart.options.scales!.xLine as any).max = max;
      histChart.data.labels = centers;

      histChart.data.datasets[0]!.data = new Array(density.length).fill(0);
      histChart.data.datasets[1]!.data = normData.map(pt => ({ x: pt.x, y: null as any }));
      (histChart.data.datasets[1] as any).borderColor = 'rgba(144,184,120,0)';
      histChart.update('none');

      const barTotal = density.length;
      const normTotal = normData.length;
      const durationMs = 1000;
      const normDelayFrac = 0.25;
      let startTime: number | null = null;

      const tick = (now: number) => {
        if (!histChart) return;
        if (!startTime) startTime = now;
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / durationMs, 1);

        const barData = density.map((d, i) => {
          const barStart = i / barTotal;
          const barProgress = Math.max(0, Math.min((progress - barStart) * barTotal / 3, 1));
          return d * barProgress;
        });

        const normProgress = Math.max(0, (progress - normDelayFrac) / (1 - normDelayFrac));
        const normEnd = Math.floor(normProgress * normTotal);

        if (normEnd > 0) {
          (histChart.data.datasets[1] as any).borderColor = COLORS.olivine;
        }

        histChart.data.datasets[0]!.data = barData;
        histChart.data.datasets[1]!.data = normData.map((pt, i) =>
          i < normEnd ? pt : { x: pt.x, y: null as any }
        );
        histChart.update('none');

        if (progress < 1) {
          animId = requestAnimationFrame(tick) as any;
        } else {
          animId = null;
        }
      };
      animId = requestAnimationFrame(tick) as any;
    }

    return {
      dist: 'uniform',
      n: '5',
      param: '0.5',
      hasParam: false,
      paramLabel: '',
      distLabel: 'Uniform [0,1]',

      init() {
        this.updateParam();
        this.run();
        this.$watch('dist', () => { this.updateParam(); this.run(); });
      },

      updateParam() {
        const p = parseFloat(this.param) || 0.5;
        if (this.dist === 'bernoulli') {
          this.hasParam = true;
          this.paramLabel = `p = ${p.toFixed(2)}`;
        } else if (this.dist === 'exponential') {
          this.hasParam = true;
          const lam = 0.5 + p * 4;
          this.paramLabel = `λ = ${lam.toFixed(1)}`;
        } else {
          this.hasParam = false;
          this.paramLabel = '';
        }
      },

      run() {
        this.updateParam();
        const pVal = parseFloat(this.param) || 0.5;
        const n = parseInt(this.n) || 5;

        let sample: () => number;
        let mu: number;
        let sigma: number;

        if (this.dist === 'bernoulli') {
          const bp = pVal;
          sample = () => Math.random() < bp ? 1 : 0;
          mu = bp;
          sigma = Math.sqrt(bp * (1 - bp));
          this.distLabel = `Bernoulli (p=${bp.toFixed(2)})`;
        } else if (this.dist === 'exponential') {
          const lam = 0.5 + pVal * 4;
          sample = () => -Math.log(1 - Math.random()) / lam;
          mu = 1 / lam;
          sigma = 1 / lam;
          this.distLabel = `Exponential (λ=${lam.toFixed(1)})`;
        } else if (this.dist === 'bimodal') {
          sample = () => Math.random() < 0.5 ? Math.random() * 0.3 : 0.7 + Math.random() * 0.3;
          mu = 0.5;
          sigma = Math.sqrt(0.085);
          this.distLabel = 'Bimodal';
        } else {
          sample = () => Math.random();
          mu = 0.5;
          sigma = Math.sqrt(1 / 12);
          this.distLabel = 'Uniform [0,1]';
        }

        const zScores: number[] = [];
        for (let t = 0; t < TRIALS; t++) {
          let sum = 0;
          for (let i = 0; i < n; i++) sum += sample();
          const z = (sum - n * mu) / (sigma * Math.sqrt(n));
          zScores.push(z);
        }

        animateHist(zScores);
      },
    };
  });
}
