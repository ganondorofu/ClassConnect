
"use client";

import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  LayoutDashboard,
  Settings,
  History,
  BookMarked,
  HelpCircle,
  CalendarDays,
  MessageSquarePlus,
  ShieldQuestion,
  ScrollText,
  ClipboardList,
  X
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
// import Image from 'next/image'; // Image component is no longer used

interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
}

const baseCommonLinks = [
  { href: '/', label: '時間割表', icon: LayoutDashboard },
  { href: '/calendar', label: 'カレンダー', icon: CalendarDays },
  { href: '/assignments', label: '課題一覧', icon: ClipboardList },
  { href: '/contact', label: 'お問い合わせ', icon: MessageSquarePlus },
  { href: '/help', label: 'ヘルプ', icon: HelpCircle },
];

const adminLinks = [
  { href: '/admin/subjects', label: '科目管理', icon: BookMarked },
  { href: '/admin/settings', label: '時間割設定', icon: Settings },
  { href: '/admin/inquiries', label: '問い合わせ管理', icon: ShieldQuestion },
  { href: '/admin/logs', label: '変更履歴', icon: History },
];

const updateLogLink = { href: '/updates', label: '更新ログ', icon: ScrollText };

export function Sidebar({ isOpen, toggleSidebar }: SidebarProps) {
  const { user, isAnonymous } = useAuth();
  const pathname = usePathname();

  let linksToDisplay = [...baseCommonLinks];
  if (user && !isAnonymous) {
    linksToDisplay.push(...adminLinks);
  }
  linksToDisplay.push(updateLogLink);

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[49] bg-black/30 backdrop-blur-sm md:hidden print:hidden"
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar itself acts as overlay on mobile, fixed on desktop */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full w-64 transform flex-col border-r bg-card text-card-foreground shadow-lg transition-transform duration-300 ease-in-out print:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-end border-b p-4 h-14"> {/* Adjusted height to match header, removed logo link, changed justify-between to justify-end */}
          <Button variant="ghost" size="icon" onClick={toggleSidebar} className="md:hidden"> {/* Close button for mobile */}
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
                  onClick={isOpen ? toggleSidebar : undefined}
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
      </aside>
    </>
  );
}

