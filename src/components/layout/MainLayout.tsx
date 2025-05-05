
import React from 'react'; // Ensure React is imported
import { Header } from './Header';

interface MainLayoutProps {
  children: React.ReactNode;
}

// Ensure default export
export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      {/* Adjust padding for responsiveness */}
      <main className="flex-1 container py-4 px-4 md:py-6 md:px-8">
        {children}
      </main>
      {/* Footer can be added here if needed */}
    </div>
  );
}

    