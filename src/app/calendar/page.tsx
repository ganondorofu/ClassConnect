
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ChevronLeft, ChevronRight, Info, AlertCircle, WifiOff, CalendarDays as CalendarDaysIcon } from 'lucide-react';
import { format, addDays, subMonths, startOfMonth, endOfMonth, isSameDay, addMonths, startOfWeek, endOfWeek } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import type { DailyAnnouncement, DailyGeneralAnnouncement } from '@/models/announcement';
import type { SchoolEvent, TimetableSettings } from '@/models/timetable';
import { queryFnGetCalendarDisplayableItemsForMonth, queryFnGetDailyGeneralAnnouncement, queryFnGetTimetableSettings } from '@/controllers/timetableController';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import type { Subject } from '@/models/subject';
import { queryFnGetSubjects } from '@/controllers/subjectController';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from '@/components/ui/scroll-area';
import { buttonVariants } from "@/components/ui/button";


const queryClient = new QueryClient();

type CalendarItem = (DailyAnnouncement | SchoolEvent | DailyGeneralAnnouncement) & { itemType: 'announcement' | 'event' | 'general' };

function CalendarPageContent() {
  const [currentMonthDate, setCurrentMonthDate] = useState(startOfMonth(new Date()));
  const [isOffline, setIsOffline] = useState(false);
  const router = useRouter();
  const { user, isAnonymous, loading: authLoading } = useAuth();

  const [isDayDetailModalOpen, setIsDayDetailModalOpen] = useState(false);
  const [selectedDayForModal, setSelectedDayForModal] = useState<Date | null>(null);


  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      setIsOffline(!navigator.onLine);
    }
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
  
  const daysInMonth = useMemo(() => {
    const monthStart = startOfMonth(currentMonthDate);
    // Ensure the calendar grid shows full weeks, even if they span across months
    const displayStart = startOfWeek(monthStart, { locale: ja });
    const monthEnd = endOfMonth(currentMonthDate);
    const displayEnd = endOfWeek(monthEnd, { locale: ja });
    
    const daysArray = [];
    for (let day = displayStart; day <= displayEnd; day = addDays(day, 1)) {
      daysArray.push(day);
    }
    return daysArray;
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
  
  const handleDayClick = (day: Date) => {
    setSelectedDayForModal(day);
    setIsDayDetailModalOpen(true);
  };

  const itemsForSelectedDay = useMemo(() => {
    if (!selectedDayForModal || !combinedItems) return [];
    const dateStr = format(selectedDayForModal, 'yyyy-MM-dd');
    return combinedItems.filter(item => {
      if (item.itemType === 'event') {
        return dateStr >= item.startDate && dateStr <= (item.endDate ?? item.startDate);
      }
      return item.date === dateStr;
    });
  }, [selectedDayForModal, combinedItems]);


  const isLoading = isLoadingSettings || isLoadingSubjects || isLoadingItems || isLoadingGeneralAnnouncements || authLoading;

  const renderDayContent = (day: Date): React.ReactNode => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const itemsForDayInCell = combinedItems.filter(item => {
       if (item.itemType === 'event') {
           return dateStr >= item.startDate && dateStr <= (item.endDate ?? item.startDate);
       }
       return item.date === dateStr;
    });

    // Determine if the day is outside the current month for styling
    const isOutsideMonth = day.getMonth() !== currentMonthDate.getMonth();

    return (
      <div className={cn("relative flex flex-col items-start p-1 h-full overflow-hidden w-full", isOutsideMonth && "opacity-50")}>
        <span className={cn("absolute top-1 right-1 text-xs", isSameDay(day, new Date()) && !isOutsideMonth && "font-bold text-primary")}>
            {format(day, 'd')}
        </span>
        {itemsForDayInCell.length > 0 && (
          <div className="mt-4 space-y-0.5 w-full">
            {itemsForDayInCell.slice(0, 2).map((item, index) => ( // Show up to 2 items, adjust as needed
              <div
                key={`${item.itemType}-${item.id || (item as DailyAnnouncement).period || index}-cell`}
                className={cn(
                  "text-xs px-1 py-0.5 rounded-sm w-full truncate",
                  item.itemType === 'event' ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300' :
                  item.itemType === 'announcement' ? 'bg-green-500/20 text-green-700 dark:text-green-300' :
                  'bg-purple-500/20 text-purple-700 dark:text-purple-300' 
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
                    (subjectsMap?.get(item.subjectIdOverride || '') || '連絡') + (item.text ? `: ${item.text.substring(0,10)}${item.text.length > 10 ? '...':''}`: '') :
                    (item as DailyGeneralAnnouncement).content.substring(0,20) + "..."
                }
              </div>
            ))}
            {itemsForDayInCell.length > 2 && (
              <div className="text-xs text-muted-foreground mt-0.5">他 {itemsForDayInCell.length - 2} 件</div>
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
      <div className="flex flex-col h-full">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-2 sm:gap-0">
          <h1 className="text-xl sm:text-2xl font-semibold">クラスカレンダー</h1>
          <div className="flex items-center gap-1 sm:gap-2">
            <Button variant="outline" size="icon" onClick={handlePrevMonth} disabled={isLoading} className="h-8 w-8 sm:h-9 sm:w-9">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-base sm:text-lg font-medium w-28 sm:w-32 text-center">
              {format(currentMonthDate, 'yyyy年 M月', { locale: ja })}
            </span>
            <Button variant="outline" size="icon" onClick={handleNextMonth} disabled={isLoading} className="h-8 w-8 sm:h-9 sm:w-9">
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

        <Card className="shadow-lg flex-grow flex flex-col overflow-hidden">
          <CardContent className="p-0 sm:p-2 md:p-4 flex-1 flex flex-col">
            {isLoading ? (
              <div className="p-4 flex-1 flex flex-col">
                  <Skeleton className="h-8 w-1/3 mb-4" />
                  <Skeleton className="flex-grow w-full" />
              </div>
            ) : errorItems ? (
              <Alert variant="destructive" className="m-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>エラー</AlertTitle>
                <AlertDescription>カレンダー情報の読み込みに失敗しました。</AlertDescription>
              </Alert>
            ) : (
              <Calendar
                mode="single"
                selected={selectedDayForModal} 
                onSelect={(day) => day && handleDayClick(day)}
                month={currentMonthDate}
                onMonthChange={setCurrentMonthDate}
                locale={ja}
                fixedWeeks // Ensures 6 weeks are always rendered
                className="w-full p-0 flex-1 flex flex-col" // Calendar root is flex-col and grows
                classNames={{
                  months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                  month: "space-y-4 flex-1 flex flex-col", // Month div takes flex-1 and is flex-col
                  caption: "flex justify-center pt-1 relative items-center",
                  caption_label: "text-sm font-medium",
                  nav: "space-x-1 flex items-center",
                  nav_button: cn(
                    buttonVariants({ variant: "outline" }),
                    "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
                  ),
                  nav_button_previous: "absolute left-1",
                  nav_button_next: "absolute right-1",
                  table: "w-full border-collapse flex-1 flex flex-col", // Table takes flex-1 and is flex-col
                  head_row: "flex", 
                  head_cell: "text-muted-foreground rounded-md flex-1 font-normal text-[0.8rem] text-center py-2", // Head cells share width
                  tbody: "flex-1 flex flex-col", // Tbody takes flex-1 and is flex-col (for rows)
                  row: "flex w-full flex-1", // Each row takes flex-1 height within tbody
                  cell: cn( // Cell takes flex-1 width within row and h-full
                    "flex-1 p-0 relative text-center text-sm h-full", 
                    "[&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20"
                  ),
                  day: cn( // Day button fills the cell
                    buttonVariants({ variant: "ghost" }),
                    "h-full w-full p-0 font-normal aria-selected:opacity-100 flex flex-col items-start justify-start" // Align content top-left
                  ),
                  day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground", 
                  day_today: "bg-accent text-accent-foreground font-bold", 
                  day_outside: "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30", // Style for days outside current month
                  day_disabled: "text-muted-foreground opacity-50",
                  day_range_end: "day-range-end",
                  day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
                  day_hidden: "invisible",
                }}
                components={{
                  DayContent: ({ date }) => renderDayContent(date),
                }}
                disabled={isOffline}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDayDetailModalOpen} onOpenChange={setIsDayDetailModalOpen}>
        <DialogContent className="sm:max-w-md md:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedDayForModal ? format(selectedDayForModal, 'yyyy年M月d日 (E)', { locale: ja }) : '予定詳細'}
            </DialogTitle>
            <DialogDescription>
              この日の予定・連絡事項の一覧です。
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[280px] sm:h-[350px] w-full pr-3">
            {isLoadingItems || isLoadingGeneralAnnouncements ? (
              <div className="space-y-2 p-2">
                {[...Array(3)].map((_, i) => <Skeleton key={`modal-skel-${i}`} className="h-16 w-full" />)}
              </div>
            ) : itemsForSelectedDay.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 text-center">この日の予定や連絡はありません。</p>
            ) : (
              <ul className="space-y-3 p-1">
                {itemsForSelectedDay.map((item, index) => (
                  <li key={`${item.itemType}-${item.id || (item as DailyAnnouncement).period || index}-modal`} 
                      className="p-3 border rounded-md shadow-sm bg-card hover:shadow-md transition-shadow">
                    <p className={cn(
                      "font-semibold text-sm mb-1",
                      item.itemType === 'event' ? 'text-blue-600 dark:text-blue-400' :
                      item.itemType === 'announcement' ? 'text-green-600 dark:text-green-400' :
                      'text-purple-600 dark:text-purple-400'
                    )}>
                      {item.itemType === 'event' ? <><CalendarDaysIcon className="inline-block mr-1.5 h-4 w-4 align-text-bottom" />行事: {item.title}</> :
                       item.itemType === 'announcement' ? 
                        <>
                         <Info className="inline-block mr-1.5 h-4 w-4 align-text-bottom" />
                         {`${item.period}限目の連絡` + (subjectsMap?.get(item.subjectIdOverride || '') ? ` (${subjectsMap.get(item.subjectIdOverride || '')})` : '')}
                        </>
                         :
                         <> <Info className="inline-block mr-1.5 h-4 w-4 align-text-bottom" />全体連絡</>
                       }
                    </p>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {item.itemType === 'event' ? item.description :
                       item.itemType === 'announcement' ? item.text :
                       (item as DailyGeneralAnnouncement).content}
                    </p>
                    {item.itemType === 'event' && item.startDate !== (item.endDate ?? item.startDate) && (
                      <p className="text-xs text-muted-foreground mt-1">
                        期間: {format(new Date(item.startDate), "M/d")} ~ {format(new Date(item.endDate ?? item.startDate), "M/d")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
          <DialogFooter className="mt-4 sm:justify-between">
             <Button variant="outline" onClick={() => setIsDayDetailModalOpen(false)} className="w-full sm:w-auto">
              閉じる
            </Button>
            <Button onClick={() => {
              if (selectedDayForModal) {
                router.push(`/?date=${format(selectedDayForModal, 'yyyy-MM-dd')}`);
                setIsDayDetailModalOpen(false);
              }
            }} disabled={!selectedDayForModal} className="w-full sm:w-auto">
              この日の時間割を見る
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

