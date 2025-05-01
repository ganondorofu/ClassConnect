"use client";

import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { CalendarCheck, Settings, History } from 'lucide-react'; // Icons for navigation

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <div className="mr-4 hidden md:flex">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <CalendarCheck className="h-6 w-6 text-primary" />
            <span className="hidden font-bold sm:inline-block">
              ClassConnect
            </span>
          </Link>
          {/* Navigation placeholder - Implement routing later */}
          <nav className="flex items-center space-x-6 text-sm font-medium">
             {/* Example Nav Link */}
            {/* <Link
              href="/timetable"
              className="transition-colors hover:text-foreground/80 text-foreground/60"
            >
              時間割
            </Link> */}
             {/* Add more links as needed */}
          </nav>
        </div>
        {/* Mobile Menu Trigger (Placeholder) */}
        <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
          {/* Placeholder for Admin/Settings/Log Links - adjust visibility based on future auth */}
           <nav className="flex items-center gap-1">
             <Button variant="ghost" size="sm" asChild>
                <Link href="/admin/settings" aria-label="設定">
                     <Settings className="h-4 w-4" />
                     <span className="hidden sm:inline ml-1">設定</span>
                </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
                <Link href="/admin/logs" aria-label="履歴">
                     <History className="h-4 w-4" />
                    <span className="hidden sm:inline ml-1">履歴</span>
                </Link>
            </Button>
          </nav>

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
