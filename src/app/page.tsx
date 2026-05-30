'use client';

import { useEffect, useState } from 'react';

type LogLine = {
  text: string;
  color?: string;
};

export default function TerminalPage() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [currentText, setCurrentText] = useState('');
  const [currentColor, setCurrentColor] = useState('#00ff41');
  const [done, setDone] = useState(false);

  useEffect(() => {
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

    function tick() {
      if (lineIdx >= script.length) {
        setDone(true);
        return;
      }

      const line = script[lineIdx];

      if (line.text === '') {
        setLines(prev => [...prev, { text: '', color: undefined }]);
        setCurrentText('');
        lineIdx++;
        setTimeout(tick, 200);
        return;
      }

      if (charIdx < line.text.length) {
        const ch = line.text[charIdx];
        charIdx++;
        setCurrentText(prev => prev + ch);
        setTimeout(tick, 35 + Math.random() * 45);
      } else {
        const completedText = line.text;
        const completedColor = line.color;
        setLines(prev => [...prev, { text: completedText, color: completedColor }]);
        setCurrentText('');
        setCurrentColor(script[lineIdx + 1]?.color ?? '#00ff41');
        lineIdx++;
        charIdx = 0;
        setTimeout(tick, 250 + Math.random() * 350);
      }
    }

    const timeout = setTimeout(tick, 600);
    return () => clearTimeout(timeout);
  }, []);

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
