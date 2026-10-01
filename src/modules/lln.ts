// lln page
import type { Alpine } from 'alpinejs';
import { Chart } from 'chart.js';
import { COLORS, axis, legend } from './shared/chart';

const MAUVE = '#c890b0';

// uniform[0,1] cumulant K(t) = ln((e^t - 1)/t), K'(t) is increasing from 0 to 1
function uniformCumulant(t: number): number {
  if (Math.abs(t) < 1e-6) return t / 2;
  return Math.log(Math.expm1(t) / t);
}

function uniformCumulantDeriv(t: number): number {
  if (Math.abs(t) < 1e-6) return 0.5 + t / 12;
  return Math.exp(t) / Math.expm1(t) - 1 / t;
}

// Cramér rate function I(x) = sup_t (tx - K(t)), solved by bisection on K'(t) = x
function uniformRate(x: number): number {
  if (x <= 0 || x >= 1) return Infinity;
  let lo = -60, hi = 60;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (uniformCumulantDeriv(mid) < x) lo = mid; else hi = mid;
  }
  const t = (lo + hi) / 2;
  return t * x - uniformCumulant(t);
}

function bernoulliRate(x: number, p: number): number {
  if (x < 0 || x > 1) return Infinity;
  const term = (a: number, b: number) => (a === 0 ? 0 : a * Math.log(a / b));
  return term(x, p) + term(1 - x, 1 - p);
}

function exponentialRate(x: number): number {
  if (x <= 0) return Infinity;
  return x - 1 - Math.log(x);
}

export default function (Alpine: Alpine) {
  Alpine.data('llnViz', () => {
    let convergenceChart: Chart | null = null;
    let decayChart: Chart | null = null;

    const dists: Record<string, { sample: () => number; mu: number; sigma: number; range: [number, number]; rate: (x: number) => number }> = {
      uniform: { sample: () => Math.random(), mu: 0.5, sigma: Math.sqrt(1/12), range: [0, 1], rate: uniformRate },
      exponential: { sample: () => -Math.log(1 - Math.random()), mu: 1, sigma: 1, range: [0, Infinity], rate: exponentialRate },
      bernoulli: { sample: () => Math.random() < 0.5 ? 1 : 0, mu: 0.5, sigma: 0.5, range: [0, 1], rate: (x) => bernoulliRate(x, 0.5) },
    };

    // smallest ε with I(mu + sign*ε) >= target, I is increasing away from mu
    function invertRate(rate: (x: number) => number, mu: number, sign: 1 | -1, limit: number, target: number): number {
      if (rate(mu + sign * limit) < target) return limit;
      let lo = 0, hi = limit;
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if (rate(mu + sign * mid) < target) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    }

    const band = (label: string, order: number, rgb: string) => [
      { label: `${label} upper`, order, data: [] as number[], borderColor: `rgba(${rgb},0.9)`, borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, fill: false },
      { label: `${label} lower`, order, data: [] as number[], borderColor: `rgba(${rgb},0.9)`, borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, fill: '-1' as any, backgroundColor: `rgba(${rgb},0.08)` },
    ];

    const anim = { duration: 250, easing: 'easeOutQuart' as const };

    function setData(chart: Chart, arrays: number[][]) {
      arrays.forEach((arr, i) => {
        const ds = chart.data.datasets[i];
        if (ds) ds.data = arr;
      });
    }

    function buildCharts() {
      const canvas1 = document.getElementById('lln-convergence') as HTMLCanvasElement | null;
      const canvas2 = document.getElementById('lln-decay') as HTMLCanvasElement | null;
      if (!canvas1 || !canvas2) return;

      convergenceChart = new Chart(canvas1, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            { label: 'Sample mean Mₙ', data: [], borderColor: COLORS.colonial, borderWidth: 1.5, pointRadius: 0, fill: false, order: 0 },
            { label: 'True mean μ', data: [], borderColor: COLORS.teak, borderWidth: 1, borderDash: [6, 4], pointRadius: 0, fill: false, order: 1 },
            ...band('Markov', 5, '232,160,80'),
            ...band('Chebyshev', 3, '144,184,120'),
            ...band('Hoeffding', 4, '200,144,176'),
            ...band('Chernoff', 2, '240,120,88'),
          ],
        },
        options: {
          animation: anim,
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: window.innerWidth < 480 ? 0.75 : 2.4,
          plugins: {
            legend: legend({ labels: {
              filter: (item: any) => !item.text.includes('lower') && !item.hidden,
              sort: (a: any, b: any) => a.datasetIndex - b.datasetIndex,
            } }),
            tooltip: { enabled: false },
          },
          scales: {
            x: axis({ type: 'linear', min: 1, max: 200, title: { display: true, text: 'n (samples)', color: COLORS.pottersClay } }),
            y: axis({ title: { display: true, text: 'Mₙ', color: COLORS.pottersClay } }),
          },
        },
      });

      decayChart = new Chart(canvas2, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            { label: 'Markov', data: [], borderColor: COLORS.porsche, borderWidth: 2, pointRadius: 0, fill: false },
            { label: 'Chebyshev', data: [], borderColor: COLORS.olivine, borderWidth: 2, pointRadius: 0, fill: false },
            { label: 'Hoeffding', data: [], borderColor: MAUVE, borderWidth: 2, pointRadius: 0, fill: false },
            { label: 'Chernoff', data: [], borderColor: COLORS.sienna, borderWidth: 2, pointRadius: 0, fill: false },
          ],
        },
        options: {
          animation: anim,
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 2.8,
          plugins: {
            legend: legend({ labels: { filter: (item: any) => !item.hidden } }),
            tooltip: { enabled: false },
          },
          scales: {
            x: axis({ type: 'linear', min: 1, max: 200, title: { display: true, text: 'n', color: COLORS.pottersClay } }),
            y: axis({ min: 0, max: 1, title: { display: true, text: 'ℙ(|Mₙ-μ| ≥ ε)', color: COLORS.pottersClay } }),
          },
        },
      });
    }

    function run(dist: string, N: number, epsilon: number, confidence: number, showMarkov: boolean, showCheb: boolean, showHoeffding: boolean, showChernoff: boolean) {
      const d = dists[dist];
      if (!d) return;
      if (!convergenceChart || !decayChart) buildCharts();
      if (!convergenceChart || !decayChart) return;

      const means: number[] = [];
      let sum = 0;
      for (let i = 0; i < N; i++) {
        sum += d.sample();
        means.push(sum / (i + 1));
      }

      const mu = d.mu;
      const sigma = d.sigma;
      const alpha = 1 - confidence;
      const bounded = isFinite(d.range[1]);
      const a = d.range[0];
      const b = isFinite(d.range[1]) ? d.range[1] : 1;
      const R = b - a;
      const upLimit = bounded ? b - mu : 50;
      const downLimit = mu - a;
      const yTop = bounded ? b : mu + 2;
      const up = (e: number) => Math.min(mu + e, yTop);
      const down = (e: number) => Math.max(mu - e, a);

      const markovBand: number[] = [];
      const chebBand: number[] = [];
      const hoeffdingBand: number[] = [];
      const chernoffUpper: number[] = [];
      const chernoffLower: number[] = [];

      for (let n = 1; n <= N; n++) {
        markovBand.push(sigma / (alpha * Math.sqrt(n)));
        chebBand.push(sigma / Math.sqrt(n * alpha));
        hoeffdingBand.push(bounded ? R * Math.sqrt(Math.log(2 / alpha) / (2 * n)) : NaN);
        const target = Math.log(2 / alpha) / n;
        chernoffUpper.push(invertRate(d.rate, mu, 1, upLimit, target));
        chernoffLower.push(invertRate(d.rate, mu, -1, downLimit, target));
      }

      const xLabels = Array.from({ length: N }, (_, i) => i + 1);

      const c1 = convergenceChart;
      c1.data.labels = xLabels;
      setData(c1, [
        means,
        new Array(N).fill(mu),
        markovBand.map(up), markovBand.map(down),
        chebBand.map(up), chebBand.map(down),
        hoeffdingBand.map(up), hoeffdingBand.map(down),
        chernoffUpper.map(up), chernoffLower.map(down),
      ]);
      const vis1 = [true, true, showMarkov, showMarkov, showCheb, showCheb, showHoeffding && bounded, showHoeffding && bounded, showChernoff, showChernoff];
      vis1.forEach((v, i) => c1.setDatasetVisibility(i, v));
      (c1.options.scales as any).x.max = N;
      c1.update();

      const eps = epsilon;
      const iUp = d.rate(mu + eps);
      const iDown = d.rate(mu - eps);
      const c2 = decayChart;
      c2.data.labels = xLabels;
      setData(c2, [
        xLabels.map((n) => Math.min(sigma / (eps * Math.sqrt(n)), 1)),
        xLabels.map((n) => Math.min(sigma * sigma / (n * eps * eps), 1)),
        xLabels.map((n) => (bounded ? Math.min(2 * Math.exp(-2 * n * eps * eps / (R * R)), 1) : NaN)),
        xLabels.map((n) => Math.min(Math.exp(-n * iUp) + Math.exp(-n * iDown), 1)),
      ]);
      const vis2 = [showMarkov, showCheb, showHoeffding && bounded, showChernoff];
      vis2.forEach((v, i) => c2.setDatasetVisibility(i, v));
      (c2.options.scales as any).x.max = N;
      c2.update();
    }

    return {
      dist: 'uniform',
      n: '200',
      epsilon: '0.15',
      confidence: '0.95',
      showMarkov: true,
      showCheb: true,
      showHoeffding: true,
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
          this.showHoeffding,
          this.showChernoff,
        );
      },
    };
  });
}
