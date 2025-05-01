import type React from 'react';
import { Header } from './Header';

interface MainLayoutProps {
  children: React.ReactNode;
}

// Corrected: Use default export
export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 container py-6">
        {children}
      </main>
      {/* Footer can be added here if needed */}
    </div>
  );
}
