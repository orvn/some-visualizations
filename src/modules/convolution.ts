// convolution page
import type { Alpine } from 'alpinejs';
import { Chart } from 'chart.js';
import { makeScriptableGrad, COLORS, axis, legend } from './shared/chart';

export default function (Alpine: Alpine) {
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
            { label: 'f(x)', data: [], borderColor: COLORS.colonial, borderWidth: 2, pointRadius: 0, fill: false, tension: 0 },
            { label: 'g(z−x)', data: [], borderColor: COLORS.sienna, borderWidth: 2, pointRadius: 0, fill: true, backgroundColor: 'rgba(240,120,88,0.15)', tension: 0 },
            { label: 'overlap', data: [], borderColor: 'rgba(144,184,120,0.4)', borderWidth: 0, pointRadius: 0, fill: true, backgroundColor: 'rgba(144,184,120,0.3)', tension: 0 },
          ],
        },
        options: {
          animation: false, responsive: true, maintainAspectRatio: true, aspectRatio: 2.8,
          plugins: {
            legend: legend(),
            tooltip: { enabled: false },
          },
          scales: {
            x: axis({ type: 'linear', min: X_MIN, max: X_MAX, title: { display: true, text: 'x', color: COLORS.pottersClay } }),
            y: axis({ min: 0, max: 1.5 }),
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
            borderColor: COLORS.olivine,
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
            legend: legend(),
            tooltip: { enabled: false },
          },
          scales: {
            x: axis({ type: 'linear', min: X_MIN, max: X_MAX, title: { display: true, text: 'z', color: COLORS.pottersClay } }),
            y: axis({ min: 0, title: { display: true, text: '(f * g)(z)', color: COLORS.pottersClay } }),
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

      chart.data.datasets[0]!.data = fData;
      chart.data.datasets[1]!.data = gFlipped;
      chart.data.datasets[2]!.data = overlap;
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

        if (!resultChart) return;
        const result: { x: number; y: number }[] = [];
        for (let i = 0; i <= RESOLUTION; i++) {
          const zz = X_MIN + i * DX;
          result.push({ x: zz, y: convolve(def.f, def.g, zz) });
        }
        resultChart.data.datasets[0]!.data = result;
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
          resultChart.data.datasets[0]!.data = [];
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
            resultChart.data.datasets[0]!.data = [...result];
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
}
