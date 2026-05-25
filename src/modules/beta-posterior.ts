// beta-posterior page
import type { Alpine } from 'alpinejs';

export default function (Alpine: Alpine) {
  Alpine.data('bayesBeta', () => {
    const GRID_STEP = 1 / 200;
    const TOTAL_FLIPS = 150;
    const TICK_MS = 125;
    const TOSS_COLS = 50;
    const grid: number[] = [];
    for (let v = 0; v <= 1.001; v += GRID_STEP) grid.push(v);

    const factorialMemo: number[] = [];
    function factorial(m: number): number {
      if (m === 0 || m === 1) return 1;
      if (factorialMemo[m] > 0) return factorialMemo[m];
      factorialMemo[m] = factorial(m - 1) * m;
      return factorialMemo[m];
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let d3svg: any = null;
    let d3tossSvg: any = null;
    let xScale: any = null;
    let yScale: any = null;
    let lineFn: any = null;
    let ymax = 8;

    return {
      bias: '0.5',
      running: false,
      n: 0,
      heads: 0,
      tails: 0,
      info: '',
      tosses: [] as string[],
      data: [] as any[],

      init() {
        // @ts-ignore
        if (window.d3) {
          this.buildChart();
        } else {
          const self = this;
          const check = setInterval(() => {
            // @ts-ignore
            if (window.d3) {
              clearInterval(check);
              self.buildChart();
            }
          }, 50);
        }
      },

      destroy() {
        if (timeoutId) clearTimeout(timeoutId);
      },

      buildChart() {
        const container = document.getElementById('bayesChart');
        if (!container) return;
        container.innerHTML = '';
        const tossContainer = document.getElementById('bayesTosses');
        if (tossContainer) tossContainer.innerHTML = '';

        // @ts-ignore
        const d3 = window.d3;
        if (!d3) return;

        const isMob = window.innerWidth < 480;
        const margin = isMob
          ? { top: 15, right: 30, bottom: 60, left: 60 }
          : { top: 15, right: 50, bottom: 50, left: 50 };
        const width = (isMob ? 450 : 900) - margin.left - margin.right;
        const height = (isMob ? 380 : 500) - margin.top - margin.bottom;

        xScale = d3.scale.linear().range([0, width]).domain([0, 1]);
        yScale = d3.scale.linear().range([height, 0]).domain([0, ymax]);

        lineFn = d3.svg.line()
          .x((d: any) => xScale(d.x))
          .y((d: any) => yScale(d.y));

        const xAxis = d3.svg.axis().scale(xScale).orient('bottom');
        const yAxis = d3.svg.axis().scale(yScale).orient('left');

        d3svg = d3.select(container)
          .append('svg')
          .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
          .append('g')
          .attr('transform', `translate(${margin.left},${margin.top})`);

        d3svg.append('g')
          .attr('class', 'x axis')
          .attr('transform', `translate(0,${height})`)
          .call(xAxis);

        d3svg.append('g')
          .attr('class', 'y axis')
          .call(yAxis);

        if (tossContainer) {
          d3tossSvg = d3.select(tossContainer)
            .append('svg')
            .attr('viewBox', `0 0 ${width + margin.left + margin.right} 100`)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);
        }
      },

      start() {
        if (timeoutId) clearTimeout(timeoutId);
        // @ts-ignore
        const d3 = window.d3;
        if (!d3) return;
        if (!d3svg) this.buildChart();
        if (!d3svg) return;

        this.running = true;
        this.n = 0;
        this.heads = 0;
        this.tails = 0;
        this.tosses = [];
        this.data = [];
        this.info = '';
        ymax = 8;

        yScale.domain([0, ymax]);
        d3svg.select('.y.axis').call(d3.svg.axis().scale(yScale).orient('left'));
        d3svg.selectAll('path.trial').remove();
        if (d3tossSvg) d3tossSvg.selectAll('text').remove();

        this.data.push({
          trial: 'num0',
          info: 'flips:0 heads:0 tails:0',
          values: grid.map(d => ({ x: d, y: 1 })),
        });

        this.loop();
      },

      loop() {
        // @ts-ignore
        const d3 = window.d3;
        const self = this;
        const biasVal = parseFloat(this.bias) || 0.5;

        timeoutId = setTimeout(() => {
          self.n++;
          const coin = Math.random() < biasVal ? 'H' : 'T';
          if (coin === 'H') self.heads++;
          else self.tails++;
          self.tosses.push(coin);

          const H = self.heads;
          const n = self.n;

          function beta(theta: number) {
            const norm = (factorial(H) * factorial(n - H)) / factorial(n + 1);
            const likelihood = Math.pow(theta, H) * Math.pow(1 - theta, n - H);
            return likelihood / norm;
          }

          self.data.push({
            trial: `num${n}`,
            info: `flips:${n} heads:${H} tails:${self.tails}`,
            values: grid.map(d => ({ x: d, y: beta(d) })),
          });

          const last = self.data[self.data.length - 1];
          const peak = last.values.reduce((p: any, d: any) => d.y > p.y ? d : p);

          if (peak.y > ymax) {
            ymax = peak.y + 2;
            yScale.domain([0, ymax]);
            d3svg.select('.y.axis').transition().duration(125)
              .call(d3.svg.axis().scale(yScale).orient('left'));
            d3svg.selectAll('path.trial')
              .transition().duration(100)
              .attr('d', (d: any) => lineFn(d.values))
              .attr('class', 'trial prev');
          } else {
            d3svg.selectAll('path.trial')
              .transition().duration(100)
              .attr('class', 'trial prev');
          }

          const trials = d3svg.selectAll('path.trial').data(self.data, (d: any) => d.trial);
          trials.enter()
            .append('path')
            .attr('class', 'trial')
            .attr('d', () => lineFn(self.data[self.data.length - 2].values))
            .attr('id', (d: any) => d.trial);

          d3svg.select(`path#num${n}`)
            .transition().ease('linear').duration(100)
            .attr('d', (d: any) => lineFn(d.values));

          if (d3tossSvg) {
            const text = d3tossSvg.selectAll('.toss').data(self.tosses);
            text.enter()
              .append('text')
              .attr('class', (d: string) => d === 'H' ? 'toss heads' : 'toss tails')
              .attr('x', (_d: string, i: number) => (i % TOSS_COLS) * 14 + 120)
              .attr('y', (_d: string, i: number) => 14 + 16 * Math.floor(i / TOSS_COLS))
              .text((d: string) => d);
          }

          self.info = `mode: ${peak.x.toFixed(3)}  density: ${peak.y.toFixed(2)}  flips: ${n}  H: ${H}  T: ${self.tails}`;

          if (self.n < TOTAL_FLIPS) {
            self.loop();
          } else {
            d3svg.select(`path#num${n}`).classed('final', true);
            self.running = false;
          }
        }, TICK_MS);
      },
    };
  });
}
