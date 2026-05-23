import type { Alpine } from 'alpinejs';
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Legend, Tooltip, BarController, BarElement, ScatterController } from 'chart.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Legend, Tooltip, BarController, BarElement, ScatterController);

// On mobile, make charts taller by reducing aspect ratios
Chart.register({
  id: 'mobileAspect',
  beforeInit(chart: any) {
    if (window.innerWidth < 768 && chart.options.aspectRatio && chart.options.aspectRatio > 1.4) {
      chart.options.aspectRatio = Math.max(1.2, chart.options.aspectRatio * 0.55);
    }
  },
});

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

        const isMob = window.innerWidth < 480;
        const margin = isMob
          ? { top: 15, right: 30, bottom: 60, left: 60 }
          : { top: 15, right: 50, bottom: 50, left: 50 };
        const width = (isMob ? 450 : 900) - margin.left - margin.right;
        const height = (isMob ? 380 : 500) - margin.top - margin.bottom;

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
            aspectRatio: window.innerWidth < 480 ? 0.75 : 2.4,
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
      const scale = Math.min(W, H) * 0.15;
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
        ctx.save();
        ctx.beginPath();
        ctx.rect(pad.left, pad.top, plotW, plotH);
        ctx.clip();
        const levels = [0.8, 0.5, 0.2, 0.05];
        // Independent contours (axis-aligned) in teak
        if (rho !== 0) {
          drawContours(ctx, sx, sy, 0, pad, plotW, plotH, 'rgba(184,148,112,0.25)', levels);
        }
        // Actual contours in colonial (or sienna if bivariate)
        const contourColor = rho !== 0 ? 'rgba(240,120,88,0.5)' : 'rgba(240,216,168,0.45)';
        drawContours(ctx, sx, sy, rho, pad, plotW, plotH, contourColor, levels);
        ctx.restore();
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

  // Markov Chains
  Alpine.data('markovChain', () => {
    let diagramCanvas: HTMLCanvasElement | null = null;
    let diagramCtx: CanvasRenderingContext2D | null = null;
    let histChart: Chart | null = null;
    let walkTimer: ReturnType<typeof setTimeout> | null = null;

    const STATES = 7;
    const STATE_LABELS = ['i', 'j', 'k', 'l', 'm', 'n', 'o'];
    const COLORS = ['#f0d8a8', '#90b878', '#f07858', '#e8a050', '#b89470', '#f0d8a8', '#90b878'];

    // Transition matrix from lecture diagram (states 1-7 mapped to i-o)
    // {i,j,k} recurrent class 1, {m,o,n} recurrent class 2
    // l is transient: reachable from k, sends to m and n, n can send back
    function defaultMatrix(): number[][] {
      return [
      // i     j     k     l     m     n     o
        [0.4,  0.6,  0,    0,    0,    0,    0   ], // i: self 0.4, →j 0.6
        [0.2,  0,    0.8,  0,    0,    0,    0   ], // j: →i 0.2, →k 0.8
        [0,    0,    0.6,  0.4,  0,    0,    0   ], // k: self 0.6, →l 0.4
        [0,    0,    0.5,  0,    0.3,  0.2,  0   ], // l: →k 0.5, →m 0.3, →n 0.2
        [0,    0,    0,    0,    0,    0,    1   ], // m: →o 1
        [0,    0,    0,    0.3,  0,    0,    0.7 ], // n: →l 0.3, →o 0.7
        [0,    0,    0,    0,    0,    1,    0   ], // o: →n 1
      ];
    }

    function statePositions(W: number, H: number): [number, number][] {
      const px = 60;
      const py = 50;
      const uw = W - px * 2;
      const uh = H - py * 2;
      return [
        [px + uw * 0.0,  py + uh * 0.35], // i
        [px + uw * 0.17, py + uh * 0.35], // j
        [px + uw * 0.34, py + uh * 0.35], // k
        [px + uw * 0.58, py + uh * 0.25], // l
        [px + uw * 0.82, py + uh * 0.25], // m
        [px + uw * 0.52, py + uh * 0.72], // n
        [px + uw * 0.78, py + uh * 0.72], // o
      ];
    }

    function drawDiagram(matrix: number[][], current: number, visits: number[]) {
      if (!diagramCtx || !diagramCanvas) return;
      const W = diagramCanvas.getBoundingClientRect().width;
      const H = diagramCanvas.getBoundingClientRect().height;
      const ctx = diagramCtx;
      ctx.clearRect(0, 0, W * 3, H * 3);

      const pos = statePositions(W, H);
      const nodeR = 22;

      // Draw edges
      for (let i = 0; i < STATES; i++) {
        for (let j = 0; j < STATES; j++) {
          if (i === j || matrix[i][j] < 0.01) continue;
          const [x1, y1] = pos[i];
          const [x2, y2] = pos[j];
          const dx = x2 - x1;
          const dy = y2 - y1;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const nx = dx / dist;
          const ny = dy / dist;

          // Perpendicular offset: use canonical direction (lower→higher index) so
          // bidirectional pairs consistently separate instead of both curving the same way
          const hasBoth = matrix[j][i] > 0.01;
          const curveAmt = hasBoth ? 8 : 5;
          const lowIdx = Math.min(i, j);
          const highIdx = Math.max(i, j);
          const [lx, ly] = pos[lowIdx];
          const [hx, hy] = pos[highIdx];
          const refDx = hx - lx;
          const refDy = hy - ly;
          const refDist = Math.sqrt(refDx * refDx + refDy * refDy);
          const perpX = (refDy / refDist) * curveAmt;
          const perpY = -(refDx / refDist) * curveAmt;
          const side = hasBoth ? (i < j ? 1 : -1) : 1;
          const ox = perpX * side;
          const oy = perpY * side;

          const sx = x1 + nx * nodeR + ox;
          const sy = y1 + ny * nodeR + oy;
          const ex = x2 - nx * (nodeR + 6) + ox;
          const ey = y2 - ny * (nodeR + 6) + oy;

          ctx.strokeStyle = 'rgba(184,148,112,0.6)';
          ctx.lineWidth = 1;

          // Curved edge via quadratic bezier
          const curveMult = hasBoth ? 2.5 : 1.5;
          const cpx = (sx + ex) / 2 + ox * curveMult;
          const cpy = (sy + ey) / 2 + oy * curveMult;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.quadraticCurveTo(cpx, cpy, ex, ey);
          ctx.stroke();

          // Arrowhead (aligned to curve tangent at endpoint)
          const t = 0.95;
          const tangentX = 2 * (1 - t) * (cpx - sx) + 2 * t * (ex - cpx);
          const tangentY = 2 * (1 - t) * (cpy - sy) + 2 * t * (ey - cpy);
          const tLen = Math.sqrt(tangentX * tangentX + tangentY * tangentY);
          const tnx = tangentX / tLen;
          const tny = tangentY / tLen;
          const aLen = 6;
          ctx.fillStyle = 'rgba(184,148,112,0.6)';
          ctx.beginPath();
          ctx.moveTo(ex + tnx * aLen, ey + tny * aLen);
          ctx.lineTo(ex - tny * 3, ey + tnx * 3);
          ctx.lineTo(ex + tny * 3, ey - tnx * 3);
          ctx.closePath();
          ctx.fill();

          // Probability label along the curve
          if (matrix[i][j] >= 0.05) {
            const mx = cpx + ox * 0.8;
            const my = cpy + oy * 0.8;
            ctx.fillStyle = 'rgba(184,148,112,0.7)';
            ctx.font = '9px ui-monospace, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(matrix[i][j].toFixed(1), mx, my);
          }
        }
      }

      // Self-loops as horseshoe arcs (above for top/mid nodes, below for bottom nodes)
      for (let i = 0; i < STATES; i++) {
        if (matrix[i][i] < 0.01) continue;
        const [x, y] = pos[i];
        const loopR = 12;
        const isBottom = y > H * 0.6;
        const loopCy = isBottom ? y + nodeR + loopR - 2 : y - nodeR - loopR + 2;

        ctx.strokeStyle = 'rgba(184,148,112,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (isBottom) {
          // Horseshoe below node: arc traces bottom half, gap at top (near node)
          ctx.arc(x, loopCy, loopR, Math.PI * 1.15, Math.PI * 1.85, true);
        } else {
          // Horseshoe above node: arc traces top half, gap at bottom (near node)
          ctx.arc(x, loopCy, loopR, Math.PI * 0.85, Math.PI * 0.15);
        }
        ctx.stroke();

        // Arrowhead at end of arc
        ctx.fillStyle = 'rgba(184,148,112,0.6)';
        ctx.beginPath();
        if (isBottom) {
          // Arrow points upward (toward node)
          const endA = Math.PI * 1.85;
          const ax = x + loopR * Math.cos(endA);
          const ay = loopCy + loopR * Math.sin(endA);
          ctx.moveTo(ax + 1, ay - 5);
          ctx.lineTo(ax - 4, ay + 2);
          ctx.lineTo(ax + 4, ay + 2);
        } else {
          // Arrow points downward (toward node)
          const endA = Math.PI * 0.15;
          const ax = x + loopR * Math.cos(endA);
          const ay = loopCy + loopR * Math.sin(endA);
          ctx.moveTo(ax + 1, ay + 5);
          ctx.lineTo(ax - 4, ay - 2);
          ctx.lineTo(ax + 4, ay - 2);
        }
        ctx.closePath();
        ctx.fill();

        // Label
        ctx.fillStyle = 'rgba(184,148,112,0.7)';
        ctx.font = '9px ui-monospace, monospace';
        ctx.textAlign = 'center';
        const labelY = isBottom ? loopCy + loopR + 12 : loopCy - loopR - 5;
        ctx.fillText(matrix[i][i].toFixed(1), x, labelY);
      }

      // Draw nodes
      for (let i = 0; i < STATES; i++) {
        const [x, y] = pos[i];
        const isActive = i === current;

        ctx.fillStyle = isActive ? COLORS[i] : 'rgba(34,15,7,0.9)';
        ctx.strokeStyle = COLORS[i];
        ctx.lineWidth = isActive ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.arc(x, y, nodeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isActive ? '#1a0c06' : COLORS[i];
        ctx.font = 'italic 15px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(STATE_LABELS[i], x, y);
      }
      ctx.textBaseline = 'alphabetic';
    }

    function updateHist(visits: number[], totalSteps: number) {
      const canvas = document.getElementById('markov-hist') as HTMLCanvasElement | null;
      if (!canvas) return;

      const freq = visits.map(v => totalSteps > 0 ? v / totalSteps : 0);

      if (!histChart) {
        const existing = Chart.getChart(canvas);
        if (existing) existing.destroy();
        histChart = new Chart(canvas, {
          type: 'bar',
          data: {
            labels: STATE_LABELS,
            datasets: [{
              label: 'Time in state',
              data: freq,
              backgroundColor: COLORS.map(c => c + '88'),
              borderColor: COLORS,
              borderWidth: 1,
              barPercentage: 0.6,
              categoryPercentage: 0.6,
            }],
          },
          options: {
            animation: { duration: 150 },
            responsive: true, maintainAspectRatio: true, aspectRatio: 2.8,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: {
              x: { ticks: { color: '#7a5a3a' }, grid: { color: '#2e1508' }, border: { color: '#3a1a0a' } },
              y: { min: 0, max: 1, ticks: { color: '#7a5a3a' }, grid: { color: '#2e1508' }, border: { color: '#3a1a0a' }, title: { display: true, text: 'fraction of time', color: '#7a5a3a' } },
            },
          },
        });
      } else {
        histChart.data.datasets[0].data = freq;
        histChart.update();
      }
    }

    function computeSteadyState(matrix: number[][]): number[] {
      // Power iteration
      let pi = new Array(STATES).fill(1 / STATES);
      for (let iter = 0; iter < 200; iter++) {
        const next = new Array(STATES).fill(0);
        for (let j = 0; j < STATES; j++) {
          for (let i = 0; i < STATES; i++) {
            next[j] += pi[i] * matrix[i][j];
          }
        }
        pi = next;
      }
      return pi;
    }

    return {
      matrix: defaultMatrix(),
      current: 0,
      visits: new Array(STATES).fill(0) as number[],
      totalSteps: 0,
      running: false,
      speedIdx: '2',
      steadyState: [] as number[],
      stepsDisplay: '0',

      get speedLabel() {
        const labels = ['0.25×', '0.5×', '1×', '2×', '4×'];
        return labels[parseInt(this.speedIdx)] || '1×';
      },

      get speedMs() {
        const ms = [1000, 500, 250, 125, 60];
        return ms[parseInt(this.speedIdx)] || 250;
      },

      init() {
        const self = this;
        const tryInit = () => {
          diagramCanvas = document.getElementById('markov-diagram') as HTMLCanvasElement | null;
          if (!diagramCanvas || diagramCanvas.getBoundingClientRect().width === 0) {
            requestAnimationFrame(tryInit);
            return;
          }
          const dpr = window.devicePixelRatio || 1;
          const rect = diagramCanvas.getBoundingClientRect();
          diagramCanvas.width = rect.width * dpr;
          diagramCanvas.height = rect.height * dpr;
          diagramCtx = diagramCanvas.getContext('2d');
          if (diagramCtx) diagramCtx.scale(dpr, dpr);
          self.recalc();
          self.draw();
          self.start();
        };
        requestAnimationFrame(tryInit);
      },

      recalc() {
        this.steadyState = computeSteadyState(this.matrix);
      },

      draw() {
        drawDiagram(this.matrix, this.current, this.visits);
        updateHist(this.visits, this.totalSteps);
      },

      reset() {
        this.stop();
        this.current = 0;
        this.visits = new Array(STATES).fill(0);
        this.totalSteps = 0;
        this.stepsDisplay = '0';
        this.draw();
      },

      start() {
        if (this.running) return;
        this.running = true;
        const self = this;
        const doStep = () => {
          if (!self.running) return;
          // Inline the step logic to avoid proxy issues
          const row = self.matrix[self.current];
          let r = Math.random();
          let next = 0;
          for (let j = 0; j < STATES; j++) {
            r -= row[j];
            if (r <= 0) { next = j; break; }
          }
          self.current = next;
          const v = [...self.visits];
          v[next]++;
          self.visits = v;
          self.totalSteps++;
          self.stepsDisplay = String(self.totalSteps);
          drawDiagram(self.matrix, self.current, self.visits);
          updateHist(self.visits, self.totalSteps);

          walkTimer = setTimeout(doStep, self.speedMs);
        };
        doStep();
      },

      stop() {
        this.running = false;
        if (walkTimer) { clearTimeout(walkTimer); walkTimer = null; }
      },

      setTransition(i: number, j: number, val: string) {
        const v = parseFloat(val) || 0;
        const old = this.matrix[i][j];
        const diff = v - old;
        this.matrix[i][j] = v;

        // Redistribute diff across other entries in row i
        const others = [];
        for (let k = 0; k < STATES; k++) {
          if (k !== j && this.matrix[i][k] > 0.01) others.push(k);
        }
        if (others.length > 0) {
          const each = diff / others.length;
          others.forEach(k => {
            this.matrix[i][k] = Math.max(0, this.matrix[i][k] - each);
          });
        }

        // Normalize
        let sum = 0;
        for (let k = 0; k < STATES; k++) sum += this.matrix[i][k];
        if (sum > 0) {
          for (let k = 0; k < STATES; k++) this.matrix[i][k] /= sum;
        }

        this.recalc();
        this.draw();
      },
    };
  });

  // Random Variables reference
  Alpine.data('rvViz', () => {
    let rvChart: Chart | null = null;

    interface RVDef {
      name: string;
      type: 'discrete' | 'continuous';
      params: { key: string; label: string; min: number; max: number; step: number; default: number }[];
      pmf?: (k: number, p: Record<string, number>) => number;
      pdf?: (x: number, p: Record<string, number>) => number;
      range: (p: Record<string, number>) => [number, number];
      mean: (p: Record<string, number>) => string;
      variance: (p: Record<string, number>) => string;
      formula: string;
      description: string;
    }

    function fact(n: number): number { if (n <= 1) return 1; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
    function logFact(n: number): number { let r = 0; for (let i = 2; i <= n; i++) r += Math.log(i); return r; }
    function comb(n: number, k: number): number { if (k < 0 || k > n) return 0; return Math.exp(logFact(n) - logFact(k) - logFact(n - k)); }
    function gamma(z: number): number {
      if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
      z -= 1;
      const g = 7; const c = [0.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
      let x = c[0]; for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
      const t = z + g + 0.5;
      return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
    }
    function normalPdfRV(x: number, mu: number, sigma: number): number {
      return (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - mu) / sigma) ** 2);
    }

    const dists: Record<string, RVDef> = {
      // DISCRETE
      bernoulli: { name: 'Bernoulli', type: 'discrete',
        params: [{ key: 'p', label: 'p', min: 0.01, max: 0.99, step: 0.01, default: 0.5 }],
        pmf: (k, p) => k === 0 ? 1 - p.p : k === 1 ? p.p : 0,
        range: () => [-0.5, 1.5],
        mean: (p) => `${p.p.toFixed(2)}`, variance: (p) => `${(p.p * (1 - p.p)).toFixed(4)}`,
        formula: 'ℙ(X=k) = p^k (1−p)^(1−k),  k ∈ {0, 1}\n𝔼[X] = p\n𝕍(X) = p(1−p)',
        description: 'A single trial with two outcomes: success (1) with probability p, or failure (0) with probability 1−p. The simplest nontrivial random variable, and the building block for binomial, geometric, and many other distributions. Indicator random variables are Bernoulli RVs that track whether an event A occurs.',
      },
      binomial: { name: 'Binomial', type: 'discrete',
        params: [{ key: 'n', label: 'n', min: 1, max: 50, step: 1, default: 10 }, { key: 'p', label: 'p', min: 0.01, max: 0.99, step: 0.01, default: 0.5 }],
        pmf: (k, p) => k < 0 || k > p.n || k !== Math.floor(k) ? 0 : comb(p.n, k) * Math.pow(p.p, k) * Math.pow(1 - p.p, p.n - k),
        range: (p) => [-0.5, p.n + 0.5],
        mean: (p) => `${(p.n * p.p).toFixed(2)}`, variance: (p) => `${(p.n * p.p * (1 - p.p)).toFixed(4)}`,
        formula: 'ℙ(X=k) = C(n,k) p^k (1−p)^(n−k),  k = 0,1,…,n\n𝔼[X] = np\n𝕍(X) = np(1−p)',
        description: 'The number of successes in n independent Bernoulli trials, each with success probability p. As n grows, the binomial approaches a normal distribution (De Moivre-Laplace theorem). For large n and small p, it can be approximated by a Poisson with λ = np.',
      },
      geometric: { name: 'Geometric', type: 'discrete',
        params: [{ key: 'p', label: 'p', min: 0.01, max: 0.99, step: 0.01, default: 0.3 }],
        pmf: (k, p) => k < 1 || k !== Math.floor(k) ? 0 : Math.pow(1 - p.p, k - 1) * p.p,
        range: () => [0.5, 20.5],
        mean: (p) => `${(1 / p.p).toFixed(2)}`, variance: (p) => `${((1 - p.p) / (p.p * p.p)).toFixed(2)}`,
        formula: 'ℙ(X=k) = (1−p)^(k−1) p,  k = 1,2,3,…\n𝔼[X] = 1/p\n𝕍(X) = (1−p)/p²',
        description: 'Number of independent trials until the first success. The only discrete distribution with the memorylessness property: past failures give no information about how many more trials are needed. Interarrival times in a Bernoulli process follow a geometric distribution.',
      },
      pascal: { name: 'Pascal', type: 'discrete',
        params: [{ key: 'r', label: 'r', min: 1, max: 10, step: 1, default: 3 }, { key: 'p', label: 'p', min: 0.01, max: 0.99, step: 0.01, default: 0.4 }],
        pmf: (k, p) => k < p.r || k !== Math.floor(k) ? 0 : comb(k - 1, p.r - 1) * Math.pow(p.p, p.r) * Math.pow(1 - p.p, k - p.r),
        range: (p) => [p.r - 0.5, p.r + 25],
        mean: (p) => `${(p.r / p.p).toFixed(2)}`, variance: (p) => `${(p.r * (1 - p.p) / (p.p * p.p)).toFixed(2)}`,
        formula: 'ℙ(X=k) = C(k−1,r−1) p^r (1−p)^(k−r),  k = r,r+1,…\n𝔼[X] = r/p\n𝕍(X) = r(1−p)/p²',
        description: 'Also called the negative binomial. The number of trials until the rth success. It is the sum of r independent geometric random variables, making it a natural generalization. In queueing theory, it models the time of the kth arrival in a Bernoulli process.',
      },
      poisson: { name: 'Poisson', type: 'discrete',
        params: [{ key: 'lam', label: 'λ', min: 0.1, max: 20, step: 0.1, default: 4 }],
        pmf: (k, p) => k < 0 || k !== Math.floor(k) ? 0 : Math.exp(-p.lam + k * Math.log(p.lam) - logFact(k)),
        range: (p) => [-0.5, Math.max(15, p.lam * 3)],
        mean: (p) => `${p.lam.toFixed(1)}`, variance: (p) => `${p.lam.toFixed(1)}`,
        formula: 'ℙ(X=k) = (λ^k e^−λ) / k!,  k = 0,1,2,…\n𝔼[X] = λ\n𝕍(X) = λ',
        description: 'The count of events in a fixed time interval for a Poisson process with rate λ. Uniquely, its mean and variance are equal. It approximates a binomial when n is large and p is small, with λ = np. First applied by Bortkiewicz (1898) to deaths from horse kicks in the Prussian army.',
      },
      duniform: { name: 'Discrete Uniform', type: 'discrete',
        params: [{ key: 'a', label: 'a', min: 0, max: 10, step: 1, default: 1 }, { key: 'b', label: 'b', min: 1, max: 20, step: 1, default: 6 }],
        pmf: (k, p) => k < p.a || k > p.b || k !== Math.floor(k) ? 0 : 1 / (p.b - p.a + 1),
        range: (p) => [p.a - 0.5, p.b + 0.5],
        mean: (p) => `${((p.a + p.b) / 2).toFixed(1)}`, variance: (p) => `${((Math.pow(p.b - p.a + 1, 2) - 1) / 12).toFixed(2)}`,
        formula: 'ℙ(X=k) = 1/(b−a+1),  k = a,a+1,…,b\n𝔼[X] = (a+b)/2\n𝕍(X) = ((b−a+1)²−1)/12',
        description: 'Each integer in [a,b] has equal probability. Models situations with no reason to prefer one outcome over another. A fair die is Uniform(1,6). The special case where a = b gives a deterministic (constant) random variable.',
      },
      hypergeometric: { name: 'Hypergeometric', type: 'discrete',
        params: [{ key: 'N', label: 'N', min: 10, max: 60, step: 1, default: 30 }, { key: 'K', label: 'K', min: 1, max: 30, step: 1, default: 10 }, { key: 'n', label: 'n', min: 1, max: 30, step: 1, default: 8 }],
        pmf: (k, p) => { const K = Math.min(p.K, p.N); const n = Math.min(p.n, p.N); if (k < Math.max(0, n + K - p.N) || k > Math.min(n, K) || k !== Math.floor(k)) return 0; return comb(K, k) * comb(p.N - K, n - k) / comb(p.N, n); },
        range: (p) => [-0.5, Math.min(p.n, p.K) + 0.5],
        mean: (p) => `${(p.n * p.K / p.N).toFixed(2)}`, variance: (p) => { const f = (p.N - p.n) / (p.N - 1); return `${(p.n * p.K / p.N * (1 - p.K / p.N) * f).toFixed(2)}`; },
        formula: 'ℙ(X=k) = C(K,k)·C(N−K,n−k) / C(N,n)\n𝔼[X] = nK/N\n𝕍(X) = n(K/N)(1−K/N)(N−n)/(N−1)',
        description: 'The number of successes when drawing n items without replacement from a population of N, where K are marked as successes. Unlike the binomial, draws are dependent. Approaches the binomial as N → ∞. Common in card games and quality inspection sampling.',
      },
      categorical: { name: 'Categorical', type: 'discrete',
        params: [{ key: 'k', label: 'outcomes', min: 2, max: 8, step: 1, default: 4 }],
        pmf: (k, p) => k < 1 || k > p.k || k !== Math.floor(k) ? 0 : 1 / p.k,
        range: (p) => [0.5, p.k + 0.5],
        mean: (p) => `${((p.k + 1) / 2).toFixed(1)}`, variance: (p) => `${(((Math.pow(p.k, 2)) - 1) / 12).toFixed(2)}`,
        formula: 'ℙ(X=i) = pᵢ,  Σpᵢ = 1\n(shown as uniform 1/k)\n𝔼[X] = Σ i·pᵢ',
        description: 'A generalization of the Bernoulli to k possible outcomes, each with its own probability. Rolling a die, classifying into categories, or any experiment with more than two outcomes. The multinomial distribution extends this to repeated categorical trials.',
      },
      zipf: { name: 'Zipf', type: 'discrete',
        params: [{ key: 's', label: 's', min: 0.5, max: 3, step: 0.1, default: 1 }, { key: 'N', label: 'N', min: 5, max: 30, step: 1, default: 15 }],
        pmf: (k, p) => { if (k < 1 || k > p.N || k !== Math.floor(k)) return 0; let H = 0; for (let i = 1; i <= p.N; i++) H += 1 / Math.pow(i, p.s); return 1 / (Math.pow(k, p.s) * H); },
        range: (p) => [0.5, p.N + 0.5],
        mean: (p) => { let H = 0, Hm = 0; for (let i = 1; i <= p.N; i++) { H += 1 / Math.pow(i, p.s); Hm += i / Math.pow(i, p.s); } return `${(Hm / H).toFixed(2)}`; },
        variance: (p) => '—',
        formula: 'ℙ(X=k) = (1/k^s) / H(N,s)\nH(N,s) = Σᵢ(1/i^s)',
        description: 'A power-law distribution where the kth most common item has frequency proportional to 1/k^s. Originally observed in word frequencies (Zipf\'s law), it also appears in city populations, website traffic, and wealth distributions. The heavy tail means a few items dominate.',
      },
      // CONTINUOUS
      uniform: { name: 'Continuous Uniform', type: 'continuous',
        params: [{ key: 'a', label: 'a', min: -5, max: 5, step: 0.5, default: 0 }, { key: 'b', label: 'b', min: -5, max: 10, step: 0.5, default: 1 }],
        pdf: (x, p) => x >= p.a && x <= p.b ? 1 / (p.b - p.a) : 0,
        range: (p) => [p.a - 1, p.b + 1],
        mean: (p) => `${((p.a + p.b) / 2).toFixed(2)}`, variance: (p) => `${(Math.pow(p.b - p.a, 2) / 12).toFixed(4)}`,
        formula: 'f(x) = 1/(b−a),  a ≤ x ≤ b\n𝔼[X] = (a+b)/2\n𝕍(X) = (b−a)²/12',
        description: 'Constant probability density over a continuous interval [a,b]. Every sub-interval of the same length has the same probability. The simplest continuous distribution, often used as a non-informative prior or to model complete ignorance within a known range.',
      },
      exponential: { name: 'Exponential', type: 'continuous',
        params: [{ key: 'lam', label: 'λ', min: 0.1, max: 5, step: 0.1, default: 1 }],
        pdf: (x, p) => x < 0 ? 0 : p.lam * Math.exp(-p.lam * x),
        range: (p) => [0, Math.max(5, 5 / p.lam)],
        mean: (p) => `${(1 / p.lam).toFixed(2)}`, variance: (p) => `${(1 / (p.lam * p.lam)).toFixed(4)}`,
        formula: 'f(x) = λe^(−λx),  x ≥ 0\n𝔼[X] = 1/λ\n𝕍(X) = 1/λ²',
        description: 'The time between consecutive arrivals in a Poisson process. The only continuous distribution with the memorylessness property: knowing you have already waited t units tells you nothing about how much longer you will wait. The continuous analog of the geometric distribution.',
      },
      normal: { name: 'Normal', type: 'continuous',
        params: [{ key: 'mu', label: 'μ', min: -5, max: 5, step: 0.1, default: 0 }, { key: 'sigma', label: 'σ', min: 0.1, max: 4, step: 0.1, default: 1 }],
        pdf: (x, p) => normalPdfRV(x, p.mu, p.sigma),
        range: (p) => [p.mu - 4 * p.sigma, p.mu + 4 * p.sigma],
        mean: (p) => `${p.mu.toFixed(2)}`, variance: (p) => `${(Math.pow(p.sigma, 2)).toFixed(4)}`,
        formula: 'f(x) = (1/σ√2π) exp(−(x−μ)²/2σ²)\n𝔼[X] = μ\n𝕍(X) = σ²',
        description: 'The Gaussian bell curve, the most important distribution in probability. The central limit theorem guarantees that sums of independent random variables converge to a normal regardless of the original distribution. Preserved under linear transformation and summation. When a quantity is influenced by many small independent factors, a normal model is natural.',
      },
      erlang: { name: 'Erlang', type: 'continuous',
        params: [{ key: 'k', label: 'k', min: 1, max: 15, step: 1, default: 3 }, { key: 'lam', label: 'λ', min: 0.1, max: 5, step: 0.1, default: 1 }],
        pdf: (x, p) => x < 0 ? 0 : (Math.pow(p.lam, p.k) * Math.pow(x, p.k - 1) * Math.exp(-p.lam * x)) / fact(p.k - 1),
        range: (p) => [0, Math.max(8, (p.k + 3 * Math.sqrt(p.k)) / p.lam)],
        mean: (p) => `${(p.k / p.lam).toFixed(2)}`, variance: (p) => `${(p.k / (p.lam * p.lam)).toFixed(4)}`,
        formula: 'f(x) = λ^k x^(k−1) e^(−λx) / (k−1)!\n𝔼[X] = k/λ\n𝕍(X) = k/λ²',
        description: 'The time until the kth arrival in a Poisson process with rate λ. Equivalently, the sum of k independent exponential random variables. Developed by Agner Erlang in 1909 to analyze telephone switchboard capacity. A special case of the Gamma distribution with integer shape parameter.',
      },
      gammaD: { name: 'Gamma', type: 'continuous',
        params: [{ key: 'alpha', label: 'α', min: 0.5, max: 10, step: 0.5, default: 2 }, { key: 'beta', label: 'β', min: 0.1, max: 5, step: 0.1, default: 1 }],
        pdf: (x, p) => x <= 0 ? 0 : (Math.pow(p.beta, p.alpha) / gamma(p.alpha)) * Math.pow(x, p.alpha - 1) * Math.exp(-p.beta * x),
        range: (p) => [0, Math.max(8, (p.alpha + 3 * Math.sqrt(p.alpha)) / p.beta)],
        mean: (p) => `${(p.alpha / p.beta).toFixed(2)}`, variance: (p) => `${(p.alpha / (p.beta * p.beta)).toFixed(4)}`,
        formula: 'f(x) = (β^α / Γ(α)) x^(α−1) e^(−βx)\n𝔼[X] = α/β\n𝕍(X) = α/β²',
        description: 'A flexible family for positive-valued data that unifies the exponential (α = 1) and Erlang (integer α) distributions. The shape parameter α controls skewness: small α gives exponential-like decay, large α approaches a symmetric bell. Common in reliability analysis and Bayesian statistics as a conjugate prior for the Poisson rate.',
      },
      beta: { name: 'Beta', type: 'continuous',
        params: [{ key: 'alpha', label: 'α', min: 0.1, max: 10, step: 0.1, default: 2 }, { key: 'beta', label: 'β', min: 0.1, max: 10, step: 0.1, default: 5 }],
        pdf: (x, p) => { if (x <= 0 || x >= 1) return 0; const B = gamma(p.alpha) * gamma(p.beta) / gamma(p.alpha + p.beta); return Math.pow(x, p.alpha - 1) * Math.pow(1 - x, p.beta - 1) / B; },
        range: () => [-0.05, 1.05],
        mean: (p) => `${(p.alpha / (p.alpha + p.beta)).toFixed(4)}`, variance: (p) => `${(p.alpha * p.beta / (Math.pow(p.alpha + p.beta, 2) * (p.alpha + p.beta + 1))).toFixed(4)}`,
        formula: 'f(x) = x^(α−1)(1−x)^(β−1) / B(α,β)\n𝔼[X] = α/(α+β)\n𝕍(X) = αβ/((α+β)²(α+β+1))',
        description: 'Defined on [0,1], extremely flexible: uniform when α = β = 1, U-shaped when both < 1, bell-shaped when both > 1, skewed otherwise. The conjugate prior for Bernoulli and binomial likelihoods, making it central to Bayesian inference. If you observe k heads in n flips with a Beta(α,β) prior, the posterior is Beta(α+k, β+n−k).',
      },
      lognormal: { name: 'Log-Normal', type: 'continuous',
        params: [{ key: 'mu', label: 'μ', min: -2, max: 2, step: 0.1, default: 0 }, { key: 'sigma', label: 'σ', min: 0.1, max: 2, step: 0.1, default: 0.5 }],
        pdf: (x, p) => x <= 0 ? 0 : (1 / (x * p.sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-(Math.pow(Math.log(x) - p.mu, 2)) / (2 * Math.pow(p.sigma, 2))),
        range: (p) => [0, Math.exp(p.mu + 3 * p.sigma)],
        mean: (p) => `${Math.exp(p.mu + Math.pow(p.sigma, 2) / 2).toFixed(4)}`, variance: (p) => `${((Math.exp(Math.pow(p.sigma, 2)) - 1) * Math.exp(2 * p.mu + Math.pow(p.sigma, 2))).toFixed(4)}`,
        formula: 'f(x) = (1/xσ√2π) exp(−(ln x−μ)²/2σ²)\n𝔼[X] = exp(μ + σ²/2)\n𝕍(X) = (e^σ²−1)·e^(2μ+σ²)',
        description: 'If the logarithm of X is normally distributed, then X is log-normal. Arises naturally in multiplicative processes where many small independent factors combine. Models stock prices (geometric Brownian motion), income distributions, particle sizes, and biological measurements. Always positive and right-skewed.',
      },
      chisquared: { name: 'Chi-Squared', type: 'continuous',
        params: [{ key: 'k', label: 'k (df)', min: 1, max: 20, step: 1, default: 3 }],
        pdf: (x, p) => x <= 0 ? 0 : (1 / (Math.pow(2, p.k / 2) * gamma(p.k / 2))) * Math.pow(x, p.k / 2 - 1) * Math.exp(-x / 2),
        range: (p) => [0, Math.max(10, p.k + 4 * Math.sqrt(2 * p.k))],
        mean: (p) => `${p.k}`, variance: (p) => `${2 * p.k}`,
        formula: 'f(x) = x^(k/2−1) e^(−x/2) / (2^(k/2) Γ(k/2))\n𝔼[X] = k\n𝕍(X) = 2k',
        description: 'The sum of k squared independent standard normal random variables: χ²ₖ = Z₁² + Z₂² + ⋯ + Zₖ². A special case of the Gamma distribution with α = k/2 and β = 1/2. Central to hypothesis testing (goodness-of-fit, independence tests) and constructing confidence intervals for variance.',
      },
      studentt: { name: 't-distribution', type: 'continuous',
        params: [{ key: 'nu', label: 'ν (df)', min: 1, max: 30, step: 1, default: 5 }],
        pdf: (x, p) => { const v = p.nu; return (gamma((v + 1) / 2) / (Math.sqrt(v * Math.PI) * gamma(v / 2))) * Math.pow(1 + x * x / v, -(v + 1) / 2); },
        range: () => [-6, 6],
        mean: (p) => p.nu > 1 ? '0' : '∄', variance: (p) => p.nu > 2 ? `${(p.nu / (p.nu - 2)).toFixed(4)}` : p.nu > 1 ? '∞' : '∄',
        formula: 'f(x) = Γ((ν+1)/2) / (√(νπ)Γ(ν/2)) · (1+x²/ν)^(−(ν+1)/2)\n𝔼[X] = 0 (ν > 1)\n𝕍(X) = ν/(ν−2) (ν > 2)',
        description: 'When estimating the mean with unknown variance, the normalized statistic Tₙ = √n(Θ̂ₙ−θ)/Sₙ is not normal because Sₙ is itself random. Its exact distribution is the t-distribution with n−1 degrees of freedom: symmetric and bell-shaped like the normal, but more spread out with heavier tails. As ν → ∞ it converges to N(0,1). Published in 1908 by William Gosset under the pseudonym "Student" while working at the Guinness brewery in Dublin on barley yield analysis with small samples.',
      },
      cauchy: { name: 'Cauchy', type: 'continuous',
        params: [{ key: 'x0', label: 'x₀', min: -5, max: 5, step: 0.5, default: 0 }, { key: 'gam', label: 'γ', min: 0.1, max: 5, step: 0.1, default: 1 }],
        pdf: (x, p) => 1 / (Math.PI * p.gam * (1 + Math.pow((x - p.x0) / p.gam, 2))),
        range: (p) => [p.x0 - 10 * p.gam, p.x0 + 10 * p.gam],
        mean: () => '∄', variance: () => '∄',
        formula: 'f(x) = 1 / (πγ(1 + ((x−x₀)/γ)²))\n𝔼[X] ∄ (diverges)\n𝕍(X) ∄ (diverges)',
        description: 'A pathological distribution whose tails are so heavy that neither the mean nor the variance exist. The integral for 𝔼[X] diverges. It is the distribution of the ratio of two independent standard normals, and a Student\'s t with ν = 1. Serves as an important counterexample to theorems that require finite moments.',
      },
      weibull: { name: 'Weibull', type: 'continuous',
        params: [{ key: 'k', label: 'k', min: 0.5, max: 5, step: 0.1, default: 1.5 }, { key: 'lam', label: 'λ', min: 0.5, max: 5, step: 0.1, default: 1 }],
        pdf: (x, p) => x < 0 ? 0 : (p.k / p.lam) * Math.pow(x / p.lam, p.k - 1) * Math.exp(-Math.pow(x / p.lam, p.k)),
        range: (p) => [0, p.lam * 3],
        mean: (p) => `${(p.lam * gamma(1 + 1 / p.k)).toFixed(4)}`, variance: (p) => `${(Math.pow(p.lam, 2) * (gamma(1 + 2 / p.k) - Math.pow(gamma(1 + 1 / p.k), 2))).toFixed(4)}`,
        formula: 'f(x) = (k/λ)(x/λ)^(k−1) exp(−(x/λ)^k)\n𝔼[X] = λΓ(1+1/k)\n𝕍(X) = λ²[Γ(1+2/k)−Γ²(1+1/k)]',
        description: 'A flexible model for time-to-failure in reliability engineering. The shape parameter k controls the hazard rate: k < 1 means the failure rate decreases over time (early failures), k = 1 reduces to the exponential (constant rate), and k > 1 means the failure rate increases (wear-out). Generalizes both the exponential and Rayleigh distributions.',
      },
      pareto: { name: 'Pareto', type: 'continuous',
        params: [{ key: 'alpha', label: 'α', min: 0.5, max: 5, step: 0.1, default: 2 }, { key: 'xm', label: 'xₘ', min: 0.5, max: 5, step: 0.5, default: 1 }],
        pdf: (x, p) => x < p.xm ? 0 : p.alpha * Math.pow(p.xm, p.alpha) / Math.pow(x, p.alpha + 1),
        range: (p) => [0, p.xm * 8],
        mean: (p) => p.alpha > 1 ? `${(p.alpha * p.xm / (p.alpha - 1)).toFixed(4)}` : '∞',
        variance: (p) => p.alpha > 2 ? `${(Math.pow(p.xm, 2) * p.alpha / (Math.pow(p.alpha - 1, 2) * (p.alpha - 2))).toFixed(4)}` : '∞',
        formula: 'f(x) = αxₘ^α / x^(α+1),  x ≥ xₘ\n𝔼[X] = αxₘ/(α−1) (α > 1)\n𝕍(X) = xₘ²α/((α−1)²(α−2)) (α > 2)',
        description: 'A power-law distribution where a few values are extremely large while most are small. The basis of the "80/20 rule" (Pareto principle): roughly 80% of effects come from 20% of causes. Models wealth distribution, city sizes, file sizes, and earthquake magnitudes. For α ≤ 2 the variance is infinite; for α ≤ 1 even the mean diverges.',
      },
      rayleigh: { name: 'Rayleigh', type: 'continuous',
        params: [{ key: 'sigma', label: 'σ', min: 0.1, max: 5, step: 0.1, default: 1 }],
        pdf: (x, p) => x < 0 ? 0 : (x / (Math.pow(p.sigma, 2))) * Math.exp(-Math.pow(x, 2) / (2 * Math.pow(p.sigma, 2))),
        range: (p) => [0, p.sigma * 5],
        mean: (p) => `${(p.sigma * Math.sqrt(Math.PI / 2)).toFixed(4)}`, variance: (p) => `${((2 - Math.PI / 2) * Math.pow(p.sigma, 2)).toFixed(4)}`,
        formula: 'f(x) = (x/σ²) exp(−x²/2σ²)\n𝔼[X] = σ√(π/2)\n𝕍(X) = σ²(2−π/2)',
        description: 'The distribution of the distance from the origin when both coordinates are independent normals with the same variance: R = √(X² + Y²). A special case of the Weibull with k = 2. Models the magnitude of 2D noise vectors, wind speed, wave heights, and radar signal envelopes.',
      },
      laplace: { name: 'Laplace', type: 'continuous',
        params: [{ key: 'mu', label: 'μ', min: -5, max: 5, step: 0.5, default: 0 }, { key: 'b', label: 'b', min: 0.1, max: 5, step: 0.1, default: 1 }],
        pdf: (x, p) => (1 / (2 * p.b)) * Math.exp(-Math.abs(x - p.mu) / p.b),
        range: (p) => [p.mu - 6 * p.b, p.mu + 6 * p.b],
        mean: (p) => `${p.mu.toFixed(2)}`, variance: (p) => `${(2 * Math.pow(p.b, 2)).toFixed(4)}`,
        formula: 'f(x) = (1/2b) exp(−|x−μ|/b)\n𝔼[X] = μ\n𝕍(X) = 2b²',
        description: 'Also called the double exponential. Symmetric around μ with a sharper peak and heavier tails than the normal. The difference of two independent exponential random variables follows a Laplace distribution. Used in robust statistics and as a sparsity-promoting prior in Bayesian methods (LASSO regularization).',
      },
      logistic: { name: 'Logistic', type: 'continuous',
        params: [{ key: 'mu', label: 'μ', min: -5, max: 5, step: 0.5, default: 0 }, { key: 's', label: 's', min: 0.1, max: 3, step: 0.1, default: 1 }],
        pdf: (x, p) => { const e = Math.exp(-(x - p.mu) / p.s); return e / (p.s * Math.pow(1 + e, 2)); },
        range: (p) => [p.mu - 8 * p.s, p.mu + 8 * p.s],
        mean: (p) => `${p.mu.toFixed(2)}`, variance: (p) => `${((Math.pow(Math.PI, 2) * Math.pow(p.s, 2)) / 3).toFixed(4)}`,
        formula: 'f(x) = e^(−(x−μ)/s) / (s(1+e^(−(x−μ)/s))²)\n𝔼[X] = μ\n𝕍(X) = s²π²/3',
        description: 'Symmetric and bell-shaped like the normal, but with slightly heavier tails. Its CDF is the logistic (sigmoid) function 1/(1+e^(−x)), which is central to logistic regression and neural network activations. Models growth processes that saturate, dose-response relationships, and any phenomenon with an S-shaped cumulative behavior.',
      },
    };

    const discreteKeys = Object.keys(dists).filter(k => dists[k].type === 'discrete');
    const continuousKeys = Object.keys(dists).filter(k => dists[k].type === 'continuous');

    let polarAnimId: number | null = null;

    function renderPolar(distKey: string, paramVals: Record<string, number>) {
      if (polarAnimId) { cancelAnimationFrame(polarAnimId); polarAnimId = null; }
      const canvas = document.getElementById('rv-polar') as HTMLCanvasElement | null;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = rect.width;
      const H = rect.height;
      ctx.clearRect(0, 0, W, H);

      const cx = W / 2;
      const cy = H / 2;
      const maxR = Math.min(cx, cy) - 20;

      if (distKey === 'rayleigh') {
        const sigma = paramVals.sigma || 1;
        const points: [number, number][] = [];
        for (let i = 0; i < 400; i++) {
          const u1 = Math.random(), u2 = Math.random();
          const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma;
          const z2 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2) * sigma;
          points.push([z1, z2]);
        }
        const scale = maxR / (4 * sigma);

        // Static elements: rings, axes, labels
        ctx.strokeStyle = 'rgba(58,26,10,0.5)';
        ctx.lineWidth = 0.5;
        for (let r = 1; r <= 3; r++) {
          ctx.beginPath();
          ctx.arc(cx, cy, r * sigma * scale, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#7a5a3a';
          ctx.font = '10px system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(`${r}σ`, cx + r * sigma * scale + 3, cy - 3);
        }
        ctx.strokeStyle = 'rgba(58,26,10,0.3)';
        ctx.beginPath();
        ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy);
        ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR);
        ctx.stroke();
        ctx.fillStyle = '#b89470';
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('R = √(X²+Y²) ~ Rayleigh(σ)', cx, H - 6);

        // Animate points appearing
        let shown = 0;
        const perFrame = 6;
        const tick = () => {
          const end = Math.min(shown + perFrame, points.length);
          for (let i = shown; i < end; i++) {
            const [x, y] = points[i];
            ctx.fillStyle = 'rgba(240,216,168,0.3)';
            ctx.beginPath();
            ctx.arc(cx + x * scale, cy - y * scale, 2, 0, Math.PI * 2);
            ctx.fill();
            if (i < 15) {
              ctx.strokeStyle = 'rgba(240,120,88,0.4)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(cx, cy);
              ctx.lineTo(cx + x * scale, cy - y * scale);
              ctx.stroke();
            }
          }
          shown = end;
          if (shown < points.length) {
            polarAnimId = requestAnimationFrame(tick);
          } else {
            polarAnimId = null;
          }
        };
        polarAnimId = requestAnimationFrame(tick);
      }

      if (distKey === 'cauchy') {
        const gam = paramVals.gam || 1;
        const circR = maxR * 0.6;
        const lineY = cy + circR + 30;

        // Static: semicircle, line, labels, center
        ctx.strokeStyle = '#b89470';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, circR, Math.PI, 0);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(58,26,10,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(20, lineY);
        ctx.lineTo(W - 20, lineY);
        ctx.stroke();
        ctx.fillStyle = '#f0d8a8';
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#b89470';
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('uniform angle θ', cx, cy - circR - 8);
        ctx.fillText('tan(θ) ~ Cauchy', cx, lineY + 16);
        ctx.fillStyle = '#7a5a3a';
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillText('angles near ±π/2 → extreme values', cx, lineY + 30);

        // Animate projections one by one
        const angles: number[] = [];
        for (let i = 0; i < 25; i++) {
          angles.push(Math.PI * (0.05 + 0.9 * Math.random()));
        }
        angles.sort();

        let shown = 0;
        const tick = () => {
          if (shown >= angles.length) { polarAnimId = null; return; }
          const a = angles[shown];
          const i = shown;
          const px = cx + circR * Math.cos(a);
          const py = cy - circR * Math.sin(a);
          const projX = cx + circR / Math.tan(a) * gam;

          ctx.fillStyle = '#f0d8a8';
          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fill();

          // Projection line
          const clampedProjX = Math.max(20, Math.min(W - 20, projX));
          ctx.strokeStyle = i % 3 === 0 ? 'rgba(240,120,88,0.35)' : 'rgba(184,148,112,0.15)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(clampedProjX, lineY);
          ctx.stroke();

          // Point on line
          ctx.fillStyle = i % 3 === 0 ? '#f07858' : 'rgba(240,216,168,0.4)';
          ctx.beginPath();
          ctx.arc(clampedProjX, lineY, 2.5, 0, Math.PI * 2);
          ctx.fill();

          shown++;
          polarAnimId = window.setTimeout(() => {
            polarAnimId = requestAnimationFrame(tick) as any;
          }, 60) as any;
        };
        polarAnimId = requestAnimationFrame(tick);
      }
    }

    function renderChart(distKey: string, paramVals: Record<string, number>) {
      const d = dists[distKey];
      if (!d) return;

      const canvas = document.getElementById('rv-chart') as HTMLCanvasElement | null;
      if (!canvas) return;

      const [xMin, xMax] = d.range(paramVals);
      const datasets: any[] = [];

      // Compute extremity: how close params are to their edges (0=center, 1=edge)
      let extremity = 0;
      d.params.forEach(p => {
        const val = paramVals[p.key] ?? p.default;
        const mid = (p.min + p.max) / 2;
        const halfRange = (p.max - p.min) / 2;
        if (halfRange > 0) {
          const t = Math.abs(val - mid) / halfRange; // 0 at center, 1 at edge
          if (t > extremity) extremity = t;
        }
      });
      // Threshold: only shift color past 0.4, ramp gently
      const colorT = extremity < 0.4 ? 0 : Math.pow((extremity - 0.4) / 0.6, 2);

      const needsRebuild = !rvChart || (d.type === 'discrete' && (rvChart.config as any).type !== 'bar') || (d.type === 'continuous' && (rvChart.config as any).type !== 'line');

      if (d.type === 'discrete' && d.pmf) {
        const ks: number[] = [];
        const vals: number[] = [];
        for (let k = Math.ceil(xMin); k <= Math.floor(xMax); k++) {
          ks.push(k);
          vals.push(d.pmf(k, paramVals));
        }

        if (needsRebuild) {
          if (rvChart) { rvChart.destroy(); rvChart = null; }
          const stripes = createStripePattern('#f0d8a8');
          rvChart = new Chart(canvas, {
            type: 'bar',
            data: { labels: ks, datasets: [{ type: 'bar', label: 'PMF', data: vals, backgroundColor: stripes, borderColor: '#f0d8a8', borderWidth: 1, barPercentage: 0.6, categoryPercentage: 0.6, borderRadius: 1 }] },
            options: {
              animation: { duration: 250, easing: 'easeOutQuart' as const },
              responsive: true, maintainAspectRatio: true, aspectRatio: 2.4,
              plugins: { legend: { display: false }, tooltip: { enabled: false } },
              scales: {
                x: { type: 'linear', min: xMin, max: xMax, ticks: { color: '#7a5a3a', stepSize: (xMax - xMin) <= 20 ? 1 : undefined }, grid: { color: '#2e1508' }, border: { color: '#3a1a0a' }, title: { display: true, text: 'k', color: '#7a5a3a' } },
                y: { min: 0, ticks: { color: '#7a5a3a' }, grid: { color: '#2e1508' }, border: { color: '#3a1a0a' }, title: { display: true, text: 'ℙ(X=k)', color: '#7a5a3a' } },
              },
            },
          });
        } else {
          // Interpolate discrete color: colonial(240,216,168) → sienna(240,120,88)
          const dr = Math.round(240 + (240 - 240) * colorT);
          const dg = Math.round(216 + (120 - 216) * colorT);
          const db = Math.round(168 + (88 - 168) * colorT);
          const dColor = `rgb(${dr},${dg},${db})`;
          rvChart!.data.labels = ks;
          rvChart!.data.datasets[0].data = vals;
          (rvChart!.data.datasets[0] as any).borderColor = dColor;
          (rvChart!.data.datasets[0] as any).backgroundColor = createStripePattern(dColor);
          (rvChart!.options.scales!.x as any).min = xMin;
          (rvChart!.options.scales!.x as any).max = xMax;
          (rvChart!.options.scales!.x as any).ticks.stepSize = (xMax - xMin) <= 20 ? 1 : undefined;
          rvChart!.update();
        }
      } else if (d.type === 'continuous' && d.pdf) {
        const data: { x: number; y: number }[] = [];
        const step = (xMax - xMin) / 300;
        for (let x = xMin; x <= xMax; x += step) {
          data.push({ x, y: d.pdf(x, paramVals) });
        }

        if (needsRebuild) {
          if (rvChart) { rvChart.destroy(); rvChart = null; }
          rvChart = new Chart(canvas, {
            type: 'line',
            data: { datasets: [{ label: 'PDF', data, borderColor: '#90b878', borderWidth: 2, pointRadius: 0, fill: true, backgroundColor: makeScriptableGrad('#90b878', 0.3, 0.01), tension: 0.3 }] },
            options: {
              animation: { duration: 250, easing: 'easeOutQuart' as const },
              responsive: true, maintainAspectRatio: true, aspectRatio: 2.4,
              plugins: { legend: { display: false }, tooltip: { enabled: false } },
              scales: {
                x: { type: 'linear', min: xMin, max: xMax, ticks: { color: '#7a5a3a' }, grid: { color: '#2e1508' }, border: { color: '#3a1a0a' }, title: { display: true, text: 'x', color: '#7a5a3a' } },
                y: { min: 0, ticks: { color: '#7a5a3a' }, grid: { color: '#2e1508' }, border: { color: '#3a1a0a' }, title: { display: true, text: 'f(x)', color: '#7a5a3a' } },
              },
            },
          });
        } else {
          // Interpolate continuous color: olivine(144,184,120) → sienna(240,120,88)
          const cr = Math.round(144 + (240 - 144) * colorT);
          const cg = Math.round(184 + (120 - 184) * colorT);
          const cb = Math.round(120 + (88 - 120) * colorT);
          const cHex = '#' + [cr, cg, cb].map(c => c.toString(16).padStart(2, '0')).join('');
          rvChart!.data.datasets[0].data = data;
          (rvChart!.data.datasets[0] as any).borderColor = cHex;
          (rvChart!.data.datasets[0] as any).backgroundColor = makeScriptableGrad(cHex, 0.3, 0.01);
          (rvChart!.options.scales!.x as any).min = xMin;
          (rvChart!.options.scales!.x as any).max = xMax;
          rvChart!.update();
        }
      }
    }

    return {
      group: 'discrete' as 'discrete' | 'continuous',
      selected: 'bernoulli',
      paramValues: {} as Record<string, number>,
      currentDist: null as RVDef | null,
      distMean: '',
      distVar: '',
      fLine0: '',
      fLine1: '',
      fLine2: '',

      init() {
        // Map slug → key
        const slugToKey: Record<string, string> = {};
        Object.keys(dists).forEach(k => {
          const slug = dists[k].name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
          slugToKey[slug] = k;
        });

        const params = new URLSearchParams(window.location.search);
        const typeParam = params.get('type');
        if (typeParam && slugToKey[typeParam]) {
          this.selectDist(slugToKey[typeParam], false);
        } else if (typeParam && dists[typeParam]) {
          this.selectDist(typeParam, false);
        } else {
          this.selectDist(this.selected, false);
        }
      },

      selectDist(key: string, updateUrl = true) {
        this.selected = key;
        const d = dists[key];
        if (!d) return;
        this.currentDist = d;
        this.group = d.type;
        const pv: Record<string, number> = {};
        d.params.forEach(p => { pv[p.key] = p.default; });
        this.paramValues = pv;
        this.updateChart();

        if (updateUrl) {
          const slug = d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
          const url = new URL(window.location.href);
          url.searchParams.set('type', slug);
          history.replaceState(null, '', url.toString());
        }
      },

      updateChart() {
        const d = dists[this.selected];
        if (!d) return;
        const lines = (d.formula || '').split('\n');
        this.fLine0 = lines[0] || '';
        this.fLine1 = lines[1] || '';
        this.fLine2 = lines[2] || '';
        this.distMean = d.mean(this.paramValues);
        this.distVar = d.variance(this.paramValues);
        renderChart(this.selected, this.paramValues);
        const self = this;
        if (this.selected === 'rayleigh' || this.selected === 'cauchy') {
          // Defer to allow x-show to make canvas visible first
          setTimeout(() => renderPolar(self.selected, self.paramValues), 50);
        }
      },

      setParam(key: string, val: string) {
        this.paramValues[key] = parseFloat(val);
        this.updateChart();
      },

      get discreteList() { return discreteKeys.map(k => ({ key: k, name: dists[k].name })); },
      get continuousList() { return continuousKeys.map(k => ({ key: k, name: dists[k].name })); },
    };
  });

  // Confidence intervals coverage
  Alpine.data('confidenceViz', () => {
    let ciCanvas: HTMLCanvasElement | null = null;
    let ciCtx: CanvasRenderingContext2D | null = null;

    const TRUE_SIGMA = 1;
    const NUM_EXPERIMENTS = 50;

    // Standard normal quantile approximation (Abramowitz & Stegun)
    function zQuantile(p: number): number {
      if (p <= 0 || p >= 1) return 0;
      const a = p < 0.5 ? p : 1 - p;
      const t = Math.sqrt(-2 * Math.log(a));
      const z = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
      return p < 0.5 ? -z : z;
    }

    function boxMuller(): number {
      const u1 = Math.random();
      const u2 = Math.random();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }

    function runExperiments(n: number, confidence: number, trueMu: number) {
      const alpha = 1 - confidence;
      const z = zQuantile(1 - alpha / 2);
      const experiments: { mean: number; lo: number; hi: number; captured: boolean }[] = [];

      for (let i = 0; i < NUM_EXPERIMENTS; i++) {
        let sum = 0;
        for (let j = 0; j < n; j++) {
          sum += trueMu + TRUE_SIGMA * boxMuller();
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

      // Find x range
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
      const bracketH = 0;

      // True parameter vertical line
      const trueX = toX(trueMu);
      ctx.strokeStyle = 'rgba(240,216,168,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(trueX, pad.top);
      ctx.lineTo(trueX, pad.top + plotH);
      ctx.stroke();

      // θ label below axis
      ctx.fillStyle = '#f0d8a8';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('θ', trueX, pad.top + plotH + 40);

      // Draw intervals as bracket-style lines
      for (let i = 0; i < count; i++) {
        const e = experiments[i];
        const y = pad.top + i * (rowH + gap) + rowH / 2;
        const x1 = toX(e.lo);
        const x2 = toX(e.hi);
        const col = e.captured ? '#90b878' : '#f07858';
        const colFill = e.captured ? 'rgba(144,184,120,0.45)' : 'rgba(240,120,88,0.45)';

        // Filled bar
        ctx.fillStyle = colFill;
        ctx.fillRect(x1, y - barH / 2, x2 - x1, barH);

        // Border
        ctx.strokeStyle = col;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x1, y - barH / 2, x2 - x1, barH);

        // Estimate dot
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(toX(e.mean), y, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Number line at top
      const axisY = pad.top - 2;
      ctx.strokeStyle = '#3a1a0a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, axisY);
      ctx.lineTo(pad.left + plotW, axisY);
      ctx.stroke();

      // Ticks at top
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

      // θ dot at bottom
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
        const tryInit = () => {
          ciCanvas = document.getElementById('ci-chart') as HTMLCanvasElement | null;
          if (!ciCanvas || ciCanvas.getBoundingClientRect().width === 0) {
            requestAnimationFrame(tryInit);
            return;
          }
          const dpr = window.devicePixelRatio || 1;
          const rect = ciCanvas.getBoundingClientRect();
          ciCanvas.width = rect.width * dpr;
          ciCanvas.height = rect.height * dpr;
          ciCtx = ciCanvas.getContext('2d');
          if (ciCtx) ciCtx.scale(dpr, dpr);
          self.simulate();
        };
        requestAnimationFrame(tryInit);
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
