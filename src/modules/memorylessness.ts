// memorylessness page
import type { Alpine } from 'alpinejs';
import { Chart } from 'chart.js';
import { COLORS, axis, legend, makeScriptableGrad, alpha } from './shared/chart';
import { waitForCanvas, initHDPI } from './shared/canvas';

export default function (Alpine: Alpine) {
  Alpine.data('memorylessness', () => {
    let timelineCanvas: HTMLCanvasElement | null = null;
    let timelineCtx: CanvasRenderingContext2D | null = null;
    let uncondChart: Chart | null = null;
    let condChart: Chart | null = null;

    const MAX_TIME = 20;
    const PDF_RANGE = 10;
    const PDF_STEPS = 200;

    function expPdf(x: number, lam: number): number {
      return x < 0 ? 0 : lam * Math.exp(-lam * x);
    }

    function generateArrivals(lam: number): number[] {
      const arrivals: number[] = [];
      let t = 0;
      while (t < MAX_TIME) {
        t += -Math.log(1 - Math.random()) / lam;
        if (t < MAX_TIME) arrivals.push(t);
      }
      return arrivals;
    }

    let arrivals: number[] = [];

    function drawTimeline(lam: number, s: number) {
      if (!timelineCtx || !timelineCanvas) return;
      const ctx = timelineCtx;
      const W = timelineCanvas.getBoundingClientRect().width;
      const H = timelineCanvas.getBoundingClientRect().height;
      const pad = { left: 40, right: 20, top: 20, bottom: 25 };
      const plotW = W - pad.left - pad.right;
      const axisY = pad.top + (H - pad.top - pad.bottom) / 2;

      ctx.clearRect(0, 0, W * 3, H * 3);

      // highlight region past s
      const sX = pad.left + (s / MAX_TIME) * plotW;
      ctx.fillStyle = alpha(COLORS.sienna, 0.08);
      ctx.fillRect(sX, pad.top, pad.left + plotW - sX, H - pad.top - pad.bottom);

      // axis
      ctx.strokeStyle = COLORS.bronze;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, axisY);
      ctx.lineTo(pad.left + plotW, axisY);
      ctx.stroke();

      // ticks
      ctx.fillStyle = COLORS.pottersClay;
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (let t = 0; t <= MAX_TIME; t += 2) {
        const x = pad.left + (t / MAX_TIME) * plotW;
        ctx.beginPath();
        ctx.moveTo(x, axisY - 3);
        ctx.lineTo(x, axisY + 3);
        ctx.stroke();
        ctx.fillText(String(t), x, axisY + 16);
      }

      // arrival markers
      arrivals.forEach((t) => {
        const x = pad.left + (t / MAX_TIME) * plotW;
        const past = t > s;
        ctx.strokeStyle = past ? COLORS.sienna : COLORS.teak;
        ctx.lineWidth = past ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(x, axisY - 10);
        ctx.lineTo(x, axisY + 10);
        ctx.stroke();
        ctx.fillStyle = past ? COLORS.sienna : COLORS.teak;
        ctx.beginPath();
        ctx.arc(x, axisY, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // interarrival gaps
      ctx.fillStyle = COLORS.pottersClay;
      ctx.font = '9px ui-monospace, monospace';
      for (let i = 0; i < arrivals.length; i++) {
        const prev = i === 0 ? 0 : arrivals[i - 1]!;
        const curr = arrivals[i]!;
        const gap = curr - prev;
        const startX = pad.left + (prev / MAX_TIME) * plotW;
        const endX = pad.left + (curr / MAX_TIME) * plotW;
        if (endX - startX > 25) {
          ctx.fillText(gap.toFixed(1), (startX + endX) / 2, axisY - 14);
        }
      }

      // s marker (draggable indicator)
      ctx.strokeStyle = COLORS.colonial;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sX, pad.top);
      ctx.lineTo(sX, H - pad.bottom);
      ctx.stroke();

      // s label
      ctx.fillStyle = COLORS.colonial;
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`s = ${s.toFixed(1)}`, sX, pad.top - 6);

      // legend labels
      ctx.fillStyle = COLORS.pottersClay;
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`λ = ${lam.toFixed(1)}`, pad.left, pad.top - 6);
    }

    function pdfData(lam: number, maxX: number): { x: number; y: number }[] {
      const data: { x: number; y: number }[] = [];
      const step = maxX / PDF_STEPS;
      for (let x = 0; x <= maxX; x += step) {
        data.push({ x, y: expPdf(x, lam) });
      }
      return data;
    }

    function buildCharts(lam: number) {
      const uncondCanvas = document.getElementById('ml-unconditional') as HTMLCanvasElement | null;
      const condCanvas = document.getElementById('ml-conditional') as HTMLCanvasElement | null;

      const uncondData = pdfData(lam, PDF_RANGE);

      if (uncondCanvas) {
        if (uncondChart) uncondChart.destroy();
        uncondChart = new Chart(uncondCanvas, {
          type: 'line',
          data: {
            datasets: [{
              label: 'f(x) = λe^{−λx}',
              data: uncondData,
              borderColor: COLORS.olivine,
              borderWidth: 2,
              pointRadius: 0,
              fill: true,
              backgroundColor: makeScriptableGrad(COLORS.olivine, 0.3, 0.01),
              tension: 0.3,
            }],
          },
          options: {
            animation: { duration: 300, easing: 'easeOutQuart' as const },
            responsive: true, maintainAspectRatio: true, aspectRatio: 1.8,
            plugins: {
              legend: legend({ labels: { boxWidth: 12 } }),
              tooltip: { enabled: false },
            },
            scales: {
              x: axis({ type: 'linear', min: 0, max: PDF_RANGE, title: { display: true, text: 'x', color: COLORS.pottersClay } }),
              y: axis({ min: 0, suggestedMax: lam * 1.1, title: { display: true, text: 'f(x)', color: COLORS.pottersClay } }),
            },
          },
        });
      }

      if (condCanvas) {
        if (condChart) condChart.destroy();
        condChart = new Chart(condCanvas, {
          type: 'line',
          data: {
            datasets: [{
              label: 'f(t | X > s) = λe^{−λt}',
              data: uncondData,
              borderColor: COLORS.sienna,
              borderWidth: 2,
              pointRadius: 0,
              fill: true,
              backgroundColor: makeScriptableGrad(COLORS.sienna, 0.3, 0.01),
              tension: 0.3,
            }],
          },
          options: {
            animation: { duration: 300, easing: 'easeOutQuart' as const },
            responsive: true, maintainAspectRatio: true, aspectRatio: 1.8,
            plugins: {
              legend: legend({ labels: { boxWidth: 12 } }),
              tooltip: { enabled: false },
            },
            scales: {
              x: axis({ type: 'linear', min: 0, max: PDF_RANGE, title: { display: true, text: 't (remaining wait)', color: COLORS.pottersClay } }),
              y: axis({ min: 0, suggestedMax: lam * 1.1, title: { display: true, text: 'f(t | X > s)', color: COLORS.pottersClay } }),
            },
          },
        });
      }
    }

    function updateCharts(lam: number) {
      const data = pdfData(lam, PDF_RANGE);
      if (uncondChart) {
        uncondChart.data.datasets[0]!.data = data;
        (uncondChart.options.scales!.y as any).suggestedMax = lam * 1.1;
        uncondChart.update();
      }
      if (condChart) {
        condChart.data.datasets[0]!.data = data;
        (condChart.options.scales!.y as any).suggestedMax = lam * 1.1;
        condChart.update();
      }
    }

    return {
      lambda: '1',
      s: '3',
      info: '',

      init() {
        const self = this;
        waitForCanvas('ml-timeline', (canvas) => {
          timelineCanvas = canvas;
          timelineCtx = initHDPI(canvas);
          self.resample();
          self.buildPdfs();
        });
      },

      resample() {
        const lam = parseFloat(this.lambda) || 1;
        arrivals = generateArrivals(lam);
        this.render();
      },

      buildPdfs() {
        const lam = parseFloat(this.lambda) || 1;
        buildCharts(lam);
        this.updateInfo();
      },

      render() {
        const lam = parseFloat(this.lambda) || 1;
        const s = parseFloat(this.s) || 3;
        drawTimeline(lam, s);
        this.updateInfo();
      },

      onLambdaChange() {
        const lam = parseFloat(this.lambda) || 1;
        arrivals = generateArrivals(lam);
        updateCharts(lam);
        this.render();
      },

      onSChange() {
        this.render();
      },

      updateInfo() {
        const lam = parseFloat(this.lambda) || 1;
        const s = parseFloat(this.s) || 3;
        const pSurvive = Math.exp(-lam * s);
        const condMean = 1 / lam;
        this.info = `ℙ(X > ${s.toFixed(1)}) = ${pSurvive.toFixed(4)}   𝔼[remaining] = 1/λ = ${condMean.toFixed(2)}   (same as unconditional mean)`;
      },
    };
  });
}
