// rv page
import type { Alpine } from 'alpinejs';
import { Chart } from 'chart.js';
import { makeScriptableGrad } from './shared/chart';

function createStripePattern(color: string, bgColor: string = 'transparent'): CanvasPattern | string {
  const size = 8;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return color;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, size);
  ctx.lineTo(size, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-size / 2, size / 2);
  ctx.lineTo(size / 2, -size / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(size / 2, size + size / 2);
  ctx.lineTo(size + size / 2, size / 2);
  ctx.stroke();
  const pattern = ctx.createPattern(c, 'repeat');
  return pattern || color;
}

export default (Alpine: Alpine) => {
  // Random Variables reference
  Alpine.data('rvViz', () => {
    let rvChart: Chart | null = null;

    interface RVDef {
      name: string;
      type: 'discrete' | 'continuous';
      params: { key: string; label: string; min: number; max: number; step: number; default: number }[];
      pmf?: (k: number, p: Record<string, number>) => number;
      pdf?: (x: number, p: Record<string, number>) => number;
      range: (p: Record<string, number>) => [number, number];
      mean: (p: Record<string, number>) => string;
      variance: (p: Record<string, number>) => string;
      formula: string;
      description: string;
    }

    function fact(n: number): number { if (n <= 1) return 1; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
    function logFact(n: number): number { let r = 0; for (let i = 2; i <= n; i++) r += Math.log(i); return r; }
    function comb(n: number, k: number): number { if (k < 0 || k > n) return 0; return Math.exp(logFact(n) - logFact(k) - logFact(n - k)); }
    function gamma(z: number): number {
      if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
      z -= 1;
      const g = 7; const c = [0.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
      let x = c[0]; for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
      const t = z + g + 0.5;
      return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
    }
    function normalPdfRV(x: number, mu: number, sigma: number): number {
      return (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - mu) / sigma) ** 2);
    }

    const dists: Record<string, RVDef> = {
      // DISCRETE
      bernoulli: { name: 'Bernoulli', type: 'discrete',
        params: [{ key: 'p', label: 'p', min: 0.01, max: 0.99, step: 0.01, default: 0.5 }],
        pmf: (k, p) => k === 0 ? 1 - p.p : k === 1 ? p.p : 0,
        range: () => [-0.5, 1.5],
        mean: (p) => `${p.p.toFixed(2)}`, variance: (p) => `${(p.p * (1 - p.p)).toFixed(4)}`,
        formula: 'ℙ(X=k) = p^k (1−p)^(1−k),  k ∈ {0, 1}\n𝔼[X] = p\n𝕍(X) = p(1−p)',
        description: 'A single trial with two outcomes: success (1) with probability p, or failure (0) with probability 1−p. The simplest nontrivial random variable, and the building block for binomial, geometric, and many other distributions. Indicator random variables are Bernoulli RVs that track whether an event A occurs.',
      },
      binomial: { name: 'Binomial', type: 'discrete',
        params: [{ key: 'n', label: 'n', min: 1, max: 50, step: 1, default: 10 }, { key: 'p', label: 'p', min: 0.01, max: 0.99, step: 0.01, default: 0.5 }],
        pmf: (k, p) => k < 0 || k > p.n || k !== Math.floor(k) ? 0 : comb(p.n, k) * Math.pow(p.p, k) * Math.pow(1 - p.p, p.n - k),
        range: (p) => [-0.5, p.n + 0.5],
        mean: (p) => `${(p.n * p.p).toFixed(2)}`, variance: (p) => `${(p.n * p.p * (1 - p.p)).toFixed(4)}`,
        formula: 'ℙ(X=k) = C(n,k) p^k (1−p)^(n−k),  k = 0,1,…,n\n𝔼[X] = np\n𝕍(X) = np(1−p)',
        description: 'The number of successes in n independent Bernoulli trials, each with success probability p. As n grows, the binomial approaches a normal distribution (De Moivre-Laplace theorem). For large n and small p, it can be approximated by a Poisson with λ = np.',
      },
      geometric: { name: 'Geometric', type: 'discrete',
        params: [{ key: 'p', label: 'p', min: 0.01, max: 0.99, step: 0.01, default: 0.3 }],
        pmf: (k, p) => k < 1 || k !== Math.floor(k) ? 0 : Math.pow(1 - p.p, k - 1) * p.p,
        range: () => [0.5, 20.5],
        mean: (p) => `${(1 / p.p).toFixed(2)}`, variance: (p) => `${((1 - p.p) / (p.p * p.p)).toFixed(2)}`,
        formula: 'ℙ(X=k) = (1−p)^(k−1) p,  k = 1,2,3,…\n𝔼[X] = 1/p\n𝕍(X) = (1−p)/p²',
        description: 'Number of independent trials until the first success. The only discrete distribution with the memorylessness property: past failures give no information about how many more trials are needed. Interarrival times in a Bernoulli process follow a geometric distribution.',
      },
      pascal: { name: 'Pascal', type: 'discrete',
        params: [{ key: 'r', label: 'r', min: 1, max: 10, step: 1, default: 3 }, { key: 'p', label: 'p', min: 0.01, max: 0.99, step: 0.01, default: 0.4 }],
        pmf: (k, p) => k < p.r || k !== Math.floor(k) ? 0 : comb(k - 1, p.r - 1) * Math.pow(p.p, p.r) * Math.pow(1 - p.p, k - p.r),
        range: (p) => [p.r - 0.5, p.r + 25],
        mean: (p) => `${(p.r / p.p).toFixed(2)}`, variance: (p) => `${(p.r * (1 - p.p) / (p.p * p.p)).toFixed(2)}`,
        formula: 'ℙ(X=k) = C(k−1,r−1) p^r (1−p)^(k−r),  k = r,r+1,…\n𝔼[X] = r/p\n𝕍(X) = r(1−p)/p²',
        description: 'Also called the negative binomial. The number of trials until the rth success. It is the sum of r independent geometric random variables, making it a natural generalization. In queueing theory, it models the time of the kth arrival in a Bernoulli process.',
      },
      poisson: { name: 'Poisson', type: 'discrete',
        params: [{ key: 'lam', label: 'λ', min: 0.1, max: 20, step: 0.1, default: 4 }],
        pmf: (k, p) => k < 0 || k !== Math.floor(k) ? 0 : Math.exp(-p.lam + k * Math.log(p.lam) - logFact(k)),
        range: (p) => [-0.5, Math.max(15, p.lam * 3)],
        mean: (p) => `${p.lam.toFixed(1)}`, variance: (p) => `${p.lam.toFixed(1)}`,
        formula: 'ℙ(X=k) = (λ^k e^−λ) / k!,  k = 0,1,2,…\n𝔼[X] = λ\n𝕍(X) = λ',
        description: 'The count of events in a fixed time interval for a Poisson process with rate λ. Uniquely, its mean and variance are equal. It approximates a binomial when n is large and p is small, with λ = np. First applied by Bortkiewicz (1898) to deaths from horse kicks in the Prussian army.',
      },
      duniform: { name: 'Discrete Uniform', type: 'discrete',
        params: [{ key: 'a', label: 'a', min: 0, max: 10, step: 1, default: 1 }, { key: 'b', label: 'b', min: 1, max: 20, step: 1, default: 6 }],
        pmf: (k, p) => k < p.a || k > p.b || k !== Math.floor(k) ? 0 : 1 / (p.b - p.a + 1),
        range: (p) => [p.a - 0.5, p.b + 0.5],
        mean: (p) => `${((p.a + p.b) / 2).toFixed(1)}`, variance: (p) => `${((Math.pow(p.b - p.a + 1, 2) - 1) / 12).toFixed(2)}`,
        formula: 'ℙ(X=k) = 1/(b−a+1),  k = a,a+1,…,b\n𝔼[X] = (a+b)/2\n𝕍(X) = ((b−a+1)²−1)/12',
        description: 'Each integer in [a,b] has equal probability. Models situations with no reason to prefer one outcome over another. A fair die is Uniform(1,6). The special case where a = b gives a deterministic (constant) random variable.',
      },
      hypergeometric: { name: 'Hypergeometric', type: 'discrete',
        params: [{ key: 'N', label: 'N', min: 10, max: 60, step: 1, default: 30 }, { key: 'K', label: 'K', min: 1, max: 30, step: 1, default: 10 }, { key: 'n', label: 'n', min: 1, max: 30, step: 1, default: 8 }],
        pmf: (k, p) => { const K = Math.min(p.K, p.N); const n = Math.min(p.n, p.N); if (k < Math.max(0, n + K - p.N) || k > Math.min(n, K) || k !== Math.floor(k)) return 0; return comb(K, k) * comb(p.N - K, n - k) / comb(p.N, n); },
        range: (p) => [-0.5, Math.min(p.n, p.K) + 0.5],
        mean: (p) => `${(p.n * p.K / p.N).toFixed(2)}`, variance: (p) => { const f = (p.N - p.n) / (p.N - 1); return `${(p.n * p.K / p.N * (1 - p.K / p.N) * f).toFixed(2)}`; },
        formula: 'ℙ(X=k) = C(K,k)·C(N−K,n−k) / C(N,n)\n𝔼[X] = nK/N\n𝕍(X) = n(K/N)(1−K/N)(N−n)/(N−1)',
        description: 'The number of successes when drawing n items without replacement from a population of N, where K are marked as successes. Unlike the binomial, draws are dependent. Approaches the binomial as N → ∞. Common in card games and quality inspection sampling.',
      },
      categorical: { name: 'Categorical', type: 'discrete',
        params: [{ key: 'k', label: 'outcomes', min: 2, max: 8, step: 1, default: 4 }],
        pmf: (k, p) => k < 1 || k > p.k || k !== Math.floor(k) ? 0 : 1 / p.k,
        range: (p) => [0.5, p.k + 0.5],
        mean: (p) => `${((p.k + 1) / 2).toFixed(1)}`, variance: (p) => `${(((Math.pow(p.k, 2)) - 1) / 12).toFixed(2)}`,
        formula: 'ℙ(X=i) = pᵢ,  Σpᵢ = 1\n(shown as uniform 1/k)\n𝔼[X] = Σ i·pᵢ',
        description: 'A generalization of the Bernoulli to k possible outcomes, each with its own probability. Rolling a die, classifying into categories, or any experiment with more than two outcomes. The multinomial distribution extends this to repeated categorical trials.',
      },
      zipf: { name: 'Zipf', type: 'discrete',
        params: [{ key: 's', label: 's', min: 0.5, max: 3, step: 0.1, default: 1 }, { key: 'N', label: 'N', min: 5, max: 30, step: 1, default: 15 }],
        pmf: (k, p) => { if (k < 1 || k > p.N || k !== Math.floor(k)) return 0; let H = 0; for (let i = 1; i <= p.N; i++) H += 1 / Math.pow(i, p.s); return 1 / (Math.pow(k, p.s) * H); },
        range: (p) => [0.5, p.N + 0.5],
        mean: (p) => { let H = 0, Hm = 0; for (let i = 1; i <= p.N; i++) { H += 1 / Math.pow(i, p.s); Hm += i / Math.pow(i, p.s); } return `${(Hm / H).toFixed(2)}`; },
        variance: (p) => '—',
        formula: 'ℙ(X=k) = (1/k^s) / H(N,s)\nH(N,s) = Σᵢ(1/i^s)',
        description: 'A power-law distribution where the kth most common item has frequency proportional to 1/k^s. Originally observed in word frequencies (Zipf\'s law), it also appears in city populations, website traffic, and wealth distributions. The heavy tail means a few items dominate.',
      },
      // CONTINUOUS
      uniform: { name: 'Continuous Uniform', type: 'continuous',
        params: [{ key: 'a', label: 'a', min: -5, max: 5, step: 0.5, default: 0 }, { key: 'b', label: 'b', min: -5, max: 10, step: 0.5, default: 1 }],
        pdf: (x, p) => x >= p.a && x <= p.b ? 1 / (p.b - p.a) : 0,
        range: (p) => [p.a - 1, p.b + 1],
        mean: (p) => `${((p.a + p.b) / 2).toFixed(2)}`, variance: (p) => `${(Math.pow(p.b - p.a, 2) / 12).toFixed(4)}`,
        formula: 'f(x) = 1/(b−a),  a ≤ x ≤ b\n𝔼[X] = (a+b)/2\n𝕍(X) = (b−a)²/12',
        description: 'Constant probability density over a continuous interval [a,b]. Every sub-interval of the same length has the same probability. The simplest continuous distribution, often used as a non-informative prior or to model complete ignorance within a known range.',
      },
      exponential: { name: 'Exponential', type: 'continuous',
        params: [{ key: 'lam', label: 'λ', min: 0.1, max: 5, step: 0.1, default: 1 }],
        pdf: (x, p) => x < 0 ? 0 : p.lam * Math.exp(-p.lam * x),
        range: (p) => [0, Math.max(5, 5 / p.lam)],
        mean: (p) => `${(1 / p.lam).toFixed(2)}`, variance: (p) => `${(1 / (p.lam * p.lam)).toFixed(4)}`,
        formula: 'f(x) = λe^(−λx),  x ≥ 0\n𝔼[X] = 1/λ\n𝕍(X) = 1/λ²',
        description: 'The time between consecutive arrivals in a Poisson process. The only continuous distribution with the memorylessness property: knowing you have already waited t units tells you nothing about how much longer you will wait. The continuous analog of the geometric distribution.',
      },
      normal: { name: 'Normal', type: 'continuous',
        params: [{ key: 'mu', label: 'μ', min: -5, max: 5, step: 0.1, default: 0 }, { key: 'sigma', label: 'σ', min: 0.1, max: 4, step: 0.1, default: 1 }],
        pdf: (x, p) => normalPdfRV(x, p.mu, p.sigma),
        range: (p) => [p.mu - 4 * p.sigma, p.mu + 4 * p.sigma],
        mean: (p) => `${p.mu.toFixed(2)}`, variance: (p) => `${(Math.pow(p.sigma, 2)).toFixed(4)}`,
        formula: 'f(x) = (1/σ√2π) exp(−(x−μ)²/2σ²)\n𝔼[X] = μ\n𝕍(X) = σ²',
        description: 'The Gaussian bell curve, the most important distribution in probability. The central limit theorem guarantees that sums of independent random variables converge to a normal regardless of the original distribution. Preserved under linear transformation and summation. When a quantity is influenced by many small independent factors, a normal model is natural.',
      },
      erlang: { name: 'Erlang', type: 'continuous',
        params: [{ key: 'k', label: 'k', min: 1, max: 15, step: 1, default: 3 }, { key: 'lam', label: 'λ', min: 0.1, max: 5, step: 0.1, default: 1 }],
        pdf: (x, p) => x < 0 ? 0 : (Math.pow(p.lam, p.k) * Math.pow(x, p.k - 1) * Math.exp(-p.lam * x)) / fact(p.k - 1),
        range: (p) => [0, Math.max(8, (p.k + 3 * Math.sqrt(p.k)) / p.lam)],
        mean: (p) => `${(p.k / p.lam).toFixed(2)}`, variance: (p) => `${(p.k / (p.lam * p.lam)).toFixed(4)}`,
        formula: 'f(x) = λ^k x^(k−1) e^(−λx) / (k−1)!\n𝔼[X] = k/λ\n𝕍(X) = k/λ²',
        description: 'The time until the kth arrival in a Poisson process with rate λ. Equivalently, the sum of k independent exponential random variables. Developed by Agner Erlang in 1909 to analyze telephone switchboard capacity. A special case of the Gamma distribution with integer shape parameter.',
      },
      gammaD: { name: 'Gamma', type: 'continuous',
        params: [{ key: 'alpha', label: 'α', min: 0.5, max: 10, step: 0.5, default: 2 }, { key: 'beta', label: 'β', min: 0.1, max: 5, step: 0.1, default: 1 }],
        pdf: (x, p) => x <= 0 ? 0 : (Math.pow(p.beta, p.alpha) / gamma(p.alpha)) * Math.pow(x, p.alpha - 1) * Math.exp(-p.beta * x),
        range: (p) => [0, Math.max(8, (p.alpha + 3 * Math.sqrt(p.alpha)) / p.beta)],
        mean: (p) => `${(p.alpha / p.beta).toFixed(2)}`, variance: (p) => `${(p.alpha / (p.beta * p.beta)).toFixed(4)}`,
        formula: 'f(x) = (β^α / Γ(α)) x^(α−1) e^(−βx)\n𝔼[X] = α/β\n𝕍(X) = α/β²',
        description: 'A flexible family for positive-valued data that unifies the exponential (α = 1) and Erlang (integer α) distributions. The shape parameter α controls skewness: small α gives exponential-like decay, large α approaches a symmetric bell. Common in reliability analysis and Bayesian statistics as a conjugate prior for the Poisson rate.',
      },
      beta: { name: 'Beta', type: 'continuous',
        params: [{ key: 'alpha', label: 'α', min: 0.1, max: 10, step: 0.1, default: 2 }, { key: 'beta', label: 'β', min: 0.1, max: 10, step: 0.1, default: 5 }],
        pdf: (x, p) => { if (x <= 0 || x >= 1) return 0; const B = gamma(p.alpha) * gamma(p.beta) / gamma(p.alpha + p.beta); return Math.pow(x, p.alpha - 1) * Math.pow(1 - x, p.beta - 1) / B; },
        range: () => [-0.05, 1.05],
        mean: (p) => `${(p.alpha / (p.alpha + p.beta)).toFixed(4)}`, variance: (p) => `${(p.alpha * p.beta / (Math.pow(p.alpha + p.beta, 2) * (p.alpha + p.beta + 1))).toFixed(4)}`,
        formula: 'f(x) = x^(α−1)(1−x)^(β−1) / B(α,β)\n𝔼[X] = α/(α+β)\n𝕍(X) = αβ/((α+β)²(α+β+1))',
        description: 'Defined on [0,1], extremely flexible: uniform when α = β = 1, U-shaped when both < 1, bell-shaped when both > 1, skewed otherwise. The conjugate prior for Bernoulli and binomial likelihoods, making it central to Bayesian inference. If you observe k heads in n flips with a Beta(α,β) prior, the posterior is Beta(α+k, β+n−k).',
      },
      lognormal: { name: 'Log-Normal', type: 'continuous',
        params: [{ key: 'mu', label: 'μ', min: -2, max: 2, step: 0.1, default: 0 }, { key: 'sigma', label: 'σ', min: 0.1, max: 2, step: 0.1, default: 0.5 }],
        pdf: (x, p) => x <= 0 ? 0 : (1 / (x * p.sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-(Math.pow(Math.log(x) - p.mu, 2)) / (2 * Math.pow(p.sigma, 2))),
        range: (p) => [0, Math.exp(p.mu + 3 * p.sigma)],
        mean: (p) => `${Math.exp(p.mu + Math.pow(p.sigma, 2) / 2).toFixed(4)}`, variance: (p) => `${((Math.exp(Math.pow(p.sigma, 2)) - 1) * Math.exp(2 * p.mu + Math.pow(p.sigma, 2))).toFixed(4)}`,
        formula: 'f(x) = (1/xσ√2π) exp(−(ln x−μ)²/2σ²)\n𝔼[X] = exp(μ + σ²/2)\n𝕍(X) = (e^σ²−1)·e^(2μ+σ²)',
        description: 'If the logarithm of X is normally distributed, then X is log-normal. Arises naturally in multiplicative processes where many small independent factors combine. Models stock prices (geometric Brownian motion), income distributions, particle sizes, and biological measurements. Always positive and right-skewed.',
      },
      chisquared: { name: 'Chi-Squared', type: 'continuous',
        params: [{ key: 'k', label: 'k (df)', min: 1, max: 20, step: 1, default: 3 }],
        pdf: (x, p) => x <= 0 ? 0 : (1 / (Math.pow(2, p.k / 2) * gamma(p.k / 2))) * Math.pow(x, p.k / 2 - 1) * Math.exp(-x / 2),
        range: (p) => [0, Math.max(10, p.k + 4 * Math.sqrt(2 * p.k))],
        mean: (p) => `${p.k}`, variance: (p) => `${2 * p.k}`,
        formula: 'f(x) = x^(k/2−1) e^(−x/2) / (2^(k/2) Γ(k/2))\n𝔼[X] = k\n𝕍(X) = 2k',
        description: 'The sum of k squared independent standard normal random variables: χ²ₖ = Z₁² + Z₂² + ⋯ + Zₖ². A special case of the Gamma distribution with α = k/2 and β = 1/2. Central to hypothesis testing (goodness-of-fit, independence tests) and constructing confidence intervals for variance.',
      },
      studentt: { name: 't-distribution', type: 'continuous',
        params: [{ key: 'nu', label: 'ν (df)', min: 1, max: 30, step: 1, default: 5 }],
        pdf: (x, p) => { const v = p.nu; return (gamma((v + 1) / 2) / (Math.sqrt(v * Math.PI) * gamma(v / 2))) * Math.pow(1 + x * x / v, -(v + 1) / 2); },
        range: () => [-6, 6],
        mean: (p) => p.nu > 1 ? '0' : '∄', variance: (p) => p.nu > 2 ? `${(p.nu / (p.nu - 2)).toFixed(4)}` : p.nu > 1 ? '∞' : '∄',
        formula: 'f(x) = Γ((ν+1)/2) / (√(νπ)Γ(ν/2)) · (1+x²/ν)^(−(ν+1)/2)\n𝔼[X] = 0 (ν > 1)\n𝕍(X) = ν/(ν−2) (ν > 2)',
        description: 'When estimating the mean with unknown variance, the normalized statistic Tₙ = √n(Θ̂ₙ−θ)/Sₙ is not normal because Sₙ is itself random. Its exact distribution is the t-distribution with n−1 degrees of freedom: symmetric and bell-shaped like the normal, but more spread out with heavier tails. As ν → ∞ it converges to N(0,1). Published in 1908 by William Gosset under the pseudonym "Student" while working at the Guinness brewery in Dublin on barley yield analysis with small samples.',
      },
      cauchy: { name: 'Cauchy', type: 'continuous',
        params: [{ key: 'x0', label: 'x₀', min: -5, max: 5, step: 0.5, default: 0 }, { key: 'gam', label: 'γ', min: 0.1, max: 5, step: 0.1, default: 1 }],
        pdf: (x, p) => 1 / (Math.PI * p.gam * (1 + Math.pow((x - p.x0) / p.gam, 2))),
        range: (p) => [p.x0 - 10 * p.gam, p.x0 + 10 * p.gam],
        mean: () => '∄', variance: () => '∄',
        formula: 'f(x) = 1 / (πγ(1 + ((x−x₀)/γ)²))\n𝔼[X] ∄ (diverges)\n𝕍(X) ∄ (diverges)',
        description: 'A pathological distribution whose tails are so heavy that neither the mean nor the variance exist. The integral for 𝔼[X] diverges. It is the distribution of the ratio of two independent standard normals, and a Student\'s t with ν = 1. Serves as an important counterexample to theorems that require finite moments.',
      },
      weibull: { name: 'Weibull', type: 'continuous',
        params: [{ key: 'k', label: 'k', min: 0.5, max: 5, step: 0.1, default: 1.5 }, { key: 'lam', label: 'λ', min: 0.5, max: 5, step: 0.1, default: 1 }],
        pdf: (x, p) => x < 0 ? 0 : (p.k / p.lam) * Math.pow(x / p.lam, p.k - 1) * Math.exp(-Math.pow(x / p.lam, p.k)),
        range: (p) => [0, p.lam * 3],
        mean: (p) => `${(p.lam * gamma(1 + 1 / p.k)).toFixed(4)}`, variance: (p) => `${(Math.pow(p.lam, 2) * (gamma(1 + 2 / p.k) - Math.pow(gamma(1 + 1 / p.k), 2))).toFixed(4)}`,
        formula: 'f(x) = (k/λ)(x/λ)^(k−1) exp(−(x/λ)^k)\n𝔼[X] = λΓ(1+1/k)\n𝕍(X) = λ²[Γ(1+2/k)−Γ²(1+1/k)]',
        description: 'A flexible model for time-to-failure in reliability engineering. The shape parameter k controls the hazard rate: k < 1 means the failure rate decreases over time (early failures), k = 1 reduces to the exponential (constant rate), and k > 1 means the failure rate increases (wear-out). Generalizes both the exponential and Rayleigh distributions.',
      },
      pareto: { name: 'Pareto', type: 'continuous',
        params: [{ key: 'alpha', label: 'α', min: 0.5, max: 5, step: 0.1, default: 2 }, { key: 'xm', label: 'xₘ', min: 0.5, max: 5, step: 0.5, default: 1 }],
        pdf: (x, p) => x < p.xm ? 0 : p.alpha * Math.pow(p.xm, p.alpha) / Math.pow(x, p.alpha + 1),
        range: (p) => [0, p.xm * 8],
        mean: (p) => p.alpha > 1 ? `${(p.alpha * p.xm / (p.alpha - 1)).toFixed(4)}` : '∞',
        variance: (p) => p.alpha > 2 ? `${(Math.pow(p.xm, 2) * p.alpha / (Math.pow(p.alpha - 1, 2) * (p.alpha - 2))).toFixed(4)}` : '∞',
        formula: 'f(x) = αxₘ^α / x^(α+1),  x ≥ xₘ\n𝔼[X] = αxₘ/(α−1) (α > 1)\n𝕍(X) = xₘ²α/((α−1)²(α−2)) (α > 2)',
        description: 'A power-law distribution where a few values are extremely large while most are small. The basis of the "80/20 rule" (Pareto principle): roughly 80% of effects come from 20% of causes. Models wealth distribution, city sizes, file sizes, and earthquake magnitudes. For α ≤ 2 the variance is infinite; for α ≤ 1 even the mean diverges.',
      },
      rayleigh: { name: 'Rayleigh', type: 'continuous',
        params: [{ key: 'sigma', label: 'σ', min: 0.1, max: 5, step: 0.1, default: 1 }],
        pdf: (x, p) => x < 0 ? 0 : (x / (Math.pow(p.sigma, 2))) * Math.exp(-Math.pow(x, 2) / (2 * Math.pow(p.sigma, 2))),
        range: (p) => [0, p.sigma * 5],
        mean: (p) => `${(p.sigma * Math.sqrt(Math.PI / 2)).toFixed(4)}`, variance: (p) => `${((2 - Math.PI / 2) * Math.pow(p.sigma, 2)).toFixed(4)}`,
        formula: 'f(x) = (x/σ²) exp(−x²/2σ²)\n𝔼[X] = σ√(π/2)\n𝕍(X) = σ²(2−π/2)',
        description: 'The distribution of the distance from the origin when both coordinates are independent normals with the same variance: R = √(X² + Y²). A special case of the Weibull with k = 2. Models the magnitude of 2D noise vectors, wind speed, wave heights, and radar signal envelopes.',
      },
      laplace: { name: 'Laplace', type: 'continuous',
        params: [{ key: 'mu', label: 'μ', min: -5, max: 5, step: 0.5, default: 0 }, { key: 'b', label: 'b', min: 0.1, max: 5, step: 0.1, default: 1 }],
        pdf: (x, p) => (1 / (2 * p.b)) * Math.exp(-Math.abs(x - p.mu) / p.b),
        range: (p) => [p.mu - 6 * p.b, p.mu + 6 * p.b],
        mean: (p) => `${p.mu.toFixed(2)}`, variance: (p) => `${(2 * Math.pow(p.b, 2)).toFixed(4)}`,
        formula: 'f(x) = (1/2b) exp(−|x−μ|/b)\n𝔼[X] = μ\n𝕍(X) = 2b²',
        description: 'Also called the double exponential. Symmetric around μ with a sharper peak and heavier tails than the normal. The difference of two independent exponential random variables follows a Laplace distribution. Used in robust statistics and as a sparsity-promoting prior in Bayesian methods (LASSO regularization).',
      },
      logistic: { name: 'Logistic', type: 'continuous',
        params: [{ key: 'mu', label: 'μ', min: -5, max: 5, step: 0.5, default: 0 }, { key: 's', label: 's', min: 0.1, max: 3, step: 0.1, default: 1 }],
        pdf: (x, p) => { const e = Math.exp(-(x - p.mu) / p.s); return e / (p.s * Math.pow(1 + e, 2)); },
        range: (p) => [p.mu - 8 * p.s, p.mu + 8 * p.s],
        mean: (p) => `${p.mu.toFixed(2)}`, variance: (p) => `${((Math.pow(Math.PI, 2) * Math.pow(p.s, 2)) / 3).toFixed(4)}`,
        formula: 'f(x) = e^(−(x−μ)/s) / (s(1+e^(−(x−μ)/s))²)\n𝔼[X] = μ\n𝕍(X) = s²π²/3',
        description: 'Symmetric and bell-shaped like the normal, but with slightly heavier tails. Its CDF is the logistic (sigmoid) function 1/(1+e^(−x)), which is central to logistic regression and neural network activations. Models growth processes that saturate, dose-response relationships, and any phenomenon with an S-shaped cumulative behavior.',
      },
    };

    const discreteKeys = Object.keys(dists).filter(k => dists[k].type === 'discrete');
    const continuousKeys = Object.keys(dists).filter(k => dists[k].type === 'continuous');

    let polarAnimId: number | null = null;

    function renderPolar(distKey: string, paramVals: Record<string, number>) {
      if (polarAnimId) { cancelAnimationFrame(polarAnimId); polarAnimId = null; }
      const canvas = document.getElementById('rv-polar') as HTMLCanvasElement | null;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = rect.width;
      const H = rect.height;
      ctx.clearRect(0, 0, W, H);

      const cx = W / 2;
      const cy = H / 2;
      const maxR = Math.min(cx, cy) - 20;

      if (distKey === 'rayleigh') {
        const sigma = paramVals.sigma || 1;
        const points: [number, number][] = [];
        for (let i = 0; i < 400; i++) {
          const u1 = Math.random(), u2 = Math.random();
          const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma;
          const z2 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2) * sigma;
          points.push([z1, z2]);
        }
        const scale = maxR / (4 * sigma);

        // Static elements: rings, axes, labels
        ctx.strokeStyle = 'rgba(58,26,10,0.5)';
        ctx.lineWidth = 0.5;
        for (let r = 1; r <= 3; r++) {
          ctx.beginPath();
          ctx.arc(cx, cy, r * sigma * scale, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#7a5a3a';
          ctx.font = '10px system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(`${r}σ`, cx + r * sigma * scale + 3, cy - 3);
        }
        ctx.strokeStyle = 'rgba(58,26,10,0.3)';
        ctx.beginPath();
        ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy);
        ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR);
        ctx.stroke();
        ctx.fillStyle = '#b89470';
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('R = √(X²+Y²) ~ Rayleigh(σ)', cx, H - 6);

        // Animate points appearing
        let shown = 0;
        const perFrame = 6;
        const tick = () => {
          const end = Math.min(shown + perFrame, points.length);
          for (let i = shown; i < end; i++) {
            const [x, y] = points[i];
            ctx.fillStyle = 'rgba(240,216,168,0.3)';
            ctx.beginPath();
            ctx.arc(cx + x * scale, cy - y * scale, 2, 0, Math.PI * 2);
            ctx.fill();
            if (i < 15) {
              ctx.strokeStyle = 'rgba(240,120,88,0.4)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(cx, cy);
              ctx.lineTo(cx + x * scale, cy - y * scale);
              ctx.stroke();
            }
          }
          shown = end;
          if (shown < points.length) {
            polarAnimId = requestAnimationFrame(tick);
          } else {
            polarAnimId = null;
          }
        };
        polarAnimId = requestAnimationFrame(tick);
      }

      if (distKey === 'cauchy') {
        const gam = paramVals.gam || 1;
        const circR = maxR * 0.6;
        const lineY = cy + circR + 30;

        // Static: semicircle, line, labels, center
        ctx.strokeStyle = '#b89470';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, circR, Math.PI, 0);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(58,26,10,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(20, lineY);
        ctx.lineTo(W - 20, lineY);
        ctx.stroke();
        ctx.fillStyle = '#f0d8a8';
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#b89470';
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('uniform angle θ', cx, cy - circR - 8);
        ctx.fillText('tan(θ) ~ Cauchy', cx, lineY + 16);
        ctx.fillStyle = '#7a5a3a';
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillText('angles near ±π/2 → extreme values', cx, lineY + 30);

        // Animate projections one by one
        const angles: number[] = [];
        for (let i = 0; i < 25; i++) {
          angles.push(Math.PI * (0.05 + 0.9 * Math.random()));
        }
        angles.sort();

        let shown = 0;
        const tick = () => {
          if (shown >= angles.length) { polarAnimId = null; return; }
          const a = angles[shown];
          const i = shown;
          const px = cx + circR * Math.cos(a);
          const py = cy - circR * Math.sin(a);
          const projX = cx + circR / Math.tan(a) * gam;

          ctx.fillStyle = '#f0d8a8';
          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fill();

          // Projection line
          const clampedProjX = Math.max(20, Math.min(W - 20, projX));
          ctx.strokeStyle = i % 3 === 0 ? 'rgba(240,120,88,0.35)' : 'rgba(184,148,112,0.15)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(clampedProjX, lineY);
          ctx.stroke();

          // Point on line
          ctx.fillStyle = i % 3 === 0 ? '#f07858' : 'rgba(240,216,168,0.4)';
          ctx.beginPath();
          ctx.arc(clampedProjX, lineY, 2.5, 0, Math.PI * 2);
          ctx.fill();

          shown++;
          polarAnimId = window.setTimeout(() => {
            polarAnimId = requestAnimationFrame(tick) as any;
          }, 60) as any;
        };
        polarAnimId = requestAnimationFrame(tick);
      }
    }

    function renderChart(distKey: string, paramVals: Record<string, number>) {
      const d = dists[distKey];
      if (!d) return;

      const canvas = document.getElementById('rv-chart') as HTMLCanvasElement | null;
      if (!canvas) return;

      const [xMin, xMax] = d.range(paramVals);
      const datasets: any[] = [];

      // Compute extremity: how close params are to their edges (0=center, 1=edge)
      let extremity = 0;
      d.params.forEach(p => {
        const val = paramVals[p.key] ?? p.default;
        const mid = (p.min + p.max) / 2;
        const halfRange = (p.max - p.min) / 2;
        if (halfRange > 0) {
          const t = Math.abs(val - mid) / halfRange; // 0 at center, 1 at edge
          if (t > extremity) extremity = t;
        }
      });
      // Threshold: only shift color past 0.4, ramp gently
      const colorT = extremity < 0.4 ? 0 : Math.pow((extremity - 0.4) / 0.6, 2);

      const needsRebuild = !rvChart || (d.type === 'discrete' && (rvChart.config as any).type !== 'bar') || (d.type === 'continuous' && (rvChart.config as any).type !== 'line');

      if (d.type === 'discrete' && d.pmf) {
        const ks: number[] = [];
        const vals: number[] = [];
        for (let k = Math.ceil(xMin); k <= Math.floor(xMax); k++) {
          ks.push(k);
          vals.push(d.pmf(k, paramVals));
        }

        if (needsRebuild) {
          if (rvChart) { rvChart.destroy(); rvChart = null; }
          const stripes = createStripePattern('#f0d8a8');
          rvChart = new Chart(canvas, {
            type: 'bar',
            data: { labels: ks, datasets: [{ type: 'bar', label: 'PMF', data: vals, backgroundColor: stripes, borderColor: '#f0d8a8', borderWidth: 1, barPercentage: 0.6, categoryPercentage: 0.6, borderRadius: 1 }] },
            options: {
              animation: { duration: 250, easing: 'easeOutQuart' as const },
              responsive: true, maintainAspectRatio: true, aspectRatio: 2.4,
              plugins: { legend: { display: false }, tooltip: { enabled: false } },
              scales: {
                x: { type: 'linear', min: xMin, max: xMax, ticks: { color: '#7a5a3a', stepSize: (xMax - xMin) <= 20 ? 1 : undefined }, grid: { color: '#2e1508' }, border: { color: '#3a1a0a' }, title: { display: true, text: 'k', color: '#7a5a3a' } },
                y: { min: 0, ticks: { color: '#7a5a3a' }, grid: { color: '#2e1508' }, border: { color: '#3a1a0a' }, title: { display: true, text: 'ℙ(X=k)', color: '#7a5a3a' } },
              },
            },
          });
        } else {
          // Interpolate discrete color: colonial(240,216,168) → sienna(240,120,88)
          const dr = Math.round(240 + (240 - 240) * colorT);
          const dg = Math.round(216 + (120 - 216) * colorT);
          const db = Math.round(168 + (88 - 168) * colorT);
          const dColor = `rgb(${dr},${dg},${db})`;
          rvChart!.data.labels = ks;
          rvChart!.data.datasets[0].data = vals;
          (rvChart!.data.datasets[0] as any).borderColor = dColor;
          (rvChart!.data.datasets[0] as any).backgroundColor = createStripePattern(dColor);
          (rvChart!.options.scales!.x as any).min = xMin;
          (rvChart!.options.scales!.x as any).max = xMax;
          (rvChart!.options.scales!.x as any).ticks.stepSize = (xMax - xMin) <= 20 ? 1 : undefined;
          rvChart!.update();
        }
      } else if (d.type === 'continuous' && d.pdf) {
        const data: { x: number; y: number }[] = [];
        const step = (xMax - xMin) / 300;
        for (let x = xMin; x <= xMax; x += step) {
          data.push({ x, y: d.pdf(x, paramVals) });
        }

        if (needsRebuild) {
          if (rvChart) { rvChart.destroy(); rvChart = null; }
          rvChart = new Chart(canvas, {
            type: 'line',
            data: { datasets: [{ label: 'PDF', data, borderColor: '#90b878', borderWidth: 2, pointRadius: 0, fill: true, backgroundColor: makeScriptableGrad('#90b878', 0.3, 0.01), tension: 0.3 }] },
            options: {
              animation: { duration: 250, easing: 'easeOutQuart' as const },
              responsive: true, maintainAspectRatio: true, aspectRatio: 2.4,
              plugins: { legend: { display: false }, tooltip: { enabled: false } },
              scales: {
                x: { type: 'linear', min: xMin, max: xMax, ticks: { color: '#7a5a3a' }, grid: { color: '#2e1508' }, border: { color: '#3a1a0a' }, title: { display: true, text: 'x', color: '#7a5a3a' } },
                y: { min: 0, ticks: { color: '#7a5a3a' }, grid: { color: '#2e1508' }, border: { color: '#3a1a0a' }, title: { display: true, text: 'f(x)', color: '#7a5a3a' } },
              },
            },
          });
        } else {
          // Interpolate continuous color: olivine(144,184,120) → sienna(240,120,88)
          const cr = Math.round(144 + (240 - 144) * colorT);
          const cg = Math.round(184 + (120 - 184) * colorT);
          const cb = Math.round(120 + (88 - 120) * colorT);
          const cHex = '#' + [cr, cg, cb].map(c => c.toString(16).padStart(2, '0')).join('');
          rvChart!.data.datasets[0].data = data;
          (rvChart!.data.datasets[0] as any).borderColor = cHex;
          (rvChart!.data.datasets[0] as any).backgroundColor = makeScriptableGrad(cHex, 0.3, 0.01);
          (rvChart!.options.scales!.x as any).min = xMin;
          (rvChart!.options.scales!.x as any).max = xMax;
          rvChart!.update();
        }
      }
    }

    return {
      group: 'discrete' as 'discrete' | 'continuous',
      selected: 'bernoulli',
      paramValues: {} as Record<string, number>,
      currentDist: null as RVDef | null,
      distMean: '',
      distVar: '',
      fLine0: '',
      fLine1: '',
      fLine2: '',

      init() {
        // Map slug → key
        const slugToKey: Record<string, string> = {};
        Object.keys(dists).forEach(k => {
          const slug = dists[k].name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
          slugToKey[slug] = k;
        });

        const params = new URLSearchParams(window.location.search);
        const typeParam = params.get('type');
        if (typeParam && slugToKey[typeParam]) {
          this.selectDist(slugToKey[typeParam], false);
        } else if (typeParam && dists[typeParam]) {
          this.selectDist(typeParam, false);
        } else {
          this.selectDist(this.selected, false);
        }
      },

      selectDist(key: string, updateUrl = true) {
        this.selected = key;
        const d = dists[key];
        if (!d) return;
        this.currentDist = d;
        this.group = d.type;
        const pv: Record<string, number> = {};
        d.params.forEach(p => { pv[p.key] = p.default; });
        this.paramValues = pv;
        this.updateChart();

        if (updateUrl) {
          const slug = d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
          const url = new URL(window.location.href);
          url.searchParams.set('type', slug);
          history.replaceState(null, '', url.toString());
        }
      },

      updateChart() {
        const d = dists[this.selected];
        if (!d) return;
        const lines = (d.formula || '').split('\n');
        this.fLine0 = lines[0] || '';
        this.fLine1 = lines[1] || '';
        this.fLine2 = lines[2] || '';
        this.distMean = d.mean(this.paramValues);
        this.distVar = d.variance(this.paramValues);
        renderChart(this.selected, this.paramValues);
        const self = this;
        if (this.selected === 'rayleigh' || this.selected === 'cauchy') {
          // Defer to allow x-show to make canvas visible first
          setTimeout(() => renderPolar(self.selected, self.paramValues), 50);
        }
      },

      setParam(key: string, val: string) {
        this.paramValues[key] = parseFloat(val);
        this.updateChart();
      },

      get discreteList() { return discreteKeys.map(k => ({ key: k, name: dists[k].name })); },
      get continuousList() { return continuousKeys.map(k => ({ key: k, name: dists[k].name })); },
    };
  });
};
