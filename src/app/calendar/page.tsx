"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ChevronLeft, ChevronRight, Info, AlertCircle, WifiOff, CalendarDays } from 'lucide-react';
import { format, addDays, subMonths, startOfMonth, endOfMonth, isSameDay, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import type { DailyAnnouncement, DailyGeneralAnnouncement } from '@/models/announcement';
import type { SchoolEvent, TimetableSettings } from '@/models/timetable';
import { queryFnGetCalendarDisplayableItemsForMonth, queryFnGetDailyGeneralAnnouncement, queryFnGetTimetableSettings } from '@/controllers/timetableController';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import type { Subject } from '@/models/subject';
import { queryFnGetSubjects } from '@/controllers/subjectController';

const queryClient = new QueryClient();

type CalendarItem = (DailyAnnouncement | SchoolEvent | DailyGeneralAnnouncement) & { itemType: 'announcement' | 'event' | 'general' };

function CalendarPageContent() {
  const [currentMonthDate, setCurrentMonthDate] = useState(startOfMonth(new Date()));
  const [isOffline, setIsOffline] = useState(false);
  const router = useRouter();
  const { user, isAnonymous, loading: authLoading } = useAuth();

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    if (typeof navigator !== 'undefined') setIsOffline(!navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleQueryError = (queryKey: string) => (error: unknown) => {
    console.error(`Calendar Query Error (${queryKey}):`, error);
    const isFirestoreUnavailable = (error as any)?.code === 'unavailable';
    setIsOffline(isFirestoreUnavailable || (typeof navigator !== 'undefined' && !navigator.onLine));
  };
  
  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth() + 1;

  const { data: settings, isLoading: isLoadingSettings } = useQuery<TimetableSettings, Error>({
    queryKey: ['timetableSettings'],
    queryFn: queryFnGetTimetableSettings,
    staleTime: Infinity,
    enabled: !isOffline && (!!user || isAnonymous),
    onError: handleQueryError('timetableSettingsCalendar'),
  });

  const { data: subjects, isLoading: isLoadingSubjects } = useQuery<Subject[], Error>({
    queryKey: ['subjects'],
    queryFn: queryFnGetSubjects,
    staleTime: 1000 * 60 * 15, // 15 minutes
    enabled: !isOffline && (!!user || isAnonymous),
    onError: handleQueryError('subjectsCalendar'),
  });
  const subjectsMap = useMemo(() => new Map(subjects?.map(s => [s.id, s.name])), [subjects]);


  const { data: calendarItemsData, isLoading: isLoadingItems, error: errorItems } = useQuery< (DailyAnnouncement | SchoolEvent)[], Error>({
    queryKey: ['calendarItems', year, month],
    queryFn: queryFnGetCalendarDisplayableItemsForMonth(year, month),
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: !isOffline && (!!user || isAnonymous),
    onError: handleQueryError('calendarItems'),
  });
  
  // Fetch general announcements for all days in the month
  const daysInMonth = useMemo(() => {
    const start = startOfMonth(currentMonthDate);
    const end = endOfMonth(currentMonthDate);
    const days = [];
    for (let day = start; day <= end; day = addDays(day, 1)) {
      days.push(day);
    }
    return days;
  }, [currentMonthDate]);

  const { data: generalAnnouncementsMap, isLoading: isLoadingGeneralAnnouncements } = useQuery<Record<string, DailyGeneralAnnouncement | null>, Error>({
    queryKey: ['generalAnnouncementsForMonth', year, month],
    queryFn: async () => {
      if (isOffline || (!user && !isAnonymous)) return {};
      const promises = daysInMonth.map(day => 
        queryFnGetDailyGeneralAnnouncement(format(day, 'yyyy-MM-dd'))().then(ann => ({ [format(day, 'yyyy-MM-dd')]: ann }))
      );
      const results = await Promise.all(promises);
      return results.reduce((acc, curr) => ({ ...acc, ...curr }), {});
    },
    staleTime: 1000 * 60 * 5,
    enabled: !isOffline && (!!user || isAnonymous) && daysInMonth.length > 0,
    onError: handleQueryError('generalAnnouncementsForMonth'),
  });


  const combinedItems = useMemo(() => {
    const items: CalendarItem[] = [];
    calendarItemsData?.forEach(item => {
      if ('startDate' in item) { // SchoolEvent
        items.push({ ...item, itemType: 'event' });
      } else if ('period' in item) { // DailyAnnouncement
        items.push({ ...item, itemType: 'announcement' });
      }
    });
     if (generalAnnouncementsMap) {
      Object.values(generalAnnouncementsMap).forEach(ann => {
        if (ann && ann.content) {
          items.push({ ...ann, itemType: 'general' });
        }
      });
    }
    return items;
  }, [calendarItemsData, generalAnnouncementsMap]);


  const handlePrevMonth = () => setCurrentMonthDate(subMonths(currentMonthDate, 1));
  const handleNextMonth = () => setCurrentMonthDate(addMonths(currentMonthDate, 1));
  const handleDayClick = (day: Date) => router.push(`/?date=${format(day, 'yyyy-MM-dd')}`);

  const isLoading = isLoadingSettings || isLoadingSubjects || isLoadingItems || isLoadingGeneralAnnouncements || authLoading;

  const renderDayContent = (day: Date): React.ReactNode => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const itemsForDay = combinedItems.filter(item => {
       if (item.itemType === 'event') {
           return dateStr >= item.startDate && dateStr <= (item.endDate ?? item.startDate);
       }
       return item.date === dateStr;
    });

    return (
      <div className="relative flex flex-col items-start p-1 h-full overflow-hidden">
        <span className={cn("absolute top-1 right-1 text-xs", isSameDay(day, new Date()) && "font-bold text-primary")}>
            {format(day, 'd')}
        </span>
        {itemsForDay.length > 0 && (
          <div className="mt-4 space-y-0.5 w-full">
            {itemsForDay.slice(0, 2).map((item, index) => ( // Show max 2 items initially
              <div
                key={`${item.itemType}-${item.id || (item as DailyAnnouncement).period || index}`}
                className={cn(
                  "text-xs px-1 py-0.5 rounded-sm w-full truncate",
                  item.itemType === 'event' ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300' :
                  item.itemType === 'announcement' ? 'bg-green-500/20 text-green-700 dark:text-green-300' :
                  'bg-purple-500/20 text-purple-700 dark:text-purple-300' // general
                )}
                title={
                    item.itemType === 'event' ? item.title : 
                    item.itemType === 'announcement' ? 
                        `${subjectsMap?.get(item.subjectIdOverride || '') || '連絡'}: ${item.text}` :
                        (item as DailyGeneralAnnouncement).content.substring(0,50) + '...'
                }
              >
                {item.itemType === 'event' ? item.title : 
                 item.itemType === 'announcement' ? 
                    (subjectsMap?.get(item.subjectIdOverride || '') || '連絡') + (item.text ? `: ${item.text}`: '') :
                    (item as DailyGeneralAnnouncement).content.substring(0,20) + "..."
                }
              </div>
            ))}
            {itemsForDay.length > 2 && (
              <div className="text-xs text-muted-foreground mt-0.5">他 {itemsForDay.length - 2} 件</div>
            )}
          </div>
        )}
      </div>
    );
  };


  if (authLoading) {
    return (
      <MainLayout>
        <Skeleton className="h-12 w-1/2 mb-4" />
        <Skeleton className="h-96 w-full" />
      </MainLayout>
    );
  }

  if (!user && !isAnonymous) {
    return (
      <MainLayout>
        <Alert variant="default" className="mt-4">
            <Info className="h-4 w-4" />
            <AlertTitle>カレンダーの表示</AlertTitle>
            <AlertDescription>
                ログインまたは「ログインなしで利用」を選択すると、カレンダーが表示されます。
            </AlertDescription>
        </Alert>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">クラスカレンダー</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevMonth} disabled={isLoading}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-lg font-medium w-32 text-center">
            {format(currentMonthDate, 'yyyy年 M月', { locale: ja })}
          </span>
          <Button variant="outline" size="icon" onClick={handleNextMonth} disabled={isLoading}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isOffline && (
        <Alert variant="destructive" className="mb-4">
          <WifiOff className="h-4 w-4" />
          <AlertTitle>オフライン</AlertTitle>
          <AlertDescription>現在オフラインです。カレンダーの表示が不正確な場合があります。</AlertDescription>
        </Alert>
      )}

      <Card className="shadow-lg">
        <CardContent className="p-0 sm:p-2 md:p-4">
          {isLoading ? (
            <div className="p-4">
                <Skeleton className="h-8 w-1/3 mb-4" />
                <Skeleton className="h-[400px] w-full" />
            </div>
          ) : errorItems ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>エラー</AlertTitle>
              <AlertDescription>カレンダー情報の読み込みに失敗しました。</AlertDescription>
            </Alert>
          ) : (
            <Calendar
              mode="single"
              selected={new Date()} // Today is "selected" for style, but navigation is on click
              onSelect={(day) => day && handleDayClick(day)}
              month={currentMonthDate}
              onMonthChange={setCurrentMonthDate}
              locale={ja}
              className="w-full p-0 [&_td]:h-20 [&_td]:align-top [&_th]:h-10"
              classNames={{
                day: "h-full w-full p-0",
                day_selected: "bg-transparent text-foreground hover:bg-accent/50", // Don't visually select day
                day_today: "bg-accent text-accent-foreground font-bold",
              }}
              components={{
                DayContent: ({ date }) => renderDayContent(date),
              }}
              disabled={isOffline}
            />
          )}
        </CardContent>
      </Card>
    </MainLayout>
  );
}

export default function CalendarPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <CalendarPageContent />
    </QueryClientProvider>
  );
}
