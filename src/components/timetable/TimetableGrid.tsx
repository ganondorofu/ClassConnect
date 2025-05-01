"use client";

import * as React from 'react'; // Added missing React import
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfWeek, addDays, eachDayOfInterval, isSameDay } from 'date-fns';
import { ja } from 'date-fns/locale'; // Import Japanese locale

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea"; // Import Textarea
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Import Select components
import { useToast } from "@/hooks/use-toast";


import type { FixedTimeSlot, TimetableSettings, DayOfWeek, SchoolEvent } from '@/models/timetable';
import { DEFAULT_TIMETABLE_SETTINGS, DayOfWeek as DayOfWeekEnum, getDayOfWeekName } from '@/models/timetable'; // Combined imports
import type { DailyAnnouncement, AnnouncementType } from '@/models/announcement';
import { AnnouncementType as AnnouncementTypeEnum } from '@/models/announcement'; // Import the enum
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
import { AlertCircle, CalendarDays, Edit2, Trash2, PlusCircle, Info, AlertTriangle, BookOpen, Users, BellRing } from 'lucide-react'; // Import icons


const DAY_CELL_WIDTH = "min-w-[150px]"; // Adjust width as needed

// Map AnnouncementType to Icons and Colors
const announcementTypeDetails: Record<AnnouncementType, { icon: React.ElementType, color: string }> = {
  [AnnouncementTypeEnum.BELONGINGS]: { icon: BookOpen, color: 'text-blue-500 dark:text-blue-400' },
  [AnnouncementTypeEnum.TEST]: { icon: Edit2, color: 'text-red-500 dark:text-red-400' },
  [AnnouncementTypeEnum.CHANGE]: { icon: AlertTriangle, color: 'text-orange-500 dark:text-orange-400' },
  [AnnouncementTypeEnum.CALL]: { icon: BellRing, color: 'text-purple-500 dark:text-purple-400' },
  [AnnouncementTypeEnum.EVENT]: { icon: CalendarDays, color: 'text-teal-500 dark:text-teal-400' }, // Event icon
  [AnnouncementTypeEnum.OTHER]: { icon: Info, color: 'text-gray-500 dark:text-gray-400' },
};


interface TimetableGridProps {
  currentDate: Date; // Pass current date as prop
}

export function TimetableGrid({ currentDate }: TimetableGridProps) {
  const { toast } = useToast();
  const [selectedSlot, setSelectedSlot] = useState<{ date: string, period: number, day: DayOfWeek, fixedSubject: string, announcement?: DailyAnnouncement } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [announcementText, setAnnouncementText] = useState('');
  const [announcementType, setAnnouncementType] = useState<AnnouncementType>(AnnouncementTypeEnum.OTHER);

  // --- State for Realtime Data ---
  const [liveSettings, setLiveSettings] = useState<TimetableSettings | null>(null);
  const [liveFixedTimetable, setLiveFixedTimetable] = useState<FixedTimeSlot[]>([]);
  const [liveDailyAnnouncements, setLiveDailyAnnouncements] = useState<Record<string, DailyAnnouncement[]>>({});
  const [liveSchoolEvents, setLiveSchoolEvents] = useState<SchoolEvent[]>([]);

  // --- Tanstack Query Fetching ---
  const { data: initialSettings, isLoading: isLoadingSettings, error: errorSettings } = useQuery({
    queryKey: ['timetableSettings'],
    queryFn: queryFnGetTimetableSettings,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });

  const { data: initialFixedTimetable, isLoading: isLoadingFixed, error: errorFixed } = useQuery({
    queryKey: ['fixedTimetable'],
    queryFn: queryFnGetFixedTimetable,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });

   const { data: initialSchoolEvents, isLoading: isLoadingEvents, error: errorEvents } = useQuery({
    queryKey: ['schoolEvents'],
    queryFn: queryFnGetSchoolEvents,
    staleTime: 1000 * 60 * 15, // 15 minutes
  });

  // Calculate week interval based on currentDate
   const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }); // Week starts on Monday
   const weekEnd = addDays(weekStart, 6); // Include Sunday
   const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Fetch daily announcements for the current week
  const { data: initialDailyAnnouncementsData, isLoading: isLoadingAnnouncements } = useQuery({
    queryKey: ['dailyAnnouncements', format(weekStart, 'yyyy-MM-dd')], // Key changes weekly
    queryFn: async () => {
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
    refetchInterval: 1000 * 60 * 2, // Refetch every 2 minutes
  });


  // --- Realtime Subscriptions ---
  useEffect(() => {
    const unsubSettings = onTimetableSettingsUpdate(setLiveSettings);
    const unsubFixed = onFixedTimetableUpdate(setLiveFixedTimetable);
    const unsubEvents = onSchoolEventsUpdate(setLiveSchoolEvents);

     // Subscribe to announcements for each day in the current view
     const unsubAnnouncements = weekDays.map(day => {
       const dateStr = format(day, 'yyyy-MM-dd');
       return onDailyAnnouncementsUpdate(dateStr, (announcements) => {
         setLiveDailyAnnouncements(prev => ({ ...prev, [dateStr]: announcements }));
       });
     });

    return () => {
      unsubSettings();
      unsubFixed();
      unsubEvents();
      unsubAnnouncements.forEach(unsub => unsub());
    };
    // Resubscribe if the week changes
  }, [weekStart]);


  // --- Data Merging ---
  const settings = liveSettings ?? initialSettings;
  const fixedTimetable = liveFixedTimetable.length > 0 ? liveFixedTimetable : initialFixedTimetable ?? [];
  const schoolEvents = liveSchoolEvents.length > 0 ? liveSchoolEvents : initialSchoolEvents ?? [];
  const dailyAnnouncements = { ...initialDailyAnnouncementsData, ...liveDailyAnnouncements };


  const isLoading = isLoadingSettings || isLoadingFixed || isLoadingAnnouncements || isLoadingEvents;
  const error = errorSettings || errorFixed || errorEvents; // Combine errors

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
        fixedSubject: fixedSlot?.subject ?? 'N/A',
        announcement
    });
    setAnnouncementText(announcement?.text ?? '');
    setAnnouncementType(announcement?.type ?? AnnouncementTypeEnum.OTHER);
    setIsModalOpen(true);
  };

 const handleSaveAnnouncement = async () => {
    if (!selectedSlot) return;

    // Basic validation
    if (!announcementText.trim()) {
        toast({
            title: "エラー",
            description: "連絡内容を入力してください。",
            variant: "destructive",
        });
        return;
    }


    try {
      const announcementData: Omit<DailyAnnouncement, 'id' | 'updatedAt'> = {
        date: selectedSlot.date,
        period: selectedSlot.period,
        text: announcementText,
        type: announcementType, // Include the type
      };
      await upsertDailyAnnouncement(announcementData);
      toast({
        title: "成功",
        description: `${selectedSlot.date} ${selectedSlot.period}限目の連絡を保存しました。`,
      });
      setIsModalOpen(false);
      // Reset state after successful save
      setSelectedSlot(null);
      setAnnouncementText('');
      setAnnouncementType(AnnouncementTypeEnum.OTHER);
    } catch (error) {
      console.error("Failed to save announcement:", error);
      toast({
        title: "エラー",
        description: "連絡の保存に失敗しました。",
        variant: "destructive",
      });
    }
  };

  const handleDeleteAnnouncement = async () => {
     if (!selectedSlot || !selectedSlot.announcement) return;

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
         setAnnouncementType(AnnouncementTypeEnum.OTHER);
     } catch (error) {
         console.error("Failed to delete announcement:", error);
         toast({
             title: "エラー",
             description: "連絡の削除に失敗しました。",
             variant: "destructive",
         });
     }
 };

  if (error) {
    return <div className="text-destructive p-4">エラーが発生しました: {String(error)}</div>;
  }

  const numberOfPeriods = settings?.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods;
  const activeDays = settings?.activeDays ?? DEFAULT_TIMETABLE_SETTINGS.activeDays;

  // Filter weekDays to only include active days + Saturday/Sunday for events
   const displayDays = weekDays.map(date => {
        const dayOfWeekStr = format(date, 'eee', { locale: ja }) as DayOfWeek; // Get Japanese day name
        const isActive = activeDays.includes(dayOfWeekStr);
        const isWeekend = dayOfWeekStr === DayOfWeekEnum.SATURDAY || dayOfWeekStr === DayOfWeekEnum.SUNDAY; // Use DayOfWeekEnum
        return { date, dayOfWeek: dayOfWeekStr, isActive, isWeekend };
    });

  return (
    <Card className="w-full overflow-hidden shadow-lg rounded-lg">
      <CardHeader>
         {/* Header can be added later if needed */}
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
          {Array.from({ length: numberOfPeriods }, (_, i) => i + 1).map((period) => (
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
                 const TypeIcon = announcement ? announcementTypeDetails[announcement.type]?.icon : null;
                 const iconColor = announcement ? announcementTypeDetails[announcement.type]?.color : '';
                 const hasEvent = !isActive && getEventsForDay(date).length > 0; // Check if inactive day has event

                return (
                  <div
                    key={`${dateStr}-${period}`}
                    className={`flex-shrink-0 ${DAY_CELL_WIDTH} p-2 border-r relative flex flex-col justify-between ${!isActive && !hasEvent ? 'bg-muted/30' : ''} ${isSameDay(date, currentDate) ? 'bg-primary/5' : ''}`}
                  >
                    {isLoading ? (
                      <Skeleton className="h-16 w-full" />
                    ) : isActive ? (
                         <>
                             {/* Top Section: Fixed Subject */}
                            <div className="text-sm text-muted-foreground truncate mb-1" title={fixedSlot?.subject || '未設定'}>
                                {fixedSlot?.subject || (period <= DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods ? '未設定' : '')}
                             </div>
                             {/* Middle Section: Announcement */}
                             <div className="text-xs flex-grow mb-1 break-words overflow-hidden">
                                 {announcement && (
                                     <div className={`p-1 rounded bg-card border border-dashed ${iconColor} border-opacity-50`}>
                                         <div className="flex items-center gap-1 font-medium mb-0.5">
                                             {TypeIcon && <TypeIcon className={`w-3 h-3 shrink-0 ${iconColor}`} />}
                                             <span>{announcement.type}</span>
                                         </div>
                                         <p className="text-foreground whitespace-pre-wrap">{announcement.text}</p>
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
          ))}
        </div>

        {/* Announcement Edit Modal */}
       <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>連絡を編集: {selectedSlot?.date} ({getDayOfWeekName(selectedSlot?.day ?? DayOfWeekEnum.MONDAY)}) {selectedSlot?.period}限目</DialogTitle>
                     <p className="text-sm text-muted-foreground pt-1">時間割: {selectedSlot?.fixedSubject || '未設定'}</p>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                         <Label htmlFor="announcement-type" className="text-right">
                             種別
                         </Label>
                         <Select
                            value={announcementType}
                            onValueChange={(value) => setAnnouncementType(value as AnnouncementType)}
                         >
                            <SelectTrigger id="announcement-type" className="col-span-3">
                                <SelectValue placeholder="種別を選択" />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.values(AnnouncementTypeEnum).map(type => (
                                    <SelectItem key={type} value={type}>
                                         <div className="flex items-center gap-2">
                                             {React.createElement(announcementTypeDetails[type].icon, { className: `w-4 h-4 ${announcementTypeDetails[type].color}` })}
                                             {type}
                                         </div>
                                     </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                     <div className="grid grid-cols-4 items-center gap-4">
                         <Label htmlFor="announcement-text" className="text-right">
                             連絡内容
                         </Label>
                         <Textarea
                            id="announcement-text"
                            value={announcementText}
                            onChange={(e) => setAnnouncementText(e.target.value)}
                            className="col-span-3 min-h-[100px]"
                            placeholder="特別な持ち物、テスト範囲、教室変更などを入力..."
                        />
                    </div>
                </div>
                <DialogFooter className="flex justify-between sm:justify-between w-full">
                     {/* Delete Button Aligned Left */}
                     <div>
                         {selectedSlot?.announcement && ( // Only show delete if there's an existing announcement
                             <Button variant="destructive" onClick={handleDeleteAnnouncement} size="sm">
                                 <Trash2 className="mr-1 w-4 h-4" />
                                 削除
                             </Button>
                         )}
                     </div>
                     {/* Save and Cancel Buttons Aligned Right */}
                     <div className="flex gap-2">
                         <DialogClose asChild>
                             <Button type="button" variant="secondary">
                                 キャンセル
                             </Button>
                         </DialogClose>
                         <Button type="button" onClick={handleSaveAnnouncement}>
                             保存
                         </Button>
                     </div>
                 </DialogFooter>
            </DialogContent>
        </Dialog>

      </CardContent>
    </Card>
  );
}

