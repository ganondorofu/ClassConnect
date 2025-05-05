
"use client"; // Required for React Query and state hooks

import React, { useState, useEffect } from 'react'; // Import React and useEffect
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout'; // Corrected: Default import
import { TimetableGrid } from '@/components/timetable/TimetableGrid';
import { DailyAnnouncementDisplay } from '@/components/announcements/DailyAnnouncementDisplay'; // Import the new component
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Database, CalendarDays, Loader2 } from 'lucide-react'; // Added Database icon and Loader2
import { format, addWeeks, subWeeks, startOfDay } from 'date-fns';
import { ja } from 'date-fns/locale'; // Import Japanese locale
import { runSeedData } from '@/lib/seedData'; // Import seed function
import { useToast } from '@/hooks/use-toast'; // Import useToast
import { queryFnGetDailyGeneralAnnouncement, onDailyGeneralAnnouncementUpdate } from '@/controllers/timetableController'; // Import functions for general announcements
import type { DailyGeneralAnnouncement } from '@/models/announcement'; // Import the type
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton

// Create a client instance outside the component
const queryClient = new QueryClient();

// Component containing the actual page content and hooks
function HomePageContent() {
   const [currentDate, setCurrentDate] = useState<Date | null>(null); // Initialize with null to prevent hydration mismatch
   const [isSeeding, setIsSeeding] = useState(false);
   const { toast } = useToast();
   const queryClientHook = useQueryClient(); // Now called within the provider context
   const [todayStr, setTodayStr] = useState<string>(''); // State for date string

    // Set currentDate and todayStr on the client after mount
    useEffect(() => {
      const now = startOfDay(new Date());
      setCurrentDate(now);
      setTodayStr(format(now, 'yyyy-MM-dd'));
    }, []);

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

   const handleToday = () => {
       const now = startOfDay(new Date());
       setCurrentDate(now);
       setTodayStr(format(now, 'yyyy-MM-dd'));
   };

   const handleSeedData = async () => {
     if (isSeeding) return;
     setIsSeeding(true);
     toast({ title: "データ投入中...", description: "初期データを登録しています。" });
     try {
       await runSeedData();
       toast({ title: "成功", description: "初期データの投入が完了しました。ページをリロードしてください。" });
       await queryClientHook.invalidateQueries({ queryKey: ['subjects'] });
       await queryClientHook.invalidateQueries({ queryKey: ['fixedTimetable'] });
       await queryClientHook.invalidateQueries({ queryKey: ['timetableSettings'] });
       await queryClientHook.invalidateQueries({ queryKey: ['dailyAnnouncements'] });
       await queryClientHook.invalidateQueries({ queryKey: ['dailyGeneralAnnouncement'] });
     } catch (error) {
       console.error("Seed data error:", error);
       toast({ title: "エラー", description: `初期データの投入中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`, variant: "destructive" });
     } finally {
       setIsSeeding(false);
     }
   };

    // Loading state while currentDate is null
    if (!currentDate) {
        return (
           <MainLayout>
             <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-y-2">
                 <Skeleton className="h-8 w-48" />
                 <div className="flex items-center gap-1 md:gap-2 flex-wrap">
                     <Skeleton className="h-9 w-24" />
                     <Skeleton className="h-9 w-16" />
                     <Skeleton className="h-9 w-9" />
                     <Skeleton className="h-6 w-24" />
                     <Skeleton className="h-9 w-9" />
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
         {/* Use flex-col on small screens and flex-row on medium and up */}
         <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-y-2">
             <h1 className="text-xl md:text-2xl font-semibold">
                クラス時間割・連絡
            </h1>
             {/* Adjust button sizes and text for responsiveness */}
             <div className="flex items-center gap-1 md:gap-2 flex-wrap">
                  {process.env.NODE_ENV === 'development' && (
                     <Button variant="outline" size="sm" onClick={handleSeedData} disabled={isSeeding}>
                       <Database className="mr-1 h-4 w-4" />
                       {isSeeding ? "..." : "初期データ"} {/* Shorten text */}
                     </Button>
                   )}
                 <Button variant="outline" size="sm" onClick={handleToday}>
                     <CalendarDays className="mr-1 h-4 w-4" />
                     今日
                 </Button>
                <Button variant="outline" size="icon" onClick={handlePreviousWeek} aria-label="前の週" className="h-9 w-9 md:h-10 md:w-10">
                     <ChevronLeft className="h-4 w-4" />
                </Button>
                 <span className="text-sm font-medium w-24 md:w-28 text-center">
                     {format(currentDate, 'yyyy年M月', { locale: ja })}
                </span>
                <Button variant="outline" size="icon" onClick={handleNextWeek} aria-label="次の週" className="h-9 w-9 md:h-10 md:w-10">
                     <ChevronRight className="h-4 w-4" />
                 </Button>
            </div>
        </div>
        {/* Display Daily General Announcement */}
        <DailyAnnouncementDisplay
             date={currentDate}
             announcement={dailyGeneralAnnouncement}
             isLoading={isLoadingGeneral || !todayStr} // Also loading if todayStr isn't set
             error={errorGeneral}
         />
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
