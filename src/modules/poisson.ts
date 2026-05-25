// poisson page
import type { Alpine } from 'alpinejs';
import { Chart } from 'chart.js';

export default function (Alpine: Alpine) {
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

      const axisY = pad.top + plotH / 2;
      ctx.strokeStyle = '#3a1a0a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, axisY);
      ctx.lineTo(pad.left + plotW, axisY);
      ctx.stroke();

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

      ctx.fillText('time', pad.left + plotW / 2, H - 2);

      arrivals.forEach((t) => {
        const x = pad.left + (t / maxTime) * plotW;
        ctx.strokeStyle = '#f07858';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, axisY - 14);
        ctx.lineTo(x, axisY + 14);
        ctx.stroke();
        ctx.fillStyle = '#f07858';
        ctx.beginPath();
        ctx.arc(x, axisY, 3, 0, Math.PI * 2);
        ctx.fill();
      });

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

      ctx.fillStyle = '#7a5a3a';
      ctx.textAlign = 'left';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(`N(${maxTime.toFixed(0)}) = ${arrivals.length}`, pad.left, pad.top + 6);

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
}
