
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, startOfWeek, addDays, eachDayOfInterval, isSameDay, getDay } from 'date-fns';
import { ja } from 'date-fns/locale'; // Import Japanese locale

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SubjectSelector } from '@/components/timetable/SubjectSelector'; // Import SubjectSelector

import type { FixedTimeSlot, TimetableSettings, DayOfWeek, SchoolEvent } from '@/models/timetable';
import type { Subject } from '@/models/subject'; // Import Subject type
import { DEFAULT_TIMETABLE_SETTINGS, DayOfWeek as DayOfWeekEnum, getDayOfWeekName, AllDays } from '@/models/timetable'; // Combined imports
import type { DailyAnnouncement } from '@/models/announcement'; // Import the type
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
import { queryFnGetSubjects, onSubjectsUpdate } from '@/controllers/subjectController'; // Import subject functions
import { AlertCircle, CalendarDays, Edit2, Trash2, WifiOff, User } from 'lucide-react'; // Added User icon
import type { Timestamp, FirestoreError } from 'firebase/firestore';


const DAY_CELL_WIDTH = "min-w-[180px]"; // Adjust width as needed


interface TimetableGridProps {
  currentDate: Date; // Pass current date as prop
}

export function TimetableGrid({ currentDate }: TimetableGridProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSlot, setSelectedSlot] = useState<{
      date: string,
      period: number,
      day: DayOfWeek,
      fixedSubjectId: string | null, // Now storing ID
      announcement?: DailyAnnouncement
  } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [announcementText, setAnnouncementText] = useState('');
  const [subjectIdOverride, setSubjectIdOverride] = useState<string | null>(null); // State for subject ID override
  const [isSaving, setIsSaving] = useState(false); // State for save/delete operations
  const [isOffline, setIsOffline] = useState(false); // State to track offline status


  // --- State for Realtime Data ---
  const [liveSettings, setLiveSettings] = useState<TimetableSettings | null>(null);
  const [liveFixedTimetable, setLiveFixedTimetable] = useState<FixedTimeSlot[]>([]);
  const [liveDailyAnnouncements, setLiveDailyAnnouncements] = useState<Record<string, DailyAnnouncement[]>>({});
  const [liveSchoolEvents, setLiveSchoolEvents] = useState<SchoolEvent[]>([]);
  const [liveSubjects, setLiveSubjects] = useState<Subject[]>([]); // State for subjects


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
        const isOfflineError = (error as FirestoreError)?.code === 'unavailable';
        setIsOffline(isOfflineError || (typeof navigator !== 'undefined' && !navigator.onLine)); // Update offline state based on error
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

     // Fetch subjects
     const { data: initialSubjects, isLoading: isLoadingSubjects, error: errorSubjects } = useQuery({
       queryKey: ['subjects'],
       queryFn: queryFnGetSubjects,
       staleTime: 1000 * 60 * 15, // 15 minutes
       onError: handleQueryError('subjects'),
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

    const unsubSubjects = onSubjectsUpdate((subs) => { // Subscribe to subjects
        setLiveSubjects(subs);
        setIsOffline(false);
    }, (error) => {
        console.error("Realtime subjects error:", error);
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
      unsubSubjects(); // Unsubscribe from subjects
      unsubAnnouncements.forEach(unsub => unsub());
    };
  }, [weekStart, isOffline, weekDays]); // Add weekDays dependency


  // --- Data Merging ---
  const settings = useMemo(() => liveSettings ?? initialSettings ?? DEFAULT_TIMETABLE_SETTINGS, [liveSettings, initialSettings]);
  const fixedTimetable = useMemo(() => liveFixedTimetable.length > 0 ? liveFixedTimetable : initialFixedTimetable ?? [], [liveFixedTimetable, initialFixedTimetable]);
  const schoolEvents = useMemo(() => liveSchoolEvents.length > 0 ? liveSchoolEvents : initialSchoolEvents ?? [], [liveSchoolEvents, initialSchoolEvents]);
  const subjects = useMemo(() => liveSubjects.length > 0 ? liveSubjects : initialSubjects ?? [], [liveSubjects, initialSubjects]); // Merge subjects
  // Create a map for quick subject lookup
  const subjectsMap = useMemo(() => new Map(subjects.map(s => [s.id, s])), [subjects]);

  // Merge initial data (potentially from cache) with live updates
  const dailyAnnouncements = useMemo(() => Object.keys(liveDailyAnnouncements).length > 0
      ? { ...initialDailyAnnouncementsData, ...liveDailyAnnouncements }
      : initialDailyAnnouncementsData ?? {}, [liveDailyAnnouncements, initialDailyAnnouncementsData]);


  const isLoading = (isLoadingSettings || isLoadingFixed || isLoadingAnnouncements || isLoadingEvents || isLoadingSubjects) && !isOffline; // Don't show loading if offline error is the reason
  const queryError = errorSettings || errorFixed || errorEvents || errorAnnouncements || errorSubjects; // Combine errors


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

  const getSubjectById = (id: string | null): Subject | undefined => {
    return id ? subjectsMap.get(id) : undefined;
  }


  const handleSlotClick = (date: string, period: number, day: DayOfWeek) => {
    const fixedSlot = getFixedSlot(day, period);
    const announcement = getDailyAnnouncement(date, period);
    setSelectedSlot({
        date,
        period,
        day,
        fixedSubjectId: fixedSlot?.subjectId ?? null, // Store fixed subject ID
        announcement
    });
    // Initialize modal state
    setAnnouncementText(announcement?.text ?? '');
    setSubjectIdOverride(announcement?.subjectIdOverride ?? null); // Initialize with existing override or null
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
        // If text and subjectIdOverride are both empty/null, the controller will delete it.
        const announcementData: Omit<DailyAnnouncement, 'id' | 'updatedAt'> = {
            date: selectedSlot.date,
            period: selectedSlot.period,
            text: announcementText.trim(),
            subjectIdOverride: subjectIdOverride ?? null, // Send trimmed override or null
        };

        await upsertDailyAnnouncement(announcementData); // upsert handles create, update, and delete based on content

        toast({
            title: "成功",
            description: `${selectedSlot.date} ${selectedSlot.period}限目の連絡・変更を保存しました。`,
        });

      setIsModalOpen(false);
      setSelectedSlot(null);
      setAnnouncementText('');
      setSubjectIdOverride(null); // Reset subject ID override
      // Invalidate query to ensure data consistency
      queryClient.invalidateQueries({ queryKey: ['dailyAnnouncements', format(weekStart, 'yyyy-MM-dd')] });
    } catch (error: any) {
      console.error("Failed to save/delete announcement:", error);
       // Ensure FirestoreError type is imported or handled properly
       const isFirebaseOfflineError = (error as FirestoreError)?.code === 'unavailable' || error?.message?.includes("オフラインのため");
      setIsOffline(isFirebaseOfflineError || (typeof navigator !== 'undefined' && !navigator.onLine));
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
     // Trigger deletion by clearing fields and saving
     setAnnouncementText('');
     setSubjectIdOverride(null);
     await handleSaveAnnouncement(); // Let handleSave trigger deletion via upsert
 };

  const hasConnectivityError = queryError && !isOffline;


  const numberOfPeriods = settings?.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods;
  const activeDays = settings?.activeDays ?? DEFAULT_TIMETABLE_SETTINGS.activeDays;

  const displayDays = useMemo(() => weekDays.map(date => {
        const dayOfWeekJs = date.getDay(); // 0 for Sunday, 6 for Saturday
        const dayOfWeekMap: { [key: number]: DayOfWeek } = {
            1: DayOfWeekEnum.MONDAY, 2: DayOfWeekEnum.TUESDAY, 3: DayOfWeekEnum.WEDNESDAY,
            4: DayOfWeekEnum.THURSDAY, 5: DayOfWeekEnum.FRIDAY, 6: DayOfWeekEnum.SATURDAY,
            0: DayOfWeekEnum.SUNDAY,
        };
        const dayOfWeekStr = dayOfWeekMap[dayOfWeekJs];
        const isActive = activeDays.includes(dayOfWeekStr);
        const isWeekend = dayOfWeekStr === DayOfWeekEnum.SATURDAY || dayOfWeekStr === DayOfWeekEnum.SUNDAY;
        return { date, dayOfWeek: dayOfWeekStr, isActive, isWeekend };
    }), [weekDays, activeDays]);

  const headers = [
    <div key="header-time" className={`flex-shrink-0 ${DAY_CELL_WIDTH} p-2 font-semibold text-center border-r sticky left-0 bg-background z-10`}>
      時間
    </div>,
    ...displayDays.map(({ date, dayOfWeek, isActive, isWeekend }) => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const headerKey = `header-${dateStr}`;
      return (
        <div
          key={headerKey}
          className={`flex-shrink-0 ${DAY_CELL_WIDTH} p-2 font-semibold text-center border-r ${isWeekend ? 'bg-muted/50' : ''} ${isSameDay(date, currentDate) ? 'bg-primary/10' : ''}`}
        >
          <div>{dayOfWeek ? getDayOfWeekName(dayOfWeek) : ''}</div>
          <div className="text-xs text-muted-foreground">{format(date, 'M/d')}</div>
          {getEventsForDay(date).map(event => {
            const eventKey = `event-${event.id}-${dateStr}`; // Ensure unique key
            return (
              <div key={eventKey} className="mt-1 p-1 bg-accent/20 text-accent-foreground rounded text-xs truncate flex items-center gap-1" title={event.title}>
                <CalendarDays className="w-3 h-3 shrink-0" />
                <span>{event.title}</span>
              </div>
            );
          })}
        </div>
      );
    })
  ];


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
            {headers}
          </div>

          {/* Timetable Rows */}
          {isLoading ? (
              Array.from({ length: numberOfPeriods }, (_, i) => i + 1).map((period) => {
                 const skeletonCells = [
                    <div key={`skeleton-period-${period}`} className={`flex-shrink-0 ${DAY_CELL_WIDTH} p-2 font-semibold text-center border-r sticky left-0 bg-background z-10 flex items-center justify-center`}>
                        <Skeleton className="h-6 w-8" />
                    </div>,
                    ...displayDays.map(({ date }) => {
                       const skeletonCellKey = `skeleton-cell-${format(date, 'yyyy-MM-dd')}-${period}`;
                       return (
                          <div key={skeletonCellKey} className={`flex-shrink-0 ${DAY_CELL_WIDTH} p-2 border-r flex flex-col justify-between`}>
                              <Skeleton className="h-4 w-3/4 mb-1" /> {/* Subject name skel */}
                              <Skeleton className="h-3 w-1/2 mb-2" /> {/* Teacher name skel */}
                              <Skeleton className="h-8 w-full" /> {/* Announcement skel */}
                          </div>
                       );
                    })
                 ];
                 return <div key={`skeleton-row-${period}`} className="flex border-b min-h-[80px]">{skeletonCells}</div>;
              })
          ) : (
              Array.from({ length: numberOfPeriods }, (_, i) => i + 1).map((period) => {
                 const cells = [
                     <div key={`period-${period}`} className={`flex-shrink-0 ${DAY_CELL_WIDTH} p-2 font-semibold text-center border-r sticky left-0 bg-background z-10 flex items-center justify-center`}>
                       {period}限
                     </div>,
                     ...displayDays.map(({ date, dayOfWeek, isActive }) => {
                        const dateStr = format(date, 'yyyy-MM-dd');
                        const cellKey = `${dateStr}-${period}`;

                        if (!dayOfWeek) return <div key={`${cellKey}-empty`} className={`flex-shrink-0 ${DAY_CELL_WIDTH} p-2 border-r bg-muted/30 h-full`}></div>;

                        const fixedSlot = isActive ? getFixedSlot(dayOfWeek, period) : undefined;
                        const announcement = isActive ? getDailyAnnouncement(dateStr, period) : undefined;
                        const hasEvent = !isActive && getEventsForDay(date).length > 0;

                        const displaySubjectId = announcement?.subjectIdOverride ?? fixedSlot?.subjectId ?? null;
                        const displaySubject = getSubjectById(displaySubjectId);
                        const announcementDisplay = announcement?.text;

                        // Check if the subject has changed compared to the fixed timetable
                        const fixedSubjectId = fixedSlot?.subjectId ?? null;
                         // Corrected condition: Show '(変更)' only if subjectIdOverride exists (not null/undefined) AND is different from fixedSubjectId
                         const showSubjectChangeIndicator = announcement?.subjectIdOverride !== null &&
                                                            announcement?.subjectIdOverride !== undefined &&
                                                            announcement.subjectIdOverride !== fixedSubjectId;


                       return (
                         <div
                           key={cellKey}
                           className={`flex-shrink-0 ${DAY_CELL_WIDTH} p-2 border-r relative flex flex-col justify-between ${!isActive && !hasEvent ? 'bg-muted/30' : ''} ${isSameDay(date, currentDate) ? 'bg-primary/5' : ''}`}
                         >
                          {isActive ? (
                                <>
                                   {/* Subject and Teacher */}
                                   <div className="mb-1">
                                       <div
                                           className="text-sm truncate font-medium"
                                           title={displaySubject?.name ?? '未設定'}
                                       >
                                           {displaySubject?.name ?? '未設定'}
                                           {/* Display '(変更)' only if subject ID override exists and is different */}
                                           {showSubjectChangeIndicator && (
                                               <span className="text-xs text-destructive ml-1">(変更)</span>
                                           )}
                                        </div>
                                         {displaySubject?.teacherName && (
                                             <div className="text-xs text-muted-foreground flex items-center gap-1 truncate" title={displaySubject.teacherName}>
                                                <User className="w-3 h-3 shrink-0" />
                                                {displaySubject.teacherName}
                                             </div>
                                         )}
                                    </div>

                                    {/* Announcement Text */}
                                    <div className="text-xs flex-grow mb-1 break-words overflow-hidden">
                                        {announcementDisplay && (
                                            <div className="p-1 rounded bg-card border border-dashed border-accent/50">
                                                <p className="text-foreground whitespace-pre-wrap">{announcementDisplay}</p>
                                           </div>
                                        )}
                                    </div>

                                    {/* Edit Button */}
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
                     })
                 ];
                 return <div key={`row-${period}`} className="flex border-b min-h-[90px]">{cells}</div>;
               })
          )}
        </div>

        {/* Announcement Edit Modal */}
       <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>連絡・変更を編集: {selectedSlot?.date} ({selectedSlot?.day ? getDayOfWeekName(selectedSlot.day) : ''}) {selectedSlot?.period}限目</DialogTitle>
                    {selectedSlot?.fixedSubjectId && getSubjectById(selectedSlot.fixedSubjectId) && (
                        <p className="text-sm text-muted-foreground pt-1">
                            元の科目: {getSubjectById(selectedSlot.fixedSubjectId)?.name ?? '未設定'}
                            {getSubjectById(selectedSlot.fixedSubjectId)?.teacherName && ` (${getSubjectById(selectedSlot.fixedSubjectId)?.teacherName})`}
                        </p>
                     )}
                </DialogHeader>
                <div className="grid gap-4 py-4">
                     {/* Subject Override Selector */}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="subject-override" className="text-right col-span-1">
                            科目変更
                        </Label>
                        <SubjectSelector
                             id="subject-override"
                             subjects={subjects}
                             selectedSubjectId={subjectIdOverride}
                             onValueChange={setSubjectIdOverride}
                             placeholder="科目を選択 (変更)"
                             disabled={isSaving || isLoadingSubjects}
                             className="col-span-3"
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
                     {/* Delete Button */}
                     <div>
                        {selectedSlot?.announcement && (announcementText || subjectIdOverride != null) && (
                             <Button
                                 variant="destructive"
                                 onClick={handleDeleteConfirmation}
                                 size="sm"
                                 disabled={isSaving || isOffline}
                            >
                                 <Trash2 className="mr-1 w-4 h-4" />
                                 {isSaving ? '削除中...' : '削除'}
                             </Button>
                         )}
                     </div>
                     {/* Save and Cancel Buttons */}
                     <div className="flex gap-2">
                         <DialogClose asChild>
                             <Button type="button" variant="secondary" disabled={isSaving}>
                                 キャンセル
                             </Button>
                         </DialogClose>
                         <Button
                             type="button"
                             onClick={handleSaveAnnouncement}
                             disabled={isSaving || isOffline || isLoadingSubjects} // Disable if subjects are loading
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



    