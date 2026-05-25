// markov page
import type { Alpine } from 'alpinejs';
import { Chart } from 'chart.js';

export default function (Alpine: Alpine) {
  Alpine.data('markovChain', () => {
    let diagramCanvas: HTMLCanvasElement | null = null;
    let diagramCtx: CanvasRenderingContext2D | null = null;
    let histChart: Chart | null = null;
    let walkTimer: ReturnType<typeof setTimeout> | null = null;
    let pulseScale = 1;
    let pulseT = 1;
    let pulseRaf: number | null = null;
    let prevState = -1;
    let activeEdge: [number, number] | null = null;

    const STATES = 7;
    const STATE_LABELS = ['i', 'j', 'k', 'l', 'm', 'n', 'o'];
    const COLORS = ['#f0d8a8', '#90b878', '#f07858', '#e8a050', '#b89470', '#f0d8a8', '#90b878'];

    // Transition matrix from lecture diagram (states 1-7 mapped to i-o)
    // {i,j,k} recurrent class 1, {m,o,n} recurrent class 2
    // l is transient: reachable from k, sends to m and n, n can send back
    // Adjacency: which edges exist in the graph (symmetric + self-loops)
    const ADJ: boolean[][] = [
    // i     j     k     l     m     n     o
      [true, true, false,false,false,false,false], // i
      [true, true, true, false,false,false,false], // j
      [false,true, true, true, false,false,false], // k
      [false,false,true, true, true, true, false], // l
      [false,false,false,true, true, false,true ], // m
      [false,false,false,true, false,true, true ], // n
      [false,false,false,false,true, true, true ], // o
    ];

    function defaultMatrix(): number[][] {
      return [
      // i     j     k     l     m     n     o
        [0.4,  0.6,  0,    0,    0,    0,    0   ], // i: self 0.4, →j 0.6
        [0.2,  0,    0.8,  0,    0,    0,    0   ], // j: →i 0.2, →k 0.8
        [0,    0,    0.6,  0.4,  0,    0,    0   ], // k: self 0.6, →l 0.4
        [0,    0,    0.5,  0,    0.3,  0.2,  0   ], // l: →k 0.5, →m 0.3, →n 0.2
        [0,    0,    0,    0,    0,    0,    1   ], // m: →o 1
        [0,    0,    0,    0.3,  0,    0,    0.7 ], // n: →l 0.3, →o 0.7
        [0,    0,    0,    0,    0,    1,    0   ], // o: →n 1
      ];
    }

    function statePositions(W: number, H: number): [number, number][] {
      const scale = Math.min(W / 600, 1);
      const pLeft = 30 * scale + 20;
      const pRight = 10 + 10 * scale;
      const pTop = 20 * scale + 5;
      const pBottom = 10 * scale + 5;
      const uw = W - pLeft - pRight;
      const uh = H - pTop - pBottom;
      return [
        [pLeft + uw * 0.0,  pTop + uh * 0.4],  // i
        [pLeft + uw * 0.18, pTop + uh * 0.4],  // j
        [pLeft + uw * 0.36, pTop + uh * 0.4],  // k
        [pLeft + uw * 0.64, pTop + uh * 0.25], // l
        [pLeft + uw * 0.9,  pTop + uh * 0.25], // m
        [pLeft + uw * 0.58, pTop + uh * 0.6],  // n
        [pLeft + uw * 0.86, pTop + uh * 0.6],  // o
      ];
    }

    // Per-edge label offsets: [dx, dy] in scaled pixels, added after default placement
    // Key format: "i->j" using state letters. Tweak these to fix overlapping labels.
    const LABEL_NUDGE: Record<string, [number, number]> = {
      'i->i': [0, 0],    // self-loop
      'i->j': [15, 5],
      'j->j': [0, 0],    // self-loop
      'j->i': [0, 0],
      'j->k': [0, 0],
      'k->j': [0, 0],
      'k->k': [0, 0],    // self-loop
      'k->l': [25, 0],
      'l->k': [5, -5],
      'l->l': [0, 0],    // self-loop
      'l->m': [10, 0],
      'l->n': [0, 0],
      'n->l': [-5, 50],
      'l->o': [0, 0],
      'm->m': [0, 0],    // self-loop
      'm->o': [8, 0],
      'n->n': [0, 0],    // self-loop
      'n->o': [25, 10],
      'o->n': [0, 0],
      'o->o': [0, 0],    // self-loop
    };

    function drawDiagram(matrix: number[][], current: number, visits: number[]) {
      if (!diagramCtx || !diagramCanvas) return;
      const W = diagramCanvas.getBoundingClientRect().width;
      const H = diagramCanvas.getBoundingClientRect().height;
      const ctx = diagramCtx;
      ctx.clearRect(0, 0, W * 3, H * 3);

      const pos = statePositions(W, H);
      const scale = Math.min(W / 600, 1);
      const nodeR = Math.round(22 * scale);

      // Draw edges
      for (let i = 0; i < STATES; i++) {
        for (let j = 0; j < STATES; j++) {
          if (i === j || matrix[i][j] < 0.01) continue;
          const [x1, y1] = pos[i];
          const [x2, y2] = pos[j];
          const dx = x2 - x1;
          const dy = y2 - y1;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const nx = dx / dist;
          const ny = dy / dist;

          // Perpendicular offset: use canonical direction (lower→higher index) so
          // bidirectional pairs consistently separate instead of both curving the same way
          const hasBoth = matrix[j][i] > 0.01;
          const curveAmt = (hasBoth ? 8 : 5) * scale;
          const lowIdx = Math.min(i, j);
          const highIdx = Math.max(i, j);
          const [lx, ly] = pos[lowIdx];
          const [hx, hy] = pos[highIdx];
          const refDx = hx - lx;
          const refDy = hy - ly;
          const refDist = Math.sqrt(refDx * refDx + refDy * refDy);
          const perpX = (refDy / refDist) * curveAmt;
          const perpY = -(refDx / refDist) * curveAmt;
          const side = hasBoth ? (i < j ? 1 : -1) : 1;
          const ox = perpX * side;
          const oy = perpY * side;

          const sx = x1 + nx * nodeR + ox;
          const sy = y1 + ny * nodeR + oy;
          const ex = x2 - nx * (nodeR + 6 * scale) + ox;
          const ey = y2 - ny * (nodeR + 6) + oy;

          const isActiveEdge = activeEdge && activeEdge[0] === i && activeEdge[1] === j;
          const edgeGlow = isActiveEdge ? 1 - pulseT : 0;
          const edgeAlpha = 0.6 + edgeGlow * 0.4;
          const edgeColor = isActiveEdge
            ? `rgba(240,216,168,${edgeAlpha})`
            : 'rgba(184,148,112,0.6)';
          ctx.strokeStyle = edgeColor;
          ctx.lineWidth = isActiveEdge ? 1.5 + edgeGlow : 1;

          // Curved edge via quadratic bezier
          const curveMult = hasBoth ? 2.5 : 1.5;
          const cpx = (sx + ex) / 2 + ox * curveMult;
          const cpy = (sy + ey) / 2 + oy * curveMult;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.quadraticCurveTo(cpx, cpy, ex, ey);
          ctx.stroke();

          // Arrowhead (aligned to curve tangent at endpoint)
          const t = 0.95;
          const tangentX = 2 * (1 - t) * (cpx - sx) + 2 * t * (ex - cpx);
          const tangentY = 2 * (1 - t) * (cpy - sy) + 2 * t * (ey - cpy);
          const tLen = Math.sqrt(tangentX * tangentX + tangentY * tangentY);
          const tnx = tangentX / tLen;
          const tny = tangentY / tLen;
          const aLen = 10 * scale;
          const aW = 5 * scale;
          ctx.fillStyle = edgeColor;
          ctx.beginPath();
          ctx.moveTo(ex + tnx * aLen, ey + tny * aLen);
          ctx.lineTo(ex - tny * aW, ey + tnx * aW);
          ctx.lineTo(ex + tny * aW, ey - tnx * aW);
          ctx.closePath();
          ctx.fill();

          // Probability label along the curve
          if (matrix[i][j] >= 0.05) {
            const lt = hasBoth ? (i < j ? 0.3 : 0.7) : 0.5;
            const lx = (1-lt)*(1-lt)*sx + 2*(1-lt)*lt*cpx + lt*lt*ex;
            const ly = (1-lt)*(1-lt)*sy + 2*(1-lt)*lt*cpy + lt*lt*ey;
            const edgeKey = STATE_LABELS[i] + '->' + STATE_LABELS[j];
            const nudge = LABEL_NUDGE[edgeKey] || [0, 0];
            const mx = lx + ox * 3 + nudge[0] * scale;
            const my = ly + oy * 3 + nudge[1] * scale;
            ctx.fillStyle = 'rgba(184,148,112,0.7)';
            ctx.font = `${Math.round(13 * scale)}px ui-monospace, monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(matrix[i][j].toFixed(1), mx, my);
          }
        }
      }

      // Self-loops as horseshoe arcs (above for top/mid nodes, below for bottom nodes)
      for (let i = 0; i < STATES; i++) {
        if (matrix[i][i] < 0.01) continue;
        const [x, y] = pos[i];
        const loopR = Math.round(12 * scale);
        const isBottom = y > H * 0.6;
        const loopCy = isBottom ? y + nodeR + loopR - 2 : y - nodeR - loopR + 2;

        const isSelfActive = activeEdge && activeEdge[0] === i && activeEdge[1] === i;
        const selfGlow = isSelfActive ? 1 - pulseT : 0;
        const selfAlpha = 0.6 + selfGlow * 0.4;
        const selfColor = isSelfActive
          ? `rgba(240,216,168,${selfAlpha})`
          : 'rgba(184,148,112,0.6)';
        ctx.strokeStyle = selfColor;
        ctx.lineWidth = isSelfActive ? 1.5 + selfGlow : 1;
        ctx.beginPath();
        if (isBottom) {
          ctx.arc(x, loopCy, loopR, Math.PI * 1.15, Math.PI * 1.85, true);
        } else {
          ctx.arc(x, loopCy, loopR, Math.PI * 0.85, Math.PI * 0.15);
        }
        ctx.stroke();

        // Arrowhead at end of arc
        ctx.fillStyle = selfColor;
        ctx.beginPath();
        if (isBottom) {
          // Arrow points upward (toward node)
          const endA = Math.PI * 1.85;
          const ax = x + loopR * Math.cos(endA);
          const ay = loopCy + loopR * Math.sin(endA);
          ctx.moveTo(ax + 1 * scale, ay - 7 * scale);
          ctx.lineTo(ax - 6 * scale, ay + 3 * scale);
          ctx.lineTo(ax + 6 * scale, ay + 3 * scale);
        } else {
          // Arrow points downward (toward node)
          const endA = Math.PI * 0.15;
          const ax = x + loopR * Math.cos(endA);
          const ay = loopCy + loopR * Math.sin(endA);
          ctx.moveTo(ax + 1 * scale, ay + 7 * scale);
          ctx.lineTo(ax - 6 * scale, ay - 3 * scale);
          ctx.lineTo(ax + 6 * scale, ay - 3 * scale);
        }
        ctx.closePath();
        ctx.fill();

        // Label
        ctx.fillStyle = 'rgba(184,148,112,0.7)';
        ctx.font = `${Math.round(13 * scale)}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        const loopKey = STATE_LABELS[i] + '->' + STATE_LABELS[i];
        const loopNudge = LABEL_NUDGE[loopKey] || [0, 0];
        const labelY = isBottom ? loopCy + loopR + 14 * scale : loopCy - loopR - 6 * scale;
        ctx.fillText(matrix[i][i].toFixed(1), x + loopNudge[0] * scale, labelY + loopNudge[1] * scale);
      }

      // Draw nodes
      for (let i = 0; i < STATES; i++) {
        const [x, y] = pos[i];
        const isActive = i === current;
        const wasPrev = i === prevState && prevState !== current;
        const r = isActive ? nodeR * pulseScale : nodeR;

        // Parse node color into RGB for interpolation
        const hex = COLORS[i];
        const cr = parseInt(hex.slice(1, 3), 16);
        const cg = parseInt(hex.slice(3, 5), 16);
        const cb = parseInt(hex.slice(5, 7), 16);
        const dark = { r: 34, g: 15, b: 7 };

        let fillAlpha: number;
        if (isActive) {
          fillAlpha = pulseT < 1 ? 0.3 + 0.7 * Math.min(pulseT * 3, 1) : 1;
        } else if (wasPrev) {
          fillAlpha = 1 - pulseT;
        } else {
          fillAlpha = 0;
        }

        const fr = Math.round(dark.r + (cr - dark.r) * fillAlpha);
        const fg = Math.round(dark.g + (cg - dark.g) * fillAlpha);
        const fb = Math.round(dark.b + (cb - dark.b) * fillAlpha);
        ctx.fillStyle = `rgb(${fr},${fg},${fb})`;
        ctx.strokeStyle = COLORS[i];
        ctx.lineWidth = isActive ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        const textAlpha = fillAlpha > 0.5 ? 1 : 0;
        ctx.fillStyle = textAlpha ? '#1a0c06' : COLORS[i];
        ctx.font = `italic ${Math.round(15 * scale)}px Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(STATE_LABELS[i], x, y);
      }
      ctx.textBaseline = 'alphabetic';
    }

    function triggerPulse(matrix: number[][], current: number, visits: number[], prev: number) {
      if (pulseRaf) cancelAnimationFrame(pulseRaf);
      prevState = prev;
      activeEdge = prev >= 0 ? [prev, current] : null;
      pulseScale = 1.08;
      pulseT = 0;
      const start = performance.now();
      const duration = 220;
      const animate = (now: number) => {
        const t = Math.min((now - start) / duration, 1);
        pulseT = t;
        pulseScale = 1.08 - 0.08 * t * t;
        drawDiagram(matrix, current, visits);
        if (t < 1) {
          pulseRaf = requestAnimationFrame(animate);
        } else {
          pulseRaf = null;
          prevState = -1;
          activeEdge = null;
        }
      };
      pulseRaf = requestAnimationFrame(animate);
    }

    function updateHist() {
      // Bars are now rendered via Alpine reactivity in the template
    }

    function computeSteadyState(matrix: number[][]): number[] {
      // Power iteration
      let pi = new Array(STATES).fill(1 / STATES);
      for (let iter = 0; iter < 200; iter++) {
        const next = new Array(STATES).fill(0);
        for (let j = 0; j < STATES; j++) {
          for (let i = 0; i < STATES; i++) {
            next[j] += pi[i] * matrix[i][j];
          }
        }
        pi = next;
      }
      return pi;
    }

    return {
      matrix: defaultMatrix(),
      adj: ADJ,
      current: 0,
      visits: new Array(STATES).fill(0) as number[],
      totalSteps: 0,
      running: false,
      speedIdx: 2,
      steadyState: [] as number[],
      stepsDisplay: '0',

      get speedMs() {
        const ms = [1000, 500, 250, 125, 60];
        return ms[this.speedIdx] || 250;
      },

      get speedMsLabel() {
        return this.speedMs + 'ms';
      },

      speedUp() {
        if (this.speedIdx < 4) this.speedIdx++;
      },

      speedDown() {
        if (this.speedIdx > 0) this.speedIdx--;
      },

      init() {
        const self = this;
        const tryInit = () => {
          diagramCanvas = document.getElementById('markov-diagram') as HTMLCanvasElement | null;
          if (!diagramCanvas || diagramCanvas.getBoundingClientRect().width === 0) {
            requestAnimationFrame(tryInit);
            return;
          }
          const dpr = window.devicePixelRatio || 1;
          const rect = diagramCanvas.getBoundingClientRect();
          diagramCanvas.width = rect.width * dpr;
          diagramCanvas.height = rect.height * dpr;
          diagramCtx = diagramCanvas.getContext('2d');
          if (diagramCtx) diagramCtx.scale(dpr, dpr);
          self.recalc();
          self.draw();
        };
        requestAnimationFrame(tryInit);
      },

      recalc() {
        this.steadyState = computeSteadyState(this.matrix);
      },

      draw() {
        drawDiagram(this.matrix, this.current, this.visits);
        updateHist(this.visits, this.totalSteps);
      },

      reset() {
        this.stop();
        this.current = 0;
        this.visits = new Array(STATES).fill(0);
        this.totalSteps = 0;
        this.stepsDisplay = '0';
        this.draw();
      },

      start() {
        if (this.running) return;
        this.running = true;
        const self = this;
        const doStep = () => {
          if (!self.running) return;
          // Inline the step logic to avoid proxy issues
          const prev = self.current;
          const row = self.matrix[prev];
          let r = Math.random();
          let next = 0;
          for (let j = 0; j < STATES; j++) {
            r -= row[j];
            if (r <= 0) { next = j; break; }
          }
          self.current = next;
          const v = [...self.visits];
          v[next]++;
          self.visits = v;
          self.totalSteps++;
          self.stepsDisplay = String(self.totalSteps);
          triggerPulse(self.matrix, self.current, self.visits, prev);
          updateHist(self.visits, self.totalSteps);

          walkTimer = setTimeout(doStep, self.speedMs);
        };
        doStep();
      },

      stop() {
        this.running = false;
        if (walkTimer) { clearTimeout(walkTimer); walkTimer = null; }
      },

      setTransition(i: number, j: number, val: string) {
        const v = parseFloat(val) || 0;
        const old = this.matrix[i][j];
        const diff = v - old;
        this.matrix[i][j] = v;

        // Redistribute diff across other entries in row i
        const others = [];
        for (let k = 0; k < STATES; k++) {
          if (k !== j && this.matrix[i][k] > 0.01) others.push(k);
        }
        if (others.length > 0) {
          const each = diff / others.length;
          others.forEach(k => {
            this.matrix[i][k] = Math.max(0, this.matrix[i][k] - each);
          });
        }

        // Normalize
        let sum = 0;
        for (let k = 0; k < STATES; k++) sum += this.matrix[i][k];
        if (sum > 0) {
          for (let k = 0; k < STATES; k++) this.matrix[i][k] /= sum;
        }

        this.recalc();
        this.draw();
      },
    };
  });
}
