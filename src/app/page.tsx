'use client';

import { useEffect, useState } from 'react';

type LogLine = {
  text: string;
  color?: string;
};

export default function TerminalPage() {
  const [lines, setLines] = useState<LogLine[]>([]);
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

    let i = 0;
    function next() {
      if (i >= script.length) {
        setDone(true);
        return;
      }
      setLines((prev) => [...prev, script[i]]);
      i++;
      const delay = script[i - 1].text === '' ? 100 : Math.random() * 60 + 30;
      setTimeout(next, delay);
    }
    const timeout = setTimeout(next, 400);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        padding: '2rem',
        boxSizing: 'border-box',
        overflowX: 'hidden',
      }}
    >
      <pre
        style={{
          color: '#00ff41',
          fontFamily: '"Courier New", Courier, monospace',
          fontSize: 'clamp(11px, 2vw, 14px)',
          lineHeight: '1.6',
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          textShadow: '0 0 8px #00ff41',
        }}
      >
        {lines.map((line, idx) => (
          <span
            key={idx}
            style={{ color: line.color ?? '#00ff41', display: 'block' }}
          >
            {line.text}
          </span>
        ))}
        {!done && (
          <span
            style={{
              display: 'inline-block',
              width: '0.6em',
              height: '1em',
              background: '#00ff41',
              animation: 'blink 1s step-end infinite',
              boxShadow: '0 0 8px #00ff41',
              verticalAlign: 'text-bottom',
            }}
          />
        )}
      </pre>
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
