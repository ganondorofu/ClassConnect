
"use client"; 

import React, { useState } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

interface MainLayoutProps {
  children: React.ReactNode;
}

const queryClient = new QueryClient();

export default function MainLayout({ children }: MainLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen flex-col bg-background">
        <Header toggleSidebar={toggleSidebar} isSidebarOpen={isSidebarOpen} />
        <div className="flex flex-1">
          <Sidebar isOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
          <main className="flex-1 w-full py-4 px-4 md:py-6 md:px-8 overflow-x-auto">
            {children}
          </main>
        </div>
      </div>
    </QueryClientProvider>
  );
}
