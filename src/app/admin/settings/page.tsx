
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'; // Import Table components
import { queryFnGetTimetableSettings, updateTimetableSettings, onTimetableSettingsUpdate, queryFnGetFixedTimetable, batchUpdateFixedTimetable } from '@/controllers/timetableController';
import type { TimetableSettings, FixedTimeSlot, DayOfWeek } from '@/models/timetable';
import { DEFAULT_TIMETABLE_SETTINGS, WeekDays, AllDays } from '@/models/timetable'; // Import WeekDays
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'; // Import Alert
import { AlertCircle, WifiOff, Save } from 'lucide-react'; // Import WifiOff and Save icon

// Re-export QueryClientProvider for client components using queries
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const queryClient = new QueryClient();


function SettingsPageContent() {
  const { toast } = useToast();
  const queryClientHook = useQueryClient(); // Hook to invalidate queries

  // --- State for General Settings ---
  const [numberOfPeriods, setNumberOfPeriods] = useState<number | string>(DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods);
  const [isOffline, setIsOffline] = useState(false); // State to track offline status
  const [liveSettings, setLiveSettings] = useState<TimetableSettings | null>(null);

  // --- State for Fixed Timetable Editor ---
  const [editedFixedTimetable, setEditedFixedTimetable] = useState<FixedTimeSlot[]>([]);
  const [initialFixedTimetableData, setInitialFixedTimetableData] = useState<FixedTimeSlot[]>([]); // Store initial data for comparison


    // --- Check Online Status ---
    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);

        // Initial check
        if (typeof navigator !== 'undefined') {
            setIsOffline(!navigator.onLine);
        }

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

     const handleQueryError = (queryKey: string) => (error: unknown) => {
        console.error(`Settings Query Error (${queryKey}):`, error);
        const isOfflineError = (error as any)?.code === 'unavailable';
        setIsOffline(isOfflineError || !navigator.onLine); // Update offline state based on error
        toast({
            title: isOfflineError ? "オフライン" : "エラー",
            description: isOfflineError
                ? `設定 (${queryKey}) の取得に失敗しました。接続を確認してください。`
                : `設定 (${queryKey}) の読み込み中にエラーが発生しました。`,
            variant: "destructive",
        });
    };

  // Fetch initial settings
  const { data: initialSettings, isLoading: isLoadingSettings, error: errorSettings } = useQuery({
    queryKey: ['timetableSettings'],
    queryFn: queryFnGetTimetableSettings,
    staleTime: Infinity, // Fetch once and rely on realtime updates
    refetchOnWindowFocus: false,
    onError: handleQueryError('timetableSettings'),
    enabled: !isOffline, // Only enable query if initially online
    refetchOnMount: true, // Refetch on mount to check connectivity
  });

   // --- Realtime Subscription for Settings ---
  useEffect(() => {
     if (isOffline) {
        console.warn("Offline: Skipping settings realtime subscription.");
        return;
     }
    const unsubscribe = onTimetableSettingsUpdate((settings) => {
      console.log("Realtime settings update received:", settings);
      setLiveSettings(settings);
      setIsOffline(false); // Got data, assume online
       if (settings?.numberOfPeriods !== undefined) {
        setNumberOfPeriods(settings.numberOfPeriods);
      }
    }, (error) => {
        console.error("Realtime settings error:", error);
        setIsOffline(true);
    });
    return () => unsubscribe(); // Cleanup subscription on unmount
  }, [isOffline]);

   // Merge initial and live data for Settings
  const settings = useMemo(() => liveSettings ?? initialSettings ?? DEFAULT_TIMETABLE_SETTINGS, [liveSettings, initialSettings]);


   // Update local state when settings data is loaded/updated
  useEffect(() => {
      if (settings?.numberOfPeriods !== undefined && (numberOfPeriods === DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods || numberOfPeriods === '')) {
       setNumberOfPeriods(settings.numberOfPeriods);
     }
  }, [settings]); // Depend on the merged settings


  // --- Fetching Fixed Timetable ---
  const { data: fetchedFixedTimetable, isLoading: isLoadingFixed, error: errorFixed } = useQuery({
    queryKey: ['fixedTimetable'],
    queryFn: queryFnGetFixedTimetable,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
    onError: handleQueryError('fixedTimetable'),
    enabled: !isOffline && !!settings, // Enable only when online and settings are loaded
    refetchOnMount: true,
  });

   // --- Initialize and Manage Edited Fixed Timetable State ---
   useEffect(() => {
       if (fetchedFixedTimetable && settings) {
           // Generate a complete grid based on settings, filled with fetched data or defaults
           const completeTimetable: FixedTimeSlot[] = [];
           WeekDays.forEach(day => { // Only active days (Mon-Fri typically)
               for (let period = 1; period <= settings.numberOfPeriods; period++) {
                   const existingSlot = fetchedFixedTimetable.find(slot => slot.day === day && slot.period === period);
                   completeTimetable.push(existingSlot ?? {
                       id: `${day}_${period}`, // Generate ID if missing
                       day,
                       period,
                       subject: '', // Default to empty string
                   });
               }
           });
           setEditedFixedTimetable(completeTimetable);
           setInitialFixedTimetableData(completeTimetable); // Store the initial state for comparison
       } else if (settings && !fetchedFixedTimetable && !isLoadingFixed) {
            // Handle case where fetch completes but returns empty/null, generate default grid
            const defaultGrid: FixedTimeSlot[] = [];
            WeekDays.forEach(day => {
                for (let period = 1; period <= settings.numberOfPeriods; period++) {
                    defaultGrid.push({
                       id: `${day}_${period}`,
                       day,
                       period,
                       subject: '',
                    });
                }
            });
           setEditedFixedTimetable(defaultGrid);
           setInitialFixedTimetableData(defaultGrid);
       }
   }, [fetchedFixedTimetable, settings, isLoadingFixed]); // Re-run when fetched data or settings change


  // --- Mutation for Updating General Settings ---
  const settingsMutation = useMutation({
    mutationFn: updateTimetableSettings,
    onSuccess: async () => {
      toast({
        title: "成功",
        description: "基本設定を更新しました。",
      });
      // Invalidate query to refetch, although realtime should update it
      await queryClientHook.invalidateQueries({ queryKey: ['timetableSettings'] });
      await queryClientHook.invalidateQueries({ queryKey: ['fixedTimetable'] }); // Invalidate fixed timetable too
    },
    onError: (error: Error) => {
      console.error("Failed to update settings:", error);
      const isOfflineError = error.message.includes("オフラインのため"); // Check specific error message from controller
      setIsOffline(isOfflineError || !navigator.onLine);
      toast({
        title: isOfflineError ? "オフライン" : "エラー",
        description: isOfflineError ? "設定の更新に失敗しました。接続を確認してください。" : `設定の更新に失敗しました: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // --- Mutation for Updating Fixed Timetable ---
  const fixedTimetableMutation = useMutation({
    mutationFn: batchUpdateFixedTimetable,
    onSuccess: async () => {
        toast({
            title: "成功",
            description: "固定時間割を更新しました。",
        });
        // Update initial data state after successful save
        setInitialFixedTimetableData([...editedFixedTimetable]);
         // Optionally refetch or invalidate, though batch update is the source of truth now
         await queryClientHook.invalidateQueries({ queryKey: ['fixedTimetable'] });
    },
    onError: (error: Error) => {
        console.error("Failed to update fixed timetable:", error);
        const isOfflineError = error.message.includes("オフラインのため");
        setIsOffline(isOfflineError || !navigator.onLine);
        toast({
            title: isOfflineError ? "オフライン" : "エラー",
            description: isOfflineError ? "固定時間割の更新に失敗しました。接続を確認してください。" : `固定時間割の更新に失敗しました: ${error.message}`,
            variant: "destructive",
        });
    },
  });


  const handleSaveSettings = () => {
    if (isOffline) {
      toast({ title: "オフライン", description: "設定を保存できません。", variant: "destructive" });
      return;
    }
    const periods = parseInt(String(numberOfPeriods), 10);
    if (isNaN(periods) || periods < 1 || periods > 12) {
      toast({ title: "入力エラー", description: "1日の時間数は1から12の間で入力してください。", variant: "destructive" });
      return;
    }
     // Only mutate if the value has changed
     if (settings && periods !== settings.numberOfPeriods) {
        settingsMutation.mutate({ numberOfPeriods: periods });
     } else if (!settings) {
         settingsMutation.mutate({ numberOfPeriods: periods });
     } else {
         toast({ title: "情報", description: "基本設定に変更はありませんでした。" });
     }
  };

  const handlePeriodsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (value === '') {
          setNumberOfPeriods('');
      } else {
          const numValue = parseInt(value, 10);
          setNumberOfPeriods(isNaN(numValue) ? value : numValue);
      }
  };

  const handleSubjectChange = (day: DayOfWeek, period: number, newSubject: string) => {
    setEditedFixedTimetable(currentTimetable =>
        currentTimetable.map(slot =>
            slot.day === day && slot.period === period
                ? { ...slot, subject: newSubject }
                : slot
        )
    );
  };

  const handleSaveFixedTimetable = () => {
      if (isOffline) {
        toast({ title: "オフライン", description: "固定時間割を保存できません。", variant: "destructive" });
        return;
      }
      // Filter out potential undefined slots just in case, though initialization should prevent this
      const validSlots = editedFixedTimetable.filter(slot => slot.id && slot.day && slot.period !== undefined);
      fixedTimetableMutation.mutate(validSlots);
  };

   const showLoadingSettings = isLoadingSettings && !isOffline;
   const showErrorSettings = errorSettings && !isOffline;
   const showLoadingFixed = isLoadingFixed && !isOffline;
   const showErrorFixed = errorFixed && !isOffline;

    // Calculate if fixed timetable has changes
   const hasFixedTimetableChanged = useMemo(() => {
       if (editedFixedTimetable.length !== initialFixedTimetableData.length) return true;
       // Deep comparison needed
       return JSON.stringify(editedFixedTimetable) !== JSON.stringify(initialFixedTimetableData);
   }, [editedFixedTimetable, initialFixedTimetableData]);

  return (
    <MainLayout>
      <h1 className="text-2xl font-semibold mb-6">設定</h1>

       {/* Offline Indicator */}
        {isOffline && (
          <Alert variant="destructive" className="mb-6">
            <WifiOff className="h-4 w-4" />
            <AlertTitle>オフライン</AlertTitle>
            <AlertDescription>
              現在オフラインです。設定の表示や変更はできません。接続が回復するまでお待ちください。
            </AlertDescription>
          </Alert>
        )}

      {/* --- Basic Settings Card --- */}
      <Card className={`mb-6 ${isOffline ? 'opacity-50 pointer-events-none' : ''}`}>
        <CardHeader>
          <CardTitle>基本設定</CardTitle>
          <CardDescription>クラスの1日の時間数を設定します。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {showLoadingSettings ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : showErrorSettings ? (
             <Alert variant="destructive">
                 <AlertCircle className="h-4 w-4" />
                  <AlertTitle>エラー</AlertTitle>
                 <AlertDescription>
                     基本設定の読み込みに失敗しました。 (エラー: {String(errorSettings)})
                 </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="numberOfPeriods">1日の時間数 (時限)</Label>
              <Input
                id="numberOfPeriods"
                type="number"
                min="1"
                max="12" // Example max limit
                value={numberOfPeriods === '' ? '' : String(numberOfPeriods)}
                onChange={handlePeriodsChange}
                placeholder={`例: ${DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods}`}
                disabled={settingsMutation.isPending || isOffline}
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground">
                 時間数を変更すると、下の固定時間割表の行数が自動的に調整されます。
              </p>
            </div>
          )}
        </CardContent>
        <CardFooter>
           <Button
                onClick={handleSaveSettings}
                disabled={
                     showLoadingSettings ||
                     settingsMutation.isPending ||
                     isOffline ||
                     String(numberOfPeriods) === '' ||
                     (settings && String(numberOfPeriods) === String(settings.numberOfPeriods)) // Disable if no change
                 }
            >
                <Save className="mr-2 h-4 w-4" />
                {settingsMutation.isPending ? '保存中...' : '基本設定を保存'}
            </Button>
        </CardFooter>
      </Card>

      {/* --- Fixed Timetable Editor Card --- */}
       <Card className={`${isOffline ? 'opacity-50 pointer-events-none' : ''}`}>
            <CardHeader>
                <CardTitle>固定時間割の設定</CardTitle>
                <CardDescription>月曜日から金曜日までの基本的な時間割を設定します。</CardDescription>
            </CardHeader>
            <CardContent>
                 {showLoadingFixed ? (
                    <div className="space-y-2">
                        {[...Array(settings?.numberOfPeriods || 6)].map((_, i) => (
                             <div key={i} className="flex gap-2">
                                <Skeleton className="h-10 w-16" />
                                {[...Array(WeekDays.length)].map((_, j) => (
                                     <Skeleton key={j} className="h-10 flex-1" />
                                ))}
                            </div>
                        ))}
                    </div>
                ) : showErrorFixed ? (
                     <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>エラー</AlertTitle>
                        <AlertDescription>
                            固定時間割の読み込みに失敗しました。(エラー: {String(errorFixed)})
                         </AlertDescription>
                    </Alert>
                 ) : !settings ? (
                     <Alert variant="destructive">
                         <AlertCircle className="h-4 w-4" />
                         <AlertTitle>エラー</AlertTitle>
                         <AlertDescription>
                             基本設定が読み込まれていないため、時間割を表示できません。
                         </AlertDescription>
                    </Alert>
                 ) : (
                     <div className="overflow-x-auto">
                         <Table>
                             <TableHeader>
                                 <TableRow>
                                     <TableHead className="w-[60px] text-center">時間</TableHead>
                                     {WeekDays.map(day => (
                                         <TableHead key={day} className="min-w-[120px] text-center">{day}</TableHead>
                                     ))}
                                 </TableRow>
                            </TableHeader>
                             <TableBody>
                                 {Array.from({ length: settings.numberOfPeriods }, (_, i) => i + 1).map(period => (
                                     <TableRow key={period}>
                                         <TableCell className="font-medium text-center">{period}限</TableCell>
                                         {WeekDays.map(day => {
                                             const slot = editedFixedTimetable.find(s => s.day === day && s.period === period);
                                             return (
                                                 <TableCell key={`${day}-${period}`}>
                                                    <Input
                                                         type="text"
                                                         value={slot?.subject ?? ''}
                                                         onChange={(e) => handleSubjectChange(day, period, e.target.value)}
                                                         placeholder="科目名"
                                                         disabled={fixedTimetableMutation.isPending || isOffline}
                                                         className="text-sm"
                                                     />
                                                 </TableCell>
                                             );
                                         })}
                                     </TableRow>
                                ))}
                             </TableBody>
                        </Table>
                    </div>
                 )}
             </CardContent>
             <CardFooter>
                <Button
                     onClick={handleSaveFixedTimetable}
                     disabled={
                         showLoadingFixed ||
                         fixedTimetableMutation.isPending ||
                         isOffline ||
                         !hasFixedTimetableChanged // Disable if no changes
                     }
                 >
                     <Save className="mr-2 h-4 w-4" />
                     {fixedTimetableMutation.isPending ? '保存中...' : '固定時間割を保存'}
                </Button>
                 {!isOffline && !fixedTimetableMutation.isPending && !hasFixedTimetableChanged && (
                     <p className="ml-4 text-sm text-muted-foreground">変更はありません</p>
                 )}
             </CardFooter>
        </Card>


    </MainLayout>
  );
}


// Wrap the content component with the provider
export default function SettingsPage() {
    return (
        <QueryClientProvider client={queryClient}>
            <SettingsPageContent />
        </QueryClientProvider>
    );
}
