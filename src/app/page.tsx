
"use client"; // Required for React Query and state hooks

import React, { useState } from 'react'; // Import React
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout'; // Corrected: Default import
import { TimetableGrid } from '@/components/timetable/TimetableGrid';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addWeeks, subWeeks } from 'date-fns';
import { ja } from 'date-fns/locale'; // Import Japanese locale

// Create a client
const queryClient = new QueryClient();

export default function Home() {
   // Initialize state with current date, run only on client
   const [currentDate, setCurrentDate] = useState(() => new Date());

   const handlePreviousWeek = () => {
     setCurrentDate(prevDate => subWeeks(prevDate, 1));
   };

   const handleNextWeek = () => {
     setCurrentDate(prevDate => addWeeks(prevDate, 1));
   };

   const handleToday = () => {
       setCurrentDate(new Date());
   };


  return (
    <QueryClientProvider client={queryClient}>
      <MainLayout>
         <div className="flex justify-between items-center mb-4">
             <h1 className="text-2xl font-semibold">
                クラス時間割・連絡
            </h1>
            <div className="flex items-center gap-2">
                 <Button variant="outline" size="sm" onClick={handleToday}>
                     今日
                 </Button>
                <Button variant="outline" size="icon" onClick={handlePreviousWeek} aria-label="前の週">
                     <ChevronLeft className="h-4 w-4" />
                </Button>
                 <span className="text-sm font-medium w-28 text-center">
                     {format(currentDate, 'yyyy年M月', { locale: ja })} {/* Display current month */}
                </span>
                <Button variant="outline" size="icon" onClick={handleNextWeek} aria-label="次の週">
                     <ChevronRight className="h-4 w-4" />
                 </Button>
            </div>
        </div>
        <TimetableGrid currentDate={currentDate} />
      </MainLayout>
    </QueryClientProvider>
  );
}

