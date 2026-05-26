// shared chart.js setup, all pages
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

// theme colors for charting (matches variables.css)
export const COLORS = {
  graphite: '#1a0c06',
  clinker: '#2e1508',
  bronze: '#3a1a0a',
  pottersClay: '#7a5a3a',
  teak: '#b89470',
  colonial: '#f0d8a8',
  porsche: '#e8a050',
  olivine: '#90b878',
  sienna: '#f07858',
};

export function alpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// themed axis config — spread into scales.x or scales.y
export function axis(opts: Record<string, any> = {}) {
  return {
    ticks: { color: COLORS.pottersClay, ...opts.ticks },
    grid: { color: COLORS.clinker },
    border: { color: COLORS.bronze },
    ...opts,
    ...(opts.ticks ? { ticks: { color: COLORS.pottersClay, ...opts.ticks } } : {}),
  };
}

// common legend config
export function legend(opts: Record<string, any> = {}) {
  return {
    display: true,
    labels: { color: COLORS.teak, font: { size: 11 }, boxWidth: 18, boxHeight: 0, ...opts.labels },
    ...opts,
    ...(opts.labels ? { labels: { color: COLORS.teak, font: { size: 11 }, boxWidth: 18, boxHeight: 0, ...opts.labels } } : {}),
  };
}

export function makeScriptableGrad(hex: string, a0 = 0.5, a1 = 0.01) {
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
