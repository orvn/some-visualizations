// random-incidence page
import type { Alpine } from 'alpinejs';
import { Chart } from 'chart.js';
import { waitForCanvas, initHDPI } from './shared/canvas';

export default function (Alpine: Alpine) {
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

      ctx.strokeStyle = '#3a1a0a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, axisY);
      ctx.lineTo(pad.left + plotW, axisY);
      ctx.stroke();

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

      ctx.strokeStyle = '#b89470';
      ctx.lineWidth = 1;
      arrivals.forEach((t) => {
        const x = pad.left + (t / TOTAL_TIME) * plotW;
        ctx.beginPath();
        ctx.moveTo(x, axisY - 10);
        ctx.lineTo(x, axisY + 10);
        ctx.stroke();
      });

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

        let idx = 0;
        for (let j = 0; j < starts.length; j++) {
          if (starts[j] <= pinTime) idx = j;
          else break;
        }
        const iStart = pad.left + (starts[idx] / TOTAL_TIME) * plotW;
        const iEnd = pad.left + ((starts[idx] + intervals[idx]) / TOTAL_TIME) * plotW;
        ctx.fillStyle = 'rgba(240,120,88,0.12)';
        ctx.fillRect(iStart, axisY - 12, iEnd - iStart, 24);

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
        waitForCanvas('ri-timeline', (canvas) => {
          timelineCanvas = canvas;
          timelineCtx = initHDPI(canvas);
          self.simulate();
        });
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
}
