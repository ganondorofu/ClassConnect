
"use client"; // Required for React Query and state hooks

import React, { useState, useEffect } from 'react'; // Import React and useEffect
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout'; // Corrected: Default import
import { TimetableGrid } from '@/components/timetable/TimetableGrid';
import { DailyAnnouncementDisplay } from '@/components/announcements/DailyAnnouncementDisplay'; // Import the new component
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, CalendarDays, RotateCcw, ArrowLeft, ArrowRight } from 'lucide-react'; // Added ArrowLeft, ArrowRight, RotateCcw
import { format, addDays, subDays, addWeeks, subWeeks, startOfDay } from 'date-fns';
import { ja } from 'date-fns/locale'; // Import Japanese locale
import { useToast } from '@/hooks/use-toast'; // Import useToast
import { queryFnGetDailyGeneralAnnouncement, onDailyGeneralAnnouncementUpdate } from '@/controllers/timetableController'; // Import functions for general announcements
import type { DailyGeneralAnnouncement } from '@/models/announcement'; // Import the type
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"; // Import Popover
import { Calendar } from "@/components/ui/calendar"; // Import Calendar
import { cn } from "@/lib/utils"; // Import cn utility

// Create a client instance outside the component
const queryClient = new QueryClient();

// Component containing the actual page content and hooks
function HomePageContent() {
   const [currentDate, setCurrentDate] = useState<Date | null>(null); // Initialize with null to prevent hydration mismatch
   const { toast } = useToast();
   const queryClientHook = useQueryClient(); // Now called within the provider context
   const [todayStr, setTodayStr] = useState<string>(''); // State for date string
   const [selectedDateForPicker, setSelectedDateForPicker] = useState<Date | undefined>(undefined); // Initialize calendar picker state

    // Set currentDate and todayStr on the client after mount
    useEffect(() => {
      const now = startOfDay(new Date());
      setCurrentDate(now);
      // No need to set todayStr here, useEffect below handles it
      // setSelectedDateForPicker is also handled below
    }, []);

    // Update todayStr and picker state when currentDate changes
    useEffect(() => {
        if (currentDate) {
          setTodayStr(format(currentDate, 'yyyy-MM-dd'));
          setSelectedDateForPicker(currentDate); // Sync picker state
        } else {
           // If currentDate is null (initial state), set picker to undefined
           setSelectedDateForPicker(undefined);
        }
    }, [currentDate]);


    // --- Fetch and Subscribe to Daily General Announcement ---
    const [liveGeneralAnnouncement, setLiveGeneralAnnouncement] = useState<DailyGeneralAnnouncement | null>(null);

    // Use todayStr in queryKey and enable only when todayStr is set
    const { data: initialGeneralAnnouncement, isLoading: isLoadingGeneral, error: errorGeneral } = useQuery({
      queryKey: ['dailyGeneralAnnouncement', todayStr],
      queryFn: queryFnGetDailyGeneralAnnouncement(todayStr),
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: true,
      enabled: !!todayStr, // Only fetch when todayStr is available
    });

    useEffect(() => {
        if (!todayStr) return; // Don't subscribe until date is set
        const unsubscribe = onDailyGeneralAnnouncementUpdate(todayStr, (announcement) => {
            setLiveGeneralAnnouncement(announcement);
        }, (error) => {
            console.error("Realtime general announcement error:", error);
            // Optionally show an error toast
        });
        return () => unsubscribe();
    }, [todayStr]); // Depend on todayStr

    const dailyGeneralAnnouncement = liveGeneralAnnouncement ?? initialGeneralAnnouncement;
    // --- End Fetch and Subscribe ---


   const handlePreviousWeek = () => {
     setCurrentDate(prevDate => prevDate ? subWeeks(prevDate, 1) : null);
   };

   const handleNextWeek = () => {
     setCurrentDate(prevDate => prevDate ? addWeeks(prevDate, 1) : null);
   };

    const handlePreviousDay = () => {
        setCurrentDate(prevDate => prevDate ? subDays(prevDate, 1) : null);
    };

    const handleNextDay = () => {
        setCurrentDate(prevDate => prevDate ? addDays(prevDate, 1) : null);
    };

   const handleToday = () => {
       const now = startOfDay(new Date());
       setCurrentDate(now);
      // todayStr will be updated by the useEffect depending on currentDate
   };

    const handleDateSelect = (date: Date | undefined) => {
        if (date) {
            const selectedDayStart = startOfDay(date);
            setCurrentDate(selectedDayStart);
            // No need to set picker state here, useEffect handles it
        } else {
            // Handle case where date is cleared (optional)
            setCurrentDate(null);
        }
        // Close popover after selection (optional) - requires managing Popover open state
   };


    // Loading state while currentDate is null (only on initial client load)
    if (!currentDate) {
        return (
           <MainLayout>
             <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-y-2">
                 <Skeleton className="h-8 w-48" />
                 <div className="flex items-center gap-1 md:gap-2 flex-wrap justify-center md:justify-end">
                     <Skeleton className="h-9 w-16" />
                     <div className="flex gap-1"> {/* Group daily nav */}
                         <Skeleton className="h-9 w-9" />
                         <Skeleton className="h-9 w-9" />
                     </div>
                     <Skeleton className="h-9 w-28" /> {/* Placeholder for Date Picker */}
                      <div className="flex gap-1"> {/* Group weekly nav */}
                         <Skeleton className="h-9 w-9" />
                         <Skeleton className="h-9 w-9" />
                      </div>
                 </div>
             </div>
             <Skeleton className="h-32 w-full mb-6" />
             <Skeleton className="h-96 w-full" />
          </MainLayout>
        );
    }

   // Now that currentDate is guaranteed to be a Date object, render the main content
   return (
      <MainLayout>
         {/* Navigation and Header */}
         <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-y-2">
             <h1 className="text-xl md:text-2xl font-semibold">
                クラス時間割・連絡
            </h1>
            {/* Navigation Buttons - Grouped for clarity */}
             <div className="flex items-center gap-1 md:gap-2 flex-wrap justify-center md:justify-end">
                   {/* Today Button */}
                 <Button variant="outline" size="sm" onClick={handleToday}>
                     <RotateCcw className="mr-1 h-4 w-4" /> {/* Changed icon */}
                     今日
                 </Button>

                 {/* Daily Navigation */}
                 <div className="flex items-center gap-1 border rounded-md p-0.5">
                    <Button variant="ghost" size="icon" onClick={handlePreviousDay} aria-label="前の日" className="h-8 w-8">
                         <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                            variant={"ghost"} // Changed variant to ghost to fit group
                            className={cn(
                                "w-[120px] md:w-[150px] justify-center text-center font-normal h-8 px-2", // Adjusted width, height, padding
                                !currentDate && "text-muted-foreground"
                            )}
                            >
                            <CalendarIcon className="mr-1 h-4 w-4" />
                            {currentDate ? format(currentDate, "M月d日", { locale: ja }) : <span>日付選択</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar
                            mode="single"
                            selected={selectedDateForPicker}
                            onSelect={handleDateSelect}
                            initialFocus
                            locale={ja} // Set locale for calendar display
                            />
                        </PopoverContent>
                    </Popover>
                    <Button variant="ghost" size="icon" onClick={handleNextDay} aria-label="次の日" className="h-8 w-8">
                         <ArrowRight className="h-4 w-4" />
                    </Button>
                 </div>

                 {/* Weekly Navigation */}
                 <div className="flex items-center gap-1 border rounded-md p-0.5">
                     <Button variant="ghost" size="icon" onClick={handlePreviousWeek} aria-label="前の週" className="h-8 w-8">
                         <ChevronLeft className="h-4 w-4" />
                         <span className="sr-only">前の週</span>
                    </Button>
                    <span className="text-xs px-1 text-muted-foreground">週</span>
                     <Button variant="ghost" size="icon" onClick={handleNextWeek} aria-label="次の週" className="h-8 w-8">
                         <ChevronRight className="h-4 w-4" />
                          <span className="sr-only">次の週</span>
                     </Button>
                 </div>
            </div>
        </div>

        {/* Display Daily General Announcement */}
        <DailyAnnouncementDisplay
             date={currentDate}
             announcement={dailyGeneralAnnouncement}
             isLoading={isLoadingGeneral || !todayStr} // Also loading if todayStr isn't set
             error={errorGeneral}
         />

        {/* Timetable Grid */}
        <div className="mt-6"> {/* Add margin top to separate from announcement */}
           <TimetableGrid currentDate={currentDate} />
        </div>
      </MainLayout>
   );
}

// The main exported component now only sets up the QueryClientProvider
export default function Home() {
  return (
    <QueryClientProvider client={queryClient}>
      <HomePageContent />
    </QueryClientProvider>
  );
}
