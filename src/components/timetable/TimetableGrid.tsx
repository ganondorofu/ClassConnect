
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, startOfWeek, addDays, eachDayOfInterval, isSameDay, getDay } from 'date-fns';
import { ja } from 'date-fns/locale';

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SubjectSelector } from '@/components/timetable/SubjectSelector';

import type { FixedTimeSlot, TimetableSettings, DayOfWeek, SchoolEvent } from '@/models/timetable';
import type { Subject } from '@/models/subject';
import { DEFAULT_TIMETABLE_SETTINGS, DayOfWeek as DayOfWeekEnum, getDayOfWeekName, AllDays } from '@/models/timetable';
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
} from '@/controllers/timetableController';
import { queryFnGetSubjects, onSubjectsUpdate } from '@/controllers/subjectController';
import { AlertCircle, CalendarDays, Edit2, Trash2, WifiOff, User, Info } from 'lucide-react';
import type { Timestamp, FirestoreError } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';

const DAY_CELL_WIDTH = "min-w-[140px] sm:min-w-[160px] md:min-w-[180px]";
const TIME_CELL_WIDTH = "w-[60px] sm:w-[70px] flex-shrink-0";

interface TimetableGridProps {
  currentDate: Date;
}

export function TimetableGrid({ currentDate }: TimetableGridProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSlot, setSelectedSlot] = useState<{
    date: string,
    period: number,
    day: DayOfWeek,
    fixedSubjectId: string | null,
    announcement?: DailyAnnouncement
  } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [announcementText, setAnnouncementText] = useState('');
  const [subjectIdOverride, setSubjectIdOverride] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const { user, isAnonymous, loading: authLoading } = useAuth();

  const [liveSettings, setLiveSettings] = useState<TimetableSettings | null>(null);
  const [liveFixedTimetable, setLiveFixedTimetable] = useState<FixedTimeSlot[]>([]);
  const [liveDailyAnnouncements, setLiveDailyAnnouncements] = useState<Record<string, DailyAnnouncement[]>>({});
  const [liveSchoolEvents, setLiveSchoolEvents] = useState<SchoolEvent[]>([]);
  const [liveSubjects, setLiveSubjects] = useState<Subject[]>([]);

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
    console.error(`Query Error (${queryKey}):`, error);
    const isOfflineError = (error as FirestoreError)?.code === 'unavailable';
    setIsOffline(isOfflineError || (typeof navigator !== 'undefined' && !navigator.onLine));
  };

  const { data: initialSettings, isLoading: isLoadingSettings, error: errorSettings } = useQuery({
    queryKey: ['timetableSettings'],
    queryFn: queryFnGetTimetableSettings,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    onError: handleQueryError('timetableSettings'),
    enabled: !isOffline && (!!user || isAnonymous),
  });

  const { data: initialFixedTimetable, isLoading: isLoadingFixed, error: errorFixed } = useQuery({
    queryKey: ['fixedTimetable'],
    queryFn: queryFnGetFixedTimetable,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    onError: handleQueryError('fixedTimetable'),
     enabled: !isOffline && (!!user || isAnonymous),
  });

  const { data: initialSchoolEvents, isLoading: isLoadingEvents, error: errorEvents } = useQuery({
    queryKey: ['schoolEvents'],
    queryFn: queryFnGetSchoolEvents,
    staleTime: 1000 * 60 * 15,
    onError: handleQueryError('schoolEvents'),
    enabled: !isOffline && (!!user || isAnonymous),
  });

  const { data: initialSubjects, isLoading: isLoadingSubjects, error: errorSubjects } = useQuery({
    queryKey: ['subjects'],
    queryFn: queryFnGetSubjects,
    staleTime: 1000 * 60 * 15,
    onError: handleQueryError('subjects'),
    enabled: !isOffline && (!!user || isAnonymous),
  });

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);
  const weekDays = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd]);

  const { data: initialDailyAnnouncementsData, isLoading: isLoadingAnnouncements, error: errorAnnouncements } = useQuery({
    queryKey: ['dailyAnnouncements', format(weekStart, 'yyyy-MM-dd')],
    queryFn: async () => {
      if (isOffline || (!user && !isAnonymous)) {
        setIsOffline(true);
        return queryClient.getQueryData(['dailyAnnouncements', format(weekStart, 'yyyy-MM-dd')]) ?? {};
      }
      setIsOffline(false);
      const announcementsPromises = weekDays.map(day => queryFnGetDailyAnnouncements(format(day, 'yyyy-MM-dd'))());
      const announcementsByDay = await Promise.all(announcementsPromises);
      const announcementsMap: Record<string, DailyAnnouncement[]> = {};
      weekDays.forEach((day, index) => {
        announcementsMap[format(day, 'yyyy-MM-dd')] = announcementsByDay[index];
      });
      return announcementsMap;
    },
    staleTime: 1000 * 60 * 1,
    refetchInterval: isOffline ? false : 1000 * 60 * 2,
    onError: handleQueryError('dailyAnnouncements'),
    enabled: !isOffline && (!!user || isAnonymous),
  });

  useEffect(() => {
    if (isOffline || (!user && !isAnonymous)) return;

    const unsubSettings = onTimetableSettingsUpdate(setLiveSettings, (error) => { console.error("RT Settings Error:", error); setIsOffline(true); });
    const unsubFixed = onFixedTimetableUpdate(setLiveFixedTimetable, (error) => { console.error("RT Fixed TT Error:", error); setIsOffline(true); });
    const unsubEvents = onSchoolEventsUpdate(setLiveSchoolEvents, (error) => { console.error("RT Events Error:", error); setIsOffline(true); });
    const unsubSubjects = onSubjectsUpdate(setLiveSubjects, (error) => { console.error("RT Subjects Error:", error); setIsOffline(true); });
    const unsubAnnouncements = weekDays.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      return onDailyAnnouncementsUpdate(dateStr, (announcements) => {
        setLiveDailyAnnouncements(prev => ({ ...prev, [dateStr]: announcements }));
      }, (error) => { console.error(`RT Annc Error ${dateStr}:`, error); setIsOffline(true); });
    });

    return () => {
      unsubSettings(); unsubFixed(); unsubEvents(); unsubSubjects();
      unsubAnnouncements.forEach(unsub => unsub());
    };
  }, [weekStart, isOffline, weekDays, user, isAnonymous]);

  const settings = useMemo(() => liveSettings ?? initialSettings ?? DEFAULT_TIMETABLE_SETTINGS, [liveSettings, initialSettings]);
  const fixedTimetable = useMemo(() => liveFixedTimetable.length > 0 ? liveFixedTimetable : initialFixedTimetable ?? [], [liveFixedTimetable, initialFixedTimetable]);
  const schoolEvents = useMemo(() => liveSchoolEvents.length > 0 ? liveSchoolEvents : initialSchoolEvents ?? [], [liveSchoolEvents, initialSchoolEvents]);
  const subjects = useMemo(() => liveSubjects.length > 0 ? liveSubjects : initialSubjects ?? [], [liveSubjects, initialSubjects]);
  const subjectsMap = useMemo(() => new Map(subjects.map(s => [s.id, s])), [subjects]);
  const dailyAnnouncements = useMemo(() => Object.keys(liveDailyAnnouncements).length > 0 ? { ...initialDailyAnnouncementsData, ...liveDailyAnnouncements } : initialDailyAnnouncementsData ?? {}, [liveDailyAnnouncements, initialDailyAnnouncementsData]);

  const isLoadingCombined = (isLoadingSettings || isLoadingFixed || isLoadingAnnouncements || isLoadingEvents || isLoadingSubjects || authLoading) && !isOffline;
  const queryError = errorSettings || errorFixed || errorEvents || errorAnnouncements || errorSubjects;

  const getFixedSlot = (day: DayOfWeek, period: number): FixedTimeSlot | undefined => fixedTimetable.find(slot => slot.day === day && slot.period === period);
  const getDailyAnnouncement = (date: string, period: number): DailyAnnouncement | undefined => dailyAnnouncements[date]?.find(ann => ann.period === period);
  const getEventsForDay = (date: Date): SchoolEvent[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return schoolEvents.filter(event => event.startDate === dateStr || (event.endDate && dateStr >= event.startDate && dateStr <= event.endDate));
  };
  const getSubjectById = (id: string | null): Subject | undefined => id ? subjectsMap.get(id) : undefined;
  
  const canEditTimetableSlot = !!user; // Only admin can change subjects in timetable slots

  const handleSlotClick = (date: string, period: number, day: DayOfWeek) => {
    const fixedSlot = getFixedSlot(day, period);
    const announcement = getDailyAnnouncement(date, period);
    setSelectedSlot({ date, period, day, fixedSubjectId: fixedSlot?.subjectId ?? null, announcement });
    setAnnouncementText(announcement?.text ?? '');
    setSubjectIdOverride(announcement?.subjectIdOverride ?? null);
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
      const userIdForLog = user ? user.uid : (isAnonymous ? 'anonymous_slot_edit' : 'unknown_user');
      const announcementData: Omit<DailyAnnouncement, 'id' | 'updatedAt'> = {
        date: selectedSlot.date,
        period: selectedSlot.period,
        text: announcementText.trim(),
        subjectIdOverride: canEditTimetableSlot ? (subjectIdOverride ?? null) : selectedSlot.announcement?.subjectIdOverride ?? null,
      };
      await upsertDailyAnnouncement(announcementData, userIdForLog);
      toast({ title: "成功", description: `${selectedSlot.date} ${selectedSlot.period}限目の連絡・変更を保存しました。` });
      setIsModalOpen(false);
      setSelectedSlot(null);
      setAnnouncementText('');
      setSubjectIdOverride(null);
      queryClient.invalidateQueries({ queryKey: ['dailyAnnouncements', format(weekStart, 'yyyy-MM-dd')] });
    } catch (error: any) {
      console.error("Failed to save/delete announcement:", error);
      const isFirebaseOfflineError = (error as FirestoreError)?.code === 'unavailable' || error?.message?.includes("オフラインのため");
      setIsOffline(isFirebaseOfflineError || (typeof navigator !== 'undefined' && !navigator.onLine));
      toast({
        title: isFirebaseOfflineError ? "オフライン" : "エラー",
        description: isFirebaseOfflineError ? "操作に失敗しました。オフラインの可能性があります。" : `操作に失敗しました: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteConfirmation = async () => {
    setAnnouncementText('');
    if (canEditTimetableSlot) setSubjectIdOverride(null);
    await handleSaveAnnouncement();
  };

  const numberOfPeriods = settings?.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods;
  const activeDays = settings?.activeDays ?? DEFAULT_TIMETABLE_SETTINGS.activeDays;
  
  const displayDays = useMemo(() => {
    const daysToShow = weekDays.filter(date => {
        const dayOfWeekJs = date.getDay();
        const dayOfWeekMap: { [key: number]: DayOfWeek } = { 1: DayOfWeekEnum.MONDAY, 2: DayOfWeekEnum.TUESDAY, 3: DayOfWeekEnum.WEDNESDAY, 4: DayOfWeekEnum.THURSDAY, 5: DayOfWeekEnum.FRIDAY, 6: DayOfWeekEnum.SATURDAY, 0: DayOfWeekEnum.SUNDAY };
        const dayOfWeekStr = dayOfWeekMap[dayOfWeekJs];
        // Show active days or any day with an event
        return activeDays.includes(dayOfWeekStr) || getEventsForDay(date).length > 0 || (dayOfWeekStr === DayOfWeekEnum.SATURDAY || dayOfWeekStr === DayOfWeekEnum.SUNDAY);
    });
    // Ensure we always show Monday to Friday if they are active, regardless of events,
    // and then add Saturday/Sunday only if they have events or are active.
    // The current logic of weekDays and then mapping with activeDays & events should cover this.
    // The issue might be if Sunday has no events and is not active, it shouldn't add a blank column.
    
    return weekDays.map(date => {
      const dayOfWeekJs = date.getDay();
      const dayOfWeekMap: { [key: number]: DayOfWeek } = { 1: DayOfWeekEnum.MONDAY, 2: DayOfWeekEnum.TUESDAY, 3: DayOfWeekEnum.WEDNESDAY, 4: DayOfWeekEnum.THURSDAY, 5: DayOfWeekEnum.FRIDAY, 6: DayOfWeekEnum.SATURDAY, 0: DayOfWeekEnum.SUNDAY };
      const dayOfWeekStr = dayOfWeekMap[dayOfWeekJs];
      const isActiveDay = activeDays.includes(dayOfWeekStr);
      const hasEvents = getEventsForDay(date).length > 0;
      // Only include the day in display if it's active OR it has events.
      // This prevents empty columns for non-active, event-less weekend days.
      return { date, dayOfWeek: dayOfWeekStr, isActive: isActiveDay, isWeekend: dayOfWeekStr === DayOfWeekEnum.SATURDAY || dayOfWeekStr === DayOfWeekEnum.SUNDAY, shouldDisplay: isActiveDay || hasEvents };
    }).filter(day => day.shouldDisplay); // Filter out days that are neither active nor have events
  }, [weekDays, activeDays, schoolEvents]);


  const headers = [
    <div key="header-time" className={`${TIME_CELL_WIDTH} p-1 sm:p-2 font-semibold text-center border-r sticky left-0 bg-card z-20`}>時間</div>,
    ...displayDays.map(({ date, dayOfWeek, isWeekend }) => {
      const dateStr = format(date, 'yyyy-MM-dd');
      return (
        <div key={`header-${dateStr}`} className={`flex-shrink-0 ${DAY_CELL_WIDTH} p-1 sm:p-2 font-semibold text-center border-r ${isWeekend ? 'bg-muted/50' : ''} ${isSameDay(date, currentDate) ? 'bg-primary/10' : ''} bg-card`}>
          <div>{dayOfWeek ? getDayOfWeekName(dayOfWeek) : ''}</div>
          <div className="text-xs text-muted-foreground">{format(date, 'M/d')}</div>
          {getEventsForDay(date).map(event => (
            <div key={`event-${event.id}-${dateStr}`} className="mt-1 p-1 bg-accent/20 text-accent-foreground rounded text-xs truncate flex items-center gap-1" title={event.title}>
              <CalendarDays className="w-3 h-3 shrink-0" /><span>{event.title}</span>
            </div>
          ))}
        </div>
      );
    })
  ];

  if (!user && !isAnonymous && !authLoading) {
    return (
        <Alert variant="default" className="m-4">
            <Info className="h-4 w-4" />
            <AlertTitle>時間割の表示</AlertTitle>
            <AlertDescription>
                ログインまたは「ログインなしで利用」を選択すると、時間割が表示されます。
            </AlertDescription>
        </Alert>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-lg shadow-lg border">
      <Card className="w-full border-0 shadow-none rounded-none">
        {isOffline && (
          <Alert variant="destructive" className="m-2 sm:m-4">
            <WifiOff className="h-4 w-4" /><AlertTitle>オフライン</AlertTitle>
            <AlertDescription>現在オフラインです。表示されているデータは古い可能性があります。変更は保存されません。</AlertDescription>
          </Alert>
        )}
        {queryError && !isOffline && (
          <Alert variant="destructive" className="m-2 sm:m-4">
            <AlertCircle className="h-4 w-4" /><AlertTitle>接続エラー</AlertTitle>
            <AlertDescription>データの読み込みに失敗しました。時間をおいてページを再読み込みしてください。</AlertDescription>
          </Alert>
        )}
        <CardContent className="p-0 overflow-x-auto">
          <div className="flex sticky top-0 bg-card z-20 border-b">{headers.map(header => header)}</div>
          {isLoadingCombined ? (
            Array.from({ length: numberOfPeriods }, (_, i) => i + 1).map((period) => {
              const skeletonCells = [
                <div key={`skeleton-period-${period}`} className={`${TIME_CELL_WIDTH} p-1 sm:p-2 font-semibold text-center border-r sticky left-0 bg-card z-10 flex items-center justify-center`}><Skeleton className="h-6 w-8" /></div>,
                ...displayDays.map(({ date }) => (
                  <div key={`skeleton-cell-${format(date, 'yyyy-MM-dd')}-${period}`} className={`flex-shrink-0 ${DAY_CELL_WIDTH} p-1 sm:p-2 border-r flex flex-col justify-between bg-card`}>
                    <Skeleton className="h-4 w-3/4 mb-1" /><Skeleton className="h-3 w-1/2 mb-2" /><Skeleton className="h-8 w-full" />
                  </div>
                ))
              ];
              return <div key={`skeleton-row-${period}`} className="flex border-b min-h-[90px]">{skeletonCells.map(cell => cell)}</div>;
            })
          ) : (
            Array.from({ length: numberOfPeriods }, (_, i) => i + 1).map((period) => {
              const cells = [
                <div key={`period-${period}`} className={`${TIME_CELL_WIDTH} p-1 sm:p-2 font-semibold text-center border-r sticky left-0 bg-card z-10 flex items-center justify-center`}>{period}限</div>,
                ...displayDays.map(({ date, dayOfWeek, isActive }) => {
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const fixedSlot = isActive ? getFixedSlot(dayOfWeek, period) : undefined;
                  const announcement = isActive ? getDailyAnnouncement(dateStr, period) : undefined;
                  const hasEvent = getEventsForDay(date).length > 0; // Check if the day has events even if not active for classes

                  const displaySubjectId = announcement?.subjectIdOverride ?? fixedSlot?.subjectId ?? null;
                  const displaySubject = getSubjectById(displaySubjectId);
                  const announcementDisplay = announcement?.text;
                  const fixedSubjectIdOrNull = fixedSlot?.subjectId ?? null;
                  
                  const showSubjectChangeIndicator = 
                    (announcement?.subjectIdOverride !== undefined && announcement?.subjectIdOverride !== null) && 
                    (announcement.subjectIdOverride !== fixedSubjectIdOrNull);

                  // Cell should render content if it's an active day OR if there's an event
                  // Otherwise, it's an empty cell for non-active, non-event days (e.g. blank weekend)
                  const shouldRenderContent = isActive || hasEvent;


                  return (
                    <div key={`${dateStr}-${period}-cell`} className={`flex-shrink-0 ${DAY_CELL_WIDTH} p-1 sm:p-2 border-r relative flex flex-col justify-between ${!isActive && !hasEvent ? 'bg-muted/30' : ''} ${isSameDay(date, currentDate) ? 'bg-primary/5' : ''} bg-card`}>
                      {shouldRenderContent ? (
                        <>
                          <div className="mb-1">
                            <div className="text-sm truncate font-medium" title={displaySubject?.name ?? (isActive ? '未設定' : '')}>
                              {displaySubject?.name ?? (isActive ? '未設定' : '')}
                              {showSubjectChangeIndicator && <span className="text-xs text-destructive ml-1">(変更)</span>}
                            </div>
                            {displaySubject?.teacherName && (
                              <div className="text-xs text-muted-foreground flex items-center gap-1 truncate" title={displaySubject.teacherName}>
                                <User className="w-3 h-3 shrink-0" />{displaySubject.teacherName}
                              </div>
                            )}
                          </div>
                          <div className="text-xs flex-grow mb-1 break-words overflow-hidden">
                            {announcementDisplay && (
                              <div className="p-1 rounded bg-card border border-dashed border-accent/50">
                                <p className="text-foreground whitespace-pre-wrap">{announcementDisplay}</p>
                              </div>
                            )}
                          </div>
                          {isActive && ( // Only show edit button for active class days
                            <div className="mt-auto">
                              <Button variant="ghost" size="sm" className="h-6 px-1 text-xs absolute bottom-1 right-1 text-muted-foreground hover:text-primary" onClick={() => handleSlotClick(dateStr, period, dayOfWeek)} aria-label={`${dateStr} ${period}限目の連絡・変更を編集`} disabled={isOffline || (!user && !isAnonymous)}>
                                <Edit2 className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                          {!isActive && hasEvent && ( // If not active class day but has event, show placeholder
                             <div className="text-xs text-muted-foreground italic h-full flex items-center justify-center">行事日</div>
                          )}
                        </>
                      ) : (
                        <div className="h-full"></div> // Empty for non-active, non-event days
                      )}
                    </div>
                  );
                })
              ];
              return <div key={`row-${period}`} className="flex border-b min-h-[90px]">{cells.map(cell => cell)}</div>;
            })
          )}
        </CardContent>
      </Card>

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
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="subject-override" className="text-right col-span-1">科目変更</Label>
              <SubjectSelector
                id="subject-override"
                subjects={subjects}
                selectedSubjectId={subjectIdOverride}
                onValueChange={setSubjectIdOverride}
                placeholder="科目を選択 (変更なし)"
                disabled={isSaving || isLoadingSubjects || !canEditTimetableSlot}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="announcement-text" className="text-right col-span-1">連絡内容</Label>
              <Textarea id="announcement-text" value={announcementText} onChange={(e) => setAnnouncementText(e.target.value)} className="col-span-3 min-h-[100px]" placeholder="持ち物、テスト範囲、教室変更など" disabled={isSaving} />
            </div>
            <p className="col-span-4 text-xs text-muted-foreground px-2 text-center">
              {canEditTimetableSlot ? "科目変更・連絡内容の両方が空の場合、この時間の連絡・変更は削除されます。" : "連絡内容が空の場合、この時間の連絡は削除されます。"}
            </p>
          </div>
          <DialogFooter className="flex justify-between sm:justify-between w-full">
            <div>
              {selectedSlot?.announcement && (selectedSlot.announcement.text || selectedSlot.announcement.subjectIdOverride !== null) && (
                <Button variant="destructive" onClick={handleDeleteConfirmation} size="sm" disabled={isSaving || isOffline}>
                  <Trash2 className="mr-1 w-4 h-4" />{isSaving ? '削除中...' : '削除'}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <DialogClose asChild><Button type="button" variant="secondary" disabled={isSaving}>キャンセル</Button></DialogClose>
              <Button type="button" onClick={handleSaveAnnouncement} disabled={isSaving || isOffline || isLoadingSubjects}>
                {isSaving ? '保存中...' : '保存'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
