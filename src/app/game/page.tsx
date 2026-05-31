'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BreakoutGame } from '../BreakoutGame';
import { FakeShell } from '../FakeShell';

export default function GamePage() {
  const [gameWon, setGameWon] = useState(false);
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
        // ゲーム中: 100dvh 固定。シェル表示時: min-height のみ（自然スクロール）
        ...(gameWon
          ? { minHeight: '100dvh' }
          : { height: '100dvh', overflow: 'hidden' }),
        background: '#050505',
        display: 'flex',
        flexDirection: 'column',
        padding: 'clamp(0.5rem, 2vw, 1rem)',
        boxSizing: 'border-box',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          marginBottom: '0.5rem',
          fontFamily: font,
          fontSize: 'clamp(11px, 2vw, 14px)',
          flexShrink: 0,
        }}>
          <Link href="/" style={{
            color: '#00ff41', textDecoration: 'none',
            border: '1px solid rgba(0,255,65,0.5)',
            padding: '0.2rem 0.7rem',
            textShadow: '0 0 6px rgba(0,255,65,0.8)',
            whiteSpace: 'nowrap',
          }}>
            ← BACK
          </Link>
          <span style={{
            color: gameWon ? '#ffff00' : '#ffff00',
            textShadow: '0 0 8px rgba(255,255,0,0.7)',
            letterSpacing: '0.1em',
          }}>
            {gameWon ? 'SHELL_UNLOCKED' : 'BLOCK_BREAKER'}
          </span>
        </div>

        {/* ゲームエリア — クリア後は非表示 */}
        {!gameWon && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <BreakoutGame fullscreen onWin={() => setGameWon(true)} />
          </div>
        )}

        {/* クリア後: シェルアクセス解放 */}
        {gameWon && (
          <div style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{
              fontFamily: font,
              fontSize: 'clamp(11px, 2.2vw, 14px)',
              flexShrink: 0,
              marginBottom: '0.75rem',
              borderBottom: '1px solid rgba(0,255,65,0.2)',
              paddingBottom: '0.5rem',
            }}>
              <span style={{ color: '#00ff41', textShadow: '0 0 6px rgba(0,255,65,0.8)' }}>
                {'> ALL BLOCKS DESTROYED. Shell access granted.'}
              </span>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <FakeShell />
            </div>
          </div>
        )}
      </main>

      <style>{`
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: #050505; }
        ${!gameWon ? 'html, body { height: 100%; overflow: hidden; }' : ''}
        a:hover { background: rgba(0,255,65,0.1); }
      `}</style>
    </>
  );
}
