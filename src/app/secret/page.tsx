'use client';

import { useEffect, useState } from 'react';

const FLAG = 'FLAG{r0b0ts_d0nt_bl0ck_hum4ns}';

const LINES = [
  { text: '> ACCESSING RESTRICTED ENDPOINT...', delay: 0 },
  { text: '> /secret — 403 Forbidden', delay: 600, color: '#ff4444' },
  { text: '> Bypassing access control...', delay: 1400 },
  { text: '> ....', delay: 2200 },
  { text: '> Authorization overridden.', delay: 2800, color: '#ffff00' },
  { text: '', delay: 3200 },
  { text: '> ██████████████████ 100%', delay: 3600, color: '#00ff41' },
  { text: '', delay: 4000 },
  { text: `> ${FLAG}`, delay: 4400, color: '#ffff00' },
  { text: '', delay: 5000 },
  { text: '> Congratulations. You found it.', delay: 5200 },
];

export default function SecretPage() {
  const [shown, setShown] = useState<typeof LINES>([]);

  useEffect(() => {
    LINES.forEach(line => {
      setTimeout(() => {
        setShown(prev => [...prev, line]);
      }, line.delay);
    });
  }, []);

  const font = '"Courier New", Courier, monospace';

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
      }} />

      <main style={{
        minHeight: '100dvh', background: '#050505',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'clamp(1rem, 5vw, 2.5rem)', boxSizing: 'border-box',
        position: 'relative', zIndex: 1,
      }}>
        <pre style={{
          fontFamily: font,
          fontSize: 'clamp(12px, 2.5vw, 16px)',
          lineHeight: 2,
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          maxWidth: '640px',
          width: '100%',
        }}>
          {shown.map((line, i) => (
            <span
              key={i}
              style={{
                display: 'block',
                color: line.color ?? '#00ff41',
                textShadow: `0 0 8px ${line.color ?? 'rgba(0,255,65,0.8)'}`,
                ...(line.text.startsWith(`> ${FLAG}`) ? {
                  background: 'rgba(255,255,0,0.08)',
                  padding: '0.1em 0',
                  letterSpacing: '0.05em',
                } : {}),
              }}
            >
              {line.text}
            </span>
          ))}
        </pre>
      </main>

      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; background: #050505; }
      `}</style>
    </>
  );
}
