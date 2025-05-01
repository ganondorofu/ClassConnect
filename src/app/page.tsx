
"use client"; // Required for React Query and state hooks

import React, { useState } from 'react'; // Import React
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout'; // Corrected: Default import
import { TimetableGrid } from '@/components/timetable/TimetableGrid';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Database } from 'lucide-react'; // Added Database icon
import { format, addWeeks, subWeeks } from 'date-fns';
import { ja } from 'date-fns/locale'; // Import Japanese locale
import { runSeedData } from '@/lib/seedData'; // Import seed function
import { useToast } from '@/hooks/use-toast'; // Import useToast

// Create a client instance outside the component
const queryClient = new QueryClient();

// Component containing the actual page content and hooks
function HomePageContent() {
   const [currentDate, setCurrentDate] = useState(() => new Date());
   const [isSeeding, setIsSeeding] = useState(false);
   const { toast } = useToast();
   const queryClientHook = useQueryClient(); // Now called within the provider context

   const handlePreviousWeek = () => {
     setCurrentDate(prevDate => subWeeks(prevDate, 1));
   };

   const handleNextWeek = () => {
     setCurrentDate(prevDate => addWeeks(prevDate, 1));
   };

   const handleToday = () => {
       setCurrentDate(new Date());
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
     } catch (error) {
       console.error("Seed data error:", error);
       toast({ title: "エラー", description: `初期データの投入中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`, variant: "destructive" });
     } finally {
       setIsSeeding(false);
     }
   };

   return (
      <MainLayout>
         <div className="flex justify-between items-center mb-4">
             <h1 className="text-2xl font-semibold">
                クラス時間割・連絡
            </h1>
             <div className="flex items-center gap-2">
                  {process.env.NODE_ENV === 'development' && (
                     <Button variant="outline" size="sm" onClick={handleSeedData} disabled={isSeeding}>
                       <Database className="mr-2 h-4 w-4" />
                       {isSeeding ? "投入中..." : "初期データ投入"}
                     </Button>
                   )}
                 <Button variant="outline" size="sm" onClick={handleToday}>
                     今日
                 </Button>
                <Button variant="outline" size="icon" onClick={handlePreviousWeek} aria-label="前の週">
                     <ChevronLeft className="h-4 w-4" />
                </Button>
                 <span className="text-sm font-medium w-28 text-center">
                     {format(currentDate, 'yyyy年M月', { locale: ja })}
                </span>
                <Button variant="outline" size="icon" onClick={handleNextWeek} aria-label="次の週">
                     <ChevronRight className="h-4 w-4" />
                 </Button>
            </div>
        </div>
        <TimetableGrid currentDate={currentDate} />
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
