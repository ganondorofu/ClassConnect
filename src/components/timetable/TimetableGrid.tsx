
"use client";

import React, { useState, useEffect, useMemo } from 'react'; // Added useMemo
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, startOfWeek, addDays, eachDayOfInterval, isSameDay } from 'date-fns';
import { ja } from 'date-fns/locale'; // Import Japanese locale

import { Card, CardContent, CardHeader } from "@/components/ui/card"; // Removed CardTitle
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input"; // Keep Input if needed elsewhere, maybe not needed here
import { Textarea } from "@/components/ui/textarea"; // Import Textarea
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Import Alert components


import type { FixedTimeSlot, TimetableSettings, DayOfWeek, SchoolEvent } from '@/models/timetable';
import { DEFAULT_TIMETABLE_SETTINGS, DayOfWeek as DayOfWeekEnum, getDayOfWeekName, AllDays } from '@/models/timetable'; // Combined imports, Added AllDays
import type { DailyAnnouncement } from '@/models/announcement';
import {
  queryFnGetTimetableSettings,
  queryFnGetFixedTimetable,
  queryFnGetDailyAnnouncements,
  queryFnGetSchoolEvents,
  onTimetableSettingsUpdate,
  onFixedTimetableUpdate,
  onDailyAnnouncementsUpdate,
  onSchoolEventsUpdate,
  upsertDailyAnnouncement,
  deleteDailyAnnouncement,
} from '@/controllers/timetableController';
import { AlertCircle, CalendarDays, Edit2, Trash2, WifiOff } from 'lucide-react'; // Adjusted icons


const DAY_CELL_WIDTH = "min-w-[150px]"; // Adjust width as needed


interface TimetableGridProps {
  currentDate: Date; // Pass current date as prop
}

export function TimetableGrid({ currentDate }: TimetableGridProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSlot, setSelectedSlot] = useState<{ date: string, period: number, day: DayOfWeek, fixedSubject: string, announcement?: DailyAnnouncement } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [announcementText, setAnnouncementText] = useState('');
  const [subjectOverride, setSubjectOverride] = useState<string | null>(null); // State for subject override
  const [isSaving, setIsSaving] = useState(false); // State for save/delete operations
  const [isOffline, setIsOffline] = useState(false); // State to track offline status


  // --- State for Realtime Data ---
  const [liveSettings, setLiveSettings] = useState<TimetableSettings | null>(null);
  const [liveFixedTimetable, setLiveFixedTimetable] = useState<FixedTimeSlot[]>([]);
  const [liveDailyAnnouncements, setLiveDailyAnnouncements] = useState<Record<string, DailyAnnouncement[]>>({});
  const [liveSchoolEvents, setLiveSchoolEvents] = useState<SchoolEvent[]>([]);


  // --- Check Online Status ---
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    if (typeof navigator !== 'undefined') {
        setIsOffline(!navigator.onLine);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);


  // --- Tanstack Query Fetching ---
    const handleQueryError = (queryKey: string) => (error: unknown) => {
        console.error(`Query Error (${queryKey}):`, error);
        const isOfflineError = (error as any)?.code === 'unavailable';
        setIsOffline(isOfflineError || !navigator.onLine); // Update offline state based on error
        toast({
          title: isOfflineError ? "オフライン" : "エラー",
          description: isOfflineError
            ? `データ(${queryKey})の取得に失敗しました。接続を確認してください。`
            : `データ(${queryKey})の読み込み中にエラーが発生しました。`,
          variant: "destructive",
        });
    };

    const { data: initialSettings, isLoading: isLoadingSettings, error: errorSettings } = useQuery({
        queryKey: ['timetableSettings'],
        queryFn: queryFnGetTimetableSettings,
        staleTime: 1000 * 60 * 5, // 5 minutes
        refetchOnWindowFocus: false,
        onError: handleQueryError('timetableSettings'),
        refetchOnMount: true, // Refetch on mount to check connectivity
    });

    const { data: initialFixedTimetable, isLoading: isLoadingFixed, error: errorFixed } = useQuery({
        queryKey: ['fixedTimetable'],
        queryFn: queryFnGetFixedTimetable,
        staleTime: 1000 * 60 * 5, // 5 minutes
        refetchOnWindowFocus: false,
        onError: handleQueryError('fixedTimetable'),
        refetchOnMount: true,
    });

    const { data: initialSchoolEvents, isLoading: isLoadingEvents, error: errorEvents } = useQuery({
        queryKey: ['schoolEvents'],
        queryFn: queryFnGetSchoolEvents,
        staleTime: 1000 * 60 * 15, // 15 minutes
        onError: handleQueryError('schoolEvents'),
        refetchOnMount: true,
    });

  // Calculate week interval based on currentDate
   const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }); // Week starts on Monday
   const weekEnd = addDays(weekStart, 6); // Include Sunday
   const weekDays = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd]);


  // Fetch daily announcements for the current week
  const { data: initialDailyAnnouncementsData, isLoading: isLoadingAnnouncements, error: errorAnnouncements } = useQuery({
    queryKey: ['dailyAnnouncements', format(weekStart, 'yyyy-MM-dd')], // Key changes weekly
    queryFn: async () => {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
           console.warn("Offline: Skipping announcement fetch.");
           setIsOffline(true);
           return queryClient.getQueryData(['dailyAnnouncements', format(weekStart, 'yyyy-MM-dd')]) ?? {};
         }
        setIsOffline(false); // Assume online if fetch proceeds
        const announcementsPromises = weekDays.map(day =>
        queryFnGetDailyAnnouncements(format(day, 'yyyy-MM-dd'))()
      );
      const announcementsByDay = await Promise.all(announcementsPromises);
      const announcementsMap: Record<string, DailyAnnouncement[]> = {};
      weekDays.forEach((day, index) => {
        announcementsMap[format(day, 'yyyy-MM-dd')] = announcementsByDay[index];
      });
      return announcementsMap;
    },
    staleTime: 1000 * 60 * 1, // 1 minute
    refetchInterval: isOffline ? false : 1000 * 60 * 2, // Refetch every 2 minutes only if online
    onError: handleQueryError('dailyAnnouncements'),
    enabled: !isOffline, // Only enable query if initially online
    refetchOnMount: true,
  });


  // --- Realtime Subscriptions ---
  useEffect(() => {
     if (isOffline) {
        console.warn("Offline: Skipping realtime subscriptions.");
        return;
     }

    const unsubSettings = onTimetableSettingsUpdate((settings) => {
      setLiveSettings(settings);
      setIsOffline(false);
    }, (error) => {
        console.error("Realtime settings error:", error);
        setIsOffline(true);
    });

    const unsubFixed = onFixedTimetableUpdate((timetable) => {
        setLiveFixedTimetable(timetable);
        setIsOffline(false);
    }, (error) => {
        console.error("Realtime fixed timetable error:", error);
        setIsOffline(true);
    });

    const unsubEvents = onSchoolEventsUpdate((events) => {
        setLiveSchoolEvents(events);
        setIsOffline(false);
    }, (error) => {
        console.error("Realtime events error:", error);
        setIsOffline(true);
    });

     // Subscribe to announcements for each day in the current view
     const unsubAnnouncements = weekDays.map(day => {
       const dateStr = format(day, 'yyyy-MM-dd');
       return onDailyAnnouncementsUpdate(dateStr, (announcements) => {
         setLiveDailyAnnouncements(prev => ({ ...prev, [dateStr]: announcements }));
         setIsOffline(false);
       }, (error) => {
           console.error(`Realtime announcements error for ${dateStr}:`, error);
           setIsOffline(true);
       });
     });

    return () => {
      unsubSettings();
      unsubFixed();
      unsubEvents();
      unsubAnnouncements.forEach(unsub => unsub());
    };
  }, [weekStart, isOffline, weekDays]); // Add weekDays dependency


  // --- Data Merging ---
  const settings = useMemo(() => liveSettings ?? initialSettings ?? DEFAULT_TIMETABLE_SETTINGS, [liveSettings, initialSettings]);
  const fixedTimetable = useMemo(() => liveFixedTimetable.length > 0 ? liveFixedTimetable : initialFixedTimetable ?? [], [liveFixedTimetable, initialFixedTimetable]);
  const schoolEvents = useMemo(() => liveSchoolEvents.length > 0 ? liveSchoolEvents : initialSchoolEvents ?? [], [liveSchoolEvents, initialSchoolEvents]);
  // Merge initial data (potentially from cache) with live updates
  const dailyAnnouncements = useMemo(() => Object.keys(liveDailyAnnouncements).length > 0
      ? { ...initialDailyAnnouncementsData, ...liveDailyAnnouncements }
      : initialDailyAnnouncementsData ?? {}, [liveDailyAnnouncements, initialDailyAnnouncementsData]);


  const isLoading = (isLoadingSettings || isLoadingFixed || isLoadingAnnouncements || isLoadingEvents) && !isOffline; // Don't show loading if offline error is the reason
  const queryError = errorSettings || errorFixed || errorEvents || errorAnnouncements; // Combine errors


  const getFixedSlot = (day: DayOfWeek, period: number): FixedTimeSlot | undefined => {
    return fixedTimetable.find(slot => slot.day === day && slot.period === period);
  };

  const getDailyAnnouncement = (date: string, period: number): DailyAnnouncement | undefined => {
    return dailyAnnouncements[date]?.find(ann => ann.period === period);
  };

  const getEventsForDay = (date: Date): SchoolEvent[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return schoolEvents.filter(event => {
        const startDateMatch = event.startDate === dateStr;
        const endDate = event.endDate ?? event.startDate; // Handle single-day events
        const isWithinRange = dateStr >= event.startDate && dateStr <= endDate;
        return startDateMatch || isWithinRange;
    });
  };


  const handleSlotClick = (date: string, period: number, day: DayOfWeek) => {
    const fixedSlot = getFixedSlot(day, period);
    const announcement = getDailyAnnouncement(date, period);
    setSelectedSlot({
        date,
        period,
        day,
        fixedSubject: fixedSlot?.subject ?? '未設定',
        announcement
    });
    // Initialize modal state based on existing announcement or fixed subject
    setAnnouncementText(announcement?.text ?? '');
    setSubjectOverride(announcement?.subjectOverride ?? null); // Initialize with existing override or null
    setIsModalOpen(true);
  };

 const handleSaveAnnouncement = async () => {
    if (!selectedSlot || isSaving) return;

    if (isOffline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        toast({ title: "オフライン", description: "連絡を保存できません。", variant: "destructive" });
        return;
    }

    setIsSaving(true);
    try {
        // If text and subjectOverride are both empty/null, the controller will delete it.
        const announcementData: Omit<DailyAnnouncement, 'id' | 'updatedAt'> = {
            date: selectedSlot.date,
            period: selectedSlot.period,
            text: announcementText.trim(), // Send trimmed text
            subjectOverride: subjectOverride ? subjectOverride.trim() : null, // Send trimmed override or null
        };

        await upsertDailyAnnouncement(announcementData); // upsert handles create, update, and delete based on content

        toast({
            title: "成功",
            description: `${selectedSlot.date} ${selectedSlot.period}限目の連絡・変更を保存しました。`,
        });

      setIsModalOpen(false);
      setSelectedSlot(null);
      setAnnouncementText('');
      setSubjectOverride(null);
      // Invalidate query to ensure data consistency
      queryClient.invalidateQueries({ queryKey: ['dailyAnnouncements', format(weekStart, 'yyyy-MM-dd')] });
    } catch (error: any) {
      console.error("Failed to save/delete announcement:", error);
      const isFirebaseOfflineError = (error as FirestoreError)?.code === 'unavailable' || error?.message?.includes("オフラインのため");
      setIsOffline(isFirebaseOfflineError || !navigator.onLine);
      toast({
        title: isFirebaseOfflineError ? "オフライン" : "エラー",
        description: isFirebaseOfflineError
            ? "操作に失敗しました。オフラインの可能性があります。"
            : `操作に失敗しました: ${error.message}`,
        variant: "destructive",
      });
    } finally {
        setIsSaving(false);
    }
  };

  const handleDeleteConfirmation = async () => {
     // This function now just calls handleSaveAnnouncement with empty fields
     // to trigger the deletion logic within upsertDailyAnnouncement.
     setAnnouncementText('');
     setSubjectOverride(null);
     await handleSaveAnnouncement(); // Let handleSave trigger deletion via upsert
 };

  const hasConnectivityError = queryError && !isOffline;


  const numberOfPeriods = settings.numberOfPeriods;
  const activeDays = settings.activeDays;

  const displayDays = useMemo(() => weekDays.map(date => {
        const dayOfWeekJs = date.getDay(); // 0 for Sunday, 6 for Saturday
        // Map JS day index to your DayOfWeek enum strings ("月", "火", etc.)
        const dayOfWeekMap: { [key: number]: DayOfWeek } = {
            1: DayOfWeekEnum.MONDAY,
            2: DayOfWeekEnum.TUESDAY,
            3: DayOfWeekEnum.WEDNESDAY,
            4: DayOfWeekEnum.THURSDAY,
            5: DayOfWeekEnum.FRIDAY,
            6: DayOfWeekEnum.SATURDAY,
            0: DayOfWeekEnum.SUNDAY,
        };
        const dayOfWeekStr = dayOfWeekMap[dayOfWeekJs];
        const isActive = activeDays.includes(dayOfWeekStr);
        const isWeekend = dayOfWeekStr === DayOfWeekEnum.SATURDAY || dayOfWeekStr === DayOfWeekEnum.SUNDAY;
        return { date, dayOfWeek: dayOfWeekStr, isActive, isWeekend };
    }), [weekDays, activeDays]);

  return (
    <Card className="w-full overflow-hidden shadow-lg rounded-lg">
      <CardHeader className="p-4 border-b">
        {isOffline && (
          <Alert variant="destructive" className="mb-4">
            <WifiOff className="h-4 w-4" />
            <AlertTitle>オフライン</AlertTitle>
            <AlertDescription>
              現在オフラインです。表示されているデータは古い可能性があります。変更は保存されません。
            </AlertDescription>
          </Alert>
        )}
        {hasConnectivityError && !isOffline && (
            <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>接続エラー</AlertTitle>
                <AlertDescription>
                    データの読み込みに失敗しました。時間をおいてページを再読み込みしてください。 (エラー詳細: {String(queryError)})
                </AlertDescription>
            </Alert>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <div className="flex border-b">
            {/* Time Column Header */}
            <div className={`flex-shrink-0 ${DAY_CELL_WIDTH} p-2 font-semibold text-center border-r sticky left-0 bg-background z-10`}>
              時間
            </div>
            {/* Day Headers */}
            {displayDays.map(({ date, dayOfWeek, isActive, isWeekend }) => (
              <div
                key={format(date, 'yyyy-MM-dd')}
                className={`flex-shrink-0 ${DAY_CELL_WIDTH} p-2 font-semibold text-center border-r ${isWeekend ? 'bg-muted/50' : ''} ${isSameDay(date, currentDate) ? 'bg-primary/10' : ''}`}
              >
                <div>{dayOfWeek ? getDayOfWeekName(dayOfWeek) : ''}</div> {/* Handle potential undefined dayOfWeek */}
                 <div className="text-xs text-muted-foreground">{format(date, 'M/d')}</div>
                  {getEventsForDay(date).map(event => (
                      <div key={event.id} className="mt-1 p-1 bg-accent/20 text-accent-foreground rounded text-xs truncate flex items-center gap-1" title={event.title}>
                           <CalendarDays className="w-3 h-3 shrink-0" />
                           <span>{event.title}</span>
                      </div>
                  ))}
              </div>
            ))}
          </div>

          {/* Timetable Rows */}
          {isLoading ? (
              Array.from({ length: numberOfPeriods || 6 }, (_, i) => i + 1).map((period) => (
                 <div key={`skeleton-row-${period}`} className="flex border-b min-h-[80px]">
                    <div className={`flex-shrink-0 ${DAY_CELL_WIDTH} p-2 font-semibold text-center border-r sticky left-0 bg-background z-10 flex items-center justify-center`}>
                        <Skeleton className="h-6 w-8" />
                    </div>
                    {displayDays.map(({ date }) => (
                        <div key={`skeleton-cell-${format(date, 'yyyy-MM-dd')}-${period}`} className={`flex-shrink-0 ${DAY_CELL_WIDTH} p-2 border-r flex flex-col justify-between`}>
                            <Skeleton className="h-16 w-full" />
                        </div>
                    ))}
                </div>
              ))
          ) : (
              Array.from({ length: numberOfPeriods }, (_, i) => i + 1).map((period) => (
                <div key={period} className="flex border-b min-h-[80px]">
                  {/* Period Number Column */}
                  <div className={`flex-shrink-0 ${DAY_CELL_WIDTH} p-2 font-semibold text-center border-r sticky left-0 bg-background z-10 flex items-center justify-center`}>
                    {period}限
                  </div>
                  {/* Timetable Cells */}
                  {displayDays.map(({ date, dayOfWeek, isActive }) => {
                     const dateStr = format(date, 'yyyy-MM-dd');
                     if (!dayOfWeek) return <div key={`${dateStr}-${period}-empty`} className={`flex-shrink-0 ${DAY_CELL_WIDTH} p-2 border-r bg-muted/30 h-full`}></div>; // Placeholder for invalid days

                     const fixedSlot = isActive ? getFixedSlot(dayOfWeek, period) : undefined;
                     const announcement = isActive ? getDailyAnnouncement(dateStr, period) : undefined;
                     const hasEvent = !isActive && getEventsForDay(date).length > 0;

                     const displaySubject = announcement?.subjectOverride ?? fixedSlot?.subject ?? '未設定';
                     const announcementDisplay = announcement?.text;


                    return (
                      <div
                        key={`${dateStr}-${period}`}
                        className={`flex-shrink-0 ${DAY_CELL_WIDTH} p-2 border-r relative flex flex-col justify-between ${!isActive && !hasEvent ? 'bg-muted/30' : ''} ${isSameDay(date, currentDate) ? 'bg-primary/5' : ''}`}
                      >
                       {isActive ? (
                             <>
                                <div
                                    className="text-sm truncate mb-1 font-medium"
                                    title={displaySubject}
                                >
                                    {displaySubject}
                                    {/* Indicate change only if override exists and differs from fixed */}
                                    {announcement?.subjectOverride && announcement.subjectOverride !== (fixedSlot?.subject ?? '') && (
                                        <span className="text-xs text-destructive ml-1">(変更)</span>
                                    )}
                                 </div>

                                 <div className="text-xs flex-grow mb-1 break-words overflow-hidden">
                                     {announcementDisplay && (
                                         <div className="p-1 rounded bg-card border border-dashed border-accent/50">
                                             <p className="text-foreground whitespace-pre-wrap">{announcementDisplay}</p>
                                        </div>
                                     )}
                                 </div>

                                 <div className="mt-auto">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-1 text-xs absolute bottom-1 right-1 text-muted-foreground hover:text-primary"
                                        onClick={() => handleSlotClick(dateStr, period, dayOfWeek)}
                                        aria-label={`${dateStr} ${period}限目の連絡・変更を編集`}
                                        disabled={isOffline}
                                    >
                                        <Edit2 className="w-3 h-3" />
                                    </Button>
                                </div>
                             </>
                        ) : hasEvent ? (
                            <div className="text-xs text-muted-foreground italic h-full flex items-center justify-center">行事日</div>
                        ) : (
                             <div className="h-full"></div> // Empty cell for inactive days
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
          )}
        </div>

        {/* Announcement Edit Modal */}
       <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>連絡・変更を編集: {selectedSlot?.date} ({selectedSlot?.day ? getDayOfWeekName(selectedSlot.day) : ''}) {selectedSlot?.period}限目</DialogTitle>
                     <p className="text-sm text-muted-foreground pt-1">
                         元の科目: {selectedSlot?.fixedSubject || '未設定'}
                     </p>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                     {/* Subject Override Input */}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="subject-override" className="text-right col-span-1">
                            科目変更
                        </Label>
                        <Input
                            id="subject-override"
                            value={subjectOverride ?? ''} // Use nullish coalescing for controlled input
                            onChange={(e) => setSubjectOverride(e.target.value || null)} // Set to null if empty
                            className="col-span-3"
                            placeholder="変更後の科目名 (空欄で元に戻る)"
                            disabled={isSaving}
                        />
                    </div>

                     {/* Announcement Text Area */}
                     <div className="grid grid-cols-4 items-center gap-4">
                         <Label htmlFor="announcement-text" className="text-right col-span-1">
                             連絡内容
                         </Label>
                         <Textarea
                            id="announcement-text"
                            value={announcementText}
                            onChange={(e) => setAnnouncementText(e.target.value)}
                            className="col-span-3 min-h-[100px]"
                            placeholder="持ち物、テスト範囲、教室変更など"
                            disabled={isSaving}
                        />
                    </div>
                     <p className="col-span-4 text-xs text-muted-foreground px-2 text-center">
                         科目変更・連絡内容の両方が空の場合、この時間の連絡・変更は削除されます。
                     </p>
                </div>
                <DialogFooter className="flex justify-between sm:justify-between w-full">
                     {/* Delete Button Aligned Left (Only show if there IS an announcement to delete) */}
                     <div>
                        {selectedSlot?.announcement && (announcementText || subjectOverride) && ( // Show delete only if announcement exists and fields are not already cleared
                             <Button
                                 variant="destructive"
                                 onClick={handleDeleteConfirmation} // Changed to confirmation logic
                                 size="sm"
                                 disabled={isSaving || isOffline}
                            >
                                 <Trash2 className="mr-1 w-4 h-4" />
                                 {isSaving ? '削除中...' : '削除'}
                             </Button>
                         )}
                     </div>
                     {/* Save and Cancel Buttons Aligned Right */}
                     <div className="flex gap-2">
                         <DialogClose asChild>
                             <Button type="button" variant="secondary" disabled={isSaving}>
                                 キャンセル
                             </Button>
                         </DialogClose>
                         <Button
                             type="button"
                             onClick={handleSaveAnnouncement}
                             disabled={isSaving || isOffline}
                        >
                            {isSaving ? '保存中...' : '保存'}
                         </Button>
                     </div>
                 </DialogFooter>
            </DialogContent>
        </Dialog>

      </CardContent>
    </Card>
  );
}
