// perceptron page
import type { Alpine } from 'alpinejs';
import { COLORS, alpha } from './shared/chart';
import { waitForCanvas, initHDPI } from './shared/canvas';

const RANGE = 5;
const pad = { left: 30, right: 15, top: 15, bottom: 28 };
const STEP_MS = 240;
const PULSE_MS = 700;
const MAX_TRAIL = 10;
const MAX_CYCLES = 5;

type Pt = { x: number; y: number; label: 1 | -1 };
type Boundary = { t1: number; t2: number; t0: number };

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSeparablePreset(): Pt[] {
  const rng = mulberry32(1337);
  const pts: Pt[] = [];
  const ang = -Math.PI / 6;
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const nx = -dy, ny = dx;
  const N_PER = 26;
  const span = 4.0;
  const minGap = 0.35;
  const maxGap = 1.7;

  const pushClass = (sign: 1 | -1) => {
    for (let i = 0; i < N_PER; i++) {
      const t = -span + 2 * span * (i / (N_PER - 1));
      const jit = (rng() - 0.5) * 0.5;
      const off = minGap + rng() * (maxGap - minGap);
      pts.push({
        x: t * dx + jit * dx + sign * off * nx,
        y: t * dy + jit * dy + sign * off * ny,
        label: sign,
      });
    }
  };
  pushClass(1);
  pushClass(-1);
  return pts;
}

const PRESETS: Record<string, Pt[]> = {
  separable: makeSeparablePreset(),
  blank: [],
};

function classify(p: Pt, b: Boundary): number {
  return p.label * (b.t1 * p.x + b.t2 * p.y + b.t0);
}

function lerpBoundary(a: Boundary, b: Boundary, t: number): Boundary {
  return {
    t1: a.t1 + (b.t1 - a.t1) * t,
    t2: a.t2 + (b.t2 - a.t2) * t,
    t0: a.t0 + (b.t0 - a.t0) * t,
  };
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function computeMargin(points: Pt[], b: Boundary): number {
  const norm = Math.hypot(b.t1, b.t2);
  if (norm < 1e-9 || points.length === 0) return 0;
  let m = Infinity;
  for (const p of points) {
    const d = p.label * (b.t1 * p.x + b.t2 * p.y + b.t0) / norm;
    if (d < m) m = d;
  }
  return m;
}

function boundarySegment(b: Boundary): [[number, number], [number, number]] | null {
  const { t1, t2, t0 } = b;
  const norm2 = t1 * t1 + t2 * t2;
  if (norm2 < 1e-12) return null;
  const inv = 1 / Math.sqrt(norm2);
  const x0 = -t0 * t1 / norm2;
  const y0 = -t0 * t2 / norm2;
  const dx = -t2 * inv;
  const dy = t1 * inv;

  let tMinus = -Infinity;
  let tPlus = Infinity;
  if (Math.abs(dx) > 1e-9) {
    const a = (-RANGE - x0) / dx;
    const b2 = (RANGE - x0) / dx;
    const [lo, hi] = a < b2 ? [a, b2] : [b2, a];
    if (lo > tMinus) tMinus = lo;
    if (hi < tPlus) tPlus = hi;
  } else if (x0 < -RANGE || x0 > RANGE) {
    return null;
  }
  if (Math.abs(dy) > 1e-9) {
    const a = (-RANGE - y0) / dy;
    const b2 = (RANGE - y0) / dy;
    const [lo, hi] = a < b2 ? [a, b2] : [b2, a];
    if (lo > tMinus) tMinus = lo;
    if (hi < tPlus) tPlus = hi;
  } else if (y0 < -RANGE || y0 > RANGE) {
    return null;
  }
  if (tPlus <= tMinus) return null;
  return [
    [x0 + tMinus * dx, y0 + tMinus * dy],
    [x0 + tPlus * dx, y0 + tPlus * dy],
  ];
}

export default function (Alpine: Alpine) {
  Alpine.data('perceptron', () => {
    let canvas: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    let animRaf: number | null = null;
    let animT = 1;
    let animStart = 0;
    let animFrom: Boundary | null = null;
    let animTo: Boundary | null = null;
    let renderRaf: number | null = null;
    let runTimer: number | null = null;
    let cursorIdx = 0;
    let cycleClean = 0;
    let lastMistake: { idx: number; ts: number } | null = null;
    let history: Boundary[] = [];

    function makeCoords(W: number, H: number) {
      const pw = W - pad.left - pad.right;
      const ph = H - pad.top - pad.bottom;
      return {
        pw, ph,
        toX: (x: number) => pad.left + ((x + RANGE) / (2 * RANGE)) * pw,
        toY: (y: number) => pad.top + ph - ((y + RANGE) / (2 * RANGE)) * ph,
        fromX: (px: number) => ((px - pad.left) / pw) * (2 * RANGE) - RANGE,
        fromY: (py: number) => RANGE - ((py - pad.top) / ph) * (2 * RANGE),
      };
    }

    function drawAxes(c: CanvasRenderingContext2D, W: number, H: number) {
      const { pw, ph, toX, toY } = makeCoords(W, H);
      c.strokeStyle = alpha(COLORS.pottersClay, 0.35);
      c.lineWidth = 0.5;
      const ox = toX(0), oy = toY(0);
      c.beginPath(); c.moveTo(pad.left, oy); c.lineTo(pad.left + pw, oy); c.stroke();
      c.beginPath(); c.moveTo(ox, pad.top); c.lineTo(ox, pad.top + ph); c.stroke();

      c.font = '9px var(--font-mono, monospace)';
      c.fillStyle = COLORS.pottersClay;
      c.textAlign = 'center';
      for (let v = -RANGE + 1; v <= RANGE - 1; v++) {
        if (v === 0) continue;
        const px = toX(v);
        c.fillText(String(v), px, oy + 12);
        c.beginPath(); c.moveTo(px, oy - 2); c.lineTo(px, oy + 2); c.stroke();
      }
      c.textAlign = 'right';
      for (let v = -RANGE + 1; v <= RANGE - 1; v++) {
        if (v === 0) continue;
        const py = toY(v);
        c.fillText(String(v), ox - 5, py + 3);
        c.beginPath(); c.moveTo(ox - 2, py); c.lineTo(ox + 2, py); c.stroke();
      }

      c.font = '11px var(--font-mono, monospace)';
      c.textAlign = 'center';
      c.fillText('x₁', pad.left + pw / 2, pad.top + ph + 22);
      c.save();
      c.translate(10, pad.top + ph / 2);
      c.rotate(-Math.PI / 2);
      c.fillText('x₂', 0, 0);
      c.restore();
    }

    function drawShadedHalfPlanes(c: CanvasRenderingContext2D, W: number, H: number, b: Boundary) {
      const { pw, ph, toX, toY } = makeCoords(W, H);
      const { t1, t2, t0 } = b;
      if (Math.hypot(t1, t2) < 1e-9) return;

      const corners: [number, number][] = [
        [-RANGE, -RANGE], [RANGE, -RANGE], [RANGE, RANGE], [-RANGE, RANGE],
      ];

      const buildPoly = (positive: boolean): [number, number][] => {
        const poly: [number, number][] = [];
        for (let i = 0; i < 4; i++) {
          const cur = corners[i]!;
          const next = corners[(i + 1) % 4]!;
          const curSide = t1 * cur[0] + t2 * cur[1] + t0;
          const nextSide = t1 * next[0] + t2 * next[1] + t0;
          const curIn = positive ? curSide >= 0 : curSide <= 0;
          const nextIn = positive ? nextSide >= 0 : nextSide <= 0;
          if (curIn) poly.push(cur);
          if (curIn !== nextIn) {
            const s = curSide / (curSide - nextSide);
            poly.push([cur[0] + (next[0] - cur[0]) * s, cur[1] + (next[1] - cur[1]) * s]);
          }
        }
        return poly;
      };

      c.save();
      c.beginPath();
      c.rect(pad.left, pad.top, pw, ph);
      c.clip();

      for (const [positive, color] of [[true, COLORS.olivine], [false, COLORS.sienna]] as const) {
        const poly = buildPoly(positive);
        if (poly.length < 3) continue;
        c.beginPath();
        c.moveTo(toX(poly[0]![0]), toY(poly[0]![1]));
        for (let i = 1; i < poly.length; i++) c.lineTo(toX(poly[i]![0]), toY(poly[i]![1]));
        c.closePath();
        c.fillStyle = alpha(color, 0.02);
        c.fill();
      }

      c.restore();
    }

    function drawBoundary(
      c: CanvasRenderingContext2D, W: number, H: number,
      b: Boundary, color: string, width: number, alphaVal = 1,
    ) {
      const seg = boundarySegment(b);
      if (!seg) return;
      const { pw, ph, toX, toY } = makeCoords(W, H);
      c.save();
      c.beginPath();
      c.rect(pad.left, pad.top, pw, ph);
      c.clip();
      c.beginPath();
      c.moveTo(toX(seg[0][0]), toY(seg[0][1]));
      c.lineTo(toX(seg[1][0]), toY(seg[1][1]));
      c.strokeStyle = alphaVal < 1 ? alpha(color, alphaVal) : color;
      c.lineWidth = width;
      c.stroke();
      c.restore();
    }

    function drawBoundaryGlow(
      c: CanvasRenderingContext2D, W: number, H: number,
      b: Boundary, color: string,
    ) {
      const seg = boundarySegment(b);
      if (!seg) return;
      const { pw, ph, toX, toY } = makeCoords(W, H);
      c.save();
      c.beginPath();
      c.rect(pad.left, pad.top, pw, ph);
      c.clip();
      c.lineCap = 'round';
      const passes: Array<[number, number]> = [[11, 0.06], [6, 0.15], [2.4, 1]];
      for (const [w, a] of passes) {
        c.beginPath();
        c.moveTo(toX(seg[0][0]), toY(seg[0][1]));
        c.lineTo(toX(seg[1][0]), toY(seg[1][1]));
        c.strokeStyle = a < 1 ? alpha(color, a) : color;
        c.lineWidth = w;
        c.stroke();
      }
      c.restore();
    }

    function drawMarginHalo(
      c: CanvasRenderingContext2D, W: number, H: number,
      b: Boundary, color: string, extent: number, peakAlpha: number,
    ) {
      const seg = boundarySegment(b);
      if (!seg) return;
      const { pw, ph, toX, toY } = makeCoords(W, H);
      const norm = Math.hypot(b.t1, b.t2);
      if (norm < 1e-9) return;
      const nx = b.t1 / norm, ny = b.t2 / norm;
      const mx = (seg[0][0] + seg[1][0]) / 2;
      const my = (seg[0][1] + seg[1][1]) / 2;
      const p1x = mx - nx * extent;
      const p1y = my - ny * extent;
      const p2x = mx + nx * extent;
      const p2y = my + ny * extent;

      const grad = c.createLinearGradient(toX(p1x), toY(p1y), toX(p2x), toY(p2y));
      grad.addColorStop(0, alpha(color, 0));
      grad.addColorStop(0.5, alpha(color, peakAlpha));
      grad.addColorStop(1, alpha(color, 0));

      c.save();
      c.beginPath();
      c.rect(pad.left, pad.top, pw, ph);
      c.clip();
      c.fillStyle = grad;
      c.fillRect(pad.left, pad.top, pw, ph);
      c.restore();
    }

    function drawNormalArrow(c: CanvasRenderingContext2D, W: number, H: number, b: Boundary) {
      const { t1, t2, t0 } = b;
      const norm = Math.hypot(t1, t2);
      if (norm < 1e-9) return;
      const { toX, toY, pw, ph } = makeCoords(W, H);
      const x0 = -t0 * t1 / (norm * norm);
      const y0 = -t0 * t2 / (norm * norm);
      const len = 0.9;
      const ex = x0 + (t1 / norm) * len;
      const ey = y0 + (t2 / norm) * len;

      c.save();
      c.beginPath();
      c.rect(pad.left, pad.top, pw, ph);
      c.clip();

      c.strokeStyle = alpha(COLORS.porsche, 0.85);
      c.fillStyle = alpha(COLORS.porsche, 0.85);
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(toX(x0), toY(y0));
      c.lineTo(toX(ex), toY(ey));
      c.stroke();

      const ang = Math.atan2(toY(ey) - toY(y0), toX(ex) - toX(x0));
      const head = 6;
      c.beginPath();
      c.moveTo(toX(ex), toY(ey));
      c.lineTo(toX(ex) - head * Math.cos(ang - Math.PI / 6), toY(ey) - head * Math.sin(ang - Math.PI / 6));
      c.lineTo(toX(ex) - head * Math.cos(ang + Math.PI / 6), toY(ey) - head * Math.sin(ang + Math.PI / 6));
      c.closePath();
      c.fill();

      c.restore();
    }

    function drawPoints(
      c: CanvasRenderingContext2D, W: number, H: number,
      points: Pt[], mistakeIdx: number | null, pulseT: number,
    ) {
      const { toX, toY } = makeCoords(W, H);
      for (let i = 0; i < points.length; i++) {
        const p = points[i]!;
        const cx = toX(p.x), cy = toY(p.y);
        const isMistake = i === mistakeIdx;
        const posColor = p.label === 1 ? COLORS.olivine : COLORS.sienna;

        if (isMistake && pulseT < 1) {
          const eased = easeInOut(pulseT);
          const ringR = 5 + eased * 16;
          const ringA = (1 - eased) * 0.8;
          c.beginPath();
          c.arc(cx, cy, ringR, 0, Math.PI * 2);
          c.strokeStyle = alpha(posColor, ringA);
          c.lineWidth = 2;
          c.stroke();
        }

        c.beginPath();
        c.arc(cx, cy, 5, 0, Math.PI * 2);
        c.fillStyle = posColor;
        c.fill();
        c.strokeStyle = COLORS.colonial;
        c.lineWidth = 1;
        c.stroke();

        c.fillStyle = COLORS.graphite;
        c.font = 'bold 8px var(--font-mono, monospace)';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(p.label === 1 ? '+' : '−', cx, cy + 0.5);
        c.textBaseline = 'alphabetic';
      }
    }

    function cancelAnim() {
      if (animRaf) { cancelAnimationFrame(animRaf); animRaf = null; }
      animT = 1;
      animFrom = null;
      animTo = null;
    }

    function stopRun() {
      if (runTimer !== null) { clearTimeout(runTimer); runTimer = null; }
    }

    function scheduleRender(self: any) {
      if (renderRaf !== null) return;
      renderRaf = requestAnimationFrame(() => {
        renderRaf = null;
        self.render();
      });
    }

    return {
      dataset: 'separable',
      clickLabel: 1 as 1 | -1,
      speed: '250',
      running: false,
      converged: false,
      nonseparableFlag: false,
      stepCount: 0,
      mistakeCount: 0,
      thetaDisplay: '',
      marginDisplay: '',
      points: [] as Pt[],
      theta: { t1: 0, t2: 0, t0: 0 } as Boundary,

      init() {
        const self = this;
        waitForCanvas('pc-plot', (c) => {
          canvas = c;
          const context = initHDPI(c);
          if (context) ctx = context;

          c.addEventListener('click', (e) => {
            if (self.running) return;
            const rect = c.getBoundingClientRect();
            const { fromX, fromY } = makeCoords(rect.width, rect.height);
            const x = fromX(e.clientX - rect.left);
            const y = fromY(e.clientY - rect.top);
            if (x < -RANGE || x > RANGE || y < -RANGE || y > RANGE) return;
            self.points.push({ x, y, label: self.clickLabel });
            self.converged = false;
            self.nonseparableFlag = false;
            cycleClean = 0;
            self.render();
          });

          self.loadPreset();
        });
      },

      loadPreset() {
        cancelAnim();
        stopRun();
        this.running = false;
        this.points = PRESETS[this.dataset]!.map((p) => ({ ...p }));
        this.doReset();
      },

      doReset() {
        cancelAnim();
        stopRun();
        this.running = false;
        this.theta = { t1: 0, t2: 0, t0: 0 };
        this.stepCount = 0;
        this.mistakeCount = 0;
        this.converged = false;
        this.nonseparableFlag = false;
        this.thetaDisplay = '';
        this.marginDisplay = '';
        cursorIdx = 0;
        cycleClean = 0;
        lastMistake = null;
        history = [];
        this.render();
      },

      reset() {
        this.doReset();
      },

      step() {
        if (this.converged || this.points.length === 0) return;
        if (animT < 1) return;

        const n = this.points.length;
        let scanned = 0;
        while (scanned < n) {
          const p = this.points[cursorIdx]!;
          const score = classify(p, this.theta);
          if (score <= 0) {
            const oldTheta = { ...this.theta };
            const newTheta: Boundary = {
              t1: oldTheta.t1 + p.label * p.x,
              t2: oldTheta.t2 + p.label * p.y,
              t0: oldTheta.t0 + p.label,
            };
            this.mistakeCount++;
            this.stepCount++;
            lastMistake = { idx: cursorIdx, ts: performance.now() };

            if (Math.hypot(oldTheta.t1, oldTheta.t2) > 1e-9) {
              history.push(oldTheta);
              if (history.length > MAX_TRAIL) history.shift();
            }

            this.theta = newTheta;
            cycleClean = 0;
            cursorIdx = (cursorIdx + 1) % n;
            this.updateDisplay();

            if (this.mistakeCount >= n * MAX_CYCLES) {
              this.nonseparableFlag = true;
              this.running = false;
              stopRun();
            }

            animFrom = oldTheta;
            animTo = newTheta;
            animT = 0;
            animStart = performance.now();
            const self = this;
            const tick = (now: number) => {
              animT = Math.min((now - animStart) / STEP_MS, 1);
              self.render();
              if (animT < 1) {
                animRaf = requestAnimationFrame(tick);
              } else {
                cancelAnim();
                self.render();
              }
            };
            animRaf = requestAnimationFrame(tick);
            return;
          }

          cursorIdx = (cursorIdx + 1) % n;
          cycleClean++;
          scanned++;

          if (cycleClean >= n) {
            this.converged = true;
            this.running = false;
            stopRun();
            this.updateDisplay();
            this.render();
            return;
          }
        }
      },

      toggleRun() {
        if (this.running) {
          this.running = false;
          stopRun();
          return;
        }
        if (this.converged || this.points.length === 0) return;
        this.running = true;
        this.nonseparableFlag = false;
        const self = this;
        const tick = () => {
          if (!self.running) return;
          if (self.converged || self.nonseparableFlag) {
            self.running = false;
            return;
          }
          self.step();
          const wait = Math.max(STEP_MS + 40, parseInt(self.speed));
          runTimer = window.setTimeout(tick, wait);
        };
        tick();
      },

      updateDisplay() {
        const { t1, t2, t0 } = this.theta;
        if (Math.hypot(t1, t2) > 1e-9) {
          this.thetaDisplay = `(${t1.toFixed(1)}, ${t2.toFixed(1)})  θ₀ = ${t0.toFixed(1)}`;
        } else {
          this.thetaDisplay = '';
        }
        if (this.converged) {
          this.marginDisplay = computeMargin(this.points, this.theta).toFixed(3);
        } else {
          this.marginDisplay = '';
        }
      },

      render() {
        if (!canvas || !ctx) return;
        const W = canvas.getBoundingClientRect().width;
        const H = canvas.getBoundingClientRect().height;

        ctx.clearRect(0, 0, W * 3, H * 3);
        drawAxes(ctx, W, H);

        let b: Boundary = this.theta;
        if (animFrom && animTo && animT < 1) {
          b = lerpBoundary(animFrom, animTo, easeInOut(animT));
        }

        for (let i = 0; i < history.length; i++) {
          const bh = history[i]!;
          const a = 0.04 + (i / MAX_TRAIL) * 0.14;
          drawBoundary(ctx, W, H, bh, COLORS.teak, 1, a);
        }

        if (Math.hypot(b.t1, b.t2) > 1e-9) {
          drawShadedHalfPlanes(ctx, W, H, b);

          const activeColor = this.converged
            ? COLORS.olivine
            : this.nonseparableFlag
              ? COLORS.sienna
              : COLORS.porsche;
          const marginNow = this.converged ? computeMargin(this.points, b) : 0.4;
          const extent = this.converged
            ? Math.max(0.4, Math.min(2.2, marginNow))
            : 0.5;
          const peak = this.converged ? 0.32 : 0.22;
          drawMarginHalo(ctx, W, H, b, activeColor, extent, peak);
          drawBoundaryGlow(ctx, W, H, b, activeColor);
          drawNormalArrow(ctx, W, H, b);
        }

        let pulseT = 1;
        let mistakeIdx: number | null = null;
        if (lastMistake) {
          const dt = (performance.now() - lastMistake.ts) / PULSE_MS;
          if (dt < 1) {
            pulseT = dt;
            mistakeIdx = lastMistake.idx;
            scheduleRender(this);
          } else {
            lastMistake = null;
          }
        }
        drawPoints(ctx, W, H, this.points, mistakeIdx, pulseT);
      },
    };
  });
}
