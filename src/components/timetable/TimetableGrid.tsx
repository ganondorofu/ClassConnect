"use client";

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, startOfWeek, addDays, eachDayOfInterval, isSameDay } from 'date-fns';
import { ja } from 'date-fns/locale'; // Import Japanese locale

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea"; // Import Textarea
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Import Alert components


import type { FixedTimeSlot, TimetableSettings, DayOfWeek, SchoolEvent } from '@/models/timetable';
import { DEFAULT_TIMETABLE_SETTINGS, DayOfWeek as DayOfWeekEnum, getDayOfWeekName } from '@/models/timetable'; // Combined imports
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
import { AlertCircle, CalendarDays, Edit2, Trash2, PlusCircle, Info, AlertTriangle, BookOpen, Users, BellRing, WifiOff } from 'lucide-react'; // Import icons


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

    // Initial check
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
    const handleQueryError = (error: unknown) => {
        console.error("Query Error:", error);
        const isOfflineError = (error as any)?.code === 'unavailable';
        setIsOffline(isOfflineError || !navigator.onLine); // Update offline state based on error
        toast({
          title: isOfflineError ? "オフライン" : "エラー",
          description: isOfflineError
            ? "データの取得に失敗しました。接続を確認してください。"
            : `データの読み込み中にエラーが発生しました。`,
          variant: "destructive",
        });
    };

    const { data: initialSettings, isLoading: isLoadingSettings, error: errorSettings } = useQuery({
        queryKey: ['timetableSettings'],
        queryFn: queryFnGetTimetableSettings,
        staleTime: 1000 * 60 * 5, // 5 minutes
        refetchOnWindowFocus: false,
        onError: handleQueryError,
        refetchOnMount: true, // Refetch on mount to check connectivity
    });

    const { data: initialFixedTimetable, isLoading: isLoadingFixed, error: errorFixed } = useQuery({
        queryKey: ['fixedTimetable'],
        queryFn: queryFnGetFixedTimetable,
        staleTime: 1000 * 60 * 5, // 5 minutes
        refetchOnWindowFocus: false,
        onError: handleQueryError,
        refetchOnMount: true,
    });

    const { data: initialSchoolEvents, isLoading: isLoadingEvents, error: errorEvents } = useQuery({
        queryKey: ['schoolEvents'],
        queryFn: queryFnGetSchoolEvents,
        staleTime: 1000 * 60 * 15, // 15 minutes
        onError: handleQueryError,
        refetchOnMount: true,
    });

  // Calculate week interval based on currentDate
   const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }); // Week starts on Monday
   const weekEnd = addDays(weekStart, 6); // Include Sunday
   const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Fetch daily announcements for the current week
  const { data: initialDailyAnnouncementsData, isLoading: isLoadingAnnouncements, error: errorAnnouncements } = useQuery({
    queryKey: ['dailyAnnouncements', format(weekStart, 'yyyy-MM-dd')], // Key changes weekly
    queryFn: async () => {
        // Attempt to fetch only if online
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
           console.warn("Offline: Skipping announcement fetch.");
           setIsOffline(true);
           // Return cached data if available, otherwise empty map
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
    onError: handleQueryError,
    enabled: !isOffline, // Only enable query if initially online
    refetchOnMount: true,
  });


  // --- Realtime Subscriptions ---
  useEffect(() => {
     // Only subscribe if online
     if (isOffline) {
        console.warn("Offline: Skipping realtime subscriptions.");
        return;
     }

    const unsubSettings = onTimetableSettingsUpdate((settings) => {
      setLiveSettings(settings);
      setIsOffline(false); // Got data, assume online
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
    // Resubscribe if the week changes or online status changes
  }, [weekStart, isOffline]);


  // --- Data Merging ---
  const settings = liveSettings ?? initialSettings ?? DEFAULT_TIMETABLE_SETTINGS; // Provide default if initial is undefined
  const fixedTimetable = liveFixedTimetable.length > 0 ? liveFixedTimetable : initialFixedTimetable ?? [];
  const schoolEvents = liveSchoolEvents.length > 0 ? liveSchoolEvents : initialSchoolEvents ?? [];
  // Merge initial data (potentially from cache) with live updates
  const dailyAnnouncements = Object.keys(liveDailyAnnouncements).length > 0
      ? { ...initialDailyAnnouncementsData, ...liveDailyAnnouncements }
      : initialDailyAnnouncementsData ?? {};


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
        // Check if the event spans the current date
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
    setAnnouncementText(announcement?.text ?? '');
    setIsModalOpen(true);
  };

 const handleSaveAnnouncement = async () => {
    if (!selectedSlot || isSaving) return;

    // Check online status before attempting save
    if (isOffline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        toast({
            title: "オフライン",
            description: "現在オフラインのため、連絡を保存できません。",
            variant: "destructive",
        });
        return;
    }

    // Basic validation (allow empty text to clear announcement)
    // if (!announcementText.trim()) {
    //     toast({
    //         title: "エラー",
    //         description: "連絡内容を入力してください。",
    //         variant: "destructive",
    //     });
    //     return;
    // }

    setIsSaving(true);
    try {
      // If text is empty, delete the announcement instead of saving empty string
      if (!announcementText.trim()) {
          if (selectedSlot.announcement) {
              await deleteDailyAnnouncement(selectedSlot.date, selectedSlot.period);
              toast({
                 title: "削除しました",
                 description: `${selectedSlot.date} ${selectedSlot.period}限目の連絡を削除しました。`,
               });
          } else {
              // No existing announcement and text is empty, do nothing
              toast({
                  title: "情報",
                  description: "連絡内容が空のため、何も保存されませんでした。",
              });
          }
      } else {
          // Save non-empty text
          const announcementData: Omit<DailyAnnouncement, 'id' | 'updatedAt'> = {
            date: selectedSlot.date,
            period: selectedSlot.period,
            text: announcementText,
          };
          await upsertDailyAnnouncement(announcementData);
          toast({
            title: "成功",
            description: `${selectedSlot.date} ${selectedSlot.period}限目の連絡を保存しました。`,
          });
      }

      setIsModalOpen(false);
      // Reset state after successful save/delete
      setSelectedSlot(null);
      setAnnouncementText('');
      // Invalidate query to ensure data consistency, even with realtime updates
      queryClient.invalidateQueries({ queryKey: ['dailyAnnouncements', format(weekStart, 'yyyy-MM-dd')] });
    } catch (error) {
      console.error("Failed to save/delete announcement:", error);
      const isFirebaseOfflineError = (error as any)?.code === 'unavailable';
       setIsOffline(isFirebaseOfflineError || !navigator.onLine);
      toast({
        title: isFirebaseOfflineError ? "オフライン" : "エラー",
        description: isFirebaseOfflineError
            ? "操作に失敗しました。オフラインの可能性があります。"
            : "操作に失敗しました。",
        variant: "destructive",
      });
    } finally {
        setIsSaving(false);
    }
  };

  const handleDeleteAnnouncement = async () => {
     if (!selectedSlot || !selectedSlot.announcement || isSaving) return;

     // Check online status before attempting delete
     if (isOffline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
         toast({
             title: "オフライン",
             description: "現在オフラインのため、連絡を削除できません。",
             variant: "destructive",
         });
         return;
     }

     setIsSaving(true);
     try {
         await deleteDailyAnnouncement(selectedSlot.date, selectedSlot.period);
         toast({
             title: "削除しました",
             description: `${selectedSlot.date} ${selectedSlot.period}限目の連絡を削除しました。`,
         });
         setIsModalOpen(false);
         // Reset state after successful delete
         setSelectedSlot(null);
         setAnnouncementText('');
          // Invalidate query
         queryClient.invalidateQueries({ queryKey: ['dailyAnnouncements', format(weekStart, 'yyyy-MM-dd')] });
     } catch (error) {
         console.error("Failed to delete announcement:", error);
         const isFirebaseOfflineError = (error as any)?.code === 'unavailable';
         setIsOffline(isFirebaseOfflineError || !navigator.onLine);
         toast({
             title: isFirebaseOfflineError ? "オフライン" : "エラー",
             description: isFirebaseOfflineError
                ? "連絡の削除に失敗しました。オフラインの可能性があります。"
                : "連絡の削除に失敗しました。",
             variant: "destructive",
         });
     } finally {
        setIsSaving(false);
     }
 };

  // Determine if there's a non-offline error
  const hasConnectivityError = queryError && !isOffline;


  const numberOfPeriods = settings.numberOfPeriods;
  const activeDays = settings.activeDays;

  // Filter weekDays to only include active days + Saturday/Sunday for events
   const displayDays = weekDays.map(date => {
        const dayOfWeekStr = format(date, 'eee', { locale: ja }) as DayOfWeek; // Get Japanese day name
        const isActive = activeDays.includes(dayOfWeekStr);
        const isWeekend = dayOfWeekStr === DayOfWeekEnum.SATURDAY || dayOfWeekStr === DayOfWeekEnum.SUNDAY; // Use DayOfWeekEnum
        return { date, dayOfWeek: dayOfWeekStr, isActive, isWeekend };
    });

  return (
    <Card className="w-full overflow-hidden shadow-lg rounded-lg">
      <CardHeader className="p-4 border-b">
         {/* Display Offline Indicator */}
        {isOffline && (
          <Alert variant="destructive" className="mb-4">
            <WifiOff className="h-4 w-4" />
            <AlertTitle>オフライン</AlertTitle>
            <AlertDescription>
              現在オフラインです。表示されているデータは古い可能性があります。変更は保存されません。
            </AlertDescription>
          </Alert>
        )}
         {/* Display Other Connectivity Error */}
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
                <div>{getDayOfWeekName(dayOfWeek)}</div>
                 <div className="text-xs text-muted-foreground">{format(date, 'M/d')}</div>
                  {/* Display Events for the Day */}
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
              // Skeleton loading rows
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
              // Actual timetable rows
              Array.from({ length: numberOfPeriods }, (_, i) => i + 1).map((period) => (
                <div key={period} className="flex border-b min-h-[80px]">
                  {/* Period Number Column */}
                  <div className={`flex-shrink-0 ${DAY_CELL_WIDTH} p-2 font-semibold text-center border-r sticky left-0 bg-background z-10 flex items-center justify-center`}>
                    {period}限
                  </div>
                  {/* Timetable Cells */}
                  {displayDays.map(({ date, dayOfWeek, isActive }) => {
                     const dateStr = format(date, 'yyyy-MM-dd');
                     const fixedSlot = isActive ? getFixedSlot(dayOfWeek, period) : undefined;
                     const announcement = isActive ? getDailyAnnouncement(dateStr, period) : undefined;
                     const hasEvent = !isActive && getEventsForDay(date).length > 0; // Check if inactive day has event

                     // Display subject from fixed timetable
                     const displaySubject = fixedSlot?.subject || '未設定';

                     // Announcement text to display
                     const announcementDisplay = announcement?.text;


                    return (
                      <div
                        key={`${dateStr}-${period}`}
                        className={`flex-shrink-0 ${DAY_CELL_WIDTH} p-2 border-r relative flex flex-col justify-between ${!isActive && !hasEvent ? 'bg-muted/30' : ''} ${isSameDay(date, currentDate) ? 'bg-primary/5' : ''}`}
                      >
                       {isActive ? (
                             <>
                                 {/* Top Section: Subject */}
                                <div
                                    className="text-sm truncate mb-1 text-muted-foreground"
                                    title={displaySubject}
                                >
                                    {displaySubject}
                                 </div>

                                 {/* Middle Section: Announcement Details */}
                                 <div className="text-xs flex-grow mb-1 break-words overflow-hidden">
                                     {announcementDisplay && (
                                         <div className="p-1 rounded bg-card border border-dashed border-accent/50 text-accent-foreground">
                                             <p className="text-foreground whitespace-pre-wrap">{announcementDisplay}</p>
                                        </div>
                                     )}
                                 </div>

                                 {/* Bottom Section: Edit Button */}
                                 <div className="mt-auto">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-1 text-xs absolute bottom-1 right-1 text-muted-foreground hover:text-primary"
                                        onClick={() => handleSlotClick(dateStr, period, dayOfWeek)}
                                        aria-label={`${dateStr} ${period}限目の連絡を編集`}
                                        disabled={isOffline} // Disable edit button when offline
                                    >
                                        <Edit2 className="w-3 h-3" />
                                    </Button>
                                </div>
                             </>
                        ) : hasEvent ? (
                            // Display placeholder or message for event days if needed
                            <div className="text-xs text-muted-foreground italic h-full flex items-center justify-center">行事日</div>
                        ) : (
                             // Inactive day without event
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
                    <DialogTitle>連絡を編集: {selectedSlot?.date} ({getDayOfWeekName(selectedSlot?.day ?? DayOfWeekEnum.MONDAY)}) {selectedSlot?.period}限目</DialogTitle>
                     <p className="text-sm text-muted-foreground pt-1">
                         時間割: {selectedSlot?.fixedSubject || '未設定'}
                     </p>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                     <div className="grid grid-cols-4 items-center gap-4">
                         <Label htmlFor="announcement-text" className="text-right col-span-1">
                             連絡内容
                         </Label>
                         <Textarea
                            id="announcement-text"
                            value={announcementText}
                            onChange={(e) => setAnnouncementText(e.target.value)}
                            className="col-span-3 min-h-[100px]"
                            placeholder="特別な持ち物、テスト範囲、教室変更などを入力... (空にすると連絡が削除されます)"
                            disabled={isSaving}
                        />
                    </div>
                     <p className="col-span-4 text-xs text-muted-foreground px-2 text-center">
                         内容を空にして保存すると、この時間の連絡は削除されます。
                     </p>
                </div>
                <DialogFooter className="flex justify-between sm:justify-between w-full">
                     {/* Delete Button Aligned Left (Now primarily handled by saving empty text) */}
                     <div>
                         {selectedSlot?.announcement && announcementText && ( // Show delete only if existing and text is NOT empty (otherwise save handles deletion)
                             <Button
                                 variant="destructive"
                                 onClick={handleDeleteAnnouncement}
                                 size="sm"
                                 disabled={isSaving || isOffline} // Disable if saving or offline
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
                             disabled={isSaving || isOffline} // Disable if saving or offline
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
