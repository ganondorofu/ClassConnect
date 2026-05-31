'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

// ── Fake filesystem ──────────────────────────────────────────────────────────

type FSFile = { type: 'file'; content: string; hidden?: boolean; special?: 'qr' };
type FSDir  = { type: 'dir';  children: string[] };
type FSNode = FSFile | FSDir;

const FS: Record<string, FSNode> = {
  '/': { type: 'dir', children: ['home', 'var', 'tmp', 'etc', 'proc'] },

  '/home': { type: 'dir', children: ['user'] },
  '/home/user': { type: 'dir', children: ['README.txt', 'hint.txt', '.profile'] },
  '/home/user/README.txt': {
    type: 'file',
    content:
`SYSTEM COMPROMISED
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
    content:
`# system profile
export USER=guest
export HOME=/home/user
# debug: see /var/log/breach.log`,
  },

  '/var': { type: 'dir', children: ['log'] },
  '/var/log': { type: 'dir', children: ['breach.log', 'system.log'] },
  '/var/log/breach.log': {
    type: 'file',
    content:
`[2026-05-31 09:12:01] INFO  System boot
[2026-05-31 09:12:33] INFO  Network interface up
[2026-05-31 09:15:02] WARN  Unauthorized access from 0.0.0.0
[2026-05-31 09:15:03] ALERT Exfiltration detected
[2026-05-31 09:15:03] ALERT Payload dumped to /tmp/flag
[2026-05-31 09:15:04] ERROR Access control bypassed`,
  },
  '/var/log/system.log': {
    type: 'file',
    content:
`[2026-05-31 09:12:01] kernel: Linux version 6.1.0
[2026-05-31 09:12:02] kernel: Booting...
[2026-05-31 09:12:05] kernel: Mount OK`,
  },

  '/tmp': { type: 'dir', children: ['flag'] },
  '/tmp/flag': { type: 'file', special: 'qr', content: '' },

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

// ── Path helpers ─────────────────────────────────────────────────────────────

function normPath(p: string): string {
  const parts: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return '/' + parts.join('/');
}

function resolvePath(cwd: string, input: string): string {
  return normPath(input.startsWith('/') ? input : cwd + '/' + input);
}

// ── Command definitions ───────────────────────────────────────────────────────

const FORBIDDEN = [
  'rm', 'rmdir', 'dd', 'mkfs', 'chmod', 'chown',
  'kill', 'killall', 'reboot', 'shutdown', 'poweroff',
  'halt', 'fdisk', 'mkswap', 'format',
];

// ── Types ─────────────────────────────────────────────────────────────────────

// ls エントリは構造化して持つ（文字列エスケープ hack を避ける）
type LSEntry = { name: string; isDir: boolean };

interface HistoryEntry {
  prompt: string;
  output: string;
  color?: string;
  ls?: LSEntry[];   // ls コマンドの結果
  qr?: string;      // QR コード data URL
}

// ── Component ────────────────────────────────────────────────────────────────

const FONT = '"Courier New", Courier, monospace';

export function FakeShell() {
  const [cwd, setCwd] = useState('/home/user');
  const cwdRef = useRef('/home/user');   // async 関数内で最新値を参照するため
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([
    { prompt: '', output: 'Shell access granted. Type "help" for available commands.', color: '#ffff00' },
  ]);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // cwd が変わったら ref も更新
  useEffect(() => { cwdRef.current = cwd; }, [cwd]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  function promptStr(dir: string) {
    return `guest@class2x:${dir === '/home/user' ? '~' : dir}$`;
  }

  async function run(raw: string) {
    const trimmed = raw.trim();
    const currentCwd = cwdRef.current;

    if (!trimmed) {
      setHistory(prev => [...prev, { prompt: promptStr(currentCwd), output: '' }]);
      setInput('');
      return;
    }

    const tokens = trimmed.split(/\s+/);
    const cmd = tokens[0];
    const args = tokens.slice(1);
    const arg = args.join(' ');

    let output = '';
    let color: string | undefined;
    let ls: LSEntry[] | undefined;
    let qr: string | undefined;

    // ── Commands ──────────────────────────────────────────────────────────────

    if (cmd === 'help') {
      output =
`Available commands:
  ls [-la] [path]   list directory contents
  cat <file>        print file contents
  cd <dir>          change directory
  pwd               print working directory
  whoami            print current user
  echo [text]       print text
  clear             clear terminal
  help              show this help`;

    } else if (cmd === 'pwd') {
      output = currentCwd;

    } else if (cmd === 'whoami') {
      output = 'guest';

    } else if (cmd === 'uname') {
      output = args.includes('-a')
        ? 'Linux class2x-mainframe 6.1.0 #1 SMP x86_64 GNU/Linux'
        : 'Linux';

    } else if (cmd === 'echo') {
      output = arg || '';

    } else if (cmd === 'clear') {
      setCwd(currentCwd); // no-op but flushes
      setHistory([]);
      setInput('');
      return;

    } else if (cmd === 'sudo') {
      output = 'sudo: Permission denied. This incident will be reported.';
      color = '#ff4444';

    } else if (FORBIDDEN.includes(cmd)) {
      output = `${cmd}: Permission denied: you lack the required privileges.`;
      color = '#ff4444';

    } else if (cmd === 'ls') {
      const showHidden = args.some(a => a.startsWith('-') && a.includes('a'));
      const pathArg = args.find(a => !a.startsWith('-'));
      const target = pathArg ? resolvePath(currentCwd, pathArg) : currentCwd;
      const n = FS[target];

      if (!n) {
        output = `ls: cannot access '${pathArg ?? target}': No such file or directory`;
        color = '#ff4444';
      } else if (n.type === 'file') {
        ls = [{ name: pathArg ?? target, isDir: false }];
      } else {
        const entries: LSEntry[] = [];
        if (showHidden) {
          entries.push({ name: '.', isDir: true }, { name: '..', isDir: true });
        }
        for (const name of n.children) {
          const childPath = target === '/' ? `/${name}` : `${target}/${name}`;
          const child = FS[childPath];
          if (!child) continue;
          if ((child as FSFile).hidden && !showHidden) continue;
          entries.push({ name: child.type === 'dir' ? `${name}/` : name, isDir: child.type === 'dir' });
        }
        ls = entries;
      }

    } else if (cmd === 'cat') {
      if (!arg) {
        output = 'cat: missing operand';
        color = '#ff4444';
      } else {
        const target = resolvePath(currentCwd, arg);
        const n = FS[target];
        if (!n) {
          output = `cat: ${arg}: No such file or directory`;
          color = '#ff4444';
        } else if (n.type === 'dir') {
          output = `cat: ${arg}: Is a directory`;
          color = '#ff4444';
        } else if (n.special === 'qr') {
          try {
            const secretUrl = `${window.location.origin}/secret`;
            qr = await QRCode.toDataURL(secretUrl, {
              width: 200,
              margin: 2,
              color: { dark: '#00ff41', light: '#050505' },
            });
            output =
`Decrypting payload...
Access token verified.
Rendering encoded data...`;
            color = '#00ff41';
          } catch {
            output = 'Error: failed to render payload.';
            color = '#ff4444';
          }
        } else {
          output = n.content;
        }
      }

    } else if (cmd === 'cd') {
      const dest = !arg || arg === '~' ? '/home/user' : resolvePath(currentCwd, arg);
      const n = FS[dest];
      if (!n) {
        output = `cd: ${arg}: No such file or directory`;
        color = '#ff4444';
      } else if (n.type === 'file') {
        output = `cd: ${arg}: Not a directory`;
        color = '#ff4444';
      } else {
        setCwd(dest);
        cwdRef.current = dest;
        setHistory(prev => [...prev, { prompt: promptStr(currentCwd), output: '' }]);
        setInput('');
        return;
      }

    } else if (cmd === 'man') {
      output = `What manual page do you want?\nTry "help" instead.`;

    } else if (cmd === 'bash' || cmd === 'sh' || cmd === 'zsh' || cmd === 'fish') {
      output = `${cmd}: You're already in a shell.`;

    } else if (cmd === 'python' || cmd === 'python3' || cmd === 'python2') {
      output = `${cmd}: interpreter has been disabled on this system.`;
      color = '#ff4444';

    } else if (cmd === 'vi' || cmd === 'vim' || cmd === 'nano') {
      output = `${cmd}: editor is not available on this system.`;
      color = '#ff4444';

    } else if (cmd === 'exit' || cmd === 'logout' || cmd === 'quit') {
      output = 'logout: session terminated.\n\n...just kidding.';

    } else if (cmd === 'history') {
      output = 'bash: history: command history not available.';
      color = '#ff4444';

    } else {
      output = `${cmd}: command not found`;
      color = '#ff4444';
    }

    setHistory(prev => [...prev, { prompt: promptStr(currentCwd), output, color, ls, qr }]);
    setInput('');
  }

  // モバイル: visualViewport リサイズ（キーボード開閉）時に入力欄へスクロール
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      inputRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  const fs = 'clamp(13px, 3.5vw, 15px)';

  return (
    <div
      style={{ fontFamily: FONT, fontSize: fs, lineHeight: 1.8, paddingBottom: '0.5rem' }}
      onClick={() => inputRef.current?.focus()}
    >
      {history.map((e, i) => (
        <div key={i}>
          {/* プロンプト行 */}
          {e.prompt && (
            <div>
              <span style={{ color: '#00ccff', textShadow: '0 0 4px rgba(0,204,255,0.6)' }}>{e.prompt}</span>
            </div>
          )}
          {/* テキスト出力 */}
          {e.output && (
            <div style={{
              color: e.color ?? '#00ff41',
              textShadow: `0 0 4px ${e.color ?? 'rgba(0,255,65,0.5)'}`,
              paddingLeft: '0.5rem',
              whiteSpace: 'pre-wrap',
            }}>
              {e.output}
            </div>
          )}
          {/* ls 出力 */}
          {e.ls && (
            <div style={{ paddingLeft: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0 1.5rem' }}>
              {e.ls.map((entry, j) => (
                <span key={j} style={{
                  color: entry.isDir ? '#6699ff' : '#00ff41',
                  textShadow: `0 0 4px ${entry.isDir ? 'rgba(102,153,255,0.5)' : 'rgba(0,255,65,0.5)'}`,
                }}>
                  {entry.name}
                </span>
              ))}
            </div>
          )}
          {/* QR コード */}
          {e.qr && (
            <div style={{ margin: '0.75rem 0 0.25rem 0.5rem' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={e.qr}
                alt="QR Code"
                style={{ width: '160px', height: '160px', imageRendering: 'pixelated', display: 'block' }}
              />
            </div>
          )}
        </div>
      ))}

      {/* 入力行 — sticky で常に画面下部に固定 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.4rem',
        marginTop: '0.25rem',
        position: 'sticky', bottom: 0,
        background: '#050505',
        paddingTop: '0.25rem',
        paddingBottom: 'env(safe-area-inset-bottom, 0.25rem)',
      }}>
        <span style={{ color: '#00ccff', whiteSpace: 'nowrap', textShadow: '0 0 4px rgba(0,204,255,0.6)', flexShrink: 0 }}>
          {promptStr(cwd)}
        </span>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); run(input); }
          }}
          onFocus={() => {
            setTimeout(() => {
              inputRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }, 300); // キーボードアニメーション待ち
          }}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          style={{
            flex: 1, minWidth: 0,
            background: 'transparent', border: 'none', outline: 'none',
            color: '#00ff41', fontFamily: FONT, fontSize: fs,
            textShadow: '0 0 4px rgba(0,255,65,0.6)',
            caretColor: '#00ff41',
          }}
        />
      </div>

      <div ref={bottomRef} />
    </div>
  );
}
