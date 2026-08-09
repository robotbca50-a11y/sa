import { useEffect, useRef } from 'react';

type P = { x: number; y: number; vx: number; vy: number; r: number; hue: number };

export default function CyberCanvas({ density = 90 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    let w = (cv.width = innerWidth);
    let h = (cv.height = innerHeight);
    let parts: P[] = [];
    const mouse = { x: -999, y: -999 };

    const seed = () => {
      const n = Math.min(160, Math.floor((w * h) / 16000) * density);
      parts = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.55,
        vy: (Math.random() - 0.5) * 0.55,
        r: Math.random() * 1.6 + 0.4,
        hue: Math.random() > 0.5 ? 187 : 318,
      }));
    };
    seed();

    const onMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    const onResize = () => {
      w = cv.width = innerWidth;
      h = cv.height = innerHeight;
      seed();
    };
    addEventListener('mousemove', onMove);
    addEventListener('resize', onResize);

    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        const dxm = p.x - mouse.x;
        const dym = p.y - mouse.y;
        const dm = Math.hypot(dxm, dym);
        if (dm < 160) {
          p.x += (dxm / dm) * 0.8;
          p.y += (dym / dm) * 0.8;
        }
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue},100%,65%,0.85)`;
        ctx.fill();
      }
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          const a = parts[i];
          const b = parts[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 110 * 110) {
            const o = 1 - Math.sqrt(d2) / 110;
            ctx.strokeStyle = `hsla(${(a.hue + b.hue) / 2},100%,60%,${o * 0.28})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('mousemove', onMove);
      removeEventListener('resize', onResize);
    };
  }, [density]);

  return (
    <canvas
      ref={ref}
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ opacity: 0.9 }}
    />
  );
}
