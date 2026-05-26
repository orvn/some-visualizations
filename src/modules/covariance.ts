// covariance page
import type { Alpine } from 'alpinejs';
import { Chart } from 'chart.js';
import { COLORS, axis } from './shared/chart';
import { boxMuller } from './shared/stats';

export default function (Alpine: Alpine) {
  Alpine.data('correlationViz', () => {
    let scatterChart: Chart | null = null;
    const N_POINTS = 600;

    function generateBivariateNormal(rho: number): { x: number; y: number }[] {
      const points: { x: number; y: number }[] = [];
      for (let i = 0; i < N_POINTS; i++) {
        const [z1, z2] = boxMuller();
        const x = z1;
        const y = rho * z1 + Math.sqrt(1 - rho * rho) * z2;
        points.push({ x, y });
      }
      return points;
    }

    return {
      rho: '0',
      info: '',
      accentColor: COLORS.colonial,

      init() {
        this.render();
      },

      render() {
        const rho = parseFloat(this.rho) || 0;
        const points = generateBivariateNormal(rho);

        const covXY = rho;
        this.info = `cov(X,Y) = ${covXY.toFixed(2)}   ρ = ${rho.toFixed(2)}   𝔼[XY] = ${covXY.toFixed(2)}`;

        const colonial = [240, 216, 168];
        const olivine = [144, 184, 120];
        const sienna = [240, 120, 88];
        const raw = Math.abs(rho);
        const t = raw < 0.5 ? 0 : (raw - 0.5) * 2;
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
                x: axis({ min: -4, max: 4, title: { display: true, text: 'X', color: COLORS.pottersClay } }),
                y: axis({ min: -4, max: 4, title: { display: true, text: 'Y', color: COLORS.pottersClay } }),
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
}
