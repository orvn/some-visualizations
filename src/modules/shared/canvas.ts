// shared canvas utilities

export function initHDPI(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.scale(dpr, dpr);
  return ctx;
}

export function waitForCanvas(id: string, callback: (canvas: HTMLCanvasElement) => void) {
  const tryInit = () => {
    const canvas = document.getElementById(id) as HTMLCanvasElement | null;
    if (!canvas || canvas.getBoundingClientRect().width === 0) {
      requestAnimationFrame(tryInit);
      return;
    }
    callback(canvas);
  };
  requestAnimationFrame(tryInit);
}

export function createStripePattern(color: string, bgColor: string = 'transparent'): CanvasPattern | string {
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
