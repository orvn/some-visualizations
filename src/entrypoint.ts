import type { Alpine } from 'alpinejs';
import { Chart, LineController, LineElement, PointElement, LinearScale, Filler, Legend, Tooltip, BarController, BarElement, ScatterController } from 'chart.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, Filler, Legend, Tooltip, BarController, BarElement, ScatterController);

const MEAN = 0;
const X_VALS: number[] = [];
for (let x = -6; x <= 6; x += 0.12) X_VALS.push(parseFloat(x.toFixed(2)));

function pdf(x: number, variance: number) {
  const s = Math.sqrt(variance);
  return (1 / (s * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - MEAN) / s) ** 2);
}

function makeScriptableGrad(hex: string, a0 = 0.5, a1 = 0.01) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  let cached: { top: number; bottom: number; gr: CanvasGradient } | null = null;
  return (context: any) => {
    const { chart } = context;
    const { ctx, chartArea } = chart;
    if (!chartArea) return `rgba(${r},${g},${b},0)`;
    const { top, bottom } = chartArea;
    if (!cached || cached.top !== top || cached.bottom !== bottom) {
      const gr = ctx.createLinearGradient(0, top, 0, bottom);
      gr.addColorStop(0, `rgba(${r},${g},${b},${a0})`);
      gr.addColorStop(1, `rgba(${r},${g},${b},${a1})`);
      cached = { top, bottom, gr };
    }
    return cached.gr;
  };
}

const BASE_OPTIONS = {
  animation: { duration: 250, easing: 'linear' as const },
  responsive: true,
  maintainAspectRatio: true,
  aspectRatio: 2.4,
  plugins: {
    legend: {
      display: true,
      labels: {
        color: '#b89470', font: { size: 12 }, boxWidth: 12,
        filter: (item: any, chartData: any) => {
          const ds = chartData.datasets[item.datasetIndex];
          return ds.data.some((v: number) => v > 0);
        },
      },
    },
    tooltip: {
      backgroundColor: '#2e1508',
      borderColor: '#3a1a0a',
      borderWidth: 1,
      titleColor: '#7a5a3a',
      bodyColor: '#f0d8a8',
    },
  },
  scales: {
    x: {
      type: 'linear' as const, min: -6, max: 6,
      ticks: { color: '#7a5a3a', maxTicksLimit: 13 },
      grid: { color: '#2e1508' },
      border: { color: '#3a1a0a' },
      title: { display: true, text: 'x', color: '#7a5a3a' },
    },
    y: {
      min: 0, max: 0.85,
      ticks: { color: '#7a5a3a' },
      grid: { color: '#2e1508' },
      border: { color: '#3a1a0a' },
      title: { display: true, text: 'P(x)', color: '#7a5a3a' },
    },
  },
};

const LIVE_IDX = 0;
const REF_START = 1;
const REF_END = 3;
const ZEROS = X_VALS.map(() => 0);

const REFS = [
  { v: 0.25, label: 'σ²=0.25  tight', color: '#f07858' },
  { v: 1, label: 'σ²=1  standard', color: '#e8a050' },
  { v: 4, label: 'σ²=4  wide', color: '#90b878' },
];

const refData = REFS.map((r) => X_VALS.map((x) => pdf(x, r.v)));

export default (Alpine: Alpine) => {
  Alpine.data('normalVariance', () => {
    let chart: Chart | null = null;
    let animFrame: number | null = null;
    let currentVal = 1;

    function buildChart(initVariance: number) {
      const canvas = document.getElementById('mainChart') as HTMLCanvasElement | null;
      if (!canvas) return;
      const existing = Chart.getChart('mainChart');
      if (existing) existing.destroy();

      const datasets: any[] = [
        {
          label: 'distribution',
          data: X_VALS.map((x) => pdf(x, initVariance)),
          borderColor: '#f0d8a8', borderWidth: 3,
          backgroundColor: makeScriptableGrad('#f0d8a8', 0.55, 0.01),
          fill: true, pointRadius: 0, tension: 0.4,
        },
      ];

      REFS.forEach((r) => {
        datasets.push({
          label: r.label,
          data: ZEROS,
          borderColor: r.color,
          borderWidth: 2,
          backgroundColor: makeScriptableGrad(r.color, 0.35, 0.01),
          fill: true, pointRadius: 0, tension: 0.4,
        });
      });

      chart = new Chart(canvas, {
        type: 'line',
        data: { labels: X_VALS, datasets },
        options: BASE_OPTIONS,
      });
      chart.update('none');
    }

    function setMode(mode: string) {
      if (!chart) return;
      const showLive = mode === 'a';
      if (showLive) {
        chart.data.datasets[LIVE_IDX].data = X_VALS.map((x) => pdf(x, currentVal));
        for (let i = REF_START; i <= REF_END; i++) {
          chart.data.datasets[i].data = ZEROS;
        }
      } else {
        chart.data.datasets[LIVE_IDX].data = ZEROS;
        for (let i = REF_START; i <= REF_END; i++) {
          chart.data.datasets[i].data = refData[i - REF_START];
        }
      }
      chart.update();
    }

    function updateLiveData(variance: number) {
      if (!chart) return;
      chart.data.datasets[LIVE_IDX].data = X_VALS.map((x) => pdf(x, variance));
      chart.update('none');
    }

    return {
      mode: 'a',
      targetVariance: 1,
      displayedVariance: 1,

      init() {
        currentVal = this.targetVariance;
        buildChart(this.displayedVariance);
        this.$watch('mode', (val: string) => setMode(val));
      },

      setTarget(val: string) {
        this.targetVariance = parseFloat(val);
        if (animFrame) cancelAnimationFrame(animFrame);
        const self = this;
        const SPEED = 0.10;
        const step = () => {
          const diff = self.targetVariance - currentVal;
          if (Math.abs(diff) < 0.0005) {
            currentVal = self.targetVariance;
            self.displayedVariance = self.targetVariance;
            updateLiveData(self.displayedVariance);
            animFrame = null;
            return;
          }
          currentVal += diff * SPEED;
          self.displayedVariance = currentVal;
          updateLiveData(self.displayedVariance);
          animFrame = requestAnimationFrame(step);
        };
        animFrame = requestAnimationFrame(step);
      },

      peak() {
        return pdf(MEAN, this.displayedVariance).toFixed(4);
      },
    };
  });

  // Bayesian coin bias simulation
  Alpine.data('bayesBeta', () => {
    const GRID_STEP = 1 / 200;
    const TOTAL_FLIPS = 150;
    const TICK_MS = 125;
    const TOSS_COLS = 50;
    const grid: number[] = [];
    for (let v = 0; v <= 1.001; v += GRID_STEP) grid.push(v);

    const factorialMemo: number[] = [];
    function factorial(m: number): number {
      if (m === 0 || m === 1) return 1;
      if (factorialMemo[m] > 0) return factorialMemo[m];
      factorialMemo[m] = factorial(m - 1) * m;
      return factorialMemo[m];
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let d3svg: any = null;
    let d3tossSvg: any = null;
    let xScale: any = null;
    let yScale: any = null;
    let lineFn: any = null;
    let ymax = 8;

    return {
      bias: '0.5',
      running: false,
      n: 0,
      heads: 0,
      tails: 0,
      info: '',
      tosses: [] as string[],
      data: [] as any[],

      init() {
        // D3 may not be loaded yet (is:inline script loads after Alpine module)
        // @ts-ignore
        if (window.d3) {
          this.buildChart();
        } else {
          const self = this;
          const check = setInterval(() => {
            // @ts-ignore
            if (window.d3) {
              clearInterval(check);
              self.buildChart();
            }
          }, 50);
        }
      },

      destroy() {
        if (timeoutId) clearTimeout(timeoutId);
      },

      buildChart() {
        const container = document.getElementById('bayesChart');
        if (!container) return;
        container.innerHTML = '';
        const tossContainer = document.getElementById('bayesTosses');
        if (tossContainer) tossContainer.innerHTML = '';

        // @ts-ignore
        const d3 = window.d3;
        if (!d3) return;

        const margin = { top: 15, right: 50, bottom: 50, left: 50 };
        const width = 900 - margin.left - margin.right;
        const height = 500 - margin.top - margin.bottom;

        xScale = d3.scale.linear().range([0, width]).domain([0, 1]);
        yScale = d3.scale.linear().range([height, 0]).domain([0, ymax]);

        lineFn = d3.svg.line()
          .x((d: any) => xScale(d.x))
          .y((d: any) => yScale(d.y));

        const xAxis = d3.svg.axis().scale(xScale).orient('bottom');
        const yAxis = d3.svg.axis().scale(yScale).orient('left');

        d3svg = d3.select(container)
          .append('svg')
          .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
          .append('g')
          .attr('transform', `translate(${margin.left},${margin.top})`);

        d3svg.append('g')
          .attr('class', 'x axis')
          .attr('transform', `translate(0,${height})`)
          .call(xAxis);

        d3svg.append('g')
          .attr('class', 'y axis')
          .call(yAxis);

        if (tossContainer) {
          d3tossSvg = d3.select(tossContainer)
            .append('svg')
            .attr('viewBox', `0 0 ${width + margin.left + margin.right} 100`)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);
        }
      },

      start() {
        if (timeoutId) clearTimeout(timeoutId);
        // @ts-ignore
        const d3 = window.d3;
        if (!d3) return;
        if (!d3svg) this.buildChart();
        if (!d3svg) return;

        this.running = true;
        this.n = 0;
        this.heads = 0;
        this.tails = 0;
        this.tosses = [];
        this.data = [];
        this.info = '';
        ymax = 8;

        yScale.domain([0, ymax]);
        d3svg.select('.y.axis').call(d3.svg.axis().scale(yScale).orient('left'));
        d3svg.selectAll('path.trial').remove();
        if (d3tossSvg) d3tossSvg.selectAll('text').remove();

        this.data.push({
          trial: 'num0',
          info: 'flips:0 heads:0 tails:0',
          values: grid.map(d => ({ x: d, y: 1 })),
        });

        this.loop();
      },

      loop() {
        // @ts-ignore
        const d3 = window.d3;
        const self = this;
        const biasVal = parseFloat(this.bias) || 0.5;

        timeoutId = setTimeout(() => {
          self.n++;
          const coin = Math.random() < biasVal ? 'H' : 'T';
          if (coin === 'H') self.heads++;
          else self.tails++;
          self.tosses.push(coin);

          const H = self.heads;
          const n = self.n;

          function beta(theta: number) {
            const norm = (factorial(H) * factorial(n - H)) / factorial(n + 1);
            const likelihood = Math.pow(theta, H) * Math.pow(1 - theta, n - H);
            return likelihood / norm;
          }

          self.data.push({
            trial: `num${n}`,
            info: `flips:${n} heads:${H} tails:${self.tails}`,
            values: grid.map(d => ({ x: d, y: beta(d) })),
          });

          const last = self.data[self.data.length - 1];
          const peak = last.values.reduce((p: any, d: any) => d.y > p.y ? d : p);

          // Update y axis if needed
          if (peak.y > ymax) {
            ymax = peak.y + 2;
            yScale.domain([0, ymax]);
            d3svg.select('.y.axis').transition().duration(125)
              .call(d3.svg.axis().scale(yScale).orient('left'));
            d3svg.selectAll('path.trial')
              .transition().duration(100)
              .attr('d', (d: any) => lineFn(d.values))
              .attr('class', 'trial prev');
          } else {
            d3svg.selectAll('path.trial')
              .transition().duration(100)
              .attr('class', 'trial prev');
          }

          // Add new line
          const trials = d3svg.selectAll('path.trial').data(self.data, (d: any) => d.trial);
          trials.enter()
            .append('path')
            .attr('class', 'trial')
            .attr('d', () => lineFn(self.data[self.data.length - 2].values))
            .attr('id', (d: any) => d.trial);

          d3svg.select(`path#num${n}`)
            .transition().ease('linear').duration(100)
            .attr('d', (d: any) => lineFn(d.values));

          // Add toss text
          if (d3tossSvg) {
            const text = d3tossSvg.selectAll('.toss').data(self.tosses);
            text.enter()
              .append('text')
              .attr('class', (d: string) => d === 'H' ? 'toss heads' : 'toss tails')
              .attr('x', (_d: string, i: number) => (i % TOSS_COLS) * 14 + 120)
              .attr('y', (_d: string, i: number) => 14 + 16 * Math.floor(i / TOSS_COLS))
              .text((d: string) => d);
          }

          self.info = `mode: ${peak.x.toFixed(3)}  density: ${peak.y.toFixed(2)}  flips: ${n}  H: ${H}  T: ${self.tails}`;

          if (self.n < TOTAL_FLIPS) {
            self.loop();
          } else {
            d3svg.select(`path#num${n}`).classed('final', true);
            self.running = false;
          }
        }, TICK_MS);
      },
    };
  });

  // Central Limit Theorem
  Alpine.data('cltViz', () => {
    let histChart: Chart | null = null;
    const TRIALS = 2000;
    const BINS = 50;

    function normalPdf(x: number, mu: number, sigma: number) {
      return (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - mu) / sigma) ** 2);
    }

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
              backgroundColor: '#f0d8a8',
              borderColor: 'transparent',
              borderWidth: 0,
              barPercentage: 0.5,
              categoryPercentage: 0.5,
            },
            {
              type: 'line',
              label: 'N(0,1)',
              data: [],
              borderColor: '#90b878',
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
            legend: {
              display: true,
              labels: { color: '#b89470', font: { size: 12 }, boxWidth: 12 },
            },
            tooltip: { enabled: false },
          },
          scales: {
            x: {
              type: 'linear',
              display: true,
              ticks: {
                color: '#7a5a3a',
                callback: (v: any) => typeof v === 'number' ? v.toFixed(1) : v,
              },
              grid: { color: '#2e1508' },
              border: { color: '#3a1a0a' },
              title: { display: true, text: 'Zₙ', color: '#7a5a3a' },
            },
            xLine: {
              type: 'linear',
              display: false,
            },
            y: {
              min: 0,
              ticks: { color: '#7a5a3a' },
              grid: { color: '#2e1508' },
              border: { color: '#3a1a0a' },
              title: { display: true, text: 'density', color: '#7a5a3a' },
            },
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

      // Set axes range
      (histChart.options.scales!.x as any).min = min;
      (histChart.options.scales!.x as any).max = max;
      (histChart.options.scales!.xLine as any).min = min;
      (histChart.options.scales!.xLine as any).max = max;
      histChart.data.labels = centers;

      // Reset to zeros
      histChart.data.datasets[0].data = new Array(density.length).fill(0);
      histChart.data.datasets[1].data = normData.map(pt => ({ x: pt.x, y: null as any }));
      (histChart.data.datasets[1] as any).borderColor = 'rgba(144,184,120,0)';
      histChart.update('none');

      // Animate using rAF for smooth 60fps
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

        // Bars: each bar appears and grows as the sweep passes it
        const barData = density.map((d, i) => {
          const barStart = i / barTotal;
          const barProgress = Math.max(0, Math.min((progress - barStart) * barTotal / 3, 1));
          return d * barProgress;
        });

        // Normal: follows bars with a delay, traces left to right
        const normProgress = Math.max(0, (progress - normDelayFrac) / (1 - normDelayFrac));
        const normEnd = Math.floor(normProgress * normTotal);

        if (normEnd > 0) {
          (histChart.data.datasets[1] as any).borderColor = '#90b878';
        }

        histChart.data.datasets[0].data = barData;
        histChart.data.datasets[1].data = normData.map((pt, i) =>
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
          // Standardize: Zₙ = (Sₙ - nμ) / (σ√n)
          const z = (sum - n * mu) / (sigma * Math.sqrt(n));
          zScores.push(z);
        }

        animateHist(zScores);
      },
    };
  });

  // Law of Large Numbers with inequality comparison
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

      // Generate samples and running mean
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
      const bounded = isFinite(d.range[1]); // can use Chernoff
      const a = d.range[0];
      const b = isFinite(d.range[1]) ? d.range[1] : 1;
      const R = b - a; // range width for Chernoff

      // Compute funnel half-widths at each n
      const markovBand: number[] = [];
      const chebBand: number[] = [];
      const chernoffBand: number[] = [];

      for (let n = 1; n <= N; n++) {
        // Markov on |Mₙ-μ|: ℙ(|Mₙ-μ| ≥ ε) ≤ 𝔼[|Mₙ-μ|]/ε ≤ σ/(ε√n)
        // Invert for band: ε = σ / (α√n)
        markovBand.push(sigma / (alpha * Math.sqrt(n)));

        // Chebyshev: ε = σ / √(nα)
        chebBand.push(sigma / Math.sqrt(n * alpha));

        // Chernoff: ε = R√(ln(2/α) / (2n))
        if (bounded) {
          chernoffBand.push(R * Math.sqrt(Math.log(2 / alpha) / (2 * n)));
        } else {
          chernoffBand.push(NaN);
        }
      }

      // Chart 1: Convergence with funnels
      const xLabels = Array.from({ length: N }, (_, i) => i + 1);

      const datasets: any[] = [
        {
          label: 'Sample mean Mₙ',
          data: means,
          borderColor: '#f0d8a8',
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          order: 0,
        },
        {
          label: 'True mean μ',
          data: new Array(N).fill(mu),
          borderColor: '#b89470',
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

      // Build or update convergence chart
      const canvas1 = document.getElementById('lln-convergence') as HTMLCanvasElement | null;
      if (canvas1) {
        if (convergenceChart) convergenceChart.destroy();
        convergenceChart = new Chart(canvas1, {
          type: 'line',
          data: { labels: xLabels, datasets },
          options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2.4,
            plugins: {
              legend: {
                display: true,
                labels: {
                  color: '#b89470', font: { size: 11 }, boxWidth: 18, boxHeight: 0,
                  filter: (item: any) => !item.text.includes('lower'),
                },
              },
              tooltip: { enabled: false },
            },
            scales: {
              x: {
                type: 'linear', min: 1, max: N,
                ticks: { color: '#7a5a3a' },
                grid: { color: '#2e1508' },
                border: { color: '#3a1a0a' },
                title: { display: true, text: 'n (samples)', color: '#7a5a3a' },
              },
              y: {
                ticks: { color: '#7a5a3a' },
                grid: { color: '#2e1508' },
                border: { color: '#3a1a0a' },
                title: { display: true, text: 'Mₙ', color: '#7a5a3a' },
              },
            },
          },
        });
      }

      // Chart 2: Probability decay
      const canvas2 = document.getElementById('lln-decay') as HTMLCanvasElement | null;
      if (canvas2) {
        if (decayChart) decayChart.destroy();
        const eps = epsilon;
        const decayDatasets: any[] = [];

        if (showMarkov) {
          decayDatasets.push({
            label: 'Markov',
            data: xLabels.map((n) => Math.min(sigma / (eps * Math.sqrt(n)), 1)),
            borderColor: '#f07858', borderWidth: 2, pointRadius: 0, fill: false,
          });
        }
        if (showCheb) {
          decayDatasets.push({
            label: 'Chebyshev',
            data: xLabels.map((n) => Math.min(sigma * sigma / (n * eps * eps), 1)),
            borderColor: '#90b878', borderWidth: 2, pointRadius: 0, fill: false,
          });
        }
        if (showChernoff && bounded) {
          decayDatasets.push({
            label: 'Chernoff',
            data: xLabels.map((n) => Math.min(2 * Math.exp(-2 * n * eps * eps / (R * R)), 1)),
            borderColor: '#e8a050', borderWidth: 2, pointRadius: 0, fill: false,
          });
        }

        decayChart = new Chart(canvas2, {
          type: 'line',
          data: { labels: xLabels, datasets: decayDatasets },
          options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2.8,
            plugins: {
              legend: {
                display: true,
                labels: { color: '#b89470', font: { size: 11 }, boxWidth: 18, boxHeight: 0 },
              },
              tooltip: { enabled: false },
            },
            scales: {
              x: {
                type: 'linear', min: 1, max: N,
                ticks: { color: '#7a5a3a' },
                grid: { color: '#2e1508' },
                border: { color: '#3a1a0a' },
                title: { display: true, text: 'n', color: '#7a5a3a' },
              },
              y: {
                min: 0, max: 1,
                ticks: { color: '#7a5a3a' },
                grid: { color: '#2e1508' },
                border: { color: '#3a1a0a' },
                title: { display: true, text: 'ℙ(|Mₙ-μ| ≥ ε)', color: '#7a5a3a' },
              },
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

  // Convolution visualization
  Alpine.data('convolutionViz', () => {
    let chart: Chart | null = null;
    let animId: number | null = null;

    const RESOLUTION = 200;
    const X_MIN = -2;
    const X_MAX = 4;
    const DX = (X_MAX - X_MIN) / RESOLUTION;

    type DistFn = (x: number) => number;

    const pdfDefs: Record<string, { f: DistFn; g: DistFn; labelF: string; labelG: string }> = {
      'uniform-uniform': {
        f: (x) => (x >= 0 && x <= 1) ? 1 : 0,
        g: (x) => (x >= 0 && x <= 1) ? 1 : 0,
        labelF: 'Uniform [0,1]', labelG: 'Uniform [0,1]',
      },
      'uniform-exponential': {
        f: (x) => (x >= 0 && x <= 1) ? 1 : 0,
        g: (x) => x >= 0 ? Math.exp(-x) : 0,
        labelF: 'Uniform [0,1]', labelG: 'Exponential (λ=1)',
      },
      'triangle-uniform': {
        f: (x) => (x >= 0 && x <= 1) ? 2 * x : (x > 1 && x <= 2) ? 2 * (2 - x) : 0,
        g: (x) => (x >= 0 && x <= 1) ? 1 : 0,
        labelF: 'Triangle [0,2]', labelG: 'Uniform [0,1]',
      },
    };

    function convolve(f: DistFn, g: DistFn, z: number): number {
      let sum = 0;
      for (let i = 0; i <= RESOLUTION; i++) {
        const x = X_MIN + i * DX;
        sum += f(x) * g(z - x) * DX;
      }
      return sum;
    }

    function buildChart() {
      const canvas = document.getElementById('conv-chart') as HTMLCanvasElement | null;
      if (!canvas) return;
      if (chart) chart.destroy();

      chart = new Chart(canvas, {
        type: 'line',
        data: {
          datasets: [
            { label: 'f(x)', data: [], borderColor: '#f0d8a8', borderWidth: 2, pointRadius: 0, fill: false, tension: 0 },
            { label: 'g(z−x)', data: [], borderColor: '#f07858', borderWidth: 2, pointRadius: 0, fill: true, backgroundColor: 'rgba(240,120,88,0.15)', tension: 0 },
            { label: 'overlap', data: [], borderColor: 'rgba(144,184,120,0.4)', borderWidth: 0, pointRadius: 0, fill: true, backgroundColor: 'rgba(144,184,120,0.3)', tension: 0 },
          ],
        },
        options: {
          animation: false, responsive: true, maintainAspectRatio: true, aspectRatio: 2.8,
          plugins: {
            legend: { display: true, labels: { color: '#b89470', font: { size: 11 }, boxWidth: 18, boxHeight: 0 } },
            tooltip: { enabled: false },
          },
          scales: {
            x: { type: 'linear', min: X_MIN, max: X_MAX, ticks: { color: '#7a5a3a' }, grid: { color: '#2e1508' }, border: { color: '#3a1a0a' }, title: { display: true, text: 'x', color: '#7a5a3a' } },
            y: { min: 0, max: 1.5, ticks: { color: '#7a5a3a' }, grid: { color: '#2e1508' }, border: { color: '#3a1a0a' } },
          },
        },
      });
    }

    let resultChart: Chart | null = null;

    function buildResultChart() {
      const canvas = document.getElementById('conv-result') as HTMLCanvasElement | null;
      if (!canvas) return;
      if (resultChart) resultChart.destroy();

      resultChart = new Chart(canvas, {
        type: 'line',
        data: {
          datasets: [{
            label: '(f * g)(z)',
            data: [],
            borderColor: '#90b878',
            borderWidth: 2,
            pointRadius: 0,
            fill: true,
            backgroundColor: makeScriptableGrad('#90b878', 0.3, 0.01),
            tension: 0.3,
          }],
        },
        options: {
          animation: false, responsive: true, maintainAspectRatio: true, aspectRatio: 2.8,
          plugins: {
            legend: { display: true, labels: { color: '#b89470', font: { size: 11 }, boxWidth: 18, boxHeight: 0 } },
            tooltip: { enabled: false },
          },
          scales: {
            x: { type: 'linear', min: X_MIN, max: X_MAX, ticks: { color: '#7a5a3a' }, grid: { color: '#2e1508' }, border: { color: '#3a1a0a' }, title: { display: true, text: 'z', color: '#7a5a3a' } },
            y: { min: 0, ticks: { color: '#7a5a3a' }, grid: { color: '#2e1508' }, border: { color: '#3a1a0a' }, title: { display: true, text: '(f * g)(z)', color: '#7a5a3a' } },
          },
        },
      });
    }

    function updateFrame(f: DistFn, g: DistFn, z: number) {
      if (!chart) return;
      const fData: { x: number; y: number }[] = [];
      const gFlipped: { x: number; y: number }[] = [];
      const overlap: { x: number; y: number }[] = [];

      for (let i = 0; i <= RESOLUTION; i++) {
        const x = X_MIN + i * DX;
        const fv = f(x);
        const gv = g(z - x);
        fData.push({ x, y: fv });
        gFlipped.push({ x, y: gv });
        overlap.push({ x, y: Math.min(fv, gv) > 0 ? fv * gv : 0 });
      }

      chart.data.datasets[0].data = fData;
      chart.data.datasets[1].data = gFlipped;
      chart.data.datasets[2].data = overlap;
      chart.update('none');
    }

    return {
      pair: 'uniform-uniform',
      playing: false,
      z: '-1',
      zDisplay: '-1.00',
      resultLabel: '',

      init() {
        buildChart();
        buildResultChart();
        this.updateStatic();
      },

      updateStatic() {
        const def = pdfDefs[this.pair];
        if (!def) return;
        this.resultLabel = `${def.labelF} + ${def.labelG}`;
        const zVal = parseFloat(this.z);
        this.zDisplay = zVal.toFixed(2);
        updateFrame(def.f, def.g, zVal);

        // Compute full convolution result
        if (!resultChart) return;
        const result: { x: number; y: number }[] = [];
        for (let i = 0; i <= RESOLUTION; i++) {
          const zz = X_MIN + i * DX;
          result.push({ x: zz, y: convolve(def.f, def.g, zz) });
        }
        resultChart.data.datasets[0].data = result;
        resultChart.update('none');
      },

      play() {
        if (animId) { cancelAnimationFrame(animId); animId = null; }
        this.playing = true;
        const def = pdfDefs[this.pair];
        if (!def) return;
        const self = this;
        let zVal = X_MIN;
        const speed = 0.02;
        const result: { x: number; y: number }[] = [];

        if (resultChart) {
          resultChart.data.datasets[0].data = [];
          resultChart.update('none');
        }

        const tick = () => {
          zVal += speed;
          if (zVal > X_MAX) {
            self.playing = false;
            self.z = String(X_MAX);
            self.zDisplay = X_MAX.toFixed(2);
            animId = null;
            return;
          }
          self.z = String(zVal);
          self.zDisplay = zVal.toFixed(2);
          updateFrame(def.f, def.g, zVal);

          result.push({ x: zVal, y: convolve(def.f, def.g, zVal) });
          if (resultChart) {
            resultChart.data.datasets[0].data = [...result];
            resultChart.update('none');
          }

          animId = requestAnimationFrame(tick);
        };
        animId = requestAnimationFrame(tick);
      },

      stop() {
        if (animId) { cancelAnimationFrame(animId); animId = null; }
        this.playing = false;
      },
    };
  });

  // Normal-Binomial approximation
  function createStripePattern(color: string, bgColor: string = 'transparent'): CanvasPattern | string {
    const size = 8;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    if (!ctx) return color;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, size);
    ctx.lineTo(size, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-size / 2, size / 2);
    ctx.lineTo(size / 2, -size / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(size / 2, size + size / 2);
    ctx.lineTo(size + size / 2, size / 2);
    ctx.stroke();
    const pattern = ctx.createPattern(c, 'repeat');
    return pattern || color;
  }

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

    function normalPdfLocal(x: number, mu: number, sigma: number): number {
      return (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - mu) / sigma) ** 2);
    }

    function normalCdf(x: number, mu: number, sigma: number): number {
      const z = (x - mu) / sigma;
      const t = 1 / (1 + 0.2316419 * Math.abs(z));
      const d = 0.3989422804014327;
      const p = d * Math.exp(-z * z / 2) * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.8212560 + t * 1.3302744))));
      return z > 0 ? 1 - p : p;
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

        // Slow start, accelerate
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

        // Binomial PMF bars
        const ks: number[] = [];
        const pmf: number[] = [];
        for (let k = 0; k <= n; k++) {
          ks.push(k);
          pmf.push(binomPmf(k, n, p));
        }

        // Normal approximation values at each k
        const normalApprox: number[] = [];
        for (let k = 0; k <= n; k++) {
          if (useCC) {
            normalApprox.push(normalCdf(k + 0.5, mu, sigma) - normalCdf(k - 0.5, mu, sigma));
          } else {
            normalApprox.push(normalPdfLocal(k, mu, sigma));
          }
        }

        // Continuous normal curve for overlay
        const normCurve: { x: number; y: number }[] = [];
        const xMin = Math.max(0, mu - 4 * sigma);
        const xMax = Math.min(n, mu + 4 * sigma);
        for (let x = xMin; x <= xMax; x += (xMax - xMin) / 200) {
          normCurve.push({ x, y: normalPdfLocal(x, mu, sigma) });
        }

        // Error metric
        let totalErr = 0;
        for (let k = 0; k <= n; k++) {
          totalErr += Math.abs(pmf[k] - normalApprox[k]);
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
                  backgroundColor: createStripePattern('#f0d8a8'),
                  borderColor: '#f0d8a8',
                  borderWidth: 1,
                  barPercentage: 0.7,
                  categoryPercentage: 0.7,
                },
                {
                  type: 'line',
                  label: 'Normal approx',
                  data: normCurve,
                  borderColor: '#90b878',
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
                legend: { display: true, labels: { color: '#b89470', font: { size: 11 }, boxWidth: 18, boxHeight: 0 } },
                tooltip: { enabled: false },
              },
              scales: {
                x: {
                  type: 'linear', min: lo, max: hi,
                  ticks: { color: '#7a5a3a', stepSize: n <= 20 ? 1 : undefined },
                  grid: { color: '#2e1508' },
                  border: { color: '#3a1a0a' },
                  title: { display: true, text: 'k', color: '#7a5a3a' },
                },
                xLine: {
                  type: 'linear', display: false,
                  min: lo, max: hi,
                },
                y: {
                  min: 0,
                  ticks: { color: '#7a5a3a' },
                  grid: { color: '#2e1508' },
                  border: { color: '#3a1a0a' },
                  title: { display: true, text: 'ℙ(X = k)', color: '#7a5a3a' },
                },
              },
            },
          });
        } else {
          nbChart.data.labels = ks;
          nbChart.data.datasets[0].data = pmf;
          nbChart.data.datasets[1].data = normCurve;
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

  // Bivariate normals — 3D surface + 2D slice
  Alpine.data('bivariateNormals', () => {
    let surfaceCanvas: HTMLCanvasElement | null = null;
    let surfaceCtx: CanvasRenderingContext2D | null = null;
    let heatCanvas: HTMLCanvasElement | null = null;
    let heatCtx: CanvasRenderingContext2D | null = null;
    let sliceChart: Chart | null = null;

    const GRID = 40;
    const RANGE = 4;

    function jointPdf(x: number, y: number, sx: number, sy: number, rho: number): number {
      const r2 = rho * rho;
      const norm = 1 / (2 * Math.PI * sx * sy * Math.sqrt(1 - r2));
      const z = (x * x) / (sx * sx) - (2 * rho * x * y) / (sx * sy) + (y * y) / (sy * sy);
      return norm * Math.exp(-z / (2 * (1 - r2)));
    }

    function densityColor(v: number, maxV: number): string {
      const t = Math.min(v / maxV, 1);
      // olivine(144,184,120) → colonial(240,216,168) → sienna(240,120,88)
      let r: number, g: number, b: number;
      if (t < 0.5) {
        const s = t * 2;
        r = Math.round(144 + (240 - 144) * s);
        g = Math.round(184 + (216 - 184) * s);
        b = Math.round(120 + (168 - 120) * s);
      } else {
        const s = (t - 0.5) * 2;
        r = Math.round(240);
        g = Math.round(216 + (120 - 216) * s);
        b = Math.round(168 + (88 - 168) * s);
      }
      return `rgb(${r},${g},${b})`;
    }

    function project(x: number, y: number, z: number, W: number, H: number): [number, number] {
      // Isometric-ish projection
      const scale = Math.min(W, H) * 0.11;
      const angle = 0.7;
      const tilt = 0.55;
      const px = W / 2 + (x - y) * Math.cos(angle) * scale;
      const py = H * 0.75 + (x + y) * Math.sin(angle) * tilt * scale - z * scale * 8;
      return [px, py];
    }

    function drawSurface(sx: number, sy: number, rho: number) {
      if (!surfaceCtx || !surfaceCanvas) return;
      const W = surfaceCanvas.getBoundingClientRect().width;
      const H = surfaceCanvas.getBoundingClientRect().height;
      const ctx = surfaceCtx;
      ctx.clearRect(0, 0, W * 3, H * 3);

      const step = (RANGE * 2) / GRID;
      const vals: number[][] = [];
      let maxV = 0;

      for (let i = 0; i <= GRID; i++) {
        vals[i] = [];
        for (let j = 0; j <= GRID; j++) {
          const x = -RANGE + i * step;
          const y = -RANGE + j * step;
          const v = jointPdf(x, y, sx, sy, rho);
          vals[i][j] = v;
          if (v > maxV) maxV = v;
        }
      }

      // Draw filled quads back-to-front (painter's algorithm)
      // Sort order: back corner is high i + high j
      const quads: { i: number; j: number; depth: number }[] = [];
      for (let i = 0; i < GRID; i++) {
        for (let j = 0; j < GRID; j++) {
          quads.push({ i, j, depth: i + j });
        }
      }
      quads.sort((a, b) => a.depth - b.depth);

      for (const q of quads) {
        const { i, j } = q;
        const x0 = -RANGE + i * step;
        const x1 = x0 + step;
        const y0 = -RANGE + j * step;
        const y1 = y0 + step;

        const v00 = vals[i][j];
        const v10 = vals[i + 1][j];
        const v01 = vals[i][j + 1];
        const v11 = vals[i + 1][j + 1];
        const avgV = (v00 + v10 + v01 + v11) / 4;

        const [p0x, p0y] = project(x0, y0, v00, W, H);
        const [p1x, p1y] = project(x1, y0, v10, W, H);
        const [p2x, p2y] = project(x1, y1, v11, W, H);
        const [p3x, p3y] = project(x0, y1, v01, W, H);

        // Fill quad with page background + some alpha for occlusion
        ctx.fillStyle = 'rgba(34, 15, 7, 0.7)';
        ctx.beginPath();
        ctx.moveTo(p0x, p0y);
        ctx.lineTo(p1x, p1y);
        ctx.lineTo(p2x, p2y);
        ctx.lineTo(p3x, p3y);
        ctx.closePath();
        ctx.fill();

        // Stroke wireframe edges
        ctx.strokeStyle = densityColor(avgV, maxV);
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // Axes labels
      ctx.fillStyle = '#7a5a3a';
      ctx.font = '11px system-ui, sans-serif';
      const [lx, ly] = project(RANGE + 0.5, 0, 0, W, H);
      ctx.fillText('X', lx, ly);
      const [lx2, ly2] = project(0, RANGE + 0.5, 0, W, H);
      ctx.fillText('Y', lx2, ly2);
    }

    function drawContours(ctx: CanvasRenderingContext2D, sx: number, sy: number, rho: number,
        pad: { left: number; right: number; top: number; bottom: number },
        plotW: number, plotH: number, color: string, levels: number[]) {
      // Draw elliptical contours of bivariate normal
      // The contour at level c satisfies: (1/(1-ρ²))[(x/σx)² - 2ρ(x/σx)(y/σy) + (y/σy)²] = -2ln(2πσxσy√(1-ρ²)·c)
      // Which is an ellipse parameterized by angle θ

      const toPixelX = (x: number) => pad.left + ((x + RANGE) / (RANGE * 2)) * plotW;
      const toPixelY = (y: number) => pad.top + ((RANGE - y) / (RANGE * 2)) * plotH;

      for (const level of levels) {
        const peak = jointPdf(0, 0, sx, sy, rho);
        const fraction = level;
        const target = peak * fraction;
        if (target <= 0) continue;

        // Mahalanobis radius for this contour
        const normConst = 1 / (2 * Math.PI * sx * sy * Math.sqrt(1 - rho * rho));
        if (target >= normConst) continue;
        const r2 = -2 * (1 - rho * rho) * Math.log(target / normConst);
        if (r2 <= 0) continue;
        const r = Math.sqrt(r2);

        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let t = 0; t <= 2 * Math.PI + 0.05; t += 0.05) {
          const u = r * Math.cos(t);
          const v = r * Math.sin(t);
          // Transform from unit circle to ellipse with correlation
          const x = sx * u;
          const y = sy * (rho * u + Math.sqrt(1 - rho * rho) * v);
          const px = toPixelX(x);
          const py = toPixelY(y);
          if (t === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }

    function drawAnnotations(ctx: CanvasRenderingContext2D, sx: number, sy: number,
        pad: { left: number; right: number; top: number; bottom: number },
        plotW: number, plotH: number) {
      const toPixelX = (x: number) => pad.left + ((x + RANGE) / (RANGE * 2)) * plotW;
      const toPixelY = (y: number) => pad.top + ((RANGE - y) / (RANGE * 2)) * plotH;
      const cx = toPixelX(0);
      const cy = toPixelY(0);

      // Center dot
      ctx.fillStyle = '#1a0c06';
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();

      // σx — offset below center to avoid slice line
      const sxPx = toPixelX(sx);
      ctx.strokeStyle = '#3a1a0a';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(cx, cy + 12);
      ctx.lineTo(sxPx, cy + 12);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#3a1a0a';
      ctx.strokeStyle = 'rgba(240,216,168,0.3)';
      ctx.lineWidth = 3;
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeText('σₓ', (cx + sxPx) / 2, cy + 32);
      ctx.fillText('σₓ', (cx + sxPx) / 2, cy + 32);

      // σy — offset left of center
      const syPy = toPixelY(sy);
      ctx.strokeStyle = '#3a1a0a';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy);
      ctx.lineTo(cx - 12, syPy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#3a1a0a';
      ctx.strokeStyle = 'rgba(240,216,168,0.3)';
      ctx.lineWidth = 3;
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.strokeText('σᵧ', cx - 30, (cy + syPy) / 2 + 5);
      ctx.fillText('σᵧ', cx - 30, (cy + syPy) / 2 + 5);

      // Center dot + label — offset up-right
      ctx.fillStyle = '#3a1a0a';
      ctx.strokeStyle = 'rgba(240,216,168,0.3)';
      ctx.lineWidth = 3;
      ctx.font = '14px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.strokeText('(μₓ, μᵧ)', cx + 14, cy - 16);
      ctx.fillText('(μₓ, μᵧ)', cx + 14, cy - 16);

      // Axis labels — tucked inside plot
      ctx.fillStyle = '#7a5a3a';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('x', pad.left + plotW - 4, toPixelY(0) - 8);
      ctx.textAlign = 'left';
      ctx.fillText('y', toPixelX(0) + 6, pad.top + 16);
    }

    function drawHeatmap(sx: number, sy: number, rho: number, sliceY: number, showContours: boolean, showAnnotations: boolean) {
      if (!heatCtx || !heatCanvas) return;
      const W = heatCanvas.getBoundingClientRect().width;
      const H = heatCanvas.getBoundingClientRect().height;
      const ctx = heatCtx;
      ctx.clearRect(0, 0, W * 3, H * 3);

      const pad = { left: 35, right: 10, top: 10, bottom: 25 };
      const plotW = W - pad.left - pad.right;
      const plotH = H - pad.top - pad.bottom;
      const step = (RANGE * 2) / 100;

      let maxV = 0;
      for (let i = 0; i <= 100; i++) {
        for (let j = 0; j <= 100; j++) {
          const x = -RANGE + i * step;
          const y = -RANGE + j * step;
          const v = jointPdf(x, y, sx, sy, rho);
          if (v > maxV) maxV = v;
        }
      }

      // Draw cells
      const cellW = plotW / 100;
      const cellH = plotH / 100;
      for (let i = 0; i <= 100; i++) {
        for (let j = 0; j <= 100; j++) {
          const x = -RANGE + i * step;
          const y = -RANGE + j * step;
          const v = jointPdf(x, y, sx, sy, rho);
          const t = Math.min(v / maxV, 1);
          const alpha = t * 0.9;
          ctx.fillStyle = `rgba(240,216,168,${alpha})`;
          ctx.fillRect(pad.left + i * cellW, pad.top + (100 - j) * cellH, cellW + 0.5, cellH + 0.5);
        }
      }

      // Contours and annotations
      if (showContours) {
        const levels = [0.8, 0.5, 0.2, 0.05];
        // Independent contours (axis-aligned) in teak
        if (rho !== 0) {
          drawContours(ctx, sx, sy, 0, pad, plotW, plotH, 'rgba(184,148,112,0.25)', levels);
        }
        // Actual contours in colonial (or sienna if bivariate)
        const contourColor = rho !== 0 ? 'rgba(240,120,88,0.5)' : 'rgba(240,216,168,0.45)';
        drawContours(ctx, sx, sy, rho, pad, plotW, plotH, contourColor, levels);
      }

      if (showAnnotations) {
        drawAnnotations(ctx, sx, sy, pad, plotW, plotH);
      }

      // Cross-section intensity strip along the slice
      const slicePixelY = pad.top + ((RANGE - sliceY) / (RANGE * 2)) * plotH;
      const stripH = 3;
      for (let i = 0; i <= 100; i++) {
        const x = -RANGE + i * step;
        const v = jointPdf(x, sliceY, sx, sy, rho);
        const t = Math.min(v / maxV, 1);
        if (t > 0.01) {
          const px = pad.left + i * cellW;
          ctx.fillStyle = `rgba(240,120,88,${0.3 + t * 0.7})`;
          ctx.fillRect(px, slicePixelY - stripH, cellW + 0.5, stripH * 2);
        }
      }

      // Slice line
      const slicePixel = slicePixelY;
      ctx.strokeStyle = '#f07858';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.left, slicePixel);
      ctx.lineTo(pad.left + plotW, slicePixel);
      ctx.stroke();
      ctx.setLineDash([]);

      // Slice label
      ctx.fillStyle = '#f07858';
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`y = ${sliceY.toFixed(1)}`, pad.left + 4, slicePixel - 5);

      // Axis ticks
      ctx.fillStyle = '#7a5a3a';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (let v = -RANGE; v <= RANGE; v += 2) {
        const px = pad.left + ((v + RANGE) / (RANGE * 2)) * plotW;
        ctx.fillText(String(v), px, pad.top + plotH + 15);
      }
      ctx.textAlign = 'right';
      for (let v = -RANGE; v <= RANGE; v += 2) {
        const py = pad.top + ((RANGE - v) / (RANGE * 2)) * plotH;
        ctx.fillText(String(v), pad.left - 5, py + 4);
      }
    }

    function drawSlice(sx: number, sy: number, rho: number, sliceY: number) {
      const canvas = document.getElementById('bn-slice') as HTMLCanvasElement | null;
      if (!canvas) return;

      // Conditional PDF: f(x|Y=y) is normal with
      // mean = ρ(σx/σy)y, variance = σx²(1-ρ²)
      const condMu = rho * (sx / sy) * sliceY;
      const condSigma = sx * Math.sqrt(1 - rho * rho);

      const data: { x: number; y: number }[] = [];
      for (let x = -RANGE; x <= RANGE; x += 0.05) {
        const v = (1 / (condSigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - condMu) / condSigma) ** 2);
        data.push({ x, y: v });
      }

      if (!sliceChart) {
        sliceChart = new Chart(canvas, {
          type: 'line',
          data: {
            datasets: [{
              label: 'f(x|Y=y)',
              data,
              borderColor: '#f07858',
              borderWidth: 2,
              pointRadius: 0,
              fill: true,
              backgroundColor: makeScriptableGrad('#f07858', 0.25, 0.01),
              tension: 0.4,
            }],
          },
          options: {
            animation: false, responsive: true, maintainAspectRatio: true, aspectRatio: 1.8,
            plugins: {
              legend: { display: true, labels: { color: '#b89470', font: { size: 11 }, boxWidth: 18, boxHeight: 0 } },
              tooltip: { enabled: false },
            },
            scales: {
              x: {
                type: 'linear', min: -RANGE, max: RANGE,
                ticks: { color: '#7a5a3a' },
                grid: { color: '#2e1508' },
                border: { color: '#3a1a0a' },
                title: { display: true, text: 'x', color: '#7a5a3a' },
              },
              y: {
                min: 0,
                suggestedMax: 0.6,
                ticks: { color: '#7a5a3a' },
                grid: { color: '#2e1508' },
                border: { color: '#3a1a0a' },
                title: { display: true, text: 'f(x|Y=y)', color: '#7a5a3a' },
              },
            },
          },
        });
      } else {
        sliceChart.data.datasets[0].data = data;
        sliceChart.update('none');
      }
    }

    return {
      mode: 'general',
      sigmaX: '1',
      sigmaY: '1',
      rho: '0',
      sliceY: '0',
      condInfo: '',
      showContours: true,
      showAnnotations: false,
      _animFrame: null as number | null,
      _current: { sx: 1, sy: 1, rho: 0, sliceY: 0 },

      init() {
        const self = this;
        const tryInit = () => {
          surfaceCanvas = document.getElementById('bn-surface') as HTMLCanvasElement | null;
          heatCanvas = document.getElementById('bn-heatmap') as HTMLCanvasElement | null;
          if (!surfaceCanvas || surfaceCanvas.getBoundingClientRect().width === 0) {
            requestAnimationFrame(tryInit);
            return;
          }
          [surfaceCanvas, heatCanvas].forEach(c => {
            if (!c) return;
            const dpr = window.devicePixelRatio || 1;
            const rect = c.getBoundingClientRect();
            c.width = rect.width * dpr;
            c.height = rect.height * dpr;
            const ctx = c.getContext('2d');
            if (ctx) ctx.scale(dpr, dpr);
          });
          surfaceCtx = surfaceCanvas.getContext('2d');
          heatCtx = heatCanvas?.getContext('2d') || null;
          self._current = { sx: 1, sy: 1, rho: 0, sliceY: 0 };
          self.render();
        };
        requestAnimationFrame(tryInit);
      },

      render() {
        let targetSx = parseFloat(this.sigmaX) || 1;
        let targetSy = parseFloat(this.sigmaY) || 1;
        let targetRho = parseFloat(this.rho) || 0;
        const targetSliceY = parseFloat(this.sliceY) || 0;

        if (this.mode === 'general') { targetRho = 0; }

        const cur = this._current;
        const needsAnim = Math.abs(cur.sx - targetSx) > 0.01 ||
                          Math.abs(cur.sy - targetSy) > 0.01 ||
                          Math.abs(cur.rho - targetRho) > 0.01 ||
                          Math.abs(cur.sliceY - targetSliceY) > 0.01;

        if (this._animFrame) { cancelAnimationFrame(this._animFrame); this._animFrame = null; }

        if (!needsAnim) {
          cur.sx = targetSx; cur.sy = targetSy; cur.rho = targetRho; cur.sliceY = targetSliceY;
          this._drawFrame();
          return;
        }

        const self = this;
        const SPEED = 0.15;
        const step = () => {
          cur.sx += (targetSx - cur.sx) * SPEED;
          cur.sy += (targetSy - cur.sy) * SPEED;
          cur.rho += (targetRho - cur.rho) * SPEED;
          cur.sliceY += (targetSliceY - cur.sliceY) * SPEED;

          const done = Math.abs(cur.sx - targetSx) < 0.005 &&
                       Math.abs(cur.sy - targetSy) < 0.005 &&
                       Math.abs(cur.rho - targetRho) < 0.005 &&
                       Math.abs(cur.sliceY - targetSliceY) < 0.005;

          if (done) {
            cur.sx = targetSx; cur.sy = targetSy; cur.rho = targetRho; cur.sliceY = targetSliceY;
          }

          self._drawFrame();

          if (!done) {
            self._animFrame = requestAnimationFrame(step);
          } else {
            self._animFrame = null;
          }
        };
        this._animFrame = requestAnimationFrame(step);
      },

      _drawFrame() {
        const { sx, sy, rho, sliceY: sliceYVal } = this._current;

        const condMu = rho * (sx / sy) * sliceYVal;
        const condSigma = sx * Math.sqrt(1 - rho * rho);
        const indepNote = Math.abs(rho) < 0.01 ? '  (independent: slice = marginal)' : '';
        this.condInfo = `f(x|Y=${sliceYVal.toFixed(1)}) ~ N(${condMu.toFixed(2)}, ${condSigma.toFixed(2)}²)${indepNote}`;

        drawSurface(sx, sy, rho);
        drawHeatmap(sx, sy, rho, sliceYVal, this.showContours, this.showAnnotations);
        drawSlice(sx, sy, rho, sliceYVal);
      },
    };
  });

  // Correlation / bivariate normal
  Alpine.data('correlationViz', () => {
    let scatterChart: Chart | null = null;
    const N_POINTS = 600;

    function generateBivariateNormal(rho: number): { x: number; y: number }[] {
      const points: { x: number; y: number }[] = [];
      for (let i = 0; i < N_POINTS; i++) {
        // Box-Muller
        const u1 = Math.random();
        const u2 = Math.random();
        const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const z2 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
        // Correlated pair: X = z1, Y = ρz1 + √(1-ρ²)z2
        const x = z1;
        const y = rho * z1 + Math.sqrt(1 - rho * rho) * z2;
        points.push({ x, y });
      }
      return points;
    }

    return {
      rho: '0',
      info: '',
      accentColor: '#f0d8a8',

      init() {
        this.render();
      },

      render() {
        const rho = parseFloat(this.rho) || 0;
        const points = generateBivariateNormal(rho);

        const covXY = rho; // since σx = σy = 1
        this.info = `cov(X,Y) = ${covXY.toFixed(2)}   ρ = ${rho.toFixed(2)}   𝔼[XY] = ${covXY.toFixed(2)}`;

        // Interpolate color: sienna(-1) → colonial(0) → olivine(+1)
        const colonial = [240, 216, 168];
        const olivine = [144, 184, 120];
        const sienna = [240, 120, 88];
        const raw = Math.abs(rho);
        const t = raw < 0.5 ? 0 : (raw - 0.5) * 2; // no color shift until |ρ| > 0.5
        const target = rho >= 0 ? olivine : sienna;
        const r = Math.round(colonial[0] + (target[0] - colonial[0]) * t);
        const g = Math.round(colonial[1] + (target[1] - colonial[1]) * t);
        const b = Math.round(colonial[2] + (target[2] - colonial[2]) * t);
        const dotBg = `rgba(${r},${g},${b},0.35)`;
        const dotBorder = `rgba(${r},${g},${b},0.5)`;
        this.accentColor = `rgb(${r},${g},${b})`;

        const canvas = document.getElementById('corr-chart') as HTMLCanvasElement | null;
        if (!canvas) return;

        if (!scatterChart) {
          scatterChart = new Chart(canvas, {
            type: 'scatter',
            data: {
              datasets: [{
                label: '(X, Y)',
                data: points,
                backgroundColor: 'rgba(240,216,168,0.35)',
                borderColor: 'rgba(240,216,168,0.5)',
                borderWidth: 0.5,
                pointRadius: 2.5,
                pointHoverRadius: 3,
              }],
            },
            options: {
              animation: { duration: 400, easing: 'easeOutQuart' as const },
              responsive: true, maintainAspectRatio: true, aspectRatio: 1,
              plugins: {
                legend: { display: false },
                tooltip: { enabled: false },
              },
              scales: {
                x: {
                  min: -4, max: 4,
                  ticks: { color: '#7a5a3a' },
                  grid: { color: '#2e1508' },
                  border: { color: '#3a1a0a' },
                  title: { display: true, text: 'X', color: '#7a5a3a' },
                },
                y: {
                  min: -4, max: 4,
                  ticks: { color: '#7a5a3a' },
                  grid: { color: '#2e1508' },
                  border: { color: '#3a1a0a' },
                  title: { display: true, text: 'Y', color: '#7a5a3a' },
                },
              },
            },
          });
        } else {
          scatterChart.data.datasets[0].data = points;
          (scatterChart.data.datasets[0] as any).backgroundColor = dotBg;
          (scatterChart.data.datasets[0] as any).borderColor = dotBorder;
          scatterChart.update();
        }
      },
    };
  });

  // Random incidence paradox
  Alpine.data('randomIncidence', () => {
    let timelineCtx: CanvasRenderingContext2D | null = null;
    let timelineCanvas: HTMLCanvasElement | null = null;
    let histChart: Chart | null = null;

    const TOTAL_TIME = 60;
    const NUM_PINS = 500;

    function generateArrivals(dist: string): number[] {
      const arrivals: number[] = [];
      let t = 0;
      while (t < TOTAL_TIME) {
        let gap: number;
        if (dist === 'mixed') {
          gap = Math.random() < 0.5 ? 1 + Math.random() : 5 + Math.random() * 5;
        } else if (dist === 'exponential') {
          gap = -Math.log(1 - Math.random()) * 3;
        } else {
          gap = 1 + Math.random() * 6;
        }
        t += gap;
        if (t < TOTAL_TIME) arrivals.push(t);
      }
      return arrivals;
    }

    function getIntervals(arrivals: number[]): number[] {
      const intervals: number[] = [];
      let prev = 0;
      for (const a of arrivals) {
        intervals.push(a - prev);
        prev = a;
      }
      intervals.push(TOTAL_TIME - prev);
      return intervals;
    }

    function sampleObserved(arrivals: number[], count: number): number[] {
      const intervals = getIntervals(arrivals);
      const starts = [0, ...arrivals];
      const observed: number[] = [];
      for (let i = 0; i < count; i++) {
        const t = Math.random() * TOTAL_TIME;
        // Find which interval t falls in
        let idx = 0;
        for (let j = 0; j < starts.length; j++) {
          if (starts[j] <= t) idx = j;
          else break;
        }
        observed.push(intervals[idx]);
      }
      return observed;
    }

    function drawTimeline(arrivals: number[], pinTime: number | null) {
      if (!timelineCtx || !timelineCanvas) return;
      const ctx = timelineCtx;
      const W = timelineCanvas.getBoundingClientRect().width;
      const H = timelineCanvas.getBoundingClientRect().height;
      const pad = { left: 40, right: 20, top: 25, bottom: 25 };
      const plotW = W - pad.left - pad.right;
      const axisY = pad.top + (H - pad.top - pad.bottom) / 2;

      ctx.clearRect(0, 0, W * 2, H * 2);

      // Axis
      ctx.strokeStyle = '#3a1a0a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, axisY);
      ctx.lineTo(pad.left + plotW, axisY);
      ctx.stroke();

      // Time ticks
      ctx.fillStyle = '#7a5a3a';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (let t = 0; t <= TOTAL_TIME; t += 10) {
        const x = pad.left + (t / TOTAL_TIME) * plotW;
        ctx.beginPath();
        ctx.moveTo(x, axisY - 3);
        ctx.lineTo(x, axisY + 3);
        ctx.stroke();
        ctx.fillText(String(t), x, axisY + 16);
      }

      // Arrival markers
      ctx.strokeStyle = '#b89470';
      ctx.lineWidth = 1;
      arrivals.forEach((t) => {
        const x = pad.left + (t / TOTAL_TIME) * plotW;
        ctx.beginPath();
        ctx.moveTo(x, axisY - 10);
        ctx.lineTo(x, axisY + 10);
        ctx.stroke();
      });

      // Interval labels
      const intervals = getIntervals(arrivals);
      const starts = [0, ...arrivals];
      ctx.fillStyle = '#7a5a3a';
      ctx.font = '9px ui-monospace, monospace';
      intervals.forEach((gap, i) => {
        const startX = pad.left + (starts[i] / TOTAL_TIME) * plotW;
        const endX = pad.left + ((starts[i] + gap) / TOTAL_TIME) * plotW;
        if (endX - startX > 25) {
          ctx.fillText(gap.toFixed(1), (startX + endX) / 2, axisY - 14);
        }
      });

      // Pin
      if (pinTime !== null) {
        const px = pad.left + (pinTime / TOTAL_TIME) * plotW;
        ctx.strokeStyle = '#f07858';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, axisY - 18);
        ctx.lineTo(px, axisY + 18);
        ctx.stroke();
        ctx.fillStyle = '#f07858';
        ctx.beginPath();
        ctx.arc(px, axisY, 4, 0, Math.PI * 2);
        ctx.fill();

        // Highlight the interval it landed in
        let idx = 0;
        for (let j = 0; j < starts.length; j++) {
          if (starts[j] <= pinTime) idx = j;
          else break;
        }
        const iStart = pad.left + (starts[idx] / TOTAL_TIME) * plotW;
        const iEnd = pad.left + ((starts[idx] + intervals[idx]) / TOTAL_TIME) * plotW;
        ctx.fillStyle = 'rgba(240,120,88,0.12)';
        ctx.fillRect(iStart, axisY - 12, iEnd - iStart, 24);

        // Label
        ctx.fillStyle = '#f07858';
        ctx.font = '10px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`landed in ${intervals[idx].toFixed(1)}s gap`, px, axisY + 30);
      }
    }

    function buildHistogram(trueIntervals: number[], observedIntervals: number[]) {
      const canvas = document.getElementById('ri-histogram') as HTMLCanvasElement | null;
      if (!canvas) return;
      if (histChart) histChart.destroy();

      const maxGap = Math.max(...trueIntervals, ...observedIntervals, 1);
      const BINS = 15;
      const binW = maxGap / BINS;

      function bin(data: number[]) {
        const counts = new Array(BINS).fill(0);
        data.forEach(v => {
          const idx = Math.min(Math.floor(v / binW), BINS - 1);
          counts[idx]++;
        });
        return counts.map(c => c / (data.length * binW));
      }

      const trueDensity = bin(trueIntervals);
      const obsDensity = bin(observedIntervals);
      const centers = trueDensity.map((_, i) => ((i + 0.5) * binW));

      histChart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: centers,
          datasets: [
            {
              label: 'True intervals',
              data: trueDensity,
              backgroundColor: 'rgba(184,148,112,0.5)',
              borderColor: 'rgba(184,148,112,0.7)',
              borderWidth: 1,
              barPercentage: 0.85,
              categoryPercentage: 0.45,
            },
            {
              label: 'Observed (sampled)',
              data: obsDensity,
              backgroundColor: 'rgba(240,120,88,0.5)',
              borderColor: 'rgba(240,120,88,0.7)',
              borderWidth: 1,
              barPercentage: 0.85,
              categoryPercentage: 0.45,
            },
          ],
        },
        options: {
          animation: false, responsive: true, maintainAspectRatio: true, aspectRatio: 2.4,
          plugins: {
            legend: { display: true, labels: { color: '#b89470', font: { size: 11 }, boxWidth: 12 } },
            tooltip: { enabled: false },
          },
          scales: {
            x: {
              type: 'linear',
              ticks: { color: '#7a5a3a', callback: (v: any) => typeof v === 'number' ? v.toFixed(1) : v },
              grid: { color: '#2e1508' },
              border: { color: '#3a1a0a' },
              title: { display: true, text: 'interval length', color: '#7a5a3a' },
            },
            y: {
              min: 0,
              ticks: { color: '#7a5a3a' },
              grid: { color: '#2e1508' },
              border: { color: '#3a1a0a' },
              title: { display: true, text: 'density', color: '#7a5a3a' },
            },
          },
        },
      });
    }

    return {
      dist: 'mixed',
      pinTime: null as number | null,
      trueAvg: '',
      obsAvg: '',

      init() {
        const self = this;
        const tryInit = () => {
          timelineCanvas = document.getElementById('ri-timeline') as HTMLCanvasElement | null;
          if (!timelineCanvas || timelineCanvas.getBoundingClientRect().width === 0) {
            requestAnimationFrame(tryInit);
            return;
          }
          const dpr = window.devicePixelRatio || 1;
          const rect = timelineCanvas.getBoundingClientRect();
          timelineCanvas.width = rect.width * dpr;
          timelineCanvas.height = rect.height * dpr;
          timelineCtx = timelineCanvas.getContext('2d');
          if (timelineCtx) timelineCtx.scale(dpr, dpr);
          self.simulate();
        };
        requestAnimationFrame(tryInit);
      },

      simulate() {
        const arrivals = generateArrivals(this.dist);
        const intervals = getIntervals(arrivals);
        const observed = sampleObserved(arrivals, NUM_PINS);

        this.pinTime = Math.random() * TOTAL_TIME;
        const trueAvgVal = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const obsAvgVal = observed.reduce((a, b) => a + b, 0) / observed.length;
        this.trueAvg = trueAvgVal.toFixed(2);
        this.obsAvg = obsAvgVal.toFixed(2);

        drawTimeline(arrivals, this.pinTime);
        buildHistogram(intervals, observed);
      },
    };
  });

  // Poisson process simulation
  Alpine.data('poissonProcess', () => {
    let staircaseChart: Chart | null = null;
    let timelineCtx: CanvasRenderingContext2D | null = null;
    let timelineCanvas: HTMLCanvasElement | null = null;

    function expRandom(rate: number) {
      return -Math.log(1 - Math.random()) / rate;
    }

    function drawTimeline(arrivals: number[], maxTime: number, lambda: number) {
      if (!timelineCtx || !timelineCanvas) return;
      const ctx = timelineCtx;
      const W = timelineCanvas.width;
      const H = timelineCanvas.height;
      const pad = { left: 50, right: 20, top: 20, bottom: 30 };
      const plotW = W - pad.left - pad.right;
      const plotH = H - pad.top - pad.bottom;

      ctx.clearRect(0, 0, W, H);

      // Axis line
      const axisY = pad.top + plotH / 2;
      ctx.strokeStyle = '#3a1a0a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, axisY);
      ctx.lineTo(pad.left + plotW, axisY);
      ctx.stroke();

      // Time ticks
      ctx.fillStyle = '#7a5a3a';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const tickStep = Math.ceil(maxTime / 10);
      for (let t = 0; t <= maxTime; t += tickStep) {
        const x = pad.left + (t / maxTime) * plotW;
        ctx.beginPath();
        ctx.moveTo(x, axisY - 3);
        ctx.lineTo(x, axisY + 3);
        ctx.stroke();
        ctx.fillText(String(t), x, axisY + 18);
      }

      // Axis label
      ctx.fillText('time', pad.left + plotW / 2, H - 2);

      // Arrival markers
      arrivals.forEach((t) => {
        const x = pad.left + (t / maxTime) * plotW;
        // Vertical line
        ctx.strokeStyle = '#f07858';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, axisY - 14);
        ctx.lineTo(x, axisY + 14);
        ctx.stroke();
        // Dot
        ctx.fillStyle = '#f07858';
        ctx.beginPath();
        ctx.arc(x, axisY, 3, 0, Math.PI * 2);
        ctx.fill();
      });

      // Interarrival brackets
      ctx.fillStyle = '#b89470';
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      for (let i = 0; i < arrivals.length; i++) {
        const prev = i === 0 ? 0 : arrivals[i - 1];
        const curr = arrivals[i];
        const gap = curr - prev;
        if (gap * plotW / maxTime > 30) {
          const mx = pad.left + ((prev + curr) / 2 / maxTime) * plotW;
          ctx.fillText(gap.toFixed(1), mx, axisY - 20);
        }
      }

      // N label
      ctx.fillStyle = '#7a5a3a';
      ctx.textAlign = 'left';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(`N(${maxTime.toFixed(0)}) = ${arrivals.length}`, pad.left, pad.top + 6);

      // λ label
      ctx.textAlign = 'right';
      ctx.fillText(`λ = ${lambda.toFixed(1)}`, pad.left + plotW, pad.top + 6);
    }

    function stairData(arrivals: number[], maxTime: number) {
      const data: { x: number; y: number }[] = [{ x: 0, y: 0 }];
      arrivals.forEach((t, i) => {
        data.push({ x: t, y: i });
        data.push({ x: t, y: i + 1 });
      });
      data.push({ x: maxTime, y: arrivals.length });
      return data;
    }

    function buildStaircase(arrivals: number[], maxTime: number) {
      // Update in place if chart exists with same maxTime
      if (staircaseChart) {
        staircaseChart.data.datasets[0].data = stairData(arrivals, maxTime);
        (staircaseChart.options.scales!.x as any).max = maxTime;
        staircaseChart.update('none');
        return;
      }

      const canvas = document.getElementById('poisson-staircase') as HTMLCanvasElement | null;
      if (!canvas) return;
      const existing = Chart.getChart('poisson-staircase');
      if (existing) existing.destroy();

      staircaseChart = new Chart(canvas, {
        type: 'line',
        data: {
          datasets: [{
            label: 'N(t)',
            data: stairData(arrivals, maxTime),
            borderColor: '#90b878',
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
            stepped: 'before',
          }],
        },
        options: {
          animation: false,
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 2.8,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
          },
          scales: {
            x: {
              type: 'linear',
              min: 0,
              max: maxTime,
              ticks: { color: '#7a5a3a' },
              grid: { color: '#2e1508' },
              border: { color: '#3a1a0a' },
              title: { display: true, text: 'time', color: '#7a5a3a' },
            },
            y: {
              min: 0,
              ticks: { color: '#7a5a3a', stepSize: 1 },
              grid: { color: '#2e1508' },
              border: { color: '#3a1a0a' },
              title: { display: true, text: 'N(t)', color: '#7a5a3a' },
            },
          },
        },
      });
    }

    let animTimer: ReturnType<typeof setTimeout> | null = null;
    let dotsTimer: ReturnType<typeof setInterval> | null = null;
    let firstRun = true;

    function cancelAnim() {
      if (animTimer) { clearTimeout(animTimer); animTimer = null; }
      if (dotsTimer) { clearInterval(dotsTimer); dotsTimer = null; }
    }

    return {
      lambda: '2',
      duration: '20',
      arrivals: [] as number[],
      info: '',
      resampling: false,
      resampleText: 'resampling',

      init() {
        const self = this;
        const tryInit = () => {
          timelineCanvas = document.getElementById('poisson-timeline') as HTMLCanvasElement | null;
          if (!timelineCanvas || timelineCanvas.getBoundingClientRect().width === 0) {
            requestAnimationFrame(tryInit);
            return;
          }
          const dpr = window.devicePixelRatio || 1;
          const rect = timelineCanvas.getBoundingClientRect();
          timelineCanvas.width = rect.width * dpr;
          timelineCanvas.height = rect.height * dpr;
          timelineCtx = timelineCanvas.getContext('2d');
          if (timelineCtx) timelineCtx.scale(dpr, dpr);
          self.simulate();
        };
        requestAnimationFrame(tryInit);
      },

      simulate() {
        cancelAnim();
        this.resampling = true;
        const self = this;

        // Animated dots
        let dotCount = 0;
        dotsTimer = setInterval(() => {
          dotCount = (dotCount + 1) % 4;
          self.resampleText = 'resampling' + '.'.repeat(dotCount);
        }, 250);

        const rate = parseFloat(this.lambda) || 2;
        const maxT = parseFloat(this.duration) || 20;
        const arr: number[] = [];
        let t = 0;
        while (true) {
          t += expRandom(rate);
          if (t > maxT) break;
          arr.push(t);
        }
        this.arrivals = arr;

        const fast = !firstRun;
        firstRun = false;
        const tickMs = fast ? 3 : 20;

        // Reset staircase chart for fresh build on new simulation
        if (staircaseChart) { staircaseChart.destroy(); staircaseChart = null; }
        drawTimeline([], maxT, rate);
        buildStaircase([], maxT);

        let step = 0;
        const shown: number[] = [];

        const tick = () => {
          if (step < arr.length) {
            shown.push(arr[step]);
            step++;
          }

          drawTimeline(shown, maxT, rate);
          buildStaircase(shown, maxT);

          const avgGap = shown.length > 1
            ? (shown[shown.length - 1] / shown.length).toFixed(2)
            : '—';
          self.info = `${shown.length} arrivals  ·  avg interarrival: ${avgGap}  ·  expected: ${(1 / rate).toFixed(2)}`;

          if (step < arr.length) {
            animTimer = setTimeout(tick, tickMs);
          } else {
            self.resampling = false;
            if (dotsTimer) { clearInterval(dotsTimer); dotsTimer = null; }
            animTimer = null;
          }
        };
        animTimer = setTimeout(tick, tickMs);
      },
    };
  });
};
