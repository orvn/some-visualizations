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
