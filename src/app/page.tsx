'use client';

import { useEffect, useRef, useState } from 'react';
import { FakeShell } from './FakeShell';

type LogLine = {
  text: string;
  color?: string;
};

type Phase = 'classconnect' | 'bsod' | 'terminal';

function detectOS(): string {
  const ua = navigator.userAgent;
  // userAgentData は Chromium のみ対応。iOS/Safari では使えないので補助的に使う
  const uaData = (navigator as { userAgentData?: { platform?: string } }).userAgentData;
  if (uaData?.platform) {
    const p = uaData.platform;
    if (p === 'Windows') return 'Windows 10/11';
    if (p === 'macOS') return 'macOS';
    if (p === 'Linux') return 'Linux';
    if (p === 'Android') return 'Android';
    if (p === 'iOS' || p === 'iPhone' || p === 'iPad') return 'iOS';
    return p;
  }
  // iPhone/iPad の UA は "like Mac OS X" を含むので Mac より先にチェック
  if (/iPhone/.test(ua)) return 'iOS (iPhone)';
  if (/iPad/.test(ua)) return 'iOS (iPad)';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows NT 10\.0/.test(ua)) return 'Windows 10/11';
  if (/Windows NT 6\.3/.test(ua)) return 'Windows 8.1';
  if (/Windows NT 6\.1/.test(ua)) return 'Windows 7';
  if (/Windows/.test(ua)) return 'Windows';
  // iPad デスクトップモード (iOS 13+) は Mac と同じ UA になるので maxTouchPoints で判定
  if (/Mac OS X/.test(ua)) {
    if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1) return 'iOS (iPad)';
    return 'macOS';
  }
  if (/Linux/.test(ua)) return 'Linux';
  return 'UNKNOWN';
}

function detectBrowser(): string {
  const ua = navigator.userAgent;
  // iOS 固有トークンを先にチェック（CriOS = Chrome on iOS, FxiOS = Firefox on iOS）
  if (/EdgiOS\//.test(ua)) {
    const m = ua.match(/EdgiOS\/([\d]+)/);
    return `Microsoft Edge ${m ? m[1] : ''}`.trim();
  }
  if (/CriOS\//.test(ua)) {
    const m = ua.match(/CriOS\/([\d]+)/);
    return `Google Chrome ${m ? m[1] : ''}`.trim();
  }
  if (/FxiOS\//.test(ua)) {
    const m = ua.match(/FxiOS\/([\d]+)/);
    return `Mozilla Firefox ${m ? m[1] : ''}`.trim();
  }
  if (/OPiOS\//.test(ua)) {
    const m = ua.match(/OPiOS\/([\d]+)/);
    return `Opera ${m ? m[1] : ''}`.trim();
  }
  // デスクトップ / Android
  if (/Edg\//.test(ua)) {
    const m = ua.match(/Edg\/([\d]+)/);
    return `Microsoft Edge ${m ? m[1] : ''}`.trim();
  }
  if (/OPR\//.test(ua)) {
    const m = ua.match(/OPR\/([\d]+)/);
    return `Opera ${m ? m[1] : ''}`.trim();
  }
  if (/Chrome\//.test(ua)) {
    const m = ua.match(/Chrome\/([\d]+)/);
    return `Google Chrome ${m ? m[1] : ''}`.trim();
  }
  if (/Firefox\//.test(ua)) {
    const m = ua.match(/Firefox\/([\d]+)/);
    return `Mozilla Firefox ${m ? m[1] : ''}`.trim();
  }
  // Safari (iOS Safari 含む)。Version/ トークンがバージョン番号
  if (/Safari\//.test(ua)) {
    const m = ua.match(/Version\/([\d]+)/);
    return `Safari ${m ? m[1] : ''}`.trim();
  }
  return 'UNKNOWN';
}


export default function TerminalPage() {
  const [phase, setPhase] = useState<Phase>('classconnect');
  const [glitching, setGlitching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [currentText, setCurrentText] = useState('');
  const [currentColor, setCurrentColor] = useState('#00ff41');
  const [done, setDone] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ClassConnect fake loading → BSOD transition
  useEffect(() => {
    if (phase !== 'classconnect') return;

    let p = 0;
    const interval = setInterval(() => {
      p += Math.random() * 18 + 4;
      if (p >= 100) {
        p = 100;
        clearInterval(interval);
        setTimeout(() => {
          setGlitching(true);
          setTimeout(() => {
            setGlitching(false);
            setPhase('bsod');
          }, 600);
        }, 300);
      }
      setProgress(Math.min(p, 100));
    }, 120);

    return () => clearInterval(interval);
  }, [phase]);

  // Terminal typing effect
  useEffect(() => {
    if (phase !== 'terminal') return;

    setLines([]);
    setCurrentText('');
    setCurrentColor('#00ff41');
    setDone(false);

    const deviceInfo = {
      os: detectOS(),
      browser: detectBrowser(),
      lang: navigator.language,
      screen: `${window.screen.width}x${window.screen.height}`,
      cores: navigator.hardwareConcurrency ?? '?',
      memory: 'CLASSIFIED',
      online: navigator.onLine ? 'CONNECTED' : 'OFFLINE',
      touch: navigator.maxTouchPoints > 0 ? 'YES' : 'NO',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      colorDepth: `${window.screen.colorDepth}bit`,
    };

    const script: LogLine[] = [
      { text: '> INITIATING DEEP SCAN...' },
      { text: '' },
      { text: '> [SYS] UNAUTHORIZED_ACCESS_DETECTED' },
      { text: '> [SYS] Origin: UNKNOWN' },
      { text: '> [SYS] Threat level: ELEVATED' },
      { text: '' },
      { text: '> Scanning target device...' },
      { text: '' },
      { text: `> OS           : ${deviceInfo.os}` },
      { text: `> BROWSER      : ${deviceInfo.browser}` },
      { text: `> LANGUAGE     : ${deviceInfo.lang}` },
      { text: `> SCREEN       : ${deviceInfo.screen}` },
      { text: `> CPU CORES    : ${deviceInfo.cores}` },
      { text: `> MEMORY       : ${deviceInfo.memory}` },
      { text: `> NETWORK      : ${deviceInfo.online}` },
      { text: `> TOUCH INPUT  : ${deviceInfo.touch}` },
      { text: `> TIMEZONE     : ${deviceInfo.timezone}` },
      { text: `> COLOR DEPTH  : ${deviceInfo.colorDepth}` },
      { text: '' },
      { text: '> Scan complete.' },
      { text: '' },
      { text: '> [WARNING] DEVICE_COMPROMISED', color: '#ffff00' },
      { text: '> [WARNING] All data has been uploaded to our servers', color: '#ffff00' },
      { text: '' },
      { text: '> Establishing uplink...' },
      { text: '> Routing through class 2-X mainframe...' },
      { text: '> Authenticating... ACCESS GRANTED', color: '#00ff41' },
      { text: '' },
      { text: '> You have been hacked.', color: '#ff4444' },
      { text: '' },
      { text: '> Have a nice day.' },
    ];

    let lineIdx = 0;
    let charIdx = 0;
    let timeout: ReturnType<typeof setTimeout>;
    let cancelled = false;

    function tick() {
      if (cancelled) return;
      if (lineIdx >= script.length) {
        setDone(true);
        return;
      }
      const line = script[lineIdx];
      if (line.text === '') {
        setLines(prev => [...prev, { text: '', color: undefined }]);
        setCurrentText('');
        lineIdx++;
        timeout = setTimeout(tick, 200);
        return;
      }
      if (charIdx < line.text.length) {
        const ch = line.text[charIdx];
        charIdx++;
        setCurrentText(prev => prev + ch);
        timeout = setTimeout(tick, 35 + Math.random() * 45);
      } else {
        const completedText = line.text;
        const completedColor = line.color;
        setLines(prev => [...prev, { text: completedText, color: completedColor }]);
        setCurrentText('');
        setCurrentColor(script[lineIdx + 1]?.color ?? '#00ff41');
        lineIdx++;
        charIdx = 0;
        timeout = setTimeout(tick, 250 + Math.random() * 350);
      }
    }

    timeout = setTimeout(tick, 600);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [phase]);

  // 新しい行が追加されるたびに自動スクロール
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines, currentText]);

  // Phase 1: Fake ClassConnect loading screen
  if (phase === 'classconnect') {
    return (
      <>
        <div style={{
          minHeight: '100vh',
          background: '#ffffff',
          fontFamily: 'Arial, Helvetica, sans-serif',
          color: '#1e293b',
          filter: glitching ? 'hue-rotate(180deg) saturate(3) contrast(2)' : 'none',
          transition: glitching ? 'none' : 'filter 0.15s',
        }}>
          <header style={{
            position: 'sticky',
            top: 0,
            zIndex: 50,
            width: '100%',
            borderBottom: '1px solid #e2e8f0',
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(8px)',
          }}>
            <div style={{
              maxWidth: '1200px',
              margin: '0 auto',
              padding: '0 1rem',
              height: '56px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="ClassConnect Logo" width={24} height={24} />
                <span style={{ fontWeight: 700, fontSize: '15px' }}>ClassConnect</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {['カレンダー', 'ヘルプ', '管理者ログイン'].map((label) => (
                  <div key={label} style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: '#64748b',
                    border: label === '管理者ログイン' ? '1px solid #e2e8f0' : 'none',
                    cursor: 'default',
                    userSelect: 'none',
                  }}>
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </header>

          <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem 1rem' }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                {[...Array(6)].map((__, j) => (
                  <div key={j} style={{
                    flex: 1,
                    height: '60px',
                    borderRadius: '6px',
                    background: '#f1f5f9',
                    animation: 'pulse 1.5s ease-in-out infinite',
                    animationDelay: `${(i + j) * 0.05}s`,
                  }} />
                ))}
              </div>
            ))}
          </main>

          <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            opacity: glitching ? 0.2 : 1,
            transition: 'opacity 0.1s',
          }}>
            <div style={{
              background: '#ffffff',
              borderRadius: '12px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              width: 'min(100% - 2rem, 420px)',
              overflow: 'hidden',
            }}>
              <div style={{ padding: '1.5rem 1.5rem 0', textAlign: 'center' }}>
                <h2 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 0.5rem', color: '#0f172a' }}>
                  ClassConnectへようこそ
                </h2>
                <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 1.5rem' }}>
                  利用方法を選択してください。
                </p>
              </div>
              <div style={{ padding: '0 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button type="button" style={{
                  width: '100%', padding: '12px', borderRadius: '8px',
                  background: '#3498db', color: '#ffffff', fontFamily: 'inherit',
                  fontSize: '15px', fontWeight: 600, border: 'none', cursor: 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}>
                  <span>&#x2192;</span> 管理者としてログイン
                </button>
                <button type="button" style={{
                  width: '100%', padding: '12px', borderRadius: '8px',
                  background: '#f1f5f9', color: '#0f172a', fontFamily: 'inherit',
                  fontSize: '15px', fontWeight: 600, border: 'none', cursor: 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}>
                  <span>&#x1F464;</span> ログインなしで利用する
                </button>
              </div>
            </div>
          </div>
        </div>

        <style>{`
          * { box-sizing: border-box; }
          body { margin: 0; padding: 0; background: #ffffff; }
          @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        `}</style>
      </>
    );
  }

  // Phase 2: BSOD / HTTP 490
  if (phase === 'bsod') {
    return (
      <>
        <div style={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10,
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
        }} />
        <div style={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9,
          background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.75) 100%)',
        }} />
        <main style={{
          minHeight: '100vh', background: '#050505', color: '#00ff41',
          fontFamily: '"Courier New", Courier, monospace',
          display: 'grid', placeItems: 'center',
          padding: 'clamp(1.25rem, 5vw, 3rem)', position: 'relative', zIndex: 1,
        }}>
          <section style={{
            width: 'min(100%, 720px)',
            border: '1px solid rgba(0,255,65,0.65)',
            boxShadow: '0 0 24px rgba(0,255,65,0.18), inset 0 0 18px rgba(0,255,65,0.08)',
            padding: 'clamp(1.25rem, 5vw, 2.5rem)',
            background: 'rgba(0, 20, 8, 0.72)',
            textShadow: '0 0 6px rgba(0,255,65,0.75)',
          }}>
            <p style={{ color: '#ff4444', fontSize: 'clamp(13px, 2.4vw, 16px)', letterSpacing: '0.08em', marginBottom: '1rem' }}>
              HTTP 490 / TOO FOUND
            </p>
            <h1 style={{ color: '#ffff66', fontSize: 'clamp(2rem, 9vw, 4.5rem)', lineHeight: 0.95, margin: '0 0 1.25rem', textTransform: 'uppercase' }}>
              ClassConnect is too well known.
            </h1>
            <p style={{ fontSize: 'clamp(14px, 2.7vw, 18px)', lineHeight: 1.7, marginBottom: '2rem', maxWidth: '56ch' }}>
              The requested system cannot be hidden because too many people have
              already found it. Opposite-of-not-found condition confirmed.
            </p>
            <button
              type="button"
              onClick={() => setPhase('terminal')}
              style={{
                appearance: 'none', border: '1px solid #00ff41', background: 'transparent',
                color: '#00ff41', font: 'inherit', fontSize: 'clamp(14px, 2.5vw, 16px)',
                padding: '0.85rem 1.2rem', cursor: 'pointer',
                textShadow: '0 0 6px rgba(0,255,65,0.8)', boxShadow: '0 0 14px rgba(0,255,65,0.2)',
              }}
            >
              CONTINUE
            </button>
          </section>
        </main>
        <style>{`
          * { box-sizing: border-box; }
          body { margin: 0; padding: 0; background: #050505; }
          button:hover { background: rgba(0, 255, 65, 0.14) !important; }
          button:focus-visible { outline: 2px solid #ffff66; outline-offset: 4px; }
        `}</style>
      </>
    );
  }

  // Phase 3: Terminal scan + mini-game
  const font = '"Courier New", Courier, monospace';
  const fontSize = 'clamp(11px, 2.2vw, 15px)';

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
      }} />
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9,
        background: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.6) 100%)',
      }} />

      <main style={{
        height: '100dvh', background: '#050505',
        display: 'flex', flexDirection: 'column',
        padding: 'clamp(1rem, 5vw, 2rem)', boxSizing: 'border-box',
        position: 'relative', zIndex: 1, overflow: 'hidden',
      }}>
        {/* スクロール可能なターミナル出力エリア */}
        <div
          ref={scrollRef}
          style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}
        >
          <pre style={{
            color: '#00ff41', fontFamily: font, fontSize,
            lineHeight: '1.9', margin: 0, whiteSpace: 'pre-wrap',
            wordBreak: 'break-word', textShadow: '0 0 6px rgba(0,255,65,0.8)', maxWidth: '800px',
          }}>
            {lines.map((line, idx) => (
              <span key={idx} style={{ color: line.color ?? '#00ff41', display: 'block' }}>
                {line.text}
              </span>
            ))}
            {!done && (
              <span style={{ color: currentColor, display: 'block' }}>
                {currentText}
                <span style={{
                  display: 'inline-block', width: '0.55em', height: '1.1em',
                  background: currentColor, animation: 'blink 0.8s step-end infinite',
                  boxShadow: `0 0 6px ${currentColor}`, verticalAlign: 'text-bottom',
                }} />
              </span>
            )}
          </pre>
        </div>

        {/* シェルとゲームリンク — 下部エリア */}
        {done && (
          <div style={{
            flexShrink: 0,
            borderTop: '1px solid rgba(0,255,65,0.2)',
            paddingTop: '0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            minHeight: 0,
            maxHeight: '45vh',
            overflowY: 'auto',
          }}>
            {/* ゲームリンク */}
            <div style={{ fontFamily: font, fontSize, flexShrink: 0 }}>
              <a
                href="/game"
                style={{
                  display: 'inline-block',
                  border: '1px solid rgba(0,255,65,0.5)',
                  color: '#00ff41',
                  fontFamily: font,
                  fontSize,
                  padding: '0.25rem 0.9rem',
                  textDecoration: 'none',
                  textShadow: '0 0 6px rgba(0,255,65,0.8)',
                  marginBottom: '0.5rem',
                }}
              >
                LAUNCH GAME →
              </a>
            </div>
            {/* フェイクシェル */}
            <FakeShell secretUrl={typeof window !== 'undefined' ? `${window.location.origin}/secret` : '/secret'} />
          </div>
        )}
      </main>

      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; background: #050505; }
        button:hover { background: rgba(0, 255, 65, 0.1) !important; }
      `}</style>
    </>
  );
}
