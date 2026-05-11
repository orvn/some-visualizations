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
};
