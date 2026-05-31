'use client';

import { useEffect, useRef, useState } from 'react';

const LW = 480;
const LH = 300;
const COLS = 8;
const ROWS = 5;
const GAP = 4;
const BLOCK_H = 18;
const PADDLE_W = 80;
const PADDLE_H = 10;
const BALL_R = 6;
const BALL_SPEED = 2.8;
const PADDLE_SPEED = 6;
const MAX_LIVES = 3;

const ROW_COLORS = ['#ff4444', '#ff8800', '#ffff00', '#88ff00', '#00ff41'];

type Status = 'idle' | 'playing' | 'won' | 'lost';

interface Block {
  x: number;
  y: number;
  w: number;
  alive: boolean;
  row: number;
}

interface Props {
  fullscreen?: boolean;
}

export function BreakoutGame({ fullscreen = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const scaleRef = useRef(1);
  const rafRef = useRef(0);

  const ballRef = useRef({ x: LW / 2, y: LH - 60, dx: 0, dy: 0 });
  const paddleXRef = useRef(LW / 2 - PADDLE_W / 2);
  const blocksRef = useRef<Block[]>([]);
  const livesRef = useRef(MAX_LIVES);
  const scoreRef = useRef(0);
  const statusRef = useRef<Status>('idle');
  const keysRef = useRef({ left: false, right: false });

  const [status, setStatus] = useState<Status>('idle');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);

  function makeBlocks(): Block[] {
    const bw = (LW - GAP * (COLS + 1)) / COLS;
    const result: Block[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        result.push({ x: GAP + c * (bw + GAP), y: 28 + r * (BLOCK_H + GAP), w: bw, alive: true, row: r });
      }
    }
    return result;
  }

  function resetBall() {
    const angle = (-0.5 + Math.random()) * (Math.PI / 3);
    ballRef.current = { x: LW / 2, y: LH - 60, dx: BALL_SPEED * Math.sin(angle), dy: -BALL_SPEED * Math.cos(angle) };
  }

  function draw() {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    const s = scaleRef.current;

    ctx.save();
    ctx.scale(s, s);
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, LW, LH);

    const isIdle = statusRef.current === 'idle';
    blocksRef.current.forEach(b => {
      if (!b.alive) return;
      const color = ROW_COLORS[b.row];
      ctx.shadowColor = color;
      ctx.shadowBlur = isIdle ? 2 : 6;
      ctx.globalAlpha = isIdle ? 0.35 : 1;
      ctx.fillStyle = color;
      ctx.fillRect(b.x, b.y, b.w, BLOCK_H);
    });
    ctx.globalAlpha = 1;

    if (!isIdle) {
      ctx.shadowColor = '#00ff41'; ctx.shadowBlur = 10;
      ctx.fillStyle = '#00ff41';
      ctx.fillRect(paddleXRef.current, LH - 20, PADDLE_W, PADDLE_H);
      const ball = ballRef.current;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
      ctx.fillStyle = '#00ff41'; ctx.shadowColor = '#00ff41'; ctx.shadowBlur = 8;
      ctx.fill();
    } else {
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#00ff41'; ctx.shadowBlur = 0;
      ctx.fillRect(LW / 2 - PADDLE_W / 2, LH - 20, PADDLE_W, PADDLE_H);
      ctx.globalAlpha = 1;
    }

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(0,255,65,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, LW - 1, LH - 1);
    ctx.restore();
  }

  function update() {
    if (statusRef.current !== 'playing') return;
    if (keysRef.current.left) paddleXRef.current = Math.max(0, paddleXRef.current - PADDLE_SPEED);
    if (keysRef.current.right) paddleXRef.current = Math.min(LW - PADDLE_W, paddleXRef.current + PADDLE_SPEED);

    const b = ballRef.current;
    b.x += b.dx; b.y += b.dy;

    if (b.x - BALL_R < 0) { b.x = BALL_R; b.dx = Math.abs(b.dx); }
    if (b.x + BALL_R > LW) { b.x = LW - BALL_R; b.dx = -Math.abs(b.dx); }
    if (b.y - BALL_R < 0) { b.y = BALL_R; b.dy = Math.abs(b.dy); }

    const py = LH - 20;
    if (b.dy > 0 && b.y + BALL_R >= py && b.y - BALL_R <= py + PADDLE_H &&
        b.x >= paddleXRef.current - BALL_R && b.x <= paddleXRef.current + PADDLE_W + BALL_R) {
      b.y = py - BALL_R;
      const hitPos = (b.x - paddleXRef.current) / PADDLE_W;
      const angle = (hitPos - 0.5) * (Math.PI * 0.65);
      const spd = Math.sqrt(b.dx * b.dx + b.dy * b.dy);
      b.dx = spd * Math.sin(angle);
      b.dy = -Math.abs(spd * Math.cos(angle));
    }

    if (b.y - BALL_R > LH) {
      livesRef.current--;
      setLives(livesRef.current);
      if (livesRef.current <= 0) { statusRef.current = 'lost'; setStatus('lost'); }
      else { resetBall(); paddleXRef.current = LW / 2 - PADDLE_W / 2; }
      return;
    }

    for (const block of blocksRef.current) {
      if (!block.alive) continue;
      if (b.x + BALL_R < block.x || b.x - BALL_R > block.x + block.w) continue;
      if (b.y + BALL_R < block.y || b.y - BALL_R > block.y + BLOCK_H) continue;
      block.alive = false;
      scoreRef.current += 10 * (block.row + 1);
      setScore(scoreRef.current);
      const oL = b.x + BALL_R - block.x, oR = block.x + block.w - (b.x - BALL_R);
      const oT = b.y + BALL_R - block.y, oB = block.y + BLOCK_H - (b.y - BALL_R);
      if (Math.min(oL, oR) < Math.min(oT, oB)) b.dx = -b.dx; else b.dy = -b.dy;
      break;
    }

    if (blocksRef.current.every(b => !b.alive)) { statusRef.current = 'won'; setStatus('won'); }
  }

  function resize() {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let cw: number;
    if (fullscreen) {
      const hudH = hudRef.current?.offsetHeight ?? 40;
      const availH = container.clientHeight - hudH;
      const maxWFromH = Math.max(availH, 1) * (LW / LH);
      cw = Math.round(Math.min(container.clientWidth, maxWFromH));
    } else {
      cw = Math.min(container.clientWidth, LW);
    }
    canvas.width = cw;
    canvas.height = Math.round(LH * (cw / LW));
    scaleRef.current = cw / LW;
    draw();
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctxRef.current = ctx;

    blocksRef.current = makeBlocks();
    paddleXRef.current = LW / 2 - PADDLE_W / 2;

    // ResizeObserver でコンテナの実サイズ変化を監視
    const ro = new ResizeObserver(() => resize());
    ro.observe(container);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') { keysRef.current.left = true; e.preventDefault(); }
      if (e.key === 'ArrowRight' || e.key === 'd') { keysRef.current.right = true; e.preventDefault(); }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') keysRef.current.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd') keysRef.current.right = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const onMouseMove = (e: MouseEvent) => {
      if (statusRef.current !== 'playing') return;
      const rect = canvas.getBoundingClientRect();
      const logX = (e.clientX - rect.left) * (LW / rect.width);
      paddleXRef.current = Math.max(0, Math.min(LW - PADDLE_W, logX - PADDLE_W / 2));
    };
    canvas.addEventListener('mousemove', onMouseMove);

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (statusRef.current !== 'playing') return;
      const rect = canvas.getBoundingClientRect();
      const logX = (e.touches[0].clientX - rect.left) * (LW / rect.width);
      paddleXRef.current = Math.max(0, Math.min(LW - PADDLE_W, logX - PADDLE_W / 2));
    };
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });

    return () => {
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('touchmove', onTouchMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleStart() {
    cancelAnimationFrame(rafRef.current);
    blocksRef.current = makeBlocks();
    paddleXRef.current = LW / 2 - PADDLE_W / 2;
    livesRef.current = MAX_LIVES;
    scoreRef.current = 0;
    statusRef.current = 'playing';
    resetBall();
    setStatus('playing');
    setScore(0);
    setLives(MAX_LIVES);

    function loop() {
      update();
      draw();
      if (statusRef.current === 'playing') rafRef.current = requestAnimationFrame(loop);
      else draw();
    }
    rafRef.current = requestAnimationFrame(loop);
  }

  const font = '"Courier New", Courier, monospace';
  const fs = fullscreen ? 'clamp(12px, 2vw, 15px)' : 'clamp(11px, 2.2vw, 14px)';
  const isLost = status === 'lost';

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        ...(fullscreen
          ? { height: '100%', display: 'flex', flexDirection: 'column' }
          : { maxWidth: `${LW}px` }),
      }}
    >
      {/* HUD */}
      <div
        ref={hudRef}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontFamily: font, fontSize: fs, color: '#00ff41',
          textShadow: '0 0 6px rgba(0,255,65,0.8)',
          padding: '0 2px', flexShrink: 0,
          marginBottom: fullscreen ? '4px' : '6px',
        }}
      >
        <span>SCORE: {score}</span>
        <span style={{ letterSpacing: '3px' }}>
          {'♥'.repeat(lives)}<span style={{ opacity: 0.25 }}>{'♥'.repeat(MAX_LIVES - lives)}</span>
        </span>
      </div>

      {/* Canvas wrapper */}
      <div style={{
        position: 'relative',
        ...(fullscreen ? { flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' } : {}),
      }}>
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            // fullscreen時は高さ基準でサイズ決定済みなので width: auto
            width: fullscreen ? 'auto' : '100%',
            maxWidth: '100%',
            cursor: status === 'playing' ? 'none' : 'default',
            touchAction: 'none',
          }}
        />

        {/* フルスクリーン時のステータスオーバーレイ */}
        {fullscreen && status !== 'playing' && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: '0.75rem',
            background: 'rgba(5,5,5,0.7)',
          }}>
            {status === 'idle' && (
              <span style={{ color: '#ffff00', fontFamily: font, fontSize: fs, textShadow: '0 0 8px rgba(255,255,0,0.7)' }}>
                mouse / touch / ← → でパドルを操作
              </span>
            )}
            {status === 'won' && (
              <span style={{ color: '#00ff41', fontFamily: font, fontSize: fs, textShadow: '0 0 8px rgba(0,255,65,0.8)' }}>
                ALL BLOCKS DESTROYED — Score: {score}
              </span>
            )}
            {status === 'lost' && (
              <span style={{ color: '#ff4444', fontFamily: font, fontSize: fs, textShadow: '0 0 8px rgba(255,68,68,0.8)' }}>
                GAME OVER — Score: {score}
              </span>
            )}
            <button
              type="button"
              onClick={handleStart}
              style={{
                background: 'transparent',
                border: `1px solid ${isLost ? '#ff4444' : '#00ff41'}`,
                color: isLost ? '#ff4444' : '#00ff41',
                fontFamily: font, fontSize: fs, padding: '0.5rem 1.5rem',
                cursor: 'pointer',
                textShadow: `0 0 6px ${isLost ? 'rgba(255,68,68,0.8)' : 'rgba(0,255,65,0.8)'}`,
              }}
            >
              {status === 'idle' ? 'START GAME' : 'PLAY AGAIN'}
            </button>
          </div>
        )}
      </div>

      {/* インライン時のステータス（非フルスクリーン）*/}
      {!fullscreen && status !== 'playing' && (
        <div style={{ marginTop: '12px', fontFamily: font, fontSize: fs }}>
          {status === 'idle' && <span style={{ color: '#ffff00', display: 'block' }}>{'> mouse / touch / ← → キーでパドルを操作'}</span>}
          {status === 'won' && <span style={{ color: '#00ff41', display: 'block' }}>{`> ALL BLOCKS DESTROYED — Score: ${score}`}</span>}
          {status === 'lost' && <span style={{ color: '#ff4444', display: 'block' }}>{`> GAME OVER — Score: ${score}`}</span>}
          <button
            type="button"
            onClick={handleStart}
            style={{
              marginTop: '8px', background: 'transparent',
              border: `1px solid ${isLost ? '#ff4444' : '#00ff41'}`,
              color: isLost ? '#ff4444' : '#00ff41',
              fontFamily: font, fontSize: fs, padding: '0.4rem 1.2rem',
              cursor: 'pointer',
              textShadow: `0 0 6px ${isLost ? 'rgba(255,68,68,0.8)' : 'rgba(0,255,65,0.8)'}`,
            }}
          >
            {status === 'idle' ? 'START GAME' : 'PLAY AGAIN'}
          </button>
        </div>
      )}
    </div>
  );
}
