
"use client";

import Link from 'next/link';
import Image from 'next/image';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { LogIn, LogOut, UserCircle, Menu as MenuIcon, X as XIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import type { Dispatch, SetStateAction } from 'react';

interface HeaderProps {
  toggleSidebar: () => void;
  isSidebarOpen: boolean;
}

export function Header({ toggleSidebar, isSidebarOpen }: HeaderProps) {
  const { user, loading, logout, isAnonymous } = useAuth();
  const router = useRouter();

  const handleLoginClick = () => {
    router.push('/login');
  };

  return (
    <header className="sticky top-0 z-[55] w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"> {/* Changed z-40 to z-[55] */}
      <div className="container mx-auto flex h-14 max-w-screen-2xl items-center px-4 md:px-8">
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="mr-2 relative z-[60]"> {/* Ensure button is above sidebar (z-50 for sidebar) */}
          {isSidebarOpen ? <XIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          <span className="sr-only">{isSidebarOpen ? "ナビゲーションを閉じる" : "ナビゲーションを開く"}</span>
        </Button>
        <div className="mr-4 flex items-center">
          <Link href="/" className="flex items-center space-x-2">
            <Image
              src="/logo.png" // Assumes logo.png is in the public directory
              alt="ClassConnect Logo"
              width={28}
              height={28}
              className="text-primary"
              data-ai-hint="logo education"
            />
            <span className="hidden font-bold sm:inline-block">
              ClassConnect
            </span>
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-end space-x-1 md:space-x-2">
          {loading ? (
             <div className="flex items-center gap-1 sm:gap-2">
                <Skeleton className="h-8 w-8 sm:w-20" />
                <Skeleton className="h-8 w-8" />
             </div>
          ) : user && !isAnonymous ? ( // Logged in as admin
            <>
              <span className="text-sm text-muted-foreground hidden md:inline-block truncate max-w-xs" title={user.email ?? undefined}>
                 {user.email}
              </span>
              <Button variant="outline" size="sm" onClick={logout}>
                <LogOut className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">ログアウト</span>
              </Button>
            </>
          ) : ( // Anonymous or not logged in
            <>
             {isAnonymous && (
                <span className="text-sm text-muted-foreground flex items-center mr-1 sm:mr-2">
                    <UserCircle className="h-4 w-4 mr-1" />
                    <span className="hidden sm:inline">ログインなしで利用中</span>
                    <span className="sm:hidden">ゲスト</span>
                </span>
             )}
             <Button variant="outline" size="sm" onClick={handleLoginClick}>
                <LogIn className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">管理者ログイン</span>
                <span className="sm:hidden">ログイン</span>
              </Button>
            </>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
