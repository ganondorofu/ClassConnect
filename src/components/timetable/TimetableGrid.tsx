
      
"use client";

import React from 'react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, startOfWeek, addDays, eachDayOfInterval, isSameDay, getDay, parseISO, isValid as isValidDate } from 'date-fns';
import { ja } from 'date-fns/locale';

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SubjectSelector } from '@/components/timetable/SubjectSelector';
import { ScrollArea } from "@/components/ui/scroll-area";

import type { FixedTimeSlot, TimetableSettings, DayOfWeek, SchoolEvent } from '@/models/timetable';
import type { Subject } from '@/models/subject';
import { DEFAULT_TIMETABLE_SETTINGS, DayOfWeek as DayOfWeekEnum, getDayOfWeekName, DisplayedWeekDaysOrder, dayCodeToDayOfWeekEnum, AllDays } from '@/models/timetable';
import type { DailyAnnouncement } from '@/models/announcement';
import type { Assignment } from '@/models/assignment';
import { queryFnGetAssignments } from '@/controllers/assignmentController';
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
  batchUpdateFixedTimetable, // Import batch updater
} from '@/controllers/timetableController';
import { queryFnGetSubjects, onSubjectsUpdate } from '@/controllers/subjectController';
import { AlertCircle, CalendarDays, Edit2, Info, WifiOff, User, FileText, ClipboardList, RotateCcw, Trash2, LucideIcon, CheckSquare, Square } from 'lucide-react';
import type { Timestamp, FirestoreError } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { areSettingsEqual, areArraysOfObjectsEqual, areDailyAnnouncementsMapEqual } from '@/lib/utils';

const DAY_CELL_WIDTH_BASE = "w-[120px] xs:w-[130px] sm:w-[140px] md:w-[150px] lg:w-[160px] xl:w-[170px]";
const DAY_CELL_WIDTH = `${DAY_CELL_WIDTH_BASE} flex-1`;
const TIME_CELL_WIDTH = "w-[50px] sm:w-[60px] flex-shrink-0";


interface TimetableGridProps {
  currentDate: Date;
}

type Unsubscribe = () => void;

export function TimetableGrid({ currentDate }: TimetableGridProps) {
  const { toast } = useToast();
  const queryClientHook = useQueryClient();
  const [selectedSlot, setSelectedSlot] = useState<{
    date: string,
    period: number,
    day: DayOfWeek,
    baseFixedSubjectId: string | null | undefined, // Allow undefined for 'unset'
    announcement?: DailyAnnouncement
  } | null>(null);

  const [isSlotViewModalOpen, setIsSlotViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isBulkEditing, setIsBulkEditing] = useState(false);
  const [selectedBulkSlots, setSelectedBulkSlots] = useState<Set<string>>(new Set());


  const [announcementText, setAnnouncementText] = useState('');
  const [subjectIdOverrideModal, setSubjectIdOverrideModal] = useState<string | null | undefined>(undefined);
  const [showOnCalendarModal, setShowOnCalendarModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const [selectedEventForDetail, setSelectedEventForDetail] = useState<SchoolEvent | null>(null);
  const [isEventDetailModalOpen, setIsEventDetailModalOpen] = useState(false);

  const [selectedAssignmentForDetail, setSelectedAssignmentForDetail] = useState<Assignment | null>(null);
  const [isAssignmentDetailModalOpen, setIsAssignmentDetailModalOpen] = useState(false);

  const { user, isAnonymous, loading: authLoading } = useAuth();

  const [liveSettings, setLiveSettings] = useState<TimetableSettings | null>(null);
  const [liveFixedTimetable, setLiveFixedTimetable] = useState<FixedTimeSlot[] | undefined>(undefined);
  const [liveDailyAnnouncements, setLiveDailyAnnouncements] = useState<Record<string, DailyAnnouncement[]>>({});
  const [liveSchoolEvents, setLiveSchoolEvents] = useState<SchoolEvent[] | undefined>(undefined);
  const [liveSubjects, setLiveSubjects] = useState<Subject[] | undefined>(undefined);
  const [liveAssignments, setLiveAssignments] = useState<Assignment[] | undefined>(undefined);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: DisplayedWeekDaysOrder.indexOf(DayOfWeekEnum.MONDAY) });
  const weekEnd = addDays(weekStart, 6); 
  const weekDays = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd]);

  useEffect(() => {
    const handleOnline = () => {
      if (isOffline) {
        setIsOffline(false);
        queryClientHook.invalidateQueries({ queryKey: ['timetableSettings'] });
        queryClientHook.invalidateQueries({ queryKey: ['fixedTimetable'] });
        queryClientHook.invalidateQueries({ queryKey: ['dailyAnnouncements', format(weekStart, 'yyyy-MM-dd')] });
        queryClientHook.invalidateQueries({ queryKey: ['schoolEvents'] });
        queryClientHook.invalidateQueries({ queryKey: ['subjects'] });
        queryClientHook.invalidateQueries({ queryKey: ['assignmentsGrid'] });
      }
    };
    const handleOffline = () => setIsOffline(true);

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
  }, [isOffline, queryClientHook, weekStart]);

  const handleQueryError = (queryKey: string) => (error: unknown) => {
    console.error(`Query Error (${queryKey}):`, error);
    const isFirestoreUnavailable = (error as FirestoreError)?.code === 'unavailable';
    if (isFirestoreUnavailable || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        setIsOffline(true);
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

  const { data: initialAssignmentsData, isLoading: isLoadingAssignmentsData, error: errorAssignmentsData } = useQuery<Assignment[], Error>({
    queryKey: ['assignmentsGrid', format(weekStart, 'yyyy-MM-dd'), format(weekEnd, 'yyyy-MM-dd')],
    queryFn: () => queryFnGetAssignments({
      dueDateStart: format(weekStart, 'yyyy-MM-dd'),
      dueDateEnd: format(weekEnd, 'yyyy-MM-dd'),
      includePastDue: true
    })(),
    staleTime: 1000 * 60 * 2,
    enabled: !isOffline && (!!user || isAnonymous),
    onError: handleQueryError('assignmentsGrid'),
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
              setLiveSettings(prev => areSettingsEqual(prev, newSettings) ? prev : newSettings); 
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
                    const currentDayAnnouncements = prev[dateStr] || [];
                    if (areArraysOfObjectsEqual(currentDayAnnouncements, announcements)) {
                      return prev;
                    }
                    return { ...prev, [dateStr]: announcements };
                  });
              },
              (error) => { console.error(`RT Annc Error ${dateStr}:`, error); setIsOffline(true); });
          });
        }
    }

    setupListeners();

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
  const assignmentsForWeek = useMemo(() => liveAssignments !== undefined ? liveAssignments : initialAssignmentsData ?? [], [liveAssignments, initialAssignmentsData]);

  const dailyAnnouncements = useMemo(() => {
      const combined = { ...(initialDailyAnnouncementsData ?? {}), ...liveDailyAnnouncements };
      return combined;
  }, [liveDailyAnnouncements, initialDailyAnnouncementsData]);

  const isLoadingCombined = (isLoadingSettings || isLoadingFixed || isLoadingAnnouncements || isLoadingEvents || isLoadingSubjects || isLoadingAssignmentsData || authLoading) && !isOffline;
  const queryError = errorSettings || errorFixed || errorEvents || errorAnnouncements || errorSubjects || errorAssignmentsData;

  const getFixedSlot = (day: DayOfWeek, period: number): FixedTimeSlot | undefined => fixedTimetable.find(slot => slot.day === day && slot.period === period);
  const getDailyAnnouncement = (date: string, period: number): DailyAnnouncement | undefined => dailyAnnouncements[date]?.find(ann => ann.period === period);

  const getAssignmentsForDayHeader = useCallback((date: Date): Assignment[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return assignmentsForWeek.filter(assignment =>
      assignment.dueDate === dateStr && !assignment.duePeriod 
    );
  }, [assignmentsForWeek]);

  const getAssignmentsForPeriodCell = useCallback((date: Date, period: number): Assignment[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return assignmentsForWeek.filter(assignment => {
      if (assignment.dueDate !== dateStr) return false;
      return (assignment.duePeriod === `${period}限`) || (period === 1 && assignment.duePeriod === "朝ST+1");
    });
  }, [assignmentsForWeek]);

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

  const getSubjectById = (id: string | null | undefined): Subject | undefined => id ? subjectsMap.get(id) : undefined;

  const canEditTimetableSlot = !!user || isAnonymous;

  const handleSlotClick = (date: string, period: number, day: DayOfWeek) => {
    if (isBulkEditing) {
        toggleBulkSlotSelection(`${date}_${period}`);
        return;
    }
    const fixedSlot = getFixedSlot(day, period);
    const announcement = getDailyAnnouncement(date, period);
    setSelectedSlot({
      date,
      period,
      day,
      baseFixedSubjectId: fixedSlot?.subjectId,
      announcement
    });
    setIsSlotViewModalOpen(true);
  };
  
  const openEditModalFromView = () => {
    if (!selectedSlot) return;
    setAnnouncementText(selectedSlot.announcement?.text ?? '');
     if (selectedSlot.announcement?.isManuallyCleared) {
      setSubjectIdOverrideModal(selectedSlot.baseFixedSubjectId);
    } else if (selectedSlot.announcement?.subjectIdOverride === "") {
        setSubjectIdOverrideModal(null);
    } else {
        setSubjectIdOverrideModal(selectedSlot.announcement?.subjectIdOverride ?? selectedSlot.baseFixedSubjectId);
    }
    setShowOnCalendarModal(selectedSlot.announcement?.showOnCalendar ?? false);
    setIsSlotViewModalOpen(false);
    setIsEditModalOpen(true);
  };


  const handleEventHeaderClick = (event: SchoolEvent) => {
    setSelectedEventForDetail(event);
    setIsEventDetailModalOpen(true);
  };

  const handleOpenAssignmentDetailModal = (assignment: Assignment) => {
    setSelectedAssignmentForDetail(assignment);
    setIsAssignmentDetailModalOpen(true);
  };

  const handleSaveAnnouncement = async () => {
    if (!selectedSlot || isSaving) return;
    if (isOffline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      toast({ title: "オフライン", description: "連絡を保存できません。", variant: "destructive" });
      return;
    }
    setIsSaving(true);

    const textToPersist = announcementText.trim() ?? '';
    const showOnCalendarToPersist = showOnCalendarModal;

    let finalSubjectIdOverrideForDb: string | null | undefined;
    const modalSelection = subjectIdOverrideModal;
    const fixedSubjectForSlot = selectedSlot.baseFixedSubjectId;

    if (modalSelection === null) { // "なし"
        finalSubjectIdOverrideForDb = ""; 
    } else if (modalSelection === fixedSubjectForSlot) { // Same as fixed, so no override needed
        finalSubjectIdOverrideForDb = null; 
    } else if (modalSelection === undefined) { // "未設定"
        finalSubjectIdOverrideForDb = null;
    } else { // A specific subject is chosen
        finalSubjectIdOverrideForDb = modalSelection; 
    }


    try {
      const userIdForLog = user ? user.uid : (isAnonymous ? 'anonymous_slot_edit' : 'unknown_user');

      const announcementData: Omit<DailyAnnouncement, 'id' | 'updatedAt'> = {
        date: selectedSlot.date,
        period: selectedSlot.period,
        text: textToPersist,
        subjectIdOverride: finalSubjectIdOverrideForDb,
        showOnCalendar: showOnCalendarToPersist,
        itemType: 'announcement',
        isManuallyCleared: false, 
      };

      await upsertDailyAnnouncement(announcementData, userIdForLog);

      toast({ title: "成功", description: `${selectedSlot.date} ${selectedSlot.period}限目の連絡・変更を保存しました。` });
      setIsEditModalOpen(false);

      queryClientHook.invalidateQueries({ queryKey: ['dailyAnnouncements', format(weekStart, 'yyyy-MM-dd')] });
      const calendarYear = selectedSlot.date ? new Date(selectedSlot.date).getFullYear() : new Date().getFullYear();
      const calendarMonth = selectedSlot.date ? new Date(selectedSlot.date).getMonth() + 1 : new Date().getMonth() + 1;
      queryClientHook.invalidateQueries({ queryKey: ['calendarItems', calendarYear, calendarMonth] });

    } catch (error: any) {
      console.error("Failed to save/delete announcement:", error);
      const isFirebaseOfflineError = (error as FirestoreError)?.code === 'unavailable' || error?.message?.includes("オフラインのため");
      if(isFirebaseOfflineError) setIsOffline(true);
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
    const { date, period, baseFixedSubjectId } = selectedSlot;
    const userIdForLog = user ? user.uid : (isAnonymous ? 'anonymous_slot_clear' : 'unknown_user');

    try {
      await upsertDailyAnnouncement({
        date: date,
        period: period,
        text: '',
        subjectIdOverride: baseFixedSubjectId ?? null, 
        showOnCalendar: false,
        itemType: 'announcement',
        isManuallyCleared: true, 
      }, userIdForLog);

      toast({ title: "成功", description: `${date} ${period}限目の連絡・変更をクリアし、基本の時間割に戻しました。` });
      setIsEditModalOpen(false);
      queryClientHook.invalidateQueries({ queryKey: ['dailyAnnouncements', format(weekStart, 'yyyy-MM-dd')] });
      const calendarYear = new Date(date).getFullYear();
      const calendarMonth = new Date(date).getMonth() + 1;
      queryClientHook.invalidateQueries({ queryKey: ['calendarItems', calendarYear, calendarMonth] });
    } catch (error: any) {
      console.error("Failed to clear announcement slot:", error);
      const isFirebaseOfflineError = (error as FirestoreError)?.code === 'unavailable' || error?.message?.includes("オフラインのため");
      if(isFirebaseOfflineError) setIsOffline(true);
      toast({
        title: isFirebaseOfflineError ? "オフライン" : "エラー",
        description: isFirebaseOfflineError ? "クリア操作に失敗しました。オフラインの可能性があります。" : `クリア操作に失敗しました: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleRevertToFixed = async () => {
    if (!selectedSlot || isSaving || !canEditTimetableSlot) return;
    if (isOffline) {
        toast({ title: "オフライン", description: "操作を実行できません。", variant: "destructive"});
        return;
    }
    setIsSaving(true);
    const { date, period, baseFixedSubjectId } = selectedSlot;
    const userIdForLog = user ? user.uid : (isAnonymous ? 'anonymous_revert_fixed' : 'unknown_user');
    try {
      await upsertDailyAnnouncement({
        date,
        period,
        text: '', 
        subjectIdOverride: baseFixedSubjectId ?? null, 
        showOnCalendar: false, 
        itemType: 'announcement',
        isManuallyCleared: false, 
      }, userIdForLog);

      toast({ title: "成功", description: "基本の時間割に戻しました。" });
      setSubjectIdOverrideModal(baseFixedSubjectId);
      setAnnouncementText('');
      setShowOnCalendarModal(false);
      
      queryClientHook.invalidateQueries({ queryKey: ['dailyAnnouncements', format(weekStart, 'yyyy-MM-dd')] });
      queryClientHook.invalidateQueries({ queryKey: ['calendarItems', new Date(date).getFullYear(), new Date(date).getMonth() + 1] });
    } catch (error: any) {
        toast({ title: "エラー", description: `基本の時間割への復元に失敗しました: ${error.message}`, variant: "destructive" });
        if ((error as FirestoreError).code === 'unavailable') setIsOffline(true);
    } finally {
        setIsSaving(false);
    }
  };

  const toggleBulkSlotSelection = (slotId: string) => {
    setSelectedBulkSlots(prev => {
      const newSet = new Set(prev);
      if (newSet.has(slotId)) {
        newSet.delete(slotId);
      } else {
        newSet.add(slotId);
      }
      return newSet;
    });
  };

  const handleBulkUpdate = async (newSubjectId: string | null | undefined) => {
    if (selectedBulkSlots.size === 0) {
      toast({ title: '情報', description: '一括変更するコマが選択されていません。' });
      return;
    }
    setIsSaving(true);
    const userId = user ? user.uid : (isAnonymous ? 'anonymous_bulk_edit' : 'unknown');
    
    // Create an array of DailyAnnouncement objects to upsert
    const announcementsToUpsert: Omit<DailyAnnouncement, 'id' | 'updatedAt'>[] = [];
    
    selectedBulkSlots.forEach(slotId => {
      const [date, periodStr] = slotId.split('_');
      const period = parseInt(periodStr, 10);
      const dayOfWeek = dayCodeToDayOfWeekEnum(getDay(parseISO(date)));
      const fixedSlot = getFixedSlot(dayOfWeek, period);
      const announcement = getDailyAnnouncement(date, period);

      let finalSubjectIdOverride: string | null | undefined;
      if (newSubjectId === undefined) { // Unset
          finalSubjectIdOverride = null;
      } else if (newSubjectId === null) { // None
          finalSubjectIdOverride = "";
      } else {
          finalSubjectIdOverride = newSubjectId;
      }

      announcementsToUpsert.push({
        date,
        period,
        text: announcement?.text ?? '', // Preserve existing text
        subjectIdOverride: finalSubjectIdOverride,
        showOnCalendar: announcement?.showOnCalendar ?? false, // Preserve existing calendar state
        itemType: 'announcement',
        isManuallyCleared: newSubjectId === undefined, // Mark as cleared if "unset"
      });
    });

    try {
      // Since we don't have a batch upsert, we can create one in the controller
      // For now, let's call the single upsert in a loop.
      // This is not ideal, but works. A true batch operation is better.
      const promises = announcementsToUpsert.map(ann => upsertDailyAnnouncement(ann, userId));
      await Promise.all(promises);
      
      toast({ title: '成功', description: `${selectedBulkSlots.size}件のコマを一括更新しました。` });
      setSelectedBulkSlots(new Set());
      setIsBulkEditing(false); // Exit bulk edit mode on success
      queryClientHook.invalidateQueries({ queryKey: ['dailyAnnouncements'] });
      queryClientHook.invalidateQueries({ queryKey: ['calendarItems'] });
    } catch (error) {
      toast({ title: '一括更新エラー', description: `更新中にエラーが発生しました: ${error}`, variant: 'destructive' });
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
        return { date: tempDate, dayOfWeek: dayEnum, isWeekend: false, isConfigActive: false, hasEvents: false, assignmentsForDayHeader: [] };
      }
      const isConfigActive = activeDaysSetting.includes(dayEnum);
      const eventsForDay = getEventsForDay(dateForDay);
      const assignmentsForDayHeader = getAssignmentsForDayHeader(dateForDay); 
      const isWeekend = dayEnum === DayOfWeekEnum.SATURDAY || dayEnum === DayOfWeekEnum.SUNDAY;

      return { date: dateForDay, dayOfWeek: dayEnum, isWeekend, isConfigActive, hasEvents: eventsForDay.length > 0, assignmentsForDayHeader };
    });
  }, [weekDays, activeDaysSetting, getEventsForDay, getAssignmentsForDayHeader]);

  const headers = [
    <div key="header-time" className={`${TIME_CELL_WIDTH} p-1 sm:p-2 font-semibold text-center border-r sticky left-0 bg-card z-20 whitespace-nowrap`}>時間</div>,
    ...displayDays.map(({ date, dayOfWeek, isWeekend }) => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const eventsForDay = getEventsForDay(date);
      return (
        <div key={`header-${dateStr}`} className={`${DAY_CELL_WIDTH} p-1 sm:p-2 font-semibold text-center border-r ${isWeekend ? 'bg-muted/50 dark:bg-muted/30' : ''} ${isSameDay(date, currentDate) ? 'bg-primary/10 dark:bg-primary/20' : ''} bg-card overflow-hidden`}>
          <div className="flex flex-col h-full items-center overflow-hidden min-w-0">
            <div>{getDayOfWeekName(dayOfWeek)}</div>
            <div className="text-xs text-muted-foreground">{format(date, 'M/d')}</div>
            <div className="w-full min-w-0 overflow-y-auto mt-0.5 space-y-0.5 max-h-[60px]">
              {eventsForDay.map(event => (
                <Button
                  key={`event-btn-${event.id}-${dateStr}`}
                  variant="ghost"
                  size="sm"
                  className="p-1 w-full h-auto justify-start bg-accent/20 text-accent-foreground rounded text-xs truncate flex items-center gap-1 hover:bg-accent/30 dark:bg-accent/30 dark:hover:bg-accent/40 min-w-0"
                  title={event.title}
                  onClick={() => handleEventHeaderClick(event)}
                >
                  <CalendarDays className="w-3 h-3 shrink-0" />
                  <span className="truncate min-w-0">{event.title}</span>
                </Button>
              ))}
              {getAssignmentsForDayHeader(date).map(assignment => (
                <Button
                  key={`assignment-header-btn-${assignment.id}-${dateStr}`}
                  variant="ghost"
                  size="sm"
                  className="p-1 w-full h-auto justify-start bg-purple-500/20 text-purple-700 dark:bg-purple-500/30 dark:text-purple-300 rounded text-xs truncate flex items-center gap-1 hover:bg-purple-500/30 dark:hover:bg-purple-500/40 min-w-0"
                  title={assignment.title}
                  onClick={() => handleOpenAssignmentDetailModal(assignment)}
                >
                  <ClipboardList className="w-3 h-3 shrink-0" />
                  <span className="truncate min-w-0">{assignment.title}</span>
                </Button>
              ))}
            </div>
          </div>
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
   <div className="flex flex-col">
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
          <div className="flex sticky top-0 bg-card z-10 border-b min-w-max">{headers.map(header => header)}</div>
          {isLoadingCombined ? (
            periodNumbers.map((period) => {
              const skeletonCells = [
                <div key={`skeleton-period-${period}`} className={`${TIME_CELL_WIDTH} p-1 sm:p-2 font-semibold text-center border-r sticky left-0 bg-card z-10 flex items-center justify-center`}><Skeleton className="h-6 w-8" /></div>,
                ...displayDays.map(({ date }) => (
                  <div key={`skeleton-cell-${format(date, 'yyyy-MM-dd')}-${period}`} className={`${DAY_CELL_WIDTH} p-1 sm:p-2 border-r flex flex-col justify-between bg-card min-h-[80px] sm:min-h-[100px] gap-0.5 overflow-hidden`}>
                    <Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /><Skeleton className="h-8 w-full" />
                  </div>
                ))
              ];
              return <div key={`skeleton-row-${period}`} className="flex border-b min-w-max">{skeletonCells.map(cell => cell)}</div>;
            })
          ) : (
            periodNumbers.map((period) => {
              const cells = [
                <div key={`period-${period}`} className={`${TIME_CELL_WIDTH} p-1 sm:p-2 font-semibold text-center border-r sticky left-0 bg-card z-10 flex items-center justify-center`}>{period}限</div>,
                ...displayDays.map(({ date, dayOfWeek, isConfigActive, isWeekend, hasEvents }) => {
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const fixedSlot = getFixedSlot(dayOfWeek, period);
                  const baseFixedSubjectId = fixedSlot?.subjectId; // undefined if no slot
                  const announcement = getDailyAnnouncement(dateStr, period);
                  const assignmentsForThisSlot = getAssignmentsForPeriodCell(date, period); 

                  let displaySubjectId: string | null | undefined = baseFixedSubjectId;
                  if (announcement && !announcement.isManuallyCleared) {
                      if (announcement.subjectIdOverride === "") { // "なし"
                          displaySubjectId = null;
                      } else if (announcement.subjectIdOverride !== null && announcement.subjectIdOverride !== undefined) {
                          displaySubjectId = announcement.subjectIdOverride; 
                      }
                  } 

                  const subjectInfo = getSubjectById(displaySubjectId);
                  const displaySubjectName = subjectInfo?.name ?? null;
                  const displayTeacherName = subjectInfo?.teacherName ?? null;
                  
                  const subjectChangedFromFixed = baseFixedSubjectId !== displaySubjectId && !(announcement?.isManuallyCleared && displaySubjectId === baseFixedSubjectId);

                  const announcementDisplayText = announcement?.isManuallyCleared ? '' : announcement?.text;
                  const hasMeaningfulAnnouncementText = !!announcementDisplayText;
                  const hasAnyPeriodSpecificAssignments = assignmentsForThisSlot.length > 0;

                  const isToday = isSameDay(date, currentDate);
                  const canEditThisSlot = (user || isAnonymous);
                  const cellIsInteractive = isConfigActive || hasEvents || isWeekend;
                  const slotId = `${dateStr}_${period}`;


                  return (
                    <div key={`${dateStr}-${period}-cell`} className={cn(
                        DAY_CELL_WIDTH, 
                        "p-1 sm:p-2 border-r relative flex flex-col justify-start bg-card min-h-[80px] sm:min-h-[100px] md:min-h-[110px] gap-0.5 overflow-hidden",
                         isBulkEditing ? 'cursor-pointer' : '',
                        isToday && "bg-primary/5 dark:bg-primary/10",
                        (isWeekend) && !isConfigActive && !hasEvents && "bg-muted/30 dark:bg-muted/20",
                        !isConfigActive && !(isWeekend) && !hasEvents && "bg-muted/10 dark:bg-muted/5",
                        // Mobile highlight for announcements
                        "sm:bg-card",
                        hasMeaningfulAnnouncementText && !hasAnyPeriodSpecificAssignments && "sm:bg-card bg-sky-100/70 dark:bg-sky-900/50"
                      )}
                      onClick={canEditThisSlot && cellIsInteractive ? () => handleSlotClick(dateStr, period, dayOfWeek) : undefined}
                      role={canEditThisSlot && cellIsInteractive ? "button" : undefined}
                      tabIndex={canEditThisSlot && cellIsInteractive ? 0 : undefined}
                      onKeyDown={canEditThisSlot && cellIsInteractive ? (e) => { if (e.key === 'Enter' || e.key === ' ') handleSlotClick(dateStr, period, dayOfWeek); } : undefined}
                      >
                       {isBulkEditing && canEditThisSlot && cellIsInteractive && (
                        <div className="absolute top-1 right-1 z-10">
                            <Checkbox
                            checked={selectedBulkSlots.has(slotId)}
                            onCheckedChange={() => toggleBulkSlotSelection(slotId)}
                            aria-label={`Select slot for ${dateStr} period ${period}`}
                            />
                        </div>
                        )}
                      {cellIsInteractive ? (
                        <div className="flex flex-col h-full min-w-0 gap-0.5"> 
                          <div className="flex-shrink-0 space-y-0.5 min-w-0"> 
                            <div className={cn("text-sm truncate min-w-0", displaySubjectName && isToday ? "font-bold" : "font-medium")} title={displaySubjectName ?? (isConfigActive || isWeekend ? (displaySubjectId === null ? 'なし' : '未設定') : '')}>
                              {displaySubjectName ?? ((isConfigActive || isWeekend) ? (displaySubjectId === null ? 'なし' : '未設定') : '')}
                              {subjectChangedFromFixed && <span className="text-xs ml-1 text-destructive">(変更)</span>}
                            </div>
                            {displayTeacherName && (
                              <div className="text-xs text-muted-foreground flex items-center gap-1 truncate min-w-0" title={displayTeacherName}>
                                <User className="w-3 h-3 shrink-0" />{displayTeacherName}
                              </div>
                            )}
                          </div>
                          
                           <div className="hidden sm:flex flex-col text-xs flex-grow break-words overflow-y-auto space-y-0.5 max-h-[40px] xs:max-h-[50px] sm:max-h-[60px] min-w-0">
                            {hasMeaningfulAnnouncementText && (
                              <div className="p-1 rounded bg-card border border-dashed border-accent/50 dark:border-accent/30 w-full min-w-0">
                                <p className="text-foreground whitespace-normal break-words w-full">{announcementDisplayText}</p>
                              </div>
                            )}
                             {hasAnyPeriodSpecificAssignments && assignmentsForThisSlot.map(assignment => (
                              <div
                                key={`assignment-cell-${assignment.id}`}
                                className="p-1 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/70 dark:text-purple-300 rounded text-xs truncate w-full cursor-pointer hover:bg-purple-200/70 dark:hover:bg-purple-800/70 min-w-0 flex items-center gap-1"
                                title={assignment.title}
                                onClick={(e) => { e.stopPropagation(); handleOpenAssignmentDetailModal(assignment);}}
                              >
                                <ClipboardList className="w-3 h-3 shrink-0" />
                                <span className="truncate">{assignment.title}</span>
                              </div>
                            ))}
                          </div>

                          <div className="sm:hidden flex flex-col items-start text-xs mt-1 space-y-0.5 min-w-0">
                              {hasMeaningfulAnnouncementText && (
                                <div className={cn(
                                    "flex items-center gap-1 truncate w-full px-1 py-0.5 rounded-sm text-xs",
                                    "bg-sky-100/70 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200" 
                                )}>
                                  <FileText className="w-3 h-3 shrink-0" />
                                  <span className="truncate">連絡事項あり</span>
                                </div>
                              )}
                              {hasAnyPeriodSpecificAssignments && (
                                <div className={cn(
                                    "flex items-center gap-1 truncate w-full px-1 py-0.5 rounded-sm text-xs",
                                    "bg-purple-100/70 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200"
                                )}>
                                  <ClipboardList className="w-3 h-3 shrink-0 text-purple-600 dark:text-purple-400" />
                                  <span className="truncate text-purple-700 dark:text-purple-300">課題あり</span>
                                </div>
                              )}
                            </div>
                          
                          {canEditThisSlot && !isBulkEditing && (
                            <div className="mt-auto flex-shrink-0">
                              <Button variant="ghost" size="sm" className="h-6 px-1 text-xs absolute bottom-1 right-1 text-muted-foreground hover:text-primary" onClick={(e) => { e.stopPropagation(); handleSlotClick(dateStr, period, dayOfWeek); }} aria-label={`${dateStr} ${period}限目の連絡・変更を編集`} disabled={isOffline}>
                                <Edit2 className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                           {!displaySubjectName && displaySubjectId !== null && !hasMeaningfulAnnouncementText && !hasAnyPeriodSpecificAssignments && (isConfigActive || isWeekend || hasEvents) && (
                             <div className="text-xs text-muted-foreground italic h-full flex items-center justify-center">{hasEvents ? '行事日' : (isWeekend && !isConfigActive) ? '休日' : '未設定'}</div>
                          )}
                        </div>
                      ) : (
                         <div className="h-full"></div>
                      )}
                    </div>
                  );
                })
              ];
              return <div key={`row-${period}`} className="flex border-b min-w-max">{cells.map(cell => cell)}</div>;
            })
          )}
        </CardContent>
      </Card>
      </div>

     {/* Bulk Edit Panel */}
    {canEditTimetableSlot && (
    <div className="mt-4 flex justify-end">
        <Button onClick={() => {
            setIsBulkEditing(!isBulkEditing);
            setSelectedBulkSlots(new Set()); // Clear selection when toggling
        }}>
        {isBulkEditing ? <X className="mr-2 h-4 w-4" /> : <CheckSquare className="mr-2 h-4 w-4" />}
        {isBulkEditing ? '一括編集を終了' : '一括編集を開始'}
        </Button>
    </div>
    )}
     <div className={`sticky bottom-0 z-20 transition-all duration-300 ease-in-out ${isBulkEditing ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}>
        <Card className="w-full mt-4 border-t-4 border-primary shadow-2xl rounded-t-lg rounded-b-none">
          <CardContent className="p-3 flex flex-col sm:flex-row items-center gap-3">
            <div className="flex-shrink-0">
                <p className="font-semibold text-sm">一括編集パネル</p>
                <p className="text-xs text-muted-foreground">{selectedBulkSlots.size}件のコマを選択中</p>
            </div>
            <div className="flex-grow w-full sm:w-auto">
              <SubjectSelector
                subjects={subjects}
                selectedSubjectId={undefined} // No pre-selection
                onValueChange={(subjectId) => handleBulkUpdate(subjectId)}
                placeholder="選択したコマの科目を変更..."
                disabled={isSaving || selectedBulkSlots.size === 0}
                includeUnsetOption={true}
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => setSelectedBulkSlots(new Set())} disabled={isSaving || selectedBulkSlots.size === 0}>
                選択をクリア
            </Button>
          </CardContent>
        </Card>
      </div>

       {/* Spacer to prevent bulk edit panel from overlapping content */}
      <div className={cn("h-0 transition-all duration-300", isBulkEditing ? "h-24" : "h-0")} />

      {/* View Slot Modal */}
      <Dialog open={isSlotViewModalOpen} onOpenChange={(open) => {
        setIsSlotViewModalOpen(open);
        if (!open) setSelectedSlot(null);
      }}>
        <DialogContent className="max-w-sm sm:max-w-md">
          <DialogHeader>
            <DialogTitle>詳細: {selectedSlot?.date} ({selectedSlot?.day ? getDayOfWeekName(selectedSlot.day) : ''}) {selectedSlot?.period}限目</DialogTitle>
            {selectedSlot?.baseFixedSubjectId && getSubjectById(selectedSlot.baseFixedSubjectId) && (
              <p className="text-sm text-muted-foreground pt-1">
                元の科目: {getSubjectById(selectedSlot.baseFixedSubjectId)?.name ?? '未設定'}
                {getSubjectById(selectedSlot.baseFixedSubjectId)?.teacherName ? ` (${getSubjectById(selectedSlot.baseFixedSubjectId)?.teacherName})` : ''}
              </p>
            )}
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] my-4">
            <div className="space-y-3 pr-3">
              {selectedSlot && (
                <>
                  <div>
                    {(() => {
                      const baseSubjectIdInModal = selectedSlot.baseFixedSubjectId;
                      let currentDisplaySubjectIdInModal: string | null | undefined = baseSubjectIdInModal;

                      if (selectedSlot.announcement && !selectedSlot.announcement.isManuallyCleared) {
                        if (selectedSlot.announcement.subjectIdOverride === "") { 
                          currentDisplaySubjectIdInModal = null; // なし
                        } else if (selectedSlot.announcement.subjectIdOverride !== undefined && selectedSlot.announcement.subjectIdOverride !== null) {
                          currentDisplaySubjectIdInModal = selectedSlot.announcement.subjectIdOverride;
                        }
                      }
                      
                      const subjectIsChangedInModal = baseSubjectIdInModal !== currentDisplaySubjectIdInModal &&
                                                !(selectedSlot.announcement?.isManuallyCleared && currentDisplaySubjectIdInModal === baseSubjectIdInModal);

                      const subjectForDisplayInModal = getSubjectById(currentDisplaySubjectIdInModal);

                      return (
                        <>
                          <h4 className="font-semibold text-sm mb-1">現在の科目:</h4>
                          <p className="text-sm">
                            {subjectForDisplayInModal?.name ?? (currentDisplaySubjectIdInModal === null ? 'なし' : '未設定')}
                            {subjectIsChangedInModal && <span className="text-xs ml-1 text-destructive">(変更)</span>}
                          </p>
                          {subjectForDisplayInModal?.teacherName && (
                        <p className="text-xs text-muted-foreground">
                            (担当: {subjectForDisplayInModal.teacherName})
                        </p>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {(selectedSlot.announcement?.text && !selectedSlot.announcement?.isManuallyCleared) && (
                    <div>
                      <h4 className="font-semibold text-sm mb-1">連絡事項:</h4>
                      <p className="text-sm whitespace-pre-wrap bg-muted/50 p-2 rounded-md">{selectedSlot.announcement.text}</p>
                    </div>
                  )}

                  <div>
                    <h4 className="font-semibold text-sm mb-1">この時間の課題:</h4>
                    {getAssignmentsForPeriodCell(parseISO(selectedSlot.date), selectedSlot.period).length > 0 ? (
                      <ul className="list-disc pl-5 space-y-1">
                        {getAssignmentsForPeriodCell(parseISO(selectedSlot.date), selectedSlot.period).map(assignment => (
                          <li key={`modal-assign-${assignment.id}`}>
                            <Button variant="link" className="p-0 h-auto text-sm text-purple-600 dark:text-purple-400 hover:underline" onClick={() => { setIsSlotViewModalOpen(false); handleOpenAssignmentDetailModal(assignment);}}>
                              {assignment.title}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm italic text-muted-foreground">この時間の課題はありません。</p>
                    )}
                  </div>

                  {selectedSlot.announcement?.showOnCalendar && (
                    <p className="text-xs text-green-600 dark:text-green-400 flex items-center mt-2">
                      <CalendarDays className="w-3 h-3 mr-1" />カレンダーに表示中
                    </p>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
          <DialogFooter className="flex-col sm:flex-row sm:justify-between gap-2">
            <Button variant="outline" onClick={() => setIsSlotViewModalOpen(false)} className="w-full sm:w-auto">閉じる</Button>
            {canEditTimetableSlot && (
              <Button onClick={openEditModalFromView} className="w-full sm:w-auto">
                <Edit2 className="mr-2 h-4 w-4" />お知らせ・科目を編集
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Slot Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={(open) => {
        setIsEditModalOpen(open);
        if (!open) {
            setSelectedSlot(null);
            setAnnouncementText('');
            setSubjectIdOverrideModal(undefined);
            setShowOnCalendarModal(false);
        }
        }}>
        <DialogContent className="max-w-sm sm:max-w-md">
          <DialogHeader>
            <DialogTitle>連絡・変更・課題: {selectedSlot?.date} ({selectedSlot?.day ? getDayOfWeekName(selectedSlot.day) : ''}) {selectedSlot?.period}限目</DialogTitle>
            {selectedSlot?.baseFixedSubjectId && getSubjectById(selectedSlot.baseFixedSubjectId) && (
              <p className="text-sm text-muted-foreground pt-1">
                元の科目: {getSubjectById(selectedSlot.baseFixedSubjectId)?.name ?? '未設定'}
                {getSubjectById(selectedSlot.baseFixedSubjectId)?.teacherName ? ` (${getSubjectById(selectedSlot.baseFixedSubjectId)?.teacherName})` : ''}
              </p>
            )}
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] my-2 pr-3">
            <div className="grid gap-4 py-2">
                {selectedSlot && getAssignmentsForPeriodCell(parseISO(selectedSlot.date), selectedSlot.period).length > 0 && (
                    <div className="mb-2">
                        <Label className="text-sm font-medium">この時間の課題:</Label>
                        <ul className="list-disc pl-5 mt-1 space-y-1">
                        {getAssignmentsForPeriodCell(parseISO(selectedSlot.date), selectedSlot.period).map(assignment => (
                            <li key={`edit-modal-assign-${assignment.id}`}>
                            <Button variant="link" className="p-0 h-auto text-xs text-purple-600 dark:text-purple-400 hover:underline" onClick={() => { setIsEditModalOpen(false); handleOpenAssignmentDetailModal(assignment);}}>
                                {assignment.title}
                            </Button>
                            </li>
                        ))}
                        </ul>
                    </div>
                )}

                <div className="grid grid-cols-4 items-center gap-x-4 gap-y-1">
                    <Label htmlFor="subject-override" className="text-right col-span-1 text-xs sm:text-sm">科目変更</Label>
                    <SubjectSelector
                    id="subject-override"
                    subjects={subjects}
                    selectedSubjectId={subjectIdOverrideModal}
                    onValueChange={setSubjectIdOverrideModal}
                    placeholder={`変更なし (${getSubjectById(selectedSlot?.baseFixedSubjectId ?? undefined)?.name ?? '未設定'})`}
                    disabled={isSaving || isLoadingSubjects || !canEditTimetableSlot}
                    className="col-span-3"
                    includeUnsetOption={true}
                    />
                </div>
                <div className="grid grid-cols-4 items-start gap-x-4 gap-y-1">
                    <Label htmlFor="announcement-text" className="text-right pt-1 col-span-1 text-xs sm:text-sm">連絡内容</Label>
                    <Textarea id="announcement-text" value={announcementText} onChange={(e) => setAnnouncementText(e.target.value)} className="col-span-3 min-h-[80px] sm:min-h-[100px]" placeholder="持ち物、テスト範囲など" disabled={isSaving || !canEditTimetableSlot} />
                </div>
                <div className="grid grid-cols-4 items-center gap-x-4 gap-y-1">
                    <Label htmlFor="show-on-calendar" className="text-right col-span-1 text-xs sm:text-sm">カレンダー</Label>
                    <div className="col-span-3 flex items-center space-x-2">
                        <Checkbox
                            id="show-on-calendar"
                            checked={showOnCalendarModal}
                            onCheckedChange={(checked) => setShowOnCalendarModal(!!checked)}
                            disabled={isSaving || !canEditTimetableSlot}
                        />
                        <label htmlFor="show-on-calendar" className="text-xs sm:text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            カレンダーにこの連絡/変更を表示
                        </label>
                    </div>
                </div>
            </div>
          </ScrollArea>
          <DialogFooter className="flex flex-col sm:flex-row justify-between items-center gap-2 w-full">
             <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2">
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" className="w-full sm:w-auto" size="sm"
                          disabled={isSaving || isOffline || !canEditTimetableSlot || (!selectedSlot?.announcement?.text && (selectedSlot?.announcement?.subjectIdOverride === undefined || selectedSlot?.announcement?.subjectIdOverride === selectedSlot?.baseFixedSubjectId || (selectedSlot?.announcement?.subjectIdOverride === null && selectedSlot?.baseFixedSubjectId === null)) && !selectedSlot?.announcement?.showOnCalendar && !selectedSlot?.announcement?.isManuallyCleared) }
                          >
                            <Trash2 className="mr-1 w-4 h-4" />{isSaving ? 'クリア中...' : '連絡・変更をクリア'}
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>連絡・変更をクリアしますか？</AlertDialogTitle>
                            <AlertDialogDescription>
                                この操作は元に戻せません。{selectedSlot?.date} {selectedSlot?.period}限目の科目変更、連絡内容、カレンダー表示設定がすべてクリアされ、スロットは基本の時間割の状態に戻ります。
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
                 <Button variant="outline" size="sm" onClick={handleRevertToFixed} className="w-full sm:w-auto"
                  disabled={isSaving || isOffline || !canEditTimetableSlot || (
                    (subjectIdOverrideModal === (selectedSlot?.baseFixedSubjectId ?? undefined)) && 
                    !announcementText && 
                    !showOnCalendarModal && 
                    (!selectedSlot?.announcement || ( 
                        selectedSlot.announcement.subjectIdOverride === null &&
                        !selectedSlot.announcement.text &&
                        !selectedSlot.announcement.showOnCalendar &&
                        !selectedSlot.announcement.isManuallyCleared
                    ))
                  )}>
                    <RotateCcw className="mr-1 w-4 h-4" /> 元の教科に戻す
                </Button>
            </div>
            <div className="flex gap-2 w-full sm:w-auto justify-end">
               <Button type="button" variant="secondary" onClick={() => setIsEditModalOpen(false)} className="w-full sm:w-auto" disabled={isSaving}>キャンセル</Button>
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

      <Dialog open={isAssignmentDetailModalOpen} onOpenChange={setIsAssignmentDetailModalOpen}>
        <DialogContent className="sm:max-w-md md:max-w-lg">
          <DialogHeader>
            <DialogTitle>課題詳細</DialogTitle>
            {selectedAssignmentForDetail && (
                 <DialogDescription>
                    課題名: {selectedAssignmentForDetail.title}
                 </DialogDescription>
            )}
          </DialogHeader>
          {selectedAssignmentForDetail && (
            <ScrollArea className="h-[400px] w-full my-4 pr-3">
                <div className="space-y-3 text-sm">
                    <div>
                        <h4 className="font-semibold mb-0.5">科目:</h4>
                        <p className="text-muted-foreground">{selectedAssignmentForDetail.subjectId ? (subjectsMap.get(selectedAssignmentForDetail.subjectId)?.name ?? '不明な科目') : (selectedAssignmentForDetail.customSubjectName || 'その他')}</p>
                    </div>
                    <div>
                        <h4 className="font-semibold mb-0.5">提出期限:</h4>
                        <p className="text-muted-foreground">{format(parseISO(selectedAssignmentForDetail.dueDate), 'yyyy年M月d日 (E)', { locale: ja })}</p>
                    </div>
                    {selectedAssignmentForDetail.duePeriod && (
                        <div>
                            <h4 className="font-semibold mb-0.5">提出時限:</h4>
                            <p className="text-muted-foreground">{selectedAssignmentForDetail.duePeriod}</p>
                        </div>
                    )}
                    <div>
                        <h4 className="font-semibold mb-0.5">内容:</h4>
                        <p className="text-muted-foreground whitespace-pre-wrap bg-muted/50 p-2 rounded-md">{selectedAssignmentForDetail.description}</p>
                    </div>
                    {selectedAssignmentForDetail.submissionMethod && (
                        <div>
                            <h4 className="font-semibold mb-0.5">提出方法:</h4>
                            <p className="text-muted-foreground">{selectedAssignmentForDetail.submissionMethod}</p>
                        </div>
                    )}
                    {selectedAssignmentForDetail.targetAudience && (
                        <div>
                            <h4 className="font-semibold mb-0.5">対象者:</h4>
                            <p className="text-muted-foreground">{selectedAssignmentForDetail.targetAudience}</p>
                        </div>
                    )}
                </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAssignmentDetailModalOpen(false)}>閉じる</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

    
