// bivariate-normals page
import type { Alpine } from 'alpinejs';
import { Chart } from 'chart.js';
import { makeScriptableGrad } from './shared/chart';
import { waitForCanvas, initHDPI } from './shared/canvas';

export default function (Alpine: Alpine) {
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
        waitForCanvas('bn-surface', (canvas) => {
          surfaceCanvas = canvas;
          heatCanvas = document.getElementById('bn-heatmap') as HTMLCanvasElement | null;
          [surfaceCanvas, heatCanvas].forEach(c => {
            if (c) initHDPI(c);
          });
          surfaceCtx = surfaceCanvas.getContext('2d');
          heatCtx = heatCanvas?.getContext('2d') || null;
          self._current = { sx: 1, sy: 1, rho: 0, sliceY: 0 };
          self.render();
        });
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
}
