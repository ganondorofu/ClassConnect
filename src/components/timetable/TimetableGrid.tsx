"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, startOfWeek, addDays, eachDayOfInterval, isSameDay, getDay, parseISO, isValid as isValidDate } from 'date-fns';
import { ja } from 'date-fns/locale';

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SubjectSelector } from '@/components/timetable/SubjectSelector';

import type { FixedTimeSlot, TimetableSettings, DayOfWeek, SchoolEvent } from '@/models/timetable';
import type { Subject } from '@/models/subject';
import { DEFAULT_TIMETABLE_SETTINGS, DayOfWeek as DayOfWeekEnum, getDayOfWeekName, DisplayedWeekDaysOrder, dayCodeToDayOfWeekEnum, AllDays } from '@/models/timetable';
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";


const DAY_CELL_WIDTH = "min-w-[100px] xs:min-w-[110px] sm:min-w-[120px] md:min-w-[140px] lg:min-w-[150px] xl:min-w-[160px]";
const TIME_CELL_WIDTH = "w-[50px] sm:w-[60px] flex-shrink-0";


interface TimetableGridProps {
  currentDate: Date;
}

type Unsubscribe = () => void;

const areSettingsEqual = (s1: TimetableSettings | null, s2: TimetableSettings | null): boolean => {
  if (!s1 && !s2) return true;
  if (!s1 || !s2) return false;
  if (s1.numberOfPeriods !== s2.numberOfPeriods) return false;
  if (s1.activeDays.length !== s2.activeDays.length) return false;
  const sortedS1Days = [...s1.activeDays].sort();
  const sortedS2Days = [...s2.activeDays].sort();
  return sortedS1Days.every((day, index) => day === sortedS2Days[index]);
};

const areArraysOfObjectsEqual = <T extends Record<string, any>>(arr1: T[] | undefined, arr2: T[] | undefined): boolean => {
  if (!arr1 && !arr2) return true;
  if (!arr1 || !arr2) return false;
  if (arr1.length !== arr2.length) return false;
  try {
    const normalize = (item: T) => {
      const newItem = {...item};
      delete (newItem as any).updatedAt; 
      delete (newItem as any).createdAt;
      return newItem;
    };
    const sortedNormalizedArr1 = arr1.map(normalize).sort((a,b) => (a.id ?? '').localeCompare(b.id ?? ''));
    const sortedNormalizedArr2 = arr2.map(normalize).sort((a,b) => (a.id ?? '').localeCompare(b.id ?? ''));
    return JSON.stringify(sortedNormalizedArr1) === JSON.stringify(sortedNormalizedArr2);
  } catch (e) {
    console.error("Error stringifying arrays for comparison:", e);
    return false; 
  }
};


export function TimetableGrid({ currentDate }: TimetableGridProps) {
  const { toast } = useToast();
  const queryClientHook = useQueryClient();
  const [selectedSlot, setSelectedSlot] = useState<{
    date: string,
    period: number,
    day: DayOfWeek,
    baseFixedSubjectId: string | null,
    announcement?: DailyAnnouncement
  } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [announcementText, setAnnouncementText] = useState('');
  const [subjectIdOverride, setSubjectIdOverride] = useState<string | null>(null);
  const [showOnCalendarModal, setShowOnCalendarModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const [selectedEventForDetail, setSelectedEventForDetail] = useState<SchoolEvent | null>(null);
  const [isEventDetailModalOpen, setIsEventDetailModalOpen] = useState(false);

  const { user, isAnonymous, loading: authLoading } = useAuth();

  const [liveSettings, setLiveSettings] = useState<TimetableSettings | null>(null);
  const [liveFixedTimetable, setLiveFixedTimetable] = useState<FixedTimeSlot[] | undefined>(undefined);
  const [liveDailyAnnouncements, setLiveDailyAnnouncements] = useState<Record<string, DailyAnnouncement[]>>({});
  const [liveSchoolEvents, setLiveSchoolEvents] = useState<SchoolEvent[] | undefined>(undefined);
  const [liveSubjects, setLiveSubjects] = useState<Subject[] | undefined>(undefined);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 }); 
  const weekEnd = addDays(weekStart, 6); 
  const weekDays = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(prevIsOffline => {
        if (prevIsOffline) { 
          queryClientHook.invalidateQueries({ queryKey: ['timetableSettings'] });
          queryClientHook.invalidateQueries({ queryKey: ['fixedTimetable'] });
          queryClientHook.invalidateQueries({ queryKey: ['dailyAnnouncements', format(weekStart, 'yyyy-MM-dd')] });
          queryClientHook.invalidateQueries({ queryKey: ['schoolEvents'] });
          queryClientHook.invalidateQueries({ queryKey: ['subjects'] });
          return false;
        }
        return prevIsOffline;
      });
    };
    const handleOffline = () => setIsOffline(prevIsOffline => !prevIsOffline ? true : prevIsOffline);

    if (typeof navigator !== 'undefined' && navigator.onLine !== undefined) {
      setIsOffline(!navigator.onLine);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
    return () => {};
  }, [queryClientHook, weekStart]);

  const handleQueryError = (queryKey: string) => (error: unknown) => {
    console.error(`Query Error (${queryKey}):`, error);
    const isFirestoreUnavailable = (error as FirestoreError)?.code === 'unavailable';
    if (isFirestoreUnavailable || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        setIsOffline(prev => !prev ? true : prev);
    }
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


  const { data: initialDailyAnnouncementsData, isLoading: isLoadingAnnouncements, error: errorAnnouncements } = useQuery({
    queryKey: ['dailyAnnouncements', format(weekStart, 'yyyy-MM-dd')],
    queryFn: async () => {
      if (isOffline || (!user && !isAnonymous)) {
        return queryClientHook.getQueryData(['dailyAnnouncements', format(weekStart, 'yyyy-MM-dd')]) ?? {};
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
    enabled: !isOffline && (!!user || isAnonymous) && weekDays.length > 0,
  });

 useEffect(() => {
    if (isOffline || (!user && !isAnonymous)) return () => {};
    let unsubSettings: Unsubscribe | undefined;
    let unsubFixed: Unsubscribe | undefined;
    let unsubEvents: Unsubscribe | undefined;
    let unsubSubjects: Unsubscribe | undefined;
    let unsubAnnouncementsList: Unsubscribe[] = [];
    
    const setupListeners = () => {
        unsubSettings = onTimetableSettingsUpdate(
            (newSettings) => { 
              setLiveSettings(prevSettings => areSettingsEqual(prevSettings, newSettings) ? prevSettings : newSettings); 
            }, 
            (error) => { console.error("RT Settings Error:", error); setIsOffline(true); }
        );
        unsubFixed = onFixedTimetableUpdate(
            (newFixedTimetable) => { 
              setLiveFixedTimetable(prev => areArraysOfObjectsEqual(prev, newFixedTimetable) ? prev : newFixedTimetable); 
            },  
            (error) => { console.error("RT Fixed TT Error:", error); setIsOffline(true); }
        );
        unsubEvents = onSchoolEventsUpdate(
            (newEvents) => { 
              setLiveSchoolEvents(prev => areArraysOfObjectsEqual(prev, newEvents) ? prev : newEvents); 
            }, 
            (error) => { console.error("RT Events Error:", error); setIsOffline(true); }
        );
        unsubSubjects = onSubjectsUpdate(
            (newSubjects) => { 
              setLiveSubjects(prev => areArraysOfObjectsEqual(prev, newSubjects) ? prev : newSubjects); 
            }, 
            (error) => { console.error("RT Subjects Error:", error); setIsOffline(true); }
        );
        
        if (weekDays.length > 0) {
          unsubAnnouncementsList = weekDays.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            return onDailyAnnouncementsUpdate(dateStr, 
              (announcements) => {
                  setLiveDailyAnnouncements(prev => {
                    const oldAnnouncementsForDate = prev[dateStr];
                    if (oldAnnouncementsForDate && areArraysOfObjectsEqual(oldAnnouncementsForDate, announcements)) {
                      return prev;
                    }
                    return { ...prev, [dateStr]: announcements };
                  });
              }, 
              (error) => { console.error(`RT Annc Error ${dateStr}:`, error); setIsOffline(true); });
          });
        }
    }

    if (user || isAnonymous) {
        setupListeners();
    }
    
    return () => {
      unsubSettings?.();
      unsubFixed?.();
      unsubEvents?.();
      unsubSubjects?.();
      unsubAnnouncementsList.forEach(unsub => unsub?.());
    };
  }, [isOffline, user, isAnonymous, weekDays, queryClientHook]); 


  const settings = useMemo(() => liveSettings ?? initialSettings ?? DEFAULT_TIMETABLE_SETTINGS, [liveSettings, initialSettings]);
  const fixedTimetable = useMemo(() => liveFixedTimetable !== undefined ? liveFixedTimetable : initialFixedTimetable ?? [], [liveFixedTimetable, initialFixedTimetable]);
  const schoolEvents = useMemo(() => liveSchoolEvents !== undefined ? liveSchoolEvents : initialSchoolEvents ?? [], [liveSchoolEvents, initialSchoolEvents]);
  const subjects = useMemo(() => liveSubjects !== undefined ? liveSubjects : initialSubjects ?? [], [liveSubjects, initialSubjects]);
  const subjectsMap = useMemo(() => new Map(subjects.map(s => [s.id, s])), [subjects]);
  const dailyAnnouncements = useMemo(() => Object.keys(liveDailyAnnouncements).length > 0 ? { ...initialDailyAnnouncementsData, ...liveDailyAnnouncements } : initialDailyAnnouncementsData ?? {}, [liveDailyAnnouncements, initialDailyAnnouncementsData]);

  const isLoadingCombined = (isLoadingSettings || isLoadingFixed || isLoadingAnnouncements || isLoadingEvents || isLoadingSubjects || authLoading) && !isOffline;
  const queryError = errorSettings || errorFixed || errorEvents || errorAnnouncements || errorSubjects;

  const getFixedSlot = (day: DayOfWeek, period: number): FixedTimeSlot | undefined => fixedTimetable.find(slot => slot.day === day && slot.period === period);
  const getDailyAnnouncement = (date: string, period: number): DailyAnnouncement | undefined => dailyAnnouncements[date]?.find(ann => ann.period === period);
  
  const getEventsForDay = useCallback((date: Date): SchoolEvent[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return schoolEvents.filter(event => {
        const startDate = event.startDate ? parseISO(event.startDate) : null;
        const endDate = event.endDate ? parseISO(event.endDate) : startDate;
        if (!startDate || !isValidDate(startDate)) return false;
        if (!endDate || !isValidDate(endDate)) return false;
        return dateStr >= format(startDate, 'yyyy-MM-dd') && dateStr <= format(endDate, 'yyyy-MM-dd');
    });
  }, [schoolEvents]);

  const getSubjectById = (id: string | null): Subject | undefined => id ? subjectsMap.get(id) : undefined;

  const canEditTimetableSlot = !!user || isAnonymous;

  const handleSlotClick = (date: string, period: number, day: DayOfWeek) => {
    const fixedSlot = getFixedSlot(day, period);
    const announcement = getDailyAnnouncement(date, period);
    setSelectedSlot({
      date,
      period,
      day,
      baseFixedSubjectId: fixedSlot?.subjectId ?? null,
      announcement
    });
    setAnnouncementText(announcement?.text ?? '');
    setSubjectIdOverride(announcement?.subjectIdOverride ?? null); // Initialize with current override or null
    setShowOnCalendarModal(announcement?.showOnCalendar ?? false);
    setIsModalOpen(true);
  };

  const handleEventHeaderClick = (event: SchoolEvent) => {
    setSelectedEventForDetail(event);
    setIsEventDetailModalOpen(true);
  };

  const handleSaveAnnouncement = async () => {
    if (!selectedSlot || isSaving) return;
    if (isOffline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      toast({ title: "オフライン", description: "連絡を保存できません。", variant: "destructive" });
      return;
    }
    setIsSaving(true);

    const textToPersist = announcementText.trim();
    const showOnCalendarToPersist = showOnCalendarModal;
    
    // If subjectIdOverride is null, it means use the fixed subject.
    // If it's a specific ID, it's an override.
    const subjectIdOverrideToPersist: string | null = subjectIdOverride; 

    try {
      const userIdForLog = user ? user.uid : (isAnonymous ? 'anonymous_slot_edit' : 'unknown_user');
      
      const announcementData: Omit<DailyAnnouncement, 'id' | 'updatedAt'> = {
        date: selectedSlot.date,
        period: selectedSlot.period,
        text: textToPersist,
        subjectIdOverride: subjectIdOverrideToPersist,
        showOnCalendar: showOnCalendarToPersist,
        itemType: 'announcement',
        isManuallyCleared: false, // When saving specific content, it's not a manual clear of the slot itself
      };

      await upsertDailyAnnouncement(announcementData, userIdForLog);
      
      toast({ title: "成功", description: `${selectedSlot.date} ${selectedSlot.period}限目の連絡・変更を保存しました。` });
      setIsModalOpen(false); 
      
      queryClientHook.invalidateQueries({ queryKey: ['dailyAnnouncements', format(weekStart, 'yyyy-MM-dd')] });
      const calendarYear = selectedSlot.date ? new Date(selectedSlot.date).getFullYear() : new Date().getFullYear();
      const calendarMonth = selectedSlot.date ? new Date(selectedSlot.date).getMonth() + 1 : new Date().getMonth() + 1;
      queryClientHook.invalidateQueries({ queryKey: ['calendarItems', calendarYear, calendarMonth] });


    } catch (error: any) {
      console.error("Failed to save/delete announcement:", error);
      const isFirebaseOfflineError = (error as FirestoreError)?.code === 'unavailable' || error?.message?.includes("オフラインのため");
      if(isFirebaseOfflineError) setIsOffline(prev => !prev ? true : prev);
      toast({
        title: isFirebaseOfflineError ? "オフライン" : "エラー",
        description: isFirebaseOfflineError ? "操作に失敗しました。オフラインの可能性があります。" : `操作に失敗しました: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleClearSlotConfirmation = async () => {
    if (!selectedSlot || isSaving || !canEditTimetableSlot) {
      toast({ title: "エラー", description: "クリア対象のスロットが選択されていないか、操作を実行できません。", variant: "destructive"});
      return;
    }
    if (isOffline) {
        toast({ title: "オフライン", description: "クリア操作はオフラインでは実行できません。", variant: "destructive"});
        return;
    }

    setIsSaving(true); 

    const { date, period } = selectedSlot;
    const userIdForLog = user ? user.uid : (isAnonymous ? 'anonymous_slot_clear' : 'unknown_user');
    
    try {
      // Clearing means setting override to null (to revert to fixed), empty text, and calendar off.
      // isManuallyCleared is set to true to indicate user explicitly cleared this slot.
      await upsertDailyAnnouncement({
        date: date,
        period: period,
        text: '',
        subjectIdOverride: null, 
        showOnCalendar: false,
        itemType: 'announcement',
        isManuallyCleared: true, 
      }, userIdForLog);

      toast({ title: "成功", description: `${date} ${period}限目の連絡・変更をクリアし、基本の時間割に戻しました。` });
      setIsModalOpen(false); 
      
      queryClientHook.invalidateQueries({ queryKey: ['dailyAnnouncements', format(weekStart, 'yyyy-MM-dd')] });
      const calendarYear = new Date(date).getFullYear();
      const calendarMonth = new Date(date).getMonth() + 1;
      queryClientHook.invalidateQueries({ queryKey: ['calendarItems', calendarYear, calendarMonth] });

    } catch (error: any) {
      console.error("Failed to clear announcement slot:", error);
      const isFirebaseOfflineError = (error as FirestoreError)?.code === 'unavailable' || error?.message?.includes("オフラインのため");
      if(isFirebaseOfflineError) setIsOffline(prev => !prev ? true : prev);
      toast({
        title: isFirebaseOfflineError ? "オフライン" : "エラー",
        description: isFirebaseOfflineError ? "クリア操作に失敗しました。オフラインの可能性があります。" : `クリア操作に失敗しました: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const numberOfPeriods = settings?.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods;
  const activeDaysSetting = settings?.activeDays ?? DEFAULT_TIMETABLE_SETTINGS.activeDays; 

  const displayDays = useMemo(() => {
    return DisplayedWeekDaysOrder.map(dayEnum => {
      const dateForDay = weekDays.find(d => dayCodeToDayOfWeekEnum(getDay(d)) === dayEnum);
      if (!dateForDay) { 
        const tempDate = new Date(); 
        return { date: tempDate, dayOfWeek: dayEnum, isWeekend: false, isConfigActive: false, hasEvents: false };
      }
      const isConfigActive = activeDaysSetting.includes(dayEnum);
      const hasEvents = getEventsForDay(dateForDay).length > 0;
      const isWeekend = dayEnum === DayOfWeekEnum.SATURDAY || dayEnum === DayOfWeekEnum.SUNDAY;
      
      return { date: dateForDay, dayOfWeek: dayEnum, isWeekend, isConfigActive, hasEvents };
    });
  }, [weekDays, activeDaysSetting, getEventsForDay]);


  const headers = [
    <div key="header-time" className={`${TIME_CELL_WIDTH} p-1 sm:p-2 font-semibold text-center border-r sticky left-0 bg-card z-20 whitespace-nowrap`}>時間</div>,
    ...displayDays.map(({ date, dayOfWeek, isWeekend }) => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const eventsForDay = getEventsForDay(date);
      return (
        <div key={`header-${dateStr}`} className={`${DAY_CELL_WIDTH} p-1 sm:p-2 font-semibold text-center border-r ${isWeekend ? 'bg-muted/50 dark:bg-muted/30' : ''} ${isSameDay(date, currentDate) ? 'bg-primary/10 dark:bg-primary/20' : ''} bg-card whitespace-nowrap flex-1`}>
          <div>{getDayOfWeekName(dayOfWeek)}</div>
          <div className="text-xs text-muted-foreground">{format(date, 'M/d')}</div>
          {eventsForDay.map(event => (
            <Button
              key={`event-btn-${event.id}-${dateStr}`}
              variant="ghost"
              size="sm"
              className="mt-1 p-1 w-full h-auto justify-start bg-accent/20 text-accent-foreground rounded text-xs truncate flex items-center gap-1 hover:bg-accent/30 dark:bg-accent/30 dark:hover:bg-accent/40"
              title={event.title}
              onClick={() => handleEventHeaderClick(event)}
            >
              <CalendarDays className="w-3 h-3 shrink-0" />
              <span>{event.title}</span>
            </Button>
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
          <div className="flex sticky top-0 bg-card z-20 border-b min-w-max">{headers.map(header => header)}</div>
          {isLoadingCombined ? (
            periodNumbers.map((period) => {
              const skeletonCells = [
                <div key={`skeleton-period-${period}`} className={`${TIME_CELL_WIDTH} p-1 sm:p-2 font-semibold text-center border-r sticky left-0 bg-card z-10 flex items-center justify-center`}><Skeleton className="h-6 w-8" /></div>,
                ...displayDays.map(({ date }) => (
                  <div key={`skeleton-cell-${format(date, 'yyyy-MM-dd')}-${period}`} className={`${DAY_CELL_WIDTH} p-1 sm:p-2 border-r flex flex-col justify-between bg-card flex-1`}>
                    <Skeleton className="h-4 w-3/4 mb-1" /><Skeleton className="h-3 w-1/2 mb-2" /><Skeleton className="h-8 w-full" />
                  </div>
                ))
              ];
              return <div key={`skeleton-row-${period}`} className="flex border-b min-h-[100px] md:min-h-[120px] min-w-max">{skeletonCells.map(cell => cell)}</div>;
            })
          ) : (
            periodNumbers.map((period) => {
              const cells = [
                <div key={`period-${period}`} className={`${TIME_CELL_WIDTH} p-1 sm:p-2 font-semibold text-center border-r sticky left-0 bg-card z-10 flex items-center justify-center`}>{period}限</div>,
                ...displayDays.map(({ date, dayOfWeek, isConfigActive, isWeekend, hasEvents }) => {
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const fixedSlot = getFixedSlot(dayOfWeek, period);
                  const baseFixedSubjectId = fixedSlot?.subjectId ?? null;
                  const announcement = getDailyAnnouncement(dateStr, period);
                  
                  let finalDisplaySubjectId: string | null = baseFixedSubjectId;

                  if (announcement) {
                      if (announcement.isManuallyCleared) {
                          finalDisplaySubjectId = baseFixedSubjectId;
                      } else if (typeof announcement.subjectIdOverride !== 'undefined') {
                          finalDisplaySubjectId = announcement.subjectIdOverride;
                      }
                  }
                  const displaySubject = getSubjectById(finalDisplaySubjectId);
                  const announcementDisplayText = announcement?.text;
                  const isToday = isSameDay(date, currentDate);
                  
                  const canEditThisSlot = (user || isAnonymous); 
                  const cellIsInteractive = isConfigActive || hasEvents || isWeekend || dayOfWeek === DayOfWeekEnum.SATURDAY || dayOfWeek === DayOfWeekEnum.SUNDAY;


                  return (
                    <div key={`${dateStr}-${period}-cell`} className={cn(
                        DAY_CELL_WIDTH, "flex-1",
                        "p-1 sm:p-2 border-r relative flex flex-col justify-between bg-card min-h-[100px] md:min-h-[120px]",
                        isToday && "bg-primary/5 dark:bg-primary/10",
                         (isWeekend || dayOfWeek === DayOfWeekEnum.SATURDAY || dayOfWeek === DayOfWeekEnum.SUNDAY) && !isConfigActive && !hasEvents && "bg-muted/30 dark:bg-muted/20", 
                        !isConfigActive && !(isWeekend || dayOfWeek === DayOfWeekEnum.SATURDAY || dayOfWeek === DayOfWeekEnum.SUNDAY) && !hasEvents && "bg-muted/10 dark:bg-muted/5" 
                      )}>
                      {cellIsInteractive ? (
                        <>
                          <div className="mb-1 flex-shrink-0">
                            <div className={cn("text-sm truncate", displaySubject && isToday ? "font-bold" : "font-medium")} title={displaySubject?.name ?? (isConfigActive || isWeekend || dayOfWeek === DayOfWeekEnum.SATURDAY || dayOfWeek === DayOfWeekEnum.SUNDAY ? '未設定' : '')}>
                              {displaySubject?.name ?? ((isConfigActive || isWeekend || dayOfWeek === DayOfWeekEnum.SATURDAY || dayOfWeek === DayOfWeekEnum.SUNDAY) ? '未設定' : '')}
                            </div>
                            {displaySubject?.teacherName && (
                              <div className="text-xs text-muted-foreground flex items-center gap-1 truncate" title={displaySubject.teacherName}>
                                <User className="w-3 h-3 shrink-0" />{displaySubject.teacherName}
                              </div>
                            )}
                          </div>
                          <div className="text-xs flex-grow mb-1 break-words overflow-hidden">
                            {announcementDisplayText && (
                              <div className="p-1 rounded bg-card border border-dashed border-accent/50 dark:border-accent/30">
                                <p className="text-foreground whitespace-pre-wrap">{announcementDisplayText}</p>
                              </div>
                            )}
                          </div>
                          {canEditThisSlot && (
                            <div className="mt-auto flex-shrink-0">
                              <Button variant="ghost" size="sm" className="h-6 px-1 text-xs absolute bottom-1 right-1 text-muted-foreground hover:text-primary" onClick={() => handleSlotClick(dateStr, period, dayOfWeek)} aria-label={`${dateStr} ${period}限目の連絡・変更を編集`} disabled={isOffline}>
                                <Edit2 className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                           {!displaySubject && !announcementDisplayText && (isConfigActive || isWeekend || dayOfWeek === DayOfWeekEnum.SATURDAY || dayOfWeek === DayOfWeekEnum.SUNDAY || hasEvents) && (
                             <div className="text-xs text-muted-foreground italic h-full flex items-center justify-center">{hasEvents ? '行事日' : (isWeekend || dayOfWeek === DayOfWeekEnum.SATURDAY || dayOfWeek === DayOfWeekEnum.SUNDAY) && !isConfigActive ? '休日' : ''}</div>
                          )}
                        </>
                      ) : (
                         <div className="h-full"></div> 
                      )}
                    </div>
                  );
                })
              ];
              return <div key={`row-${period}`} className="flex border-b min-w-max">{cells}</div>;
            })
          )}
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={(open) => {
        setIsModalOpen(open);
        if (!open) {
            setSelectedSlot(null); 
            setAnnouncementText('');
            setSubjectIdOverride(null);
            setShowOnCalendarModal(false);
        }
        }}>
        <DialogContent className="max-w-sm sm:max-w-md">
          <DialogHeader>
            <DialogTitle>連絡・変更: {selectedSlot?.date} ({selectedSlot?.day ? getDayOfWeekName(selectedSlot.day) : ''}) {selectedSlot?.period}限目</DialogTitle>
            {selectedSlot?.baseFixedSubjectId && getSubjectById(selectedSlot.baseFixedSubjectId) && (user && !isAnonymous) && ( 
              <p className="text-sm text-muted-foreground pt-1">
                元の科目: {getSubjectById(selectedSlot.baseFixedSubjectId)?.name ?? '未設定'}
                {getSubjectById(selectedSlot.baseFixedSubjectId)?.teacherName ? ` (${getSubjectById(selectedSlot.baseFixedSubjectId)?.teacherName})` : ''}
              </p>
            )}
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {(user && !isAnonymous) && ( 
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="subject-override" className="text-right col-span-1 text-xs sm:text-sm">科目変更</Label>
                <SubjectSelector
                  id="subject-override"
                  subjects={subjects}
                  selectedSubjectId={subjectIdOverride}
                  onValueChange={setSubjectIdOverride}
                  placeholder="科目を選択 (変更なし)" 
                  disabled={isSaving || isLoadingSubjects}
                  className="col-span-3"
                />
              </div>
            )}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="announcement-text" className="text-right col-span-1 text-xs sm:text-sm">連絡内容</Label>
              <Textarea id="announcement-text" value={announcementText} onChange={(e) => setAnnouncementText(e.target.value)} className="col-span-3 min-h-[80px] sm:min-h-[100px]" placeholder="持ち物、テスト範囲など" disabled={isSaving || !canEditTimetableSlot} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="show-on-calendar" className="text-right col-span-1 text-xs sm:text-sm">カレンダー</Label>
                <div className="col-span-3 flex items-center space-x-2">
                    <Checkbox
                        id="show-on-calendar"
                        checked={showOnCalendarModal}
                        onCheckedChange={(checked) => setShowOnCalendarModal(!!checked)}
                        disabled={isSaving || !canEditTimetableSlot}
                    />
                    <label htmlFor="show-on-calendar" className="text-xs sm:text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        カレンダーに表示
                    </label>
                </div>
            </div>
          </div>
          <DialogFooter className="flex flex-col sm:flex-row justify-between items-center gap-2 w-full">
             <div className="w-full sm:w-auto">
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" className="w-full sm:w-auto" size="sm" disabled={isSaving || isOffline || !canEditTimetableSlot || (!selectedSlot?.announcement?.text && !( (user && !isAnonymous && selectedSlot?.announcement?.subjectIdOverride !== selectedSlot?.baseFixedSubjectId && selectedSlot?.announcement?.subjectIdOverride !== null) || (isAnonymous && subjectIdOverride !== selectedSlot?.baseFixedSubjectId) ) && !selectedSlot?.announcement?.showOnCalendar && !selectedSlot?.announcement?.isManuallyCleared) }>
                            <Trash2 className="mr-1 w-4 h-4" />{isSaving ? 'クリア中...' : 'クリア'}
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>連絡・変更をクリアしますか？</AlertDialogTitle>
                            <AlertDialogDescription>
                                この操作は元に戻せません。{selectedSlot?.date} {selectedSlot?.period}限目の科目変更、連絡内容、カレンダー表示設定がすべてクリアされ、スロットは手動でクリアされた状態になります（固定時間割も適用されなくなります）。
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={isSaving}>キャンセル</AlertDialogCancel>
                            <AlertDialogAction onClick={handleClearSlotConfirmation} disabled={isSaving}>
                                {isSaving ? 'クリア中...' : 'クリアする'}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
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

      <Dialog open={isEventDetailModalOpen} onOpenChange={setIsEventDetailModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedEventForDetail?.title}</DialogTitle>
            {selectedEventForDetail?.startDate && (
                <p className="text-sm text-muted-foreground">
                    期間: {format(parseISO(selectedEventForDetail.startDate), 'yyyy/MM/dd', { locale: ja })}
                    {selectedEventForDetail.endDate && selectedEventForDetail.endDate !== selectedEventForDetail.startDate &&
                    ` ~ ${format(parseISO(selectedEventForDetail.endDate), 'yyyy/MM/dd', { locale: ja })}`}
                </p>
            )}
          </DialogHeader>
          {selectedEventForDetail?.description && (
            <div className="py-4">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {selectedEventForDetail.description}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIsEventDetailModalOpen(false)}>閉じる</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

