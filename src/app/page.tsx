
"use client";

import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout';
import { TimetableGrid } from '@/components/timetable/TimetableGrid';
import { DailyAnnouncementDisplay } from '@/components/announcements/DailyAnnouncementDisplay';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, RotateCcw, ArrowLeft, ArrowRight } from 'lucide-react';
import { format, addDays, subDays, addWeeks, subWeeks, startOfDay } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { DailyGeneralAnnouncement } from '@/models/announcement';
import { queryFnGetDailyGeneralAnnouncement, onDailyGeneralAnnouncementUpdate } from '@/controllers/timetableController';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useAuth } from '@/contexts/AuthContext'; // Import useAuth
import { InitialChoice } from '@/components/auth/InitialChoice'; // Import InitialChoice

const queryClient = new QueryClient();

function HomePageContent() {
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const [todayStr, setTodayStr] = useState<string>('');
  const [selectedDateForPicker, setSelectedDateForPicker] = useState<Date | undefined>(undefined);
  const [liveGeneralAnnouncement, setLiveGeneralAnnouncement] = useState<DailyGeneralAnnouncement | null>(null);
  
  const { user, loading: authLoading, isAnonymous, setAnonymousAccess } = useAuth(); // Get auth state
  const [showInitialChoice, setShowInitialChoice] = useState(false);


  useEffect(() => {
    const now = startOfDay(new Date());
    setCurrentDate(now);
  }, []);

  useEffect(() => {
    if (currentDate) {
      setTodayStr(format(currentDate, 'yyyy-MM-dd'));
      setSelectedDateForPicker(currentDate);
    } else {
      setSelectedDateForPicker(undefined);
    }
  }, [currentDate]);

  // Determine if initial choice should be shown
  useEffect(() => {
    if (!authLoading) { // Only proceed if auth state is resolved
      const anonymousAccessChosen = localStorage.getItem('classconnect_anonymous_access') === 'true';
      if (!user && !anonymousAccessChosen) {
        setShowInitialChoice(true);
      } else if (anonymousAccessChosen && !isAnonymous) {
        // Sync context if localStorage indicates anonymous but context doesn't (e.g. after refresh)
        setAnonymousAccess(true); 
      }
    }
  }, [user, authLoading, isAnonymous, setAnonymousAccess]);


  const { data: initialGeneralAnnouncement, isLoading: isLoadingGeneral, error: errorGeneral } = useQuery({
    queryKey: ['dailyGeneralAnnouncement', todayStr],
    queryFn: queryFnGetDailyGeneralAnnouncement(todayStr),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: true,
    enabled: !!todayStr && (!!user || isAnonymous), // Fetch only if authenticated or anonymous
  });

  useEffect(() => {
    if (!todayStr || (!user && !isAnonymous)) return; // Don't subscribe if no date or not authenticated/anonymous
    const unsubscribe = onDailyGeneralAnnouncementUpdate(todayStr, (announcement) => {
      setLiveGeneralAnnouncement(announcement);
    }, (error) => {
      console.error("Realtime general announcement error:", error);
    });
    return () => unsubscribe();
  }, [todayStr, user, isAnonymous]);

  const dailyGeneralAnnouncement = liveGeneralAnnouncement ?? initialGeneralAnnouncement;

  const handlePreviousWeek = () => setCurrentDate(prevDate => prevDate ? subWeeks(prevDate, 1) : null);
  const handleNextWeek = () => setCurrentDate(prevDate => prevDate ? addWeeks(prevDate, 1) : null);
  const handlePreviousDay = () => setCurrentDate(prevDate => prevDate ? subDays(prevDate, 1) : null);
  const handleNextDay = () => setCurrentDate(prevDate => prevDate ? addDays(prevDate, 1) : null);
  const handleToday = () => setCurrentDate(startOfDay(new Date()));
  const handleDateSelect = (date: Date | undefined) => {
    if (date) setCurrentDate(startOfDay(date));
    else setCurrentDate(null);
  };

  const handleChoiceMade = () => {
    setShowInitialChoice(false);
  };
  
  // Show loading skeleton or initial choice modal
  if (authLoading || (!user && !isAnonymous && showInitialChoice && !localStorage.getItem('classconnect_anonymous_access'))) {
    return (
      <MainLayout>
        {showInitialChoice && <InitialChoice onChoiceMade={handleChoiceMade} />}
        {!showInitialChoice && ( // Show skeleton if auth is loading but choice modal isn't up
           <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-y-2">
               <Skeleton className="h-8 w-48" />
               <div className="flex items-center gap-1 md:gap-2 flex-wrap justify-center md:justify-end">
                   <Skeleton className="h-9 w-16" />
                   <div className="flex gap-1"><Skeleton className="h-9 w-9" /><Skeleton className="h-9 w-9" /></div>
                   <Skeleton className="h-9 w-28" />
                    <div className="flex gap-1"><Skeleton className="h-9 w-9" /><Skeleton className="h-9 w-9" /></div>
               </div>
           </div>
        )}
        {!showInitialChoice && <Skeleton className="h-32 w-full mb-6" />}
        {!showInitialChoice && <Skeleton className="h-96 w-full" />}
      </MainLayout>
    );
  }
  
  if (!currentDate) { // If date isn't set yet (after auth is resolved)
      return (
         <MainLayout>
           <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-y-2">
               <Skeleton className="h-8 w-48" />
               <div className="flex items-center gap-1 md:gap-2 flex-wrap justify-center md:justify-end">
                   <Skeleton className="h-9 w-16" />
                   <div className="flex gap-1"><Skeleton className="h-9 w-9" /><Skeleton className="h-9 w-9" /></div>
                   <Skeleton className="h-9 w-28" />
                    <div className="flex gap-1"><Skeleton className="h-9 w-9" /><Skeleton className="h-9 w-9" /></div>
               </div>
           </div>
           <Skeleton className="h-32 w-full mb-6" />
           <Skeleton className="h-96 w-full" />
        </MainLayout>
      );
  }


  return (
    <MainLayout>
       {showInitialChoice && <InitialChoice onChoiceMade={handleChoiceMade} />}
       {!showInitialChoice && (
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
                      className={cn("w-[120px] md:w-[150px] justify-center text-center font-normal h-8 px-2", !currentDate && "text-muted-foreground")}
                      disabled={!user && !isAnonymous}
                    >
                      <CalendarIcon className="mr-1 h-4 w-4" />
                      {currentDate ? format(currentDate, "M月d日", { locale: ja }) : <span>日付選択</span>}
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
            <TimetableGrid currentDate={currentDate} />
          </div>
        </>
      )}
    </MainLayout>
  );
}

export default function Home() {
  return (
    <QueryClientProvider client={queryClient}>
      <HomePageContent />
    </QueryClientProvider>
  );
}
