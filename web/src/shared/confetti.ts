// Lightweight confetti on a single canvas; capped particle count to protect stream performance.
export function confetti(canvas: HTMLCanvasElement | null, amount = 120, colors = ['#7C3AED', '#EC4899', '#F59E0B', '#22D3EE', '#FBBF24', '#ffffff']) {
  if (!canvas || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = canvas.getContext('2d');
  if (!c) return;
  const w = (canvas.width = canvas.clientWidth);
  const h = (canvas.height = canvas.clientHeight);
  const parts = Array.from({ length: Math.min(amount, 220) }, (_, i) => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.6, y: h * 0.35 + (Math.random() - 0.5) * 60,
    vx: (Math.random() - 0.5) * 9, vy: -4 - Math.random() * 8, r: 5 + Math.random() * 6, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3, col: colors[i % colors.length],
  }));
  let frame = 0;
  const step = () => {
    c.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.22; p.vx *= 0.99; p.a += p.va;
      c.save(); c.translate(p.x, p.y); c.rotate(p.a); c.fillStyle = p.col; c.fillRect(-p.r / 2, -p.r / 3, p.r, p.r * 0.6); c.restore();
    }
    if (++frame < 160) requestAnimationFrame(step); else c.clearRect(0, 0, w, h);
  };
  requestAnimationFrame(step);
}
