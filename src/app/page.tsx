'use client';

import { useEffect, useState } from 'react';

type LogLine = {
  text: string;
  color?: string;
};

export default function TerminalPage() {
  const [started, setStarted] = useState(false);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [currentText, setCurrentText] = useState('');
  const [currentColor, setCurrentColor] = useState('#00ff41');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!started) {
      return;
    }

    setLines([]);
    setCurrentText('');
    setCurrentColor('#00ff41');
    setDone(false);

    const deviceInfo = {
      os: navigator.platform || 'UNKNOWN',
      browser: navigator.userAgent.split(' ').pop() || 'UNKNOWN',
      lang: navigator.language,
      screen: `${window.screen.width}x${window.screen.height}`,
      cores: navigator.hardwareConcurrency ?? '?',
      memory: (navigator as { deviceMemory?: number }).deviceMemory
        ? `${(navigator as { deviceMemory?: number }).deviceMemory}GB`
        : 'CLASSIFIED',
      online: navigator.onLine ? 'CONNECTED' : 'OFFLINE',
      touch: navigator.maxTouchPoints > 0 ? 'YES' : 'NO',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      colorDepth: `${window.screen.colorDepth}bit`,
    };

    const script: LogLine[] = [
      { text: '> INITIATING DEEP SCAN...' },
      { text: '' },
      { text: '> [SYS] QR_BREACH_DETECTED' },
      { text: '> [SYS] Source: Physical fabric (T-shirt)' },
      { text: '> [SYS] Vector: Optical QR decode via camera sensor' },
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
      { text: '> [WARNING] DEVICE_COMPROMISED_BY_TSHIRT', color: '#ffff00' },
      { text: '> [WARNING] All data collected via 100% organic fiber interface', color: '#ffff00' },
      { text: '' },
      { text: '> Establishing uplink...' },
      { text: '> Routing through class 2-X mainframe...' },
      { text: '> Authenticating... ACCESS GRANTED', color: '#00ff41' },
      { text: '' },
      { text: '> You have been hacked by a T-shirt.', color: '#ff4444' },
      { text: '' },
      { text: '> Have a nice day.' },
      { text: '> _' },
    ];

    let lineIdx = 0;
    let charIdx = 0;
    let timeout: ReturnType<typeof setTimeout>;
    let cancelled = false;

    function tick() {
      if (cancelled) {
        return;
      }

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
  }, [started]);

  if (!started) {
    return (
      <>
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
          pointerEvents: 'none',
          zIndex: 10,
        }} />
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.75) 100%)',
          pointerEvents: 'none',
          zIndex: 9,
        }} />

        <main style={{
          minHeight: '100vh',
          background: '#050505',
          color: '#00ff41',
          fontFamily: '"Courier New", Courier, monospace',
          display: 'grid',
          placeItems: 'center',
          padding: 'clamp(1.25rem, 5vw, 3rem)',
          position: 'relative',
          zIndex: 1,
        }}>
          <section style={{
            width: 'min(100%, 720px)',
            border: '1px solid rgba(0,255,65,0.65)',
            boxShadow: '0 0 24px rgba(0,255,65,0.18), inset 0 0 18px rgba(0,255,65,0.08)',
            padding: 'clamp(1.25rem, 5vw, 2.5rem)',
            background: 'rgba(0, 20, 8, 0.72)',
            textShadow: '0 0 6px rgba(0,255,65,0.75)',
          }}>
            <p style={{
              color: '#ff4444',
              fontSize: 'clamp(13px, 2.4vw, 16px)',
              letterSpacing: '0.08em',
              marginBottom: '1rem',
            }}>
              HTTP 490 / TOO FOUND
            </p>
            <h1 style={{
              color: '#ffff66',
              fontSize: 'clamp(2rem, 9vw, 4.5rem)',
              lineHeight: 0.95,
              margin: '0 0 1.25rem',
              textTransform: 'uppercase',
            }}>
              ClassConnect is too well known.
            </h1>
            <p style={{
              fontSize: 'clamp(14px, 2.7vw, 18px)',
              lineHeight: 1.7,
              marginBottom: '2rem',
              maxWidth: '56ch',
            }}>
              The requested system cannot be hidden because too many people have
              already found it. Opposite-of-not-found condition confirmed.
            </p>
            <button
              type="button"
              onClick={() => setStarted(true)}
              style={{
                appearance: 'none',
                border: '1px solid #00ff41',
                background: 'transparent',
                color: '#00ff41',
                font: 'inherit',
                fontSize: 'clamp(14px, 2.5vw, 16px)',
                padding: '0.85rem 1.2rem',
                cursor: 'pointer',
                textShadow: '0 0 6px rgba(0,255,65,0.8)',
                boxShadow: '0 0 14px rgba(0,255,65,0.2)',
              }}
            >
              CONTINUE
            </button>
          </section>
        </main>

        <style>{`
          * { box-sizing: border-box; }
          body { margin: 0; padding: 0; background: #050505; }
          button:hover {
            background: rgba(0, 255, 65, 0.14) !important;
          }
          button:focus-visible {
            outline: 2px solid #ffff66;
            outline-offset: 4px;
          }
        `}</style>
      </>
    );
  }

  return (
    <>
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
        pointerEvents: 'none',
        zIndex: 10,
      }} />
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.6) 100%)',
        pointerEvents: 'none',
        zIndex: 9,
      }} />

      <main style={{
        minHeight: '100vh',
        background: '#050505',
        padding: 'clamp(1rem, 5vw, 3rem)',
        boxSizing: 'border-box',
        position: 'relative',
        zIndex: 1,
      }}>
        <pre style={{
          color: '#00ff41',
          fontFamily: '"Courier New", Courier, monospace',
          fontSize: 'clamp(11px, 2.2vw, 15px)',
          lineHeight: '1.9',
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          textShadow: '0 0 6px rgba(0,255,65,0.8)',
          maxWidth: '800px',
        }}>
          {lines.map((line, idx) => (
            <span
              key={idx}
              style={{ color: line.color ?? '#00ff41', display: 'block' }}
            >
              {line.text}
            </span>
          ))}
          {!done && (
            <span style={{ color: currentColor, display: 'block' }}>
              {currentText}
              <span style={{
                display: 'inline-block',
                width: '0.55em',
                height: '1.1em',
                background: currentColor,
                animation: 'blink 0.8s step-end infinite',
                boxShadow: `0 0 6px ${currentColor}`,
                verticalAlign: 'text-bottom',
              }} />
            </span>
          )}
        </pre>
      </main>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; background: #050505; }
      `}</style>
    </>
  );
}
