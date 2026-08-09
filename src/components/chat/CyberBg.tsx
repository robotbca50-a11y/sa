import { useMemo } from 'react';

export default function CyberBg() {
  const nodes = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        x: (i * 37 + 13) % 100,
        y: (i * 53 + 29) % 100,
        s: 120 + (i % 5) * 60,
        d: 6 + (i % 4) * 4,
      })),
    [],
  );
  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(1200px 700px at 15% -10%, rgba(0,240,255,0.08), transparent 60%),' +
            'radial-gradient(1000px 600px at 90% 110%, rgba(255,46,166,0.07), transparent 60%),' +
            'radial-gradient(800px 500px at 60% 50%, rgba(124,58,237,0.06), transparent 55%)',
        }}
      />
      {nodes.map((n, i) => (
        <div
          key={i}
          className="absolute rounded-full opacity-[0.05]"
          style={{
            left: `${n.x}%`,
            top: `${n.y}%`,
            width: n.s,
            height: n.s,
            background: 'radial-gradient(circle, #00f0ff, transparent 70%)',
            animation: `float ${n.d}s ease-in-out infinite`,
          }}
        />
      ))}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,240,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,240,255,0.03) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />
    </div>
  );
}
