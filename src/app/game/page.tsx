'use client';

import Link from 'next/link';
import { BreakoutGame } from '../BreakoutGame';

export default function GamePage() {
  const font = '"Courier New", Courier, monospace';

  return (
    <>
      {/* CRT scanlines */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
      }} />
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9,
        background: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.55) 100%)',
      }} />

      <main style={{
        minHeight: '100dvh',
        background: '#050505',
        display: 'flex',
        flexDirection: 'column',
        padding: 'clamp(0.6rem, 2.5vw, 1.25rem)',
        boxSizing: 'border-box',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Header bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          marginBottom: '0.6rem',
          fontFamily: font,
          fontSize: 'clamp(11px, 2vw, 14px)',
          flexShrink: 0,
        }}>
          <Link
            href="/"
            style={{
              color: '#00ff41',
              textDecoration: 'none',
              border: '1px solid rgba(0,255,65,0.5)',
              padding: '0.2rem 0.7rem',
              textShadow: '0 0 6px rgba(0,255,65,0.8)',
              whiteSpace: 'nowrap',
            }}
          >
            ← BACK
          </Link>
          <span style={{
            color: '#ffff00',
            textShadow: '0 0 8px rgba(255,255,0,0.7)',
            letterSpacing: '0.1em',
          }}>
            BLOCK_BREAKER
          </span>
        </div>

        {/* Game area — centerd, fills remaining height */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
        }}>
          <BreakoutGame fullscreen />
        </div>
      </main>

      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; background: #050505; }
        a:hover { background: rgba(0,255,65,0.1); }
      `}</style>
    </>
  );
}
