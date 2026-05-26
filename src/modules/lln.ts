// lln page
import type { Alpine } from 'alpinejs';
import { Chart } from 'chart.js';
import { COLORS, axis, legend } from './shared/chart';

export default function (Alpine: Alpine) {
  Alpine.data('llnViz', () => {
    let convergenceChart: Chart | null = null;
    let decayChart: Chart | null = null;

    const dists: Record<string, { sample: () => number; mu: number; sigma: number; range: [number, number] }> = {
      uniform: { sample: () => Math.random(), mu: 0.5, sigma: Math.sqrt(1/12), range: [0, 1] },
      exponential: { sample: () => -Math.log(1 - Math.random()), mu: 1, sigma: 1, range: [0, Infinity] },
      bernoulli: { sample: () => Math.random() < 0.5 ? 1 : 0, mu: 0.5, sigma: 0.5, range: [0, 1] },
    };

    function run(dist: string, N: number, epsilon: number, confidence: number, showMarkov: boolean, showCheb: boolean, showChernoff: boolean) {
      const d = dists[dist];
      if (!d) return;

      const samples: number[] = [];
      const means: number[] = [];
      let sum = 0;
      for (let i = 0; i < N; i++) {
        sum += d.sample();
        samples.push(sum / (i + 1));
        means.push(sum / (i + 1));
      }

      const mu = d.mu;
      const sigma = d.sigma;
      const alpha = 1 - confidence;
      const bounded = isFinite(d.range[1]);
      const a = d.range[0];
      const b = isFinite(d.range[1]) ? d.range[1] : 1;
      const R = b - a;

      const markovBand: number[] = [];
      const chebBand: number[] = [];
      const chernoffBand: number[] = [];

      for (let n = 1; n <= N; n++) {
        markovBand.push(sigma / (alpha * Math.sqrt(n)));
        chebBand.push(sigma / Math.sqrt(n * alpha));
        if (bounded) {
          chernoffBand.push(R * Math.sqrt(Math.log(2 / alpha) / (2 * n)));
        } else {
          chernoffBand.push(NaN);
        }
      }

      const xLabels = Array.from({ length: N }, (_, i) => i + 1);

      const datasets: any[] = [
        {
          label: 'Sample mean Mₙ',
          data: means,
          borderColor: COLORS.colonial,
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          order: 0,
        },
        {
          label: 'True mean μ',
          data: new Array(N).fill(mu),
          borderColor: COLORS.teak,
          borderWidth: 1,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
          order: 1,
        },
      ];

      if (showMarkov) {
        datasets.push(
          { label: 'Markov upper', data: markovBand.map((e) => Math.min(mu + e, mu + 3)), borderColor: 'rgba(240,120,88,0.5)', borderWidth: 1, borderDash: [4, 3], pointRadius: 0, fill: false },
          { label: 'Markov lower', data: markovBand.map((e) => Math.max(mu - e, mu - 3)), borderColor: 'rgba(240,120,88,0.5)', borderWidth: 1, borderDash: [4, 3], pointRadius: 0, fill: '-1' as any, backgroundColor: 'rgba(240,120,88,0.05)' },
        );
      }
      if (showCheb) {
        datasets.push(
          { label: 'Chebyshev upper', data: chebBand.map((e) => mu + e), borderColor: 'rgba(144,184,120,0.6)', borderWidth: 1, borderDash: [4, 3], pointRadius: 0, fill: false },
          { label: 'Chebyshev lower', data: chebBand.map((e) => mu - e), borderColor: 'rgba(144,184,120,0.6)', borderWidth: 1, borderDash: [4, 3], pointRadius: 0, fill: '-1' as any, backgroundColor: 'rgba(144,184,120,0.06)' },
        );
      }
      if (showChernoff && bounded) {
        datasets.push(
          { label: 'Chernoff upper', data: chernoffBand.map((e) => mu + e), borderColor: 'rgba(232,160,80,0.6)', borderWidth: 1, borderDash: [4, 3], pointRadius: 0, fill: false },
          { label: 'Chernoff lower', data: chernoffBand.map((e) => mu - e), borderColor: 'rgba(232,160,80,0.6)', borderWidth: 1, borderDash: [4, 3], pointRadius: 0, fill: '-1' as any, backgroundColor: 'rgba(232,160,80,0.06)' },
        );
      }

      const canvas1 = document.getElementById('lln-convergence') as HTMLCanvasElement | null;
      if (canvas1) {
        if (convergenceChart) convergenceChart.destroy();
        convergenceChart = new Chart(canvas1, {
          type: 'line',
          data: { labels: xLabels, datasets },
          options: {
            animation: { duration: 300, easing: 'easeOutQuart' as const },
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: window.innerWidth < 480 ? 0.75 : 2.4,
            plugins: {
              legend: legend({ labels: { filter: (item: any) => !item.text.includes('lower') } }),
              tooltip: { enabled: false },
            },
            scales: {
              x: axis({
                type: 'linear', min: 1, max: N,
                title: { display: true, text: 'n (samples)', color: COLORS.pottersClay },
              }),
              y: axis({
                title: { display: true, text: 'Mₙ', color: COLORS.pottersClay },
              }),
            },
          },
        });
      }

      const canvas2 = document.getElementById('lln-decay') as HTMLCanvasElement | null;
      if (canvas2) {
        if (decayChart) decayChart.destroy();
        const eps = epsilon;
        const decayDatasets: any[] = [];

        if (showMarkov) {
          decayDatasets.push({
            label: 'Markov',
            data: xLabels.map((n) => Math.min(sigma / (eps * Math.sqrt(n)), 1)),
            borderColor: COLORS.sienna, borderWidth: 2, pointRadius: 0, fill: false,
          });
        }
        if (showCheb) {
          decayDatasets.push({
            label: 'Chebyshev',
            data: xLabels.map((n) => Math.min(sigma * sigma / (n * eps * eps), 1)),
            borderColor: COLORS.olivine, borderWidth: 2, pointRadius: 0, fill: false,
          });
        }
        if (showChernoff && bounded) {
          decayDatasets.push({
            label: 'Chernoff',
            data: xLabels.map((n) => Math.min(2 * Math.exp(-2 * n * eps * eps / (R * R)), 1)),
            borderColor: COLORS.porsche, borderWidth: 2, pointRadius: 0, fill: false,
          });
        }

        decayChart = new Chart(canvas2, {
          type: 'line',
          data: { labels: xLabels, datasets: decayDatasets },
          options: {
            animation: { duration: 300, easing: 'easeOutQuart' as const },
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2.8,
            plugins: {
              legend: legend(),
              tooltip: { enabled: false },
            },
            scales: {
              x: axis({
                type: 'linear', min: 1, max: N,
                title: { display: true, text: 'n', color: COLORS.pottersClay },
              }),
              y: axis({
                min: 0, max: 1,
                title: { display: true, text: 'ℙ(|Mₙ-μ| ≥ ε)', color: COLORS.pottersClay },
              }),
            },
          },
        });
      }
    }

    return {
      dist: 'uniform',
      n: '200',
      epsilon: '0.15',
      confidence: '0.95',
      showMarkov: true,
      showCheb: true,
      showChernoff: true,

      init() {
        this.simulate();
      },

      simulate() {
        run(
          this.dist,
          parseInt(this.n) || 200,
          parseFloat(this.epsilon) || 0.15,
          parseFloat(this.confidence) || 0.95,
          this.showMarkov,
          this.showCheb,
          this.showChernoff,
        );
      },
    };
  });
}
