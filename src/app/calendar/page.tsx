
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
import { ChevronLeft, ChevronRight, Info, AlertCircle, WifiOff, CalendarDays as CalendarDaysIcon, PlusCircle, Edit, Trash2, FileText, ClipboardList } from 'lucide-react';
import { format, addDays, subMonths, startOfMonth, endOfMonth, isSameDay, addMonths, startOfWeek, parseISO, endOfWeek, isValid as isValidDateFn } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import type { SchoolEvent, TimetableSettings } from '@/models/timetable';
import type { DailyAnnouncement } from '@/models/announcement';
import type { Assignment } from '@/models/assignment';
import { queryFnGetCalendarDisplayableItemsForMonth, queryFnGetTimetableSettings, deleteSchoolEvent, queryFnGetSubjects } from '@/controllers/timetableController';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buttonVariants } from "@/components/ui/button";
import EventFormDialog from '@/components/calendar/EventFormDialog';
import { useToast } from '@/hooks/use-toast';
import type { Subject } from '@/models/subject';


const queryClient = new QueryClient();

type CalendarItemUnion = (SchoolEvent & { itemType: 'event' }) | (DailyAnnouncement & { itemType: 'announcement' }) | (Assignment & { itemType: 'assignment' });
const MAX_PREVIEW_ITEMS_IN_CELL = 3; 

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

  const { data: calendarItemsData, isLoading: isLoadingItems, error: errorItems, refetch: refetchCalendarItems } = useQuery<CalendarItemUnion[], Error>({
    queryKey: ['calendarItems', year, month],
    queryFn: queryFnGetCalendarDisplayableItemsForMonth(year, month),
    staleTime: 0, 
    enabled: !isOffline && (!!user || isAnonymous),
    onError: handleQueryError('calendarItems'),
    refetchOnMount: true, 
    refetchOnWindowFocus: true,
  });
  
  const combinedItems = useMemo(() => {
    return Array.isArray(calendarItemsData) ? calendarItemsData : [];
  }, [calendarItemsData]);

  useEffect(() => {
    console.log('[CalendarPage] isLoadingItems:', isLoadingItems);
    console.log('[CalendarPage] errorItems:', errorItems);
    console.log('[CalendarPage] calendarItemsData:', calendarItemsData);
    console.log('[CalendarPage] combinedItems length:', combinedItems.length);
  }, [isLoadingItems, errorItems, calendarItemsData, combinedItems]);
  
  const { data: subjectsData } = useQuery<Subject[], Error>({
    queryKey: ['subjects'],
    queryFn: queryFnGetSubjects,
    staleTime: 1000 * 60 * 15,
    enabled: !isOffline && (!!user || isAnonymous),
  });
  const subjectsMap = useMemo(() => new Map(subjectsData?.map(s => [s.id, s.name])), [subjectsData]);


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
      } else if (item.itemType === 'announcement') { 
        return item.date === dateStr && item.showOnCalendar === true; 
      } else if (item.itemType === 'assignment') {
        return item.dueDate === dateStr;
      }
      return false; 
    }).sort((a, b) => { 
        const typeOrder = { event: 1, assignment: 2, announcement: 3 };
        if (typeOrder[a.itemType] !== typeOrder[b.itemType]) {
            return typeOrder[a.itemType] - typeOrder[b.itemType];
        }
        if (a.itemType === 'announcement' && b.itemType === 'announcement') { 
            return (a as DailyAnnouncement).period - (b as DailyAnnouncement).period;
        }
        return 0;
    });
  }, [selectedDayForModal, combinedItems]);

  const deleteEventMutation = useMutation({
    mutationFn: (eventId: string) => deleteSchoolEvent(eventId, user?.uid ?? 'admin_user_calendar_event_delete'),
    onSuccess: async (data, variables) => {
      toast({ title: "成功", description: "行事を削除しました。" });
      await queryClientHook.invalidateQueries({ queryKey: ['calendarItems', year, month] });
      
      const updatedItemsForModal = itemsForSelectedDay.filter(item => item.itemType !== 'event' || (item as SchoolEvent).id !== variables);
      if(updatedItemsForModal.length === 0 && isDayDetailModalOpen) { // Only close if it was open and now empty for that day
        setIsDayDetailModalOpen(false); 
        setSelectedDayForModal(null); 
      }
      // No explicit refetchCalendarItems() here, rely on invalidateQueries
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
    setIsDayDetailModalOpen(false); 
  };

  const isLoading = isLoadingSettings || isLoadingItems || authLoading;

  const renderDayContent = (day: Date, displayMonth: Date): React.ReactNode => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const itemsForDayInCell = combinedItems.filter(item => {
       if (item.itemType === 'event') {
         return dateStr >= item.startDate && dateStr <= (item.endDate ?? item.startDate);
       } else if (item.itemType === 'announcement') {
         return item.date === dateStr && item.showOnCalendar === true;
       } else if (item.itemType === 'assignment') {
         return item.dueDate === dateStr;
       }
       return false;
    }).sort((a,b) => { 
        const typeOrder = { event: 1, assignment: 2, announcement: 3 };
        if (typeOrder[a.itemType] !== typeOrder[b.itemType]) {
            return typeOrder[a.itemType] - typeOrder[b.itemType];
        }
        if (a.itemType === 'announcement' && b.itemType === 'announcement') {
            return (a as DailyAnnouncement).period - (b as DailyAnnouncement).period;
        }
        return 0;
    });

    const isOutsideMonth = displayMonth.getMonth() !== day.getMonth();
    const isToday = isSameDay(day, new Date());

    return (
      <div className={cn("relative flex flex-col items-start p-1 h-full overflow-hidden w-full", isOutsideMonth && "opacity-50")}>
        <span className={cn(
            "absolute top-1 right-1 text-xs sm:text-sm", 
            isToday && !isOutsideMonth && "font-bold text-primary border border-primary/30 rounded-full w-5 h-5 flex items-center justify-center bg-primary/5"
        )}>
            {format(day, 'd')}
        </span>
        {itemsForDayInCell.length > 0 && (
          <div className="mt-4 space-y-0.5 w-full text-left flex-grow overflow-y-auto min-w-0"> {/* Added min-w-0 */}
            {itemsForDayInCell.slice(0, MAX_PREVIEW_ITEMS_IN_CELL).map((item, index) => {
              let displayTitle: string;
              let styleClass: string;
              let IconComponent: React.ElementType | null = null;

              if (item.itemType === 'event') {
                displayTitle = item.title;
                styleClass = 'bg-accent/30 text-accent-foreground/90 dark:bg-accent/50 dark:text-accent-foreground';
                IconComponent = CalendarDaysIcon;
              } else if (item.itemType === 'assignment') {
                displayTitle = (item as Assignment).title;
                styleClass = 'bg-purple-500/20 text-purple-700 dark:bg-purple-500/30 dark:text-purple-300';
                IconComponent = ClipboardList;
              } else { // announcement
                const announcement = item as DailyAnnouncement;
                let subjectNamePreview = '';
                if (announcement.subjectIdOverride && subjectsMap && subjectsMap.get(announcement.subjectIdOverride)) {
                   subjectNamePreview = subjectsMap.get(announcement.subjectIdOverride)!;
                }
                let title = announcement.text || subjectNamePreview;
                if (!title) { 
                    title = `P${announcement.period}連絡`;
                } else if (subjectNamePreview && announcement.text) {
                    title = `${subjectNamePreview}: ${announcement.text}`;
                } else if (subjectNamePreview) {
                    title = `${subjectNamePreview}の連絡`;
                }
                displayTitle = title;
                styleClass = 'bg-sky-100 text-sky-700 border border-sky-300 dark:bg-sky-900 dark:text-sky-200 dark:border-sky-700';
                IconComponent = FileText;
              }
              
              return (
                <div
                  key={`${item.itemType}-${(item as any).id || index}-${dateStr}-cell`}
                  className={cn("text-[10px] sm:text-xs px-1 py-0.5 rounded-sm w-full truncate flex items-center gap-1", styleClass)}
                  title={displayTitle}
                >
                  {IconComponent && <IconComponent className="w-3 h-3 shrink-0" />}
                  <span className="truncate">{displayTitle}</span>
                </div>
              );
            })}
            {itemsForDayInCell.length > MAX_PREVIEW_ITEMS_IN_CELL && (
              <div className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">他 {itemsForDayInCell.length - MAX_PREVIEW_ITEMS_IN_CELL} 件</div>
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
                selected={selectedDayForModal ?? undefined} 
                onSelect={(day) => {
                    if (day) {
                        const isAlreadySelected = selectedDayForModal && isSameDay(day, selectedDayForModal);
                        if (isDayDetailModalOpen && isAlreadySelected) {
                            // If modal is open and same day clicked, do nothing to prevent re-opening
                        } else {
                            handleDayClick(day);
                        }
                    } else {
                       if (isDayDetailModalOpen) {
                           setIsDayDetailModalOpen(false);
                           setSelectedDayForModal(null);
                       }
                    }
                }}
                month={currentMonthDate}
                onMonthChange={setCurrentMonthDate}
                locale={ja}
                weekStartsOn={0} 
                fixedWeeks 
                className="w-full p-0 flex-1 flex flex-col [&_td]:h-auto [&_td>button]:min-h-[6rem] sm:[&_td>button]:min-h-[7rem] md:[&_td>button]:min-h-[8rem]"
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
                  table: "w-full border-collapse flex-1 flex flex-col h-full", 
                  head_row: "flex", 
                  head_cell: "text-muted-foreground rounded-md flex-1 font-normal text-[0.8rem] text-center py-2", 
                  tbody: "flex-1 flex flex-col", 
                  row: "flex w-full flex-1", 
                  cell: cn( 
                    "flex-1 p-0 relative text-center text-sm h-full border-l border-t first:border-l-0 min-w-0", 
                    "[&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20"
                  ),
                  day: cn(
                    "inline-flex items-center justify-center text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                    "h-full w-full p-0 font-normal aria-selected:opacity-100 flex flex-col items-start justify-start rounded-none",
                     buttonVariants({ variant: "ghost" }), 
                    "hover:bg-transparent focus:bg-transparent" 
                  ),
                  day_selected: "bg-primary/80 text-primary-foreground focus:bg-primary/90 focus:text-primary-foreground", 
                  day_today: "border border-primary/30 bg-primary/5", 
                  day_outside: "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30", 
                  day_disabled: "text-muted-foreground opacity-50",
                  day_range_end: "day-range-end",
                  day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
                  day_hidden: "invisible",
                }}
                components={{
                  DayContent: ({ date, displayMonth }) => renderDayContent(date, displayMonth),
                }}
                disabled={isOffline}
                showOutsideDays={true} 
                fromMonth={startOfMonth(subMonths(new Date(), 12))} 
                toMonth={endOfMonth(addMonths(new Date(), 12))} 
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDayDetailModalOpen} onOpenChange={(open) => {
          setIsDayDetailModalOpen(open);
          if (!open) {
            setSelectedDayForModal(null); 
          }
        }}>
        <DialogContent className="sm:max-w-md md:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedDayForModal ? format(selectedDayForModal, 'yyyy年M月d日 (E)', { locale: ja }) : '予定詳細'}
            </DialogTitle>
            <DialogDescription>
              この日の行事や連絡事項、課題の一覧です。
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[280px] sm:h-[350px] w-full pr-3">
            {isLoadingItems ? (
              <div className="space-y-2 p-2">
                {[...Array(3)].map((_, i) => <Skeleton key={`modal-skel-${i}`} className="h-16 w-full" />)}
              </div>
            ) : itemsForSelectedDay.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 text-center">この日の表示項目はありません。</p>
            ) : (
              <ul className="space-y-3 p-1">
                {itemsForSelectedDay.map((item, index) => {
                  const isAdmin = user && !isAnonymous;
                  let title, content, icon, footer, colorClass;

                  if (item.itemType === 'event') {
                    const eventItem = item as SchoolEvent;
                    icon = <CalendarDaysIcon className="inline-block mr-1.5 h-4 w-4 align-text-bottom" />;
                    title = `${eventItem.title}`;
                    content = eventItem.description ?? '';
                    colorClass = 'text-accent-foreground/90 dark:text-accent-foreground/80';
                    if (eventItem.startDate && eventItem.endDate && eventItem.startDate !== eventItem.endDate) {
                        const startDateValid = isValidDateFn(parseISO(eventItem.startDate));
                        const endDateValid = isValidDateFn(parseISO(eventItem.endDate));
                        if (startDateValid && endDateValid) {
                           footer = <p className="text-xs text-muted-foreground mt-1">期間: {format(parseISO(eventItem.startDate), "M/d", {locale:ja})} ~ {format(parseISO(eventItem.endDate), "M/d", {locale:ja})}</p>;
                        }
                    }
                  } else if (item.itemType === 'assignment') {
                    const assignItem = item as Assignment;
                    icon = <ClipboardList className="inline-block mr-1.5 h-4 w-4 align-text-bottom" />;
                    title = `課題: ${assignItem.title}`;
                    content = assignItem.description;
                    colorClass = 'text-purple-700 dark:text-purple-300';
                    footer = <p className="text-xs text-muted-foreground mt-1">科目: {assignItem.subjectId ? subjectsMap.get(assignItem.subjectId) : assignItem.customSubjectName || 'その他'} | 時限: {assignItem.duePeriod || '指定なし'}</p>;
                  } else if (item.itemType === 'announcement' && item.showOnCalendar === true) {
                    const annItem = item as DailyAnnouncement;
                    icon = <FileText className="inline-block mr-1.5 h-4 w-4 align-text-bottom text-sky-600 dark:text-sky-400" />;
                    const subjectName = annItem.subjectIdOverride ? subjectsMap.get(annItem.subjectIdOverride) : null;
                    
                    let annTitle = annItem.text || (subjectName ? `${subjectName}の連絡` : `P${annItem.period}限の連絡`);
                    if (annItem.text && subjectName) {
                        annTitle = `${subjectName}: ${annItem.text}`;
                    } else if (!annItem.text && !subjectName) {
                        annTitle = `P${annItem.period}限 連絡あり`;
                    }
                    title = annTitle;
                    content = annItem.text ? undefined : (subjectName ? `${subjectName}に関する連絡事項があります。` : `連絡事項があります。詳細は時間割表を確認してください。`); 
                    colorClass = 'text-sky-700 dark:text-sky-300';

                  } else {
                    return null; 
                  }

                  return (
                    <li key={`${item.itemType}-${(item as any).id || index}-modal`} 
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
                      {content && (
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                            {content}
                        </p>
                      )}
                      {footer}
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
          <DialogFooter className="mt-4 sm:justify-between">
             <Button variant="outline" onClick={() => {
                setIsDayDetailModalOpen(false);
                setSelectedDayForModal(null); 
             }} className="w-full sm:w-auto">
              閉じる
            </Button>
            <Button onClick={() => {
              if (selectedDayForModal) {
                router.push(`/?date=${format(selectedDayForModal, 'yyyy-MM-dd')}`);
                setIsDayDetailModalOpen(false);
                setSelectedDayForModal(null); 
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
            if (!open) setEventToEdit(null); 
          }}
          onEventSaved={async () => {
            await refetchCalendarItems(); 
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


