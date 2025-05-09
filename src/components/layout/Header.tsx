"use client";

import Link from 'next/link';
import Image from 'next/image';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Settings, History, BookMarked, LogIn, LogOut, UserCircle, HelpCircle, CalendarDays } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext'; 
import { Skeleton } from '@/components/ui/skeleton'; 
import { useRouter } from 'next/navigation';

export function Header() {
  const { user, loading, logout, isAnonymous } = useAuth();
  const router = useRouter();

  const handleLoginClick = () => {
    router.push('/login');
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center px-4 md:px-8">
        <div className="mr-4 flex items-center">
          <Link href="/" className="flex items-center space-x-2">
            <Image
              src="/logo.png"
              alt="ClassConnect Logo"
              width={24}
              height={24}
              className="text-primary"
              data-ai-hint="logo education"
            />
            <span className="hidden font-bold sm:inline-block">
              ClassConnect
            </span>
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-end space-x-1 md:space-x-2">
          {/* Calendar Link - Visible to all */}
          <Button variant="ghost" size="sm" className="px-2 sm:px-3" asChild>
            <Link href="/calendar" aria-label="カレンダー">
              <CalendarDays className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">カレンダー</span>
            </Link>
          </Button>

          {loading ? (
             <div className="flex items-center gap-1 sm:gap-2">
                <Skeleton className="h-8 w-8 sm:w-20" />
                <Skeleton className="h-8 w-8 sm:w-20" />
                <Skeleton className="h-8 w-8 sm:w-20" />
                <Skeleton className="h-8 w-8 sm:w-20" />
             </div>
          ) : user && !isAnonymous ? ( // Logged in as admin
            <>
              <nav className="flex items-center gap-0 sm:gap-1">
                <Button variant="ghost" size="sm" className="px-2 sm:px-3" asChild>
                  <Link href="/admin/subjects" aria-label="科目管理">
                    <BookMarked className="h-4 w-4" />
                    <span className="hidden sm:inline ml-1">科目</span>
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
                 <Button variant="ghost" size="sm" className="px-2 sm:px-3" asChild>
                  <Link href="/help" aria-label="ヘルプ">
                    <HelpCircle className="h-4 w-4" />
                    <span className="hidden sm:inline ml-1">ヘルプ</span>
                  </Link>
                </Button>
              </nav>
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
              <Button variant="ghost" size="sm" className="px-2 sm:px-3" asChild>
                  <Link href="/help" aria-label="ヘルプ">
                    <HelpCircle className="h-4 w-4" />
                    <span className="hidden sm:inline ml-1">ヘルプ</span>
                  </Link>
              </Button>
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
