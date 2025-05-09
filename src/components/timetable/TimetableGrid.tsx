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
import { Checkbox } from "@/components/ui/checkbox"; // Import Checkbox
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
import { cn } from "@/lib/utils";

const DAY_CELL_WIDTH = "flex-grow-0 min-w-[140px] sm:min-w-[160px] md:min-w-[180px]";
const TIME_CELL_WIDTH = "w-[60px] sm:w-[70px] flex-shrink-0";

interface TimetableGridProps {
  currentDate: Date;
}

type Unsubscribe = () => void;

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
  const [showOnCalendarModal, setShowOnCalendarModal] = useState(false); // State for checkbox
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
    const isFirestoreUnavailable = (error as FirestoreError)?.code === 'unavailable';
    setIsOffline(isFirestoreUnavailable || (typeof navigator !== 'undefined' && !navigator.onLine));
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

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday
  const weekEnd = addDays(weekStart, 6); // Sunday
  const weekDays = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd]);

  const { data: initialDailyAnnouncementsData, isLoading: isLoadingAnnouncements, error: errorAnnouncements } = useQuery({
    queryKey: ['dailyAnnouncements', format(weekStart, 'yyyy-MM-dd')],
    queryFn: async () => {
      if (isOffline || (!user && !isAnonymous)) {
        return queryClient.getQueryData(['dailyAnnouncements', format(weekStart, 'yyyy-MM-dd')]) ?? {};
      }
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
    let unsubSettings: Unsubscribe | undefined;
    let unsubFixed: Unsubscribe | undefined;
    let unsubEvents: Unsubscribe | undefined;
    let unsubSubjects: Unsubscribe | undefined;
    let unsubAnnouncements: Unsubscribe[] = [];

    if (user || isAnonymous) {
        unsubSettings = onTimetableSettingsUpdate((newSettings) => { setLiveSettings(newSettings); setIsOffline(false); }, (error) => { console.error("RT Settings Error:", error); setIsOffline(true); });
        unsubFixed = onFixedTimetableUpdate((newFixedTimetable) => { setLiveFixedTimetable(newFixedTimetable); setIsOffline(false); },  (error) => { console.error("RT Fixed TT Error:", error); setIsOffline(true); });
        unsubEvents = onSchoolEventsUpdate((newEvents) => { setLiveSchoolEvents(newEvents); setIsOffline(false); }, (error) => { console.error("RT Events Error:", error); setIsOffline(true); });
        unsubSubjects = onSubjectsUpdate((newSubjects) => { setLiveSubjects(newSubjects); setIsOffline(false); }, (error) => { console.error("RT Subjects Error:", error); setIsOffline(true); });
        unsubAnnouncements = weekDays.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          return onDailyAnnouncementsUpdate(dateStr, (announcements) => {
            setLiveDailyAnnouncements(prev => ({ ...prev, [dateStr]: announcements }));
            setIsOffline(false);
          }, (error) => { console.error(`RT Annc Error ${dateStr}:`, error); setIsOffline(true); });
        });
    }
    return () => {
      unsubSettings?.();
      unsubFixed?.();
      unsubEvents?.();
      unsubSubjects?.();
      unsubAnnouncements.forEach(unsub => unsub?.());
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
    return schoolEvents.filter(event => event.startDate <= dateStr && (event.endDate ?? event.startDate) >= dateStr);
  };
  const getSubjectById = (id: string | null): Subject | undefined => id ? subjectsMap.get(id) : undefined;

  const canEditTimetableSlot = !!user || isAnonymous;

  const handleSlotClick = (date: string, period: number, day: DayOfWeek) => {
    const fixedSlot = getFixedSlot(day, period);
    const announcement = getDailyAnnouncement(date, period);
    setSelectedSlot({ date, period, day, fixedSubjectId: fixedSlot?.subjectId ?? null, announcement });
    setAnnouncementText(announcement?.text ?? '');
    setSubjectIdOverride(announcement?.subjectIdOverride ?? null);
    setShowOnCalendarModal(announcement?.showOnCalendar ?? false); // Initialize checkbox state
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
        subjectIdOverride: (user && !isAnonymous) ? (subjectIdOverride ?? null) : (selectedSlot.announcement?.subjectIdOverride ?? null),
        showOnCalendar: showOnCalendarModal, // Include checkbox value
      };
      await upsertDailyAnnouncement(announcementData, userIdForLog);
      toast({ title: "成功", description: `${selectedSlot.date} ${selectedSlot.period}限目の連絡・変更を保存しました。` });
      setIsModalOpen(false);
      setSelectedSlot(null);
      setAnnouncementText('');
      setSubjectIdOverride(null);
      setShowOnCalendarModal(false);
      queryClient.invalidateQueries({ queryKey: ['dailyAnnouncements', format(weekStart, 'yyyy-MM-dd')] });
      queryClient.invalidateQueries({ queryKey: ['calendarItems'] }); // Invalidate calendar items query
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
    if (user && !isAnonymous) setSubjectIdOverride(null);
    setShowOnCalendarModal(false); // Reset checkbox on delete
    await handleSaveAnnouncement();
  };

  const numberOfPeriods = settings?.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods;
  const activeDaysSetting = settings?.activeDays ?? DEFAULT_TIMETABLE_SETTINGS.activeDays;

  const displayDays = useMemo(() => {
    return weekDays.map(date => {
        const dayOfWeekJs = date.getDay();
        const dayOfWeekMap: { [key: number]: DayOfWeek } = { 1: DayOfWeekEnum.MONDAY, 2: DayOfWeekEnum.TUESDAY, 3: DayOfWeekEnum.WEDNESDAY, 4: DayOfWeekEnum.THURSDAY, 5: DayOfWeekEnum.FRIDAY, 6: DayOfWeekEnum.SATURDAY, 0: DayOfWeekEnum.SUNDAY };
        const dayOfWeekStr = dayOfWeekMap[dayOfWeekJs];

        const isActiveDayConfig = activeDaysSetting.includes(dayOfWeekStr);
        const hasEvents = getEventsForDay(date).length > 0;
        const isWeekend = dayOfWeekStr === DayOfWeekEnum.SATURDAY || dayOfWeekStr === DayOfWeekEnum.SUNDAY;
        // A day is considered "active" for display if it's in activeDays, or it's a weekend WITH events.
        const isDisplayActive = isActiveDayConfig || (isWeekend && hasEvents);


        return { date, dayOfWeek: dayOfWeekStr, isActive: isDisplayActive, isWeekend, isConfigActive: isActiveDayConfig };
    });
  }, [weekDays, activeDaysSetting, schoolEvents, getEventsForDay]);


  const headers = [
    <div key="header-time" className={`${TIME_CELL_WIDTH} p-1 sm:p-2 font-semibold text-center border-r sticky left-0 bg-card z-20`}>時間</div>,
    ...displayDays.map(({ date, dayOfWeek, isWeekend, isActive }) => {
      const dateStr = format(date, 'yyyy-MM-dd');
      return (
        <div key={`header-${dateStr}`} className={`flex-shrink-0 ${DAY_CELL_WIDTH} p-1 sm:p-2 font-semibold text-center border-r ${isWeekend && !isActive ? 'bg-muted/30' : (isWeekend ? 'bg-muted/50' : '')} ${isSameDay(date, currentDate) ? 'bg-primary/10' : ''} bg-card`}>
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

  const periodNumbers = Array.from({ length: numberOfPeriods }, (_, i) => i + 1);


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
          <div className="flex sticky top-0 bg-card z-20 border-b min-w-max">{headers}</div>
          {isLoadingCombined ? (
            periodNumbers.map((period) => {
              const skeletonCells = [
                <div key={`skeleton-period-${period}`} className={`${TIME_CELL_WIDTH} p-1 sm:p-2 font-semibold text-center border-r sticky left-0 bg-card z-10 flex items-center justify-center`}><Skeleton className="h-6 w-8" /></div>,
                ...displayDays.map(({ date }) => (
                  <div key={`skeleton-cell-${format(date, 'yyyy-MM-dd')}-${period}`} className={`flex-shrink-0 ${DAY_CELL_WIDTH} p-1 sm:p-2 border-r flex flex-col justify-between bg-card`}>
                    <Skeleton className="h-4 w-3/4 mb-1" /><Skeleton className="h-3 w-1/2 mb-2" /><Skeleton className="h-8 w-full" />
                  </div>
                ))
              ];
              return <div key={`skeleton-row-${period}`} className="flex border-b min-h-[100px] md:min-h-[110px] min-w-max">{skeletonCells}</div>;
            })
          ) : (
            periodNumbers.map((period) => {
              const cells = [
                <div key={`period-${period}`} className={`${TIME_CELL_WIDTH} p-1 sm:p-2 font-semibold text-center border-r sticky left-0 bg-card z-10 flex items-center justify-center`}>{period}限</div>,
                ...displayDays.map(({ date, dayOfWeek, isActive, isWeekend, isConfigActive }) => {
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const fixedSlot = getFixedSlot(dayOfWeek, period);
                  const announcement = getDailyAnnouncement(dateStr, period);
                  const hasEventOnThisDay = getEventsForDay(date).length > 0;

                  const displaySubjectId = announcement?.subjectIdOverride ?? fixedSlot?.subjectId ?? null;
                  const displaySubject = getSubjectById(displaySubjectId);
                  const announcementDisplayText = announcement?.text;

                  const fixedSubjectForComparison = getSubjectById(fixedSlot?.subjectId ?? null);
                  const showSubjectChangeIndicator = (user && !isAnonymous) && // Only show for admin
                                                     (announcement?.subjectIdOverride !== undefined) &&
                                                     (announcement.subjectIdOverride !== (fixedSlot?.subjectId ?? null));


                  const isToday = isSameDay(date, currentDate);
                  const canEditThisSlot = (user || isAnonymous) && (isConfigActive || hasEventOnThisDay);

                  return (
                    <div key={`${dateStr}-${period}-cell`} className={`flex-shrink-0 ${DAY_CELL_WIDTH} p-1 sm:p-2 border-r relative flex flex-col justify-between ${!isConfigActive && !hasEventOnThisDay ? 'bg-muted/30' : ''} ${isToday ? 'bg-primary/5' : ''} bg-card`}>
                      {(isConfigActive || hasEventOnThisDay) ? (
                        <>
                          <div className="mb-1">
                            <div className={cn("text-sm truncate font-medium", isToday && displaySubject && "font-bold")} title={displaySubject?.name ?? (isConfigActive ? '未設定' : '')}>
                              {displaySubject?.name ?? (isConfigActive ? '未設定' : '')}
                              {showSubjectChangeIndicator && <span className="text-xs text-destructive ml-1">(変更)</span>}
                            </div>
                            {displaySubject?.teacherName && (
                              <div className="text-xs text-muted-foreground flex items-center gap-1 truncate" title={displaySubject.teacherName}>
                                <User className="w-3 h-3 shrink-0" />{displaySubject.teacherName}
                              </div>
                            )}
                          </div>
                          <div className="text-xs flex-grow mb-1 break-words overflow-hidden">
                            {announcementDisplayText && (
                              <div className="p-1 rounded bg-card border border-dashed border-accent/50">
                                <p className="text-foreground whitespace-pre-wrap">{announcementDisplayText}</p>
                              </div>
                            )}
                          </div>
                           {announcement?.showOnCalendar && (
                            <div className="text-xs text-accent flex items-center gap-1 mt-1" title="カレンダーに表示">
                                <CalendarDays className="w-3 h-3 shrink-0" />
                                <span className="hidden sm:inline">カレンダー</span>
                            </div>
                           )}
                          {canEditThisSlot && (
                            <div className="mt-auto">
                              <Button variant="ghost" size="sm" className="h-6 px-1 text-xs absolute bottom-1 right-1 text-muted-foreground hover:text-primary" onClick={() => handleSlotClick(dateStr, period, dayOfWeek)} aria-label={`${dateStr} ${period}限目の連絡・変更を編集`} disabled={isOffline}>
                                <Edit2 className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                          {!isConfigActive && hasEventOnThisDay && (
                             <div className="text-xs text-muted-foreground italic h-full flex items-center justify-center">行事日</div>
                          )}
                        </>
                      ) : (
                         <div className="h-full"></div>
                      )}
                    </div>
                  );
                })
              ];
              return <div key={`row-${period}`} className="flex border-b min-h-[100px] md:min-h-[110px] min-w-max">{cells}</div>;
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
                disabled={isSaving || isLoadingSubjects || !(user && !isAnonymous) }
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="announcement-text" className="text-right col-span-1">連絡内容</Label>
              <Textarea id="announcement-text" value={announcementText} onChange={(e) => setAnnouncementText(e.target.value)} className="col-span-3 min-h-[100px]" placeholder="持ち物、テスト範囲、教室変更など" disabled={isSaving || !canEditTimetableSlot} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="show-on-calendar" className="text-right col-span-1">カレンダー</Label>
                <div className="col-span-3 flex items-center space-x-2">
                    <Checkbox
                        id="show-on-calendar"
                        checked={showOnCalendarModal}
                        onCheckedChange={(checked) => setShowOnCalendarModal(!!checked)}
                        disabled={isSaving || !canEditTimetableSlot}
                    />
                    <label htmlFor="show-on-calendar" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        カレンダーに表示する
                    </label>
                </div>
            </div>
            <p className="col-span-4 text-xs text-muted-foreground px-2 text-center">
              {(user && !isAnonymous) ? "科目変更・連絡内容・カレンダー表示のいずれかが空またはオフの場合、その時間の連絡・変更は削除/非表示になります。" : "連絡内容が空でカレンダー表示オフの場合、この時間の連絡は削除されます。"}
            </p>
          </div>
          <DialogFooter className="flex flex-col sm:flex-row justify-between items-center gap-2 w-full">
             <div className="w-full sm:w-auto">
              {((selectedSlot?.announcement && (selectedSlot.announcement.text || selectedSlot.announcement.subjectIdOverride || selectedSlot.announcement.showOnCalendar)) || (announcementText.trim() !== '') || (subjectIdOverride !== null && subjectIdOverride !== selectedSlot?.fixedSubjectId) || showOnCalendarModal) && (
                <Button variant="destructive" onClick={handleDeleteConfirmation} className="w-full sm:w-auto" size="sm" disabled={isSaving || isOffline || !canEditTimetableSlot}>
                  <Trash2 className="mr-1 w-4 h-4" />{isSaving ? '削除中...' : 'クリア'}
                </Button>
              )}
            </div>
            <div className="flex gap-2 w-full sm:w-auto justify-end">
              <DialogClose asChild><Button type="button" variant="secondary" className="w-full sm:w-auto" disabled={isSaving}>キャンセル</Button></DialogClose>
              <Button type="button" onClick={handleSaveAnnouncement} className="w-full sm:w-auto" disabled={isSaving || isOffline || isLoadingSubjects || !canEditTimetableSlot}>
                {isSaving ? '保存中...' : '保存'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
