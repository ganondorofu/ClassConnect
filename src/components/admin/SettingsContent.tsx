'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { queryFnGetTimetableSettings, updateTimetableSettings, onTimetableSettingsUpdate, queryFnGetFixedTimetable, batchUpdateFixedTimetable } from '@/controllers/timetableController';
import { queryFnGetSubjects, onSubjectsUpdate } from '@/controllers/subjectController';
import type { TimetableSettings, FixedTimeSlot, DayOfWeek } from '@/models/timetable';
import type { Subject } from '@/models/subject';
import { DEFAULT_TIMETABLE_SETTINGS, WeekDays, getDayOfWeekName } from '@/models/timetable';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, WifiOff, Save } from 'lucide-react';
import { SubjectSelector } from '@/components/timetable/SubjectSelector';

// This component contains the core logic previously in SettingsPageContent
export default function SettingsContent() {
//   const { toast } = useToast();
//   const queryClientHook = useQueryClient(); // Hook to invalidate queries

//   // --- State for General Settings ---
//   const [numberOfPeriods, setNumberOfPeriods] = useState<number | string>(DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods);
//   const [isOffline, setIsOffline] = useState(false); // State to track offline status
//   const [liveSettings, setLiveSettings] = useState<TimetableSettings | null>(null);

//   // --- State for Fixed Timetable Editor ---
//   const [editedFixedTimetable, setEditedFixedTimetable] = useState<FixedTimeSlot[]>([]);
//   const [initialFixedTimetableData, setInitialFixedTimetableData] = useState<FixedTimeSlot[]>([]); // Store initial data for comparison

//   // --- State for Subjects ---
//   const [liveSubjects, setLiveSubjects] = useState<Subject[]>([]);

//     // --- Check Online Status ---
//     useEffect(() => {
//         const handleOnline = () => setIsOffline(false);
//         const handleOffline = () => setIsOffline(true);

//         // Initial check
//         if (typeof navigator !== 'undefined') {
//             setIsOffline(!navigator.onLine);
//         }

//         window.addEventListener('online', handleOnline);
//         window.addEventListener('offline', handleOffline);

//         return () => {
//             window.removeEventListener('online', handleOnline);
//             window.removeEventListener('offline', handleOffline);
//         };
//     }, []);

//      const handleQueryError = (queryKey: string) => (error: unknown) => {
//         console.error(`Settings Query Error (${queryKey}):`, error);
//         const isOfflineError = (error as any)?.code === 'unavailable';
//         setIsOffline(isOfflineError || !navigator.onLine); // Update offline state based on error
//         // Don't toast here, let individual components show errors
//     };

//   // Fetch initial settings
//   const { data: initialSettings, isLoading: isLoadingSettings, error: errorSettings } = useQuery({
//     queryKey: ['timetableSettings'],
//     queryFn: queryFnGetTimetableSettings,
//     staleTime: Infinity, // Fetch once and rely on realtime updates
//     refetchOnWindowFocus: false,
//     onError: handleQueryError('timetableSettings'),
//     enabled: !isOffline, // Only enable query if initially online
//     refetchOnMount: true, // Refetch on mount to check connectivity
//   });

//    // --- Realtime Subscription for Settings ---
//   useEffect(() => {
//      if (isOffline) {
//         console.warn("Offline: Skipping settings realtime subscription.");
//         return;
//      }
//     const unsubscribe = onTimetableSettingsUpdate((settings) => {
//       console.log("Realtime settings update received:", settings);
//       setLiveSettings(settings);
//       setIsOffline(false); // Got data, assume online
//        if (settings?.numberOfPeriods !== undefined) {
//         setNumberOfPeriods(settings.numberOfPeriods);
//       }
//     }, (error) => {
//         console.error("Realtime settings error:", error);
//         setIsOffline(true);
//     });
//     return () => unsubscribe(); // Cleanup subscription on unmount
//   }, [isOffline]);

//    // Merge initial and live data for Settings
//   const settings = useMemo(() => liveSettings ?? initialSettings ?? DEFAULT_TIMETABLE_SETTINGS, [liveSettings, initialSettings]);


//    // Update local state when settings data is loaded/updated
//   useEffect(() => {
//       if (settings?.numberOfPeriods !== undefined && (numberOfPeriods === DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods || numberOfPeriods === '')) {
//        setNumberOfPeriods(settings.numberOfPeriods);
//      }
//   }, [settings]); // Depend on the merged settings


//   // --- Fetching Fixed Timetable ---
//   const { data: fetchedFixedTimetable, isLoading: isLoadingFixed, error: errorFixed } = useQuery({
//     queryKey: ['fixedTimetable'],
//     queryFn: queryFnGetFixedTimetable,
//     staleTime: 1000 * 60 * 5, // 5 minutes
//     refetchOnWindowFocus: false,
//     onError: handleQueryError('fixedTimetable'),
//     enabled: !isOffline && !!settings, // Enable only when online and settings are loaded
//     refetchOnMount: true,
//   });

//   // --- Fetching Subjects ---
//    const { data: initialSubjects, isLoading: isLoadingSubjects, error: errorSubjects } = useQuery({
//      queryKey: ['subjects'],
//      queryFn: queryFnGetSubjects,
//      staleTime: 1000 * 60 * 15, // 15 minutes
//      refetchOnWindowFocus: false,
//      onError: handleQueryError('subjects'),
//      enabled: !isOffline,
//      refetchOnMount: true,
//    });

//    // --- Realtime Subscription for Subjects ---
//     useEffect(() => {
//         if (isOffline) return;
//         const unsubscribe = onSubjectsUpdate((subs) => {
//         setLiveSubjects(subs);
//         setIsOffline(false);
//         }, (error) => {
//         console.error("Realtime subjects error:", error);
//         setIsOffline(true);
//         });
//         return () => unsubscribe();
//     }, [isOffline]);

//     // Merge initial and live subjects data
//     const subjects = useMemo(() => liveSubjects.length > 0 ? liveSubjects : initialSubjects ?? [], [liveSubjects, initialSubjects]);


//    // --- Initialize and Manage Edited Fixed Timetable State ---
//    useEffect(() => {
//        if (fetchedFixedTimetable && settings) {
//            // Generate a complete grid based on settings, filled with fetched data or defaults
//            const completeTimetable: FixedTimeSlot[] = [];
//            (settings.activeDays ?? WeekDays).forEach(day => { // Use active days from settings or default WeekDays
//                for (let period = 1; period <= settings.numberOfPeriods; period++) {
//                    const existingSlot = fetchedFixedTimetable.find(slot => slot.day === day && slot.period === period);
//                    completeTimetable.push(existingSlot ?? {
//                        id: `${day}_${period}`, // Generate ID if missing
//                        day,
//                        period,
//                        subjectId: null, // Default to null
//                    });
//                }
//            });
//            setEditedFixedTimetable(completeTimetable);
//            setInitialFixedTimetableData(completeTimetable); // Store the initial state for comparison
//        } else if (settings && !fetchedFixedTimetable && !isLoadingFixed) {
//             // Handle case where fetch completes but returns empty/null, generate default grid
//             const defaultGrid: FixedTimeSlot[] = [];
//             (settings.activeDays ?? WeekDays).forEach(day => {
//                 for (let period = 1; period <= settings.numberOfPeriods; period++) {
//                     defaultGrid.push({
//                        id: `${day}_${period}`,
//                        day,
//                        period,
//                        subjectId: null,
//                     });
//                 }
//             });
//            setEditedFixedTimetable(defaultGrid);
//            setInitialFixedTimetableData(defaultGrid);
//        }
//    }, [fetchedFixedTimetable, settings, isLoadingFixed]); // Re-run when fetched data or settings change


//   // --- Mutation for Updating General Settings ---
//   const settingsMutation = useMutation({
//     mutationFn: updateTimetableSettings,
//     onSuccess: async () => {
//       toast({
//         title: "成功",
//         description: "基本設定を更新しました。",
//       });
//       // Invalidate query to refetch, although realtime should update it
//       await queryClientHook.invalidateQueries({ queryKey: ['timetableSettings'] });
//       await queryClientHook.invalidateQueries({ queryKey: ['fixedTimetable'] }); // Invalidate fixed timetable too
//     },
//     onError: (error: Error) => {
//       console.error("Failed to update settings:", error);
//       const isOfflineError = error.message.includes("オフラインのため"); // Check specific error message from controller
//       setIsOffline(isOfflineError || !navigator.onLine);
//       toast({
//         title: isOfflineError ? "オフライン" : "エラー",
//         description: isOfflineError ? "設定の更新に失敗しました。接続を確認してください。" : `設定の更新に失敗しました: ${error.message}`,
//         variant: "destructive",
//       });
//     },
//   });

//   // --- Mutation for Updating Fixed Timetable ---
//   const fixedTimetableMutation = useMutation({
//     mutationFn: batchUpdateFixedTimetable,
//     onSuccess: async () => {
//         toast({
//             title: "成功",
//             description: "固定時間割を更新しました。",
//         });
//         // Update initial data state after successful save
//         setInitialFixedTimetableData([...editedFixedTimetable]);
//          // Optionally refetch or invalidate, though batch update is the source of truth now
//          await queryClientHook.invalidateQueries({ queryKey: ['fixedTimetable'] });
//          // Trigger applying changes to future
//          // No need to explicitly call applyFixedTimetableForFuture here, as batchUpdateFixedTimetable handles it internally.
//     },
//     onError: (error: Error) => {
//         console.error("Failed to update fixed timetable:", error);
//         const isOfflineError = error.message.includes("オフラインのため");
//         setIsOffline(isOfflineError || !navigator.onLine);
//         toast({
//             title: isOfflineError ? "オフライン" : "エラー",
//             description: isOfflineError ? "固定時間割の更新に失敗しました。接続を確認してください。" : `固定時間割の更新に失敗しました: ${error.message}`,
//             variant: "destructive",
//         });
//     },
//   });


//   const handleSaveSettings = () => {
//     if (isOffline) {
//       toast({ title: "オフライン", description: "設定を保存できません。", variant: "destructive" });
//       return;
//     }
//     const periods = parseInt(String(numberOfPeriods), 10);
//     if (isNaN(periods) || periods < 1 || periods > 12) {
//       toast({ title: "入力エラー", description: "1日の時間数は1から12の間で入力してください。", variant: "destructive" });
//       return;
//     }
//      // Only mutate if the value has changed
//      if (settings && periods !== settings.numberOfPeriods) {
//         settingsMutation.mutate({ numberOfPeriods: periods });
//      } else if (!settings) {
//          settingsMutation.mutate({ numberOfPeriods: periods });
//      } else {
//          toast({ title: "情報", description: "基本設定に変更はありませんでした。" });
//      }
//   };

//   const handlePeriodsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//       const value = e.target.value;
//       if (value === '') {
//           setNumberOfPeriods('');
//       } else {
//           const numValue = parseInt(value, 10);
//           setNumberOfPeriods(isNaN(numValue) ? value : numValue);
//       }
//   };

//   const handleSubjectChange = (day: DayOfWeek, period: number, newSubjectId: string | null) => {
//     setEditedFixedTimetable(currentTimetable =>
//         currentTimetable.map(slot =>
//             slot.day === day && slot.period === period
//                 ? { ...slot, subjectId: newSubjectId } // Update subjectId
//                 : slot
//         )
//     );
//   };

//   const handleSaveFixedTimetable = () => {
//       if (isOffline) {
//         toast({ title: "オフライン", description: "固定時間割を保存できません。", variant: "destructive" });
//         return;
//       }
//       // Filter out potential undefined slots just in case, though initialization should prevent this
//       const validSlots = editedFixedTimetable.filter(slot => slot?.id && slot?.day && slot?.period !== undefined);
//       fixedTimetableMutation.mutate(validSlots);
//   };

//    const showLoadingSettings = isLoadingSettings && !isOffline;
//    const showErrorSettings = errorSettings && !isOffline;
//    const showLoadingFixed = isLoadingFixed && !isOffline;
//    const showErrorFixed = errorFixed && !isOffline;
//    const showLoadingSubjects = isLoadingSubjects && !isOffline;
//    const showErrorSubjects = errorSubjects && !isOffline;


//     // Calculate if fixed timetable has changes
//    const hasFixedTimetableChanged = useMemo(() => {
//        if (editedFixedTimetable.length !== initialFixedTimetableData.length) return true;
//        // Deep comparison needed
//        return JSON.stringify(editedFixedTimetable) !== JSON.stringify(initialFixedTimetableData);
//    }, [editedFixedTimetable, initialFixedTimetableData]);

   // Return the actual JSX
   return (
     <div> {/* Wrap content in a div */}
       <h1 className="text-2xl font-semibold mb-6">設定</h1>

        {/* --- Basic Settings Card --- */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>基本設定</CardTitle>
            <CardDescription>クラスの1日の時間数を設定します。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Placeholder content */}
            <p>Loading settings...</p>
          </CardContent>
          <CardFooter>
            <Button disabled>
              <Save className="mr-2 h-4 w-4" />
              基本設定を保存
            </Button>
          </CardFooter>
        </Card>

        {/* --- Fixed Timetable Card --- */}
        <Card>
          <CardHeader>
            <CardTitle>固定時間割の設定</CardTitle>
            <CardDescription>月曜日から金曜日までの基本的な時間割を設定します。</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Placeholder content */}
            <p>Loading fixed timetable editor...</p>
          </CardContent>
          <CardFooter>
            <Button disabled>
              <Save className="mr-2 h-4 w-4" />
              固定時間割を保存
            </Button>
          </CardFooter>
        </Card>
     </div>
   );
 }
