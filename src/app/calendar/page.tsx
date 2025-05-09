"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ChevronLeft, ChevronRight, Info, AlertCircle, WifiOff, CalendarDays as CalendarDaysIcon, PlusCircle, Edit, Trash2 } from 'lucide-react';
import { format, addDays, subMonths, startOfMonth, endOfMonth, isSameDay, addMonths, startOfWeek, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import type { DailyAnnouncement, DailyGeneralAnnouncement } from '@/models/announcement';
import type { SchoolEvent, TimetableSettings } from '@/models/timetable';
import { queryFnGetCalendarDisplayableItemsForMonth, queryFnGetDailyGeneralAnnouncement, queryFnGetTimetableSettings, deleteSchoolEvent } from '@/controllers/timetableController';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import type { Subject } from '@/models/subject';
import { queryFnGetSubjects } from '@/controllers/subjectController';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buttonVariants } from "@/components/ui/button";
import EventFormDialog from '@/components/calendar/EventFormDialog'; // Updated import
import { useToast } from '@/hooks/use-toast';


const queryClient = new QueryClient();

type CalendarItem = (DailyAnnouncement | SchoolEvent | DailyGeneralAnnouncement) & { itemType: 'announcement' | 'event' | 'general' };
const MAX_PREVIEW_ITEMS_IN_CELL = 2;

function CalendarPageContent() {
  const [currentMonthDate, setCurrentMonthDate] = useState(startOfMonth(new Date()));
  const [isOffline, setIsOffline] = useState(false);
  const router = useRouter();
  const { user, isAnonymous, loading: authLoading } = useAuth();
  const queryClientHook = useQueryClient();
  const { toast } = useToast();

  const [isDayDetailModalOpen, setIsDayDetailModalOpen] = useState(false);
  const [selectedDayForModal, setSelectedDayForModal] = useState<Date | null>(null);
  
  const [isEventFormModalOpen, setIsEventFormModalOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<SchoolEvent | null>(null);


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
    staleTime: 1000 * 60 * 1, 
    enabled: !isOffline && (!!user || isAnonymous),
    onError: handleQueryError('calendarItems'),
    refetchOnMount: true, 
    refetchOnWindowFocus: true,
  });
  
  const daysToFetchForAnnouncements = useMemo(() => {
    const firstDayOfMonth = startOfMonth(currentMonthDate);
    const displayStartDate = startOfWeek(firstDayOfMonth, { locale: ja, weekStartsOn: 0 }); 
    const displayEndDate = addDays(displayStartDate, (6 * 7) - 1);

    const daysArray = [];
    let currentDay = displayStartDate;
    while (currentDay <= displayEndDate) {
      daysArray.push(currentDay);
      currentDay = addDays(currentDay, 1);
    }
    return daysArray;
  }, [currentMonthDate]);


  const { data: generalAnnouncementsMap, isLoading: isLoadingGeneralAnnouncements } = useQuery<Record<string, DailyGeneralAnnouncement | null>, Error>({
    queryKey: ['generalAnnouncementsForMonth', format(currentMonthDate, 'yyyy-MM')],
    queryFn: async () => {
      if (isOffline || (!user && !isAnonymous)) return {};
      const promises = daysToFetchForAnnouncements.map(day => 
        queryFnGetDailyGeneralAnnouncement(format(day, 'yyyy-MM-dd'))().then(ann => ({ [format(day, 'yyyy-MM-dd')]: ann }))
      );
      const results = await Promise.all(promises);
      return results.reduce((acc, curr) => ({ ...acc, ...curr }), {});
    },
    staleTime: 1000 * 60 * 1,
    enabled: !isOffline && (!!user || isAnonymous) && daysToFetchForAnnouncements.length > 0,
    onError: handleQueryError('generalAnnouncementsForMonth'),
  });


  const combinedItems = useMemo(() => {
    const items: CalendarItem[] = [];
    calendarItemsData?.forEach(item => {
      if ('startDate' in item) { 
        items.push({ ...item, itemType: 'event' });
      } else if ('period' in item) { 
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
    const filtered = combinedItems.filter(item => {
      if (item.itemType === 'event') {
        return dateStr >= item.startDate && dateStr <= (item.endDate ?? item.startDate);
      }
      return item.date === dateStr;
    });

    return filtered.sort((a, b) => {
        const typeOrder = { general: 0, announcement: 1, event: 2 };
        const orderA = typeOrder[a.itemType];
        const orderB = typeOrder[b.itemType];
        if (orderA !== orderB) return orderA - orderB;
        
        if (a.itemType === 'announcement' && b.itemType === 'announcement') {
            return (a as DailyAnnouncement).period - (b as DailyAnnouncement).period;
        }
        if (a.itemType === 'event' && b.itemType === 'event') {
             const startDateA = a.startDate ? parseISO(a.startDate).getTime() : 0;
             const startDateB = b.startDate ? parseISO(b.startDate).getTime() : 0;
             return startDateA - startDateB;
        }
        return 0;
    });
  }, [selectedDayForModal, combinedItems]);

  const deleteEventMutation = useMutation({
    mutationFn: (eventId: string) => deleteSchoolEvent(eventId, user?.uid ?? 'admin_user_calendar_event_delete'),
    onSuccess: () => {
      toast({ title: "成功", description: "行事を削除しました。" });
      queryClientHook.invalidateQueries({ queryKey: ['calendarItems', year, month] });
      setIsDayDetailModalOpen(false); // Close modal after deletion
    },
    onError: (error: Error) => {
      toast({ title: "エラー", description: `行事の削除に失敗しました: ${error.message}`, variant: "destructive" });
    }
  });

  const handleOpenAddEventModal = () => {
    setEventToEdit(null);
    setIsEventFormModalOpen(true);
  };

  const handleOpenEditEventModal = (event: SchoolEvent) => {
    setEventToEdit(event);
    setIsEventFormModalOpen(true);
    setIsDayDetailModalOpen(false); // Close day detail modal
  };


  const isLoading = isLoadingSettings || isLoadingSubjects || isLoadingItems || isLoadingGeneralAnnouncements || authLoading;

  const renderDayContent = (day: Date): React.ReactNode => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const itemsForDayInCell = combinedItems.filter(item => {
       if (item.itemType === 'event') {
           return dateStr >= item.startDate && dateStr <= (item.endDate ?? item.startDate);
       }
       return item.date === dateStr;
    });

    const isOutsideMonth = day.getMonth() !== currentMonthDate.getMonth();
    const isToday = isSameDay(day, new Date());

    return (
      <div className={cn("relative flex flex-col items-start p-1 h-full overflow-hidden w-full", isOutsideMonth && "opacity-50")}>
        <span className={cn("absolute top-1 right-1 text-xs", isToday && !isOutsideMonth && "font-bold text-primary")}>
            {format(day, 'd')}
        </span>
        {itemsForDayInCell.length > 0 && (
          <div className="mt-4 space-y-0.5 w-full">
            {itemsForDayInCell.slice(0, MAX_PREVIEW_ITEMS_IN_CELL).map((item, index) => ( 
              <div
                key={`${item.itemType}-${item.id || (item as any).period || index}-${dateStr}-cell`}
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
                        (item as DailyGeneralAnnouncement).content.substring(0,50) + ((item as DailyGeneralAnnouncement).content.length > 50 ? '...' : '')
                }
              >
                {item.itemType === 'event' ? item.title : 
                 item.itemType === 'announcement' ? 
                    (subjectsMap?.get(item.subjectIdOverride || '') || '連絡') + (item.text ? `: ${item.text.substring(0,10)}${item.text.length > 10 ? '...':''}`: '') :
                    (item as DailyGeneralAnnouncement).content.substring(0,20) + ((item as DailyGeneralAnnouncement).content.length > 20 ? "..." : "")
                }
              </div>
            ))}
            {itemsForDayInCell.length > MAX_PREVIEW_ITEMS_IN_CELL && (
              <div className="text-xs text-muted-foreground mt-0.5">他 {itemsForDayInCell.length - MAX_PREVIEW_ITEMS_IN_CELL} 件</div>
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
            {user && !isAnonymous && (
                 <Button onClick={handleOpenAddEventModal} size="sm" className="ml-2 sm:ml-4">
                    <PlusCircle className="mr-1 h-4 w-4" />
                    <span className="hidden sm:inline">行事追加</span>
                    <span className="sm:hidden">追加</span>
                </Button>
            )}
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
                weekStartsOn={0} 
                fixedWeeks 
                className="w-full p-0 flex-1 flex flex-col" 
                classNames={{
                  months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                  month: "space-y-4 flex-1 flex flex-col", 
                  caption: "flex justify-center pt-1 relative items-center",
                  caption_label: "text-sm font-medium",
                  nav: "space-x-1 flex items-center",
                  nav_button: cn(
                    buttonVariants({ variant: "outline" }),
                    "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
                  ),
                  nav_button_previous: "absolute left-1",
                  nav_button_next: "absolute right-1",
                  table: "w-full border-collapse flex-1 flex flex-col", 
                  head_row: "flex", 
                  head_cell: "text-muted-foreground rounded-md flex-1 font-normal text-[0.8rem] text-center py-2", 
                  tbody: "flex-1 flex flex-col", 
                  row: "flex w-full flex-1 min-h-[6rem]", // Ensure rows have min height
                  cell: cn( 
                    "flex-1 p-0 relative text-center text-sm h-full border-l border-t first:border-l-0", 
                    "[&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20"
                  ),
                  day: cn( 
                    buttonVariants({ variant: "ghost" }),
                    "h-full w-full p-0 font-normal aria-selected:opacity-100 flex flex-col items-start justify-start rounded-none" 
                  ),
                  day_selected: "bg-primary/80 text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground focus:bg-primary/90 focus:text-primary-foreground", 
                  day_today: "bg-accent/20 text-accent-foreground font-bold",
                  day_outside: "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30", 
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
                {itemsForSelectedDay.map((item, index) => {
                  let title, content, icon, colorClass, footer;
                  const isAdmin = user && !isAnonymous;
                  switch (item.itemType) {
                    case 'general':
                      icon = <Info className="inline-block mr-1.5 h-4 w-4 align-text-bottom" />;
                      title = "全体連絡";
                      content = (item as DailyGeneralAnnouncement).content;
                      colorClass = 'text-purple-600 dark:text-purple-400';
                      break;
                    case 'announcement':
                      icon = <Info className="inline-block mr-1.5 h-4 w-4 align-text-bottom" />;
                      title = `${item.period}限目の連絡` + (subjectsMap?.get(item.subjectIdOverride || '') ? ` (${subjectsMap.get(item.subjectIdOverride || '')})` : '');
                      content = item.text;
                      colorClass = 'text-green-600 dark:text-green-400';
                      break;
                    case 'event':
                      const eventItem = item as SchoolEvent;
                      icon = <CalendarDaysIcon className="inline-block mr-1.5 h-4 w-4 align-text-bottom" />;
                      title = `行事: ${eventItem.title}`;
                      content = eventItem.description ?? '';
                      colorClass = 'text-blue-600 dark:text-blue-400';
                      if (eventItem.startDate !== (eventItem.endDate ?? eventItem.startDate)) {
                        footer = <p className="text-xs text-muted-foreground mt-1">期間: {format(parseISO(eventItem.startDate), "M/d", {locale:ja})} ~ {format(parseISO(eventItem.endDate ?? eventItem.startDate), "M/d", {locale:ja})}</p>;
                      }
                      break;
                    default:
                      return null;
                  }
                  return (
                    <li key={`${item.itemType}-${item.id || (item as any).period || index}-modal`} 
                        className="p-3 border rounded-md shadow-sm bg-card hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start">
                        <p className={cn("font-semibold text-sm mb-1", colorClass)}>
                          {icon}{title}
                        </p>
                        {isAdmin && item.itemType === 'event' && (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleOpenEditEventModal(item as SchoolEvent)}>
                              <Edit className="h-3 w-3" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive">
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>行事を削除しますか？</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    行事「{(item as SchoolEvent).title}」を削除します。この操作は元に戻せません。
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteEventMutation.mutate((item as SchoolEvent).id!)} disabled={deleteEventMutation.isPending}>
                                    {deleteEventMutation.isPending ? '削除中...' : '削除'}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {content}
                      </p>
                      {footer}
                    </li>
                  );
                })}
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

      {user && !isAnonymous && (
        <EventFormDialog
          isOpen={isEventFormModalOpen}
          onOpenChange={(open) => {
            setIsEventFormModalOpen(open);
            if (!open) setEventToEdit(null); // Clear editing event when dialog is closed
          }}
          onEventSaved={() => {
            queryClientHook.invalidateQueries({ queryKey: ['calendarItems', year, month] });
          }}
          editingEvent={eventToEdit}
        />
      )}

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
