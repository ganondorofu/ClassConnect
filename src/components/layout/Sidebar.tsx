
"use client";

import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Home,
  Settings,
  History,
  BookMarked,
  HelpCircle,
  CalendarDays,
  MessageSquarePlus,
  ShieldQuestion,
  ScrollText, // For Update Log
  ClipboardList, // For Assignments
  LayoutDashboard, // For Dashboard (Home)
  X
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
}

const commonLinks = [
  { href: '/', label: 'ダッシュボード', icon: Home },
  { href: '/calendar', label: 'カレンダー', icon: CalendarDays },
  { href: '/assignments', label: '課題一覧', icon: ClipboardList },
  { href: '/updates', label: '更新ログ', icon: ScrollText },
  { href: '/contact', label: 'お問い合わせ', icon: MessageSquarePlus },
  { href: '/help', label: 'ヘルプ', icon: HelpCircle },
];

const adminLinks = [
  { href: '/admin/subjects', label: '科目管理', icon: BookMarked },
  { href: '/admin/settings', label: '時間割設定', icon: Settings },
  { href: '/admin/inquiries', label: '問い合わせ管理', icon: ShieldQuestion },
  { href: '/admin/logs', label: '変更履歴', icon: History },
];

export function Sidebar({ isOpen, toggleSidebar }: SidebarProps) {
  const { user, isAnonymous } = useAuth();
  const pathname = usePathname();

  const linksToDisplay = user && !isAnonymous ? [...commonLinks, ...adminLinks] : commonLinks;

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          onClick={toggleSidebar}
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-full w-64 transform flex-col border-r bg-card text-card-foreground shadow-lg transition-transform duration-300 ease-in-out md:sticky md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b p-4">
          <Link href="/" className="flex items-center space-x-2" onClick={isOpen && toggleSidebar}>
            <Image
              src="/logo.png"
              alt="ClassConnect Logo"
              width={28}
              height={28}
              className="text-primary"
              data-ai-hint="logo education"
            />
            <span className="font-bold">ClassConnect</span>
          </Link>
          <Button variant="ghost" size="icon" onClick={toggleSidebar} className="md:hidden">
            <X className="h-5 w-5" />
            <span className="sr-only">サイドバーを閉じる</span>
          </Button>
        </div>
        <nav className="flex-1 overflow-y-auto p-4">
          <ul className="space-y-1">
            {linksToDisplay.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={isOpen && toggleSidebar}
                  className={cn(
                    buttonVariants({ variant: 'ghost' }),
                    "w-full justify-start",
                    pathname === href ? "bg-primary/10 text-primary dark:bg-primary/20" : "hover:bg-muted"
                  )}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {/* Optional Footer Content */}
        {/* <div className="mt-auto border-t p-4"> ... </div> */}
      </aside>
    </>
  );
}
