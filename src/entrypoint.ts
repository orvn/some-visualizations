import type { Alpine } from 'alpinejs';
import { Chart, LineController, LineElement, PointElement, LinearScale, Filler, Legend, Tooltip } from 'chart.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, Filler, Legend, Tooltip);

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

    function buildStaircase(arrivals: number[], maxTime: number) {
      const canvas = document.getElementById('poissonStaircase') as HTMLCanvasElement | null;
      if (!canvas) return;
      const existing = Chart.getChart('poissonStaircase');
      if (existing) existing.destroy();

      // Build step data
      const data: { x: number; y: number }[] = [{ x: 0, y: 0 }];
      arrivals.forEach((t, i) => {
        data.push({ x: t, y: i });
        data.push({ x: t, y: i + 1 });
      });
      data.push({ x: maxTime, y: arrivals.length });

      staircaseChart = new Chart(canvas, {
        type: 'line',
        data: {
          datasets: [{
            label: 'N(t)',
            data,
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

    return {
      lambda: '2',
      duration: '20',
      arrivals: [] as number[],
      info: '',
      resampling: false,

      init() {
        const self = this;
        const tryInit = () => {
          timelineCanvas = document.getElementById('poissonTimeline') as HTMLCanvasElement | null;
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
        this.resampling = true;
        const self = this;
        setTimeout(() => { self.resampling = false; }, 400);
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

        const avgGap = arr.length > 1
          ? (arr[arr.length - 1] / arr.length).toFixed(2)
          : '—';
        this.info = `${arr.length} arrivals  ·  avg interarrival: ${avgGap}  ·  expected: ${(1 / rate).toFixed(2)}`;

        drawTimeline(arr, maxT, rate);
        buildStaircase(arr, maxT);
      },
    };
  });
};
