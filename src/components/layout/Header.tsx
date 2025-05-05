"use client";

import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { CalendarCheck, Settings, History, BookMarked } from 'lucide-react'; // Added BookMarked icon

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Adjust container padding for smaller screens */}
      <div className="container flex h-14 items-center px-4 md:px-8">
        <div className="mr-4 flex items-center"> {/* Simplified structure */}
          <Link href="/" className="flex items-center space-x-2">
            <CalendarCheck className="h-6 w-6 text-primary" />
            <span className="hidden font-bold sm:inline-block">
              ClassConnect
            </span>
          </Link>
          {/* Navigation placeholder - Removed for simplicity in this context */}
        </div>
        {/* Mobile Menu Trigger (Placeholder) - Removed for simplicity */}
        <div className="flex flex-1 items-center justify-end space-x-1 md:space-x-2">
          {/* Adjust button padding and hide text on small screens */}
           <nav className="flex items-center gap-0 sm:gap-1"> {/* Adjusted gap for sm screens */}
             <Button variant="ghost" size="sm" className="px-2 sm:px-3" asChild>
                 <Link href="/admin/subjects" aria-label="科目管理">
                     <BookMarked className="h-4 w-4" />
                     <span className="hidden sm:inline ml-1">科目</span> {/* Shorten text */}
                 </Link>
             </Button>
             <Button variant="ghost" size="sm" className="px-2 sm:px-3" asChild>
                <Link href="/admin/settings" aria-label="設定">
                     <Settings className="h-4 w-4" />
                     <span className="hidden sm:inline ml-1">設定</span>
                </Link>
            </Button>
            <Button variant="ghost" size="sm" className="px-2 sm:px-3" asChild>
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