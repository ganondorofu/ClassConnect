import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SYSTEM ERROR',
  description: 'Critical system failure detected.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: '#000', color: '#00ff41', fontFamily: 'monospace' }}>
        {children}
      </body>
    </html>
  );
}
