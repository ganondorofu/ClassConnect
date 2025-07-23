
"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { TimetableGrid } from '@/components/timetable/TimetableGrid';
import { DailyAnnouncementDisplay } from '@/components/announcements/DailyAnnouncementDisplay';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, RotateCcw, ArrowLeft, ArrowRight } from 'lucide-react';
import { format, addDays, subDays, addWeeks, subWeeks, startOfDay, parseISO, isValid } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { DailyGeneralAnnouncement } from '@/models/announcement';
import { queryFnGetDailyGeneralAnnouncement, onDailyGeneralAnnouncementUpdate } from '@/controllers/timetableController';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useAuth } from '@/contexts/AuthContext';
import { InitialChoice } from '@/components/auth/InitialChoice';
import { useSearchParams } from 'next/navigation';

const queryClient = new QueryClient();

function HomePageContent() {
  const searchParams = useSearchParams();
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const [todayStr, setTodayStr] = useState<string>('');
  const [selectedDateForPicker, setSelectedDateForPicker] = useState<Date | undefined>(undefined);
  const [liveGeneralAnnouncement, setLiveGeneralAnnouncement] = useState<DailyGeneralAnnouncement | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  
  const { user, loading: authLoading, isAnonymous, setAnonymousAccess } = useAuth();
  const [showInitialChoice, setShowInitialChoice] = useState(false);
  const [isClientMounted, setIsClientMounted] = useState(false); // New state for client mount

  useEffect(() => {
    setIsClientMounted(true); // Set true once component mounts on client
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
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
  }, []);


  useEffect(() => {
    const dateParam = searchParams.get('date');
    let initialDate = startOfDay(new Date()); 
    if (dateParam) {
      try {
        const parsedDate = parseISO(dateParam);
        if (isValid(parsedDate)) {
          initialDate = startOfDay(parsedDate);
        } else {
          console.warn("Invalid date parameter in URL, defaulting to today:", dateParam);
        }
      } catch (e) {
        console.error("Error parsing date parameter, defaulting to today:", e);
      }
    }
    setCurrentDate(initialDate);
  }, [searchParams]);

  useEffect(() => {
    if (currentDate) {
        setTodayStr(format(currentDate, 'yyyy-MM-dd'));
        setSelectedDateForPicker(currentDate);
    }
  }, [currentDate]);


  useEffect(() => {
    if (!isClientMounted || authLoading) return; // Only run on client after mount & auth resolved
 
    const anonymousAccessChosen = localStorage.getItem('classconnect_anonymous_access') === 'true';
    if (!user && !anonymousAccessChosen) {
      setShowInitialChoice(true);
    } else if (anonymousAccessChosen && !isAnonymous) {
      setAnonymousAccess(true); 
      setShowInitialChoice(false);
    } else {
      setShowInitialChoice(false);
    }
  }, [isClientMounted, user, authLoading, isAnonymous, setAnonymousAccess]);


  const { data: initialGeneralAnnouncement, isLoading: isLoadingGeneral, error: errorGeneral } = useQuery({
    queryKey: ['dailyGeneralAnnouncement', todayStr],
    queryFn: queryFnGetDailyGeneralAnnouncement(todayStr),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: true,
    enabled: !!todayStr && (!!user || isAnonymous) && !isOffline,
  });

  useEffect(() => {
    if (!todayStr || (!user && !isAnonymous) || isOffline) {
        setLiveGeneralAnnouncement(null); 
        return;
    }
    const unsubscribe = onDailyGeneralAnnouncementUpdate(todayStr, 
      (announcement) => {
        setLiveGeneralAnnouncement(announcement);
      }, 
      (error) => {
        console.error("Realtime general announcement error:", error);
        setIsOffline(true); 
      }
    );
    return () => unsubscribe();
  }, [todayStr, user, isAnonymous, isOffline]);

  const dailyGeneralAnnouncement = liveGeneralAnnouncement ?? initialGeneralAnnouncement;

  const updateCurrentDate = (newDate: Date | null) => {
    if (newDate) {
      const newDateStartOfDay = startOfDay(newDate);
      setCurrentDate(newDateStartOfDay);
    }
  };

  const handlePreviousWeek = () => updateCurrentDate(currentDate ? subWeeks(currentDate, 1) : null);
  const handleNextWeek = () => updateCurrentDate(currentDate ? addWeeks(currentDate, 1) : null);
  const handlePreviousDay = () => updateCurrentDate(currentDate ? subDays(currentDate, 1) : null);
  const handleNextDay = () => updateCurrentDate(currentDate ? addDays(currentDate, 1) : null);
  const handleToday = () => updateCurrentDate(new Date());
  const handleDateSelect = (date: Date | undefined) => {
    if (date) updateCurrentDate(date);
  };

  const handleChoiceMade = () => {
    setShowInitialChoice(false);
  };
  
  if (!isClientMounted || authLoading || !currentDate) {
    return (
      <>
           <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-y-2">
               <Skeleton className="h-8 w-32 sm:w-48" />
               <div className="flex items-center gap-1 md:gap-2 flex-wrap justify-center md:justify-end">
                   <Skeleton className="h-9 w-16" />
                   <div className="flex gap-1"><Skeleton className="h-9 w-9" /><Skeleton className="h-9 w-9" /></div>
                   <Skeleton className="h-9 w-24 sm:w-28" />
                    <div className="flex gap-1"><Skeleton className="h-9 w-9" /><Skeleton className="h-9 w-9" /></div>
               </div>
           </div>
        <Skeleton className="h-24 sm:h-32 w-full mb-6" />
        <Skeleton className="h-80 sm:h-96 w-full" />
        {isClientMounted && showInitialChoice && <InitialChoice onChoiceMade={handleChoiceMade} />}
      </>
    );
  }
  
  return (
    <>
        <>
          <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-y-2">
            <h1 className="text-xl md:text-2xl font-semibold">クラス時間割・連絡</h1>
            <div className="flex items-center gap-1 md:gap-2 flex-wrap justify-center md:justify-end">
              <Button variant="outline" size="sm" onClick={handleToday} disabled={!user && !isAnonymous}>
                <RotateCcw className="mr-1 h-4 w-4" /> 今日
              </Button>
              <div className="flex items-center gap-1 border rounded-md p-0.5">
                <Button variant="ghost" size="icon" onClick={handlePreviousDay} aria-label="前の日" className="h-8 w-8" disabled={!user && !isAnonymous}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"ghost"}
                      className={cn("w-[100px] md:w-[130px] justify-center text-center font-normal h-8 px-1 text-xs sm:text-sm", !currentDate && "text-muted-foreground")}
                      disabled={!user && !isAnonymous}
                    >
                      <CalendarIcon className="mr-1 h-3 w-3 sm:h-4 sm:w-4" />
                      {currentDate ? format(currentDate, "M月d日 (E)", { locale: ja }) : <span>日付選択</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={selectedDateForPicker} onSelect={handleDateSelect} initialFocus locale={ja} />
                  </PopoverContent>
                </Popover>
                <Button variant="ghost" size="icon" onClick={handleNextDay} aria-label="次の日" className="h-8 w-8" disabled={!user && !isAnonymous}>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-1 border rounded-md p-0.5">
                <Button variant="ghost" size="icon" onClick={handlePreviousWeek} aria-label="前の週" className="h-8 w-8" disabled={!user && !isAnonymous}>
                  <ChevronLeft className="h-4 w-4" /> <span className="sr-only">前の週</span>
                </Button>
                <span className="text-xs px-1 text-muted-foreground">週</span>
                <Button variant="ghost" size="icon" onClick={handleNextWeek} aria-label="次の週" className="h-8 w-8" disabled={!user && !isAnonymous}>
                  <ChevronRight className="h-4 w-4" /> <span className="sr-only">次の週</span>
                </Button>
              </div>
            </div>
          </div>

          <DailyAnnouncementDisplay
            date={currentDate}
            announcement={dailyGeneralAnnouncement}
            isLoading={isLoadingGeneral || !todayStr || authLoading}
            error={errorGeneral}
          />

          <div className="mt-6">
            {currentDate && <TimetableGrid currentDate={currentDate} />}
          </div>
          {isClientMounted && showInitialChoice && <InitialChoice onChoiceMade={handleChoiceMade} />}
        </>
    </>
  );
}

export default function Home() {
  return (
    <QueryClientProvider client={queryClient}>
        <Suspense fallback={
          <>
             <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-y-2">
                 <Skeleton className="h-8 w-32 sm:w-48" />
                 <div className="flex items-center gap-1 md:gap-2 flex-wrap justify-center md:justify-end">
                     <Skeleton className="h-9 w-16" />
                     <div className="flex gap-1"><Skeleton className="h-9 w-9" /><Skeleton className="h-9 w-9" /></div>
                     <Skeleton className="h-9 w-24 sm:w-28" />
                      <div className="flex gap-1"><Skeleton className="h-9 w-9" /><Skeleton className="h-9 w-9" /></div>
                 </div>
             </div>
            <Skeleton className="h-24 sm:h-32 w-full mb-6" />
            <Skeleton className="h-80 sm:h-96 w-full" />
          </>
        }>
          <HomePageContent />
        </Suspense>
    </QueryClientProvider>
  );
}
