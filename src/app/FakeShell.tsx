'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

// ── Fake filesystem ──────────────────────────────────────────────────────────

type FSFile = { type: 'file'; content: string; hidden?: boolean; special?: 'qr' };
type FSDir  = { type: 'dir';  children: string[]; hidden?: boolean };
type FSNode = FSFile | FSDir;

const FS: Record<string, FSNode> = {
  '/': { type: 'dir', children: ['home', 'var', 'tmp', 'etc', 'proc'] },

  '/home': { type: 'dir', children: ['user'] },
  '/home/user': { type: 'dir', children: ['README.txt', 'hint.txt', '.profile'] },
  '/home/user/README.txt': {
    type: 'file',
    content: `SYSTEM COMPROMISED
--------------------
This device has been accessed remotely.
Evidence of the breach has been stored on this system.
Check /var/log for details.`,
  },
  '/home/user/hint.txt': {
    type: 'file',
    content: 'The breach left traces. Always check the logs.',
  },
  '/home/user/.profile': {
    type: 'file',
    hidden: true,
    content: `# system profile
export USER=guest
export HOME=/home/user
# debug: breach log at /var/log/breach.log`,
  },

  '/var': { type: 'dir', children: ['log'] },
  '/var/log': { type: 'dir', children: ['breach.log', 'system.log'] },
  '/var/log/breach.log': {
    type: 'file',
    content: `[2026-05-31 09:12:01] INFO  System boot
[2026-05-31 09:12:33] INFO  Network interface up
[2026-05-31 09:15:02] WARN  Unauthorized access from 0.0.0.0
[2026-05-31 09:15:03] ALERT Exfiltration detected
[2026-05-31 09:15:03] ALERT Payload dumped to /tmp/flag
[2026-05-31 09:15:04] ERROR Access control bypassed`,
  },
  '/var/log/system.log': {
    type: 'file',
    content: '[2026-05-31 09:12:01] kernel: Linux version 6.1.0\n[2026-05-31 09:12:02] kernel: Booting...',
  },

  '/tmp': { type: 'dir', children: ['flag'] },
  '/tmp/flag': {
    type: 'file',
    special: 'qr',
    content: 'CLASSIFIED',
  },

  '/etc': { type: 'dir', children: ['passwd', 'hostname'] },
  '/etc/passwd': {
    type: 'file',
    content: 'root:x:0:0:root:/root:/bin/bash\nguest:x:1000:1000::/home/user:/bin/sh',
  },
  '/etc/hostname': { type: 'file', content: 'class2x-mainframe' },

  '/proc': { type: 'dir', children: ['version', 'uptime'] },
  '/proc/version': { type: 'file', content: 'Linux version 6.1.0 (class2x-build) #1 SMP' },
  '/proc/uptime': { type: 'file', content: '3721.44 14812.20' },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolvePath(cwd: string, input: string): string {
  if (input.startsWith('/')) return normPath(input);
  return normPath(cwd + '/' + input);
}

function normPath(p: string): string {
  const parts: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return '/' + parts.join('/');
}

function node(path: string): FSNode | undefined {
  return FS[path];
}

const FORBIDDEN = ['rm', 'rmdir', 'dd', 'mkfs', 'chmod', 'chown', 'kill', 'killall', 'reboot', 'shutdown', 'poweroff', 'halt', 'fdisk', 'format', 'mkswap'];

// ── Component ────────────────────────────────────────────────────────────────

interface Entry {
  prompt: string;
  output: string;
  color?: string;
  qr?: string; // data URL
}

const FONT = '"Courier New", Courier, monospace';

export function FakeShell({ secretUrl }: { secretUrl: string }) {
  const [cwd, setCwd] = useState('/home/user');
  const [input, setInput] = useState('');
  const [entries, setEntries] = useState<Entry[]>([
    { prompt: '', output: '> Shell access granted. Type "help" for available commands.', color: '#ffff00' },
    { prompt: '', output: '' },
  ]);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries, qrDataUrl]);

  function prompt() {
    return `guest@class2x:${cwd === '/home/user' ? '~' : cwd}$`;
  }

  async function run(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      setEntries(prev => [...prev, { prompt: prompt(), output: '' }]);
      return;
    }

    const [cmd, ...args] = trimmed.split(/\s+/);
    const arg = args.join(' ');

    let output = '';
    let color: string | undefined;
    let qr: string | undefined;

    if (cmd === 'help') {
      output = `Available commands:
  ls [-la] [path]   list directory contents
  cat <file>        print file contents
  cd <dir>          change directory
  pwd               print working directory
  whoami            print current user
  echo [text]       print text
  clear             clear terminal
  help              show this help`;

    } else if (cmd === 'pwd') {
      output = cwd;

    } else if (cmd === 'whoami') {
      output = 'guest';

    } else if (cmd === 'echo') {
      output = arg || '';

    } else if (cmd === 'clear') {
      setEntries([]);
      setInput('');
      return;

    } else if (cmd === 'sudo') {
      output = 'sudo: Permission denied. This incident will be reported.';
      color = '#ff4444';

    } else if (FORBIDDEN.includes(cmd)) {
      output = `${cmd}: Permission denied: you lack the required privileges.`;
      color = '#ff4444';

    } else if (cmd === 'ls') {
      const hasA = args.includes('-la') || args.includes('-a') || args.includes('-al');
      const pathArg = args.find(a => !a.startsWith('-'));
      const target = pathArg ? resolvePath(cwd, pathArg) : cwd;
      const n = node(target);

      if (!n) {
        output = `ls: cannot access '${pathArg ?? target}': No such file or directory`;
        color = '#ff4444';
      } else if (n.type === 'file') {
        output = pathArg ?? target;
      } else {
        const children = n.children
          .map(name => {
            const childPath = target === '/' ? `/${name}` : `${target}/${name}`;
            const child = FS[childPath];
            if (!child) return null;
            if (child.hidden && !hasA) return null;
            const isDir = child.type === 'dir';
            return isDir ? `\x1bblue${name}/` : name;
          })
          .filter(Boolean) as string[];

        if (hasA) {
          children.unshift('..', '.');
        }
        output = children.map(n => n.startsWith('\x1bblue') ? n.slice(6) : n).join('  ');
        // color dirs differently
        const parts = children.map(n => {
          if (n.startsWith('\x1bblue')) return `<dir>${n.slice(6)}</dir>`;
          return n;
        });
        output = '<<FILELIST>>' + JSON.stringify(parts);
      }

    } else if (cmd === 'cat') {
      if (!arg) {
        output = 'cat: missing operand';
        color = '#ff4444';
      } else {
        const target = resolvePath(cwd, arg);
        const n = node(target);
        if (!n) {
          output = `cat: ${arg}: No such file or directory`;
          color = '#ff4444';
        } else if (n.type === 'dir') {
          output = `cat: ${arg}: Is a directory`;
          color = '#ff4444';
        } else if (n.special === 'qr') {
          // Generate QR code
          try {
            const dataUrl = await QRCode.toDataURL(secretUrl, {
              width: 240,
              margin: 2,
              color: { dark: '#00ff41', light: '#050505' },
            });
            qr = dataUrl;
            output = `Decrypting payload...
> Access token verified.
> Rendering encoded data...`;
            color = '#00ff41';
          } catch {
            output = 'Error rendering payload.';
            color = '#ff4444';
          }
        } else {
          output = n.content;
        }
      }

    } else if (cmd === 'cd') {
      if (!arg || arg === '~') {
        setCwd('/home/user');
        setEntries(prev => [...prev, { prompt: prompt(), output: '' }]);
        setInput('');
        return;
      }
      const target = resolvePath(cwd, arg);
      const n = node(target);
      if (!n) {
        output = `cd: ${arg}: No such file or directory`;
        color = '#ff4444';
      } else if (n.type === 'file') {
        output = `cd: ${arg}: Not a directory`;
        color = '#ff4444';
      } else {
        setCwd(target);
        setEntries(prev => [...prev, { prompt: prompt(), output: '' }]);
        setInput('');
        return;
      }

    } else if (cmd === 'man') {
      output = `What manual page do you want?\nTry "help" instead.`;

    } else if (cmd === 'bash' || cmd === 'sh' || cmd === 'zsh') {
      output = `${cmd}: You're already in a shell.`;

    } else if (cmd === 'python' || cmd === 'python3') {
      output = 'python3: this interpreter has been disabled on this system.';
      color = '#ff4444';

    } else if (cmd === 'exit' || cmd === 'logout' || cmd === 'quit') {
      output = 'logout: session terminated.\n\n...just kidding.';

    } else {
      output = `${cmd}: command not found`;
      color = '#ff4444';
    }

    if (qr) {
      setQrDataUrl(qr);
    }
    setEntries(prev => [...prev, { prompt: prompt(), output, color, qr }]);
    setInput('');
  }

  const fs = 'clamp(11px, 2.2vw, 13px)';

  function renderOutput(entry: Entry) {
    if (entry.output.startsWith('<<FILELIST>>')) {
      const parts: string[] = JSON.parse(entry.output.slice(12));
      return (
        <span>
          {parts.map((p, i) => {
            const isDir = p.startsWith('<dir>') && p.endsWith('</dir>');
            const name = isDir ? p.slice(5, -6) : p;
            return (
              <span key={i}>
                {i > 0 && '  '}
                <span style={{ color: isDir ? '#6699ff' : '#00ff41' }}>{name}</span>
              </span>
            );
          })}
        </span>
      );
    }
    return <span style={{ whiteSpace: 'pre-wrap' }}>{entry.output}</span>;
  }

  return (
    <div
      style={{ fontFamily: FONT, fontSize: fs, lineHeight: 1.8 }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Output */}
      {entries.map((e, i) => (
        <div key={i}>
          {e.prompt && (
            <div style={{ color: '#00ff41', textShadow: '0 0 4px rgba(0,255,65,0.6)' }}>
              <span style={{ color: '#00ccff' }}>{e.prompt}</span>{' '}
            </div>
          )}
          {e.output && (
            <div style={{ color: e.color ?? '#00ff41', textShadow: `0 0 4px ${e.color ?? 'rgba(0,255,65,0.5)'}`, paddingLeft: '0.5rem' }}>
              {renderOutput(e)}
            </div>
          )}
          {e.qr && qrDataUrl && (
            <div style={{ margin: '0.75rem 0 0.25rem 0.5rem' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="QR Code"
                style={{ width: '160px', height: '160px', imageRendering: 'pixelated', display: 'block' }}
              />
              <div style={{ color: '#888', fontSize: `calc(${fs} * 0.85)`, marginTop: '4px' }}>
                scan or visit: <span style={{ color: '#00ff41' }}>{secretUrl}</span>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Input line */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
        <span style={{ color: '#00ccff', whiteSpace: 'nowrap', textShadow: '0 0 4px rgba(0,204,255,0.6)' }}>
          {prompt()}
        </span>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); run(input); }
          }}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#00ff41',
            fontFamily: FONT,
            fontSize: fs,
            textShadow: '0 0 4px rgba(0,255,65,0.6)',
            caretColor: '#00ff41',
            minWidth: 0,
          }}
        />
      </div>

      <div ref={bottomRef} />
    </div>
  );
}
