
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
import { queryFnGetTimetableSettings, updateTimetableSettings, onTimetableSettingsUpdate, queryFnGetFixedTimetable, batchUpdateFixedTimetable, applyFixedTimetableForFuture, resetFixedTimetable, resetFutureDailyAnnouncements } from '@/controllers/timetableController'; // Added resetFutureDailyAnnouncements
import { queryFnGetSubjects, onSubjectsUpdate } from '@/controllers/subjectController';
import type { TimetableSettings, FixedTimeSlot, DayOfWeek } from '@/models/timetable';
import type { Subject } from '@/models/subject';
import { DEFAULT_TIMETABLE_SETTINGS, WeekDays, getDayOfWeekName } from '@/models/timetable';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { AlertCircle, WifiOff, Save, Send, RotateCcw, RefreshCw } from 'lucide-react'; // Added Send, RotateCcw, RefreshCw icons
import { SubjectSelector } from '@/components/timetable/SubjectSelector';

// This component contains the core logic previously in SettingsPageContent
export default function SettingsContent() {
  const { toast } = useToast();
  const queryClientHook = useQueryClient(); // Hook to invalidate queries

  // --- State for General Settings ---
  const [numberOfPeriods, setNumberOfPeriods] = useState<number | string>(DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods);
  const [isOffline, setIsOffline] = useState(false); // State to track offline status
  const [liveSettings, setLiveSettings] = useState<TimetableSettings | null>(null);

  // --- State for Fixed Timetable Editor ---
  const [editedFixedTimetable, setEditedFixedTimetable] = useState<FixedTimeSlot[]>([]);
  const [initialFixedTimetableData, setInitialFixedTimetableData] = useState<FixedTimeSlot[]>([]); // Store initial data for comparison
  const [isResetting, setIsResetting] = useState(false); // State for reset operation
  const [isOverwritingFuture, setIsOverwritingFuture] = useState(false); // State for overwrite future operation

  // --- State for Subjects ---
  const [liveSubjects, setLiveSubjects] = useState<Subject[]>([]);

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
        // Don't toast here, let individual components show errors
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

  // --- Fetching Subjects ---
   const { data: initialSubjects, isLoading: isLoadingSubjects, error: errorSubjects } = useQuery({
     queryKey: ['subjects'],
     queryFn: queryFnGetSubjects,
     staleTime: 1000 * 60 * 15, // 15 minutes
     refetchOnWindowFocus: false,
     onError: handleQueryError('subjects'),
     enabled: !isOffline,
     refetchOnMount: true,
   });

   // --- Realtime Subscription for Subjects ---
    useEffect(() => {
        if (isOffline) return;
        const unsubscribe = onSubjectsUpdate((subs) => {
        setLiveSubjects(subs);
        setIsOffline(false);
        }, (error) => {
        console.error("Realtime subjects error:", error);
        setIsOffline(true);
        });
        return () => unsubscribe();
    }, [isOffline]);

    // Merge initial and live subjects data
    const subjects = useMemo(() => liveSubjects.length > 0 ? liveSubjects : initialSubjects ?? [], [liveSubjects, initialSubjects]);


   // --- Initialize and Manage Edited Fixed Timetable State ---
   useEffect(() => {
       if (fetchedFixedTimetable && settings) {
           // Generate a complete grid based on settings, filled with fetched data or defaults
           const completeTimetable: FixedTimeSlot[] = [];
           (settings.activeDays ?? WeekDays).forEach(day => { // Use active days from settings or default WeekDays
               for (let period = 1; period <= settings.numberOfPeriods; period++) {
                   const existingSlot = fetchedFixedTimetable.find(slot => slot.day === day && slot.period === period);
                   completeTimetable.push(existingSlot ?? {
                       id: `${day}_${period}`, // Generate ID if missing
                       day,
                       period,
                       subjectId: null, // Default to null
                   });
               }
           });
           setEditedFixedTimetable(completeTimetable);
           setInitialFixedTimetableData(completeTimetable); // Store the initial state for comparison
       } else if (settings && !fetchedFixedTimetable && !isLoadingFixed) {
            // Handle case where fetch completes but returns empty/null, generate default grid
            const defaultGrid: FixedTimeSlot[] = [];
            (settings.activeDays ?? WeekDays).forEach(day => {
                for (let period = 1; period <= settings.numberOfPeriods; period++) {
                    defaultGrid.push({
                       id: `${day}_${period}`,
                       day,
                       period,
                       subjectId: null,
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
         // applyFixedTimetableForFuture is called internally by batchUpdateFixedTimetable
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

  // --- Mutation for Applying Fixed Timetable Manually ---
  const applyFutureMutation = useMutation({
      mutationFn: applyFixedTimetableForFuture,
      onSuccess: () => {
        toast({
          title: "適用開始",
          description: "固定時間割の将来への適用を開始しました。",
        });
        // No need to invalidate queries here, it reads fixed timetable and writes to daily announcements
      },
      onError: (error: Error) => {
        console.error("Failed to apply fixed timetable to future:", error);
        const isOfflineError = error.message.includes("オフラインのため");
        setIsOffline(isOfflineError || !navigator.onLine);
        toast({
          title: isOfflineError ? "オフライン" : "エラー",
          description: isOfflineError ? "固定時間割の適用に失敗しました。接続を確認してください。" : `固定時間割の適用に失敗しました: ${error.message}`,
          variant: "destructive",
        });
      },
  });

    // --- Mutation for Resetting Fixed Timetable ---
   const resetTimetableMutation = useMutation({
       mutationFn: resetFixedTimetable,
       onSuccess: async () => {
           toast({
               title: "成功",
               description: "固定時間割を初期化しました。",
           });
           // Invalidate queries to reflect the reset
           await queryClientHook.invalidateQueries({ queryKey: ['fixedTimetable'] });
           await queryClientHook.invalidateQueries({ queryKey: ['dailyAnnouncements'] }); // Also invalidate announcements
           // Reset local state as well
           const resetGrid: FixedTimeSlot[] = [];
           (settings.activeDays ?? WeekDays).forEach(day => {
               for (let period = 1; period <= settings.numberOfPeriods; period++) {
                   resetGrid.push({
                       id: `${day}_${period}`,
                       day,
                       period,
                       subjectId: null,
                   });
               }
           });
           setEditedFixedTimetable(resetGrid);
           setInitialFixedTimetableData(resetGrid);
       },
       onError: (error: Error) => {
           console.error("Failed to reset fixed timetable:", error);
           const isOfflineError = error.message.includes("オフラインのため");
           setIsOffline(isOfflineError || !navigator.onLine);
           toast({
               title: isOfflineError ? "オフライン" : "エラー",
               description: isOfflineError ? "固定時間割の初期化に失敗しました。接続を確認してください。" : `固定時間割の初期化に失敗しました: ${error.message}`,
               variant: "destructive",
           });
       },
       onSettled: () => setIsResetting(false),
   });

    // --- Mutation for Overwriting Future Daily Announcements ---
    const overwriteFutureMutation = useMutation({
        mutationFn: resetFutureDailyAnnouncements,
        onSuccess: async () => {
            toast({
                title: "成功",
                description: "将来の時間割を基本時間割で上書きしました。",
            });
            // Invalidate daily announcements to reflect the reset
            await queryClientHook.invalidateQueries({ queryKey: ['dailyAnnouncements'] });
        },
        onError: (error: Error) => {
            console.error("Failed to overwrite future daily announcements:", error);
            const isOfflineError = error.message.includes("オフラインのため");
            setIsOffline(isOfflineError || !navigator.onLine);
            toast({
                title: isOfflineError ? "オフライン" : "エラー",
                description: isOfflineError ? "将来の時間割の上書きに失敗しました。接続を確認してください。" : `将来の時間割の上書きに失敗しました: ${error.message}`,
                variant: "destructive",
            });
        },
        onSettled: () => setIsOverwritingFuture(false),
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

  const handleSubjectChange = (day: DayOfWeek, period: number, newSubjectId: string | null) => {
    setEditedFixedTimetable(currentTimetable =>
        currentTimetable.map(slot =>
            slot.day === day && slot.period === period
                ? { ...slot, subjectId: newSubjectId } // Update subjectId
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
      const validSlots = editedFixedTimetable.filter(slot => slot?.id && slot?.day && slot?.period !== undefined);
      fixedTimetableMutation.mutate(validSlots);
  };

  const handleApplyFixedTimetable = () => {
       if (isOffline) {
         toast({ title: "オフライン", description: "固定時間割を適用できません。", variant: "destructive" });
         return;
       }
       applyFutureMutation.mutate();
   };

   const handleResetTimetable = () => {
        if (isOffline || isResetting) {
           toast({ title: isOffline ? "オフライン" : "処理中", description: "固定時間割を初期化できません。", variant: "destructive" });
           return;
        }
        setIsResetting(true);
        resetTimetableMutation.mutate();
   };

   const handleOverwriteFuture = () => {
        if (isOffline || isOverwritingFuture) {
            toast({ title: isOffline ? "オフライン" : "処理中", description: "将来の時間割を上書きできません。", variant: "destructive" });
            return;
        }
        setIsOverwritingFuture(true);
        overwriteFutureMutation.mutate();
   };


   const showLoadingSettings = isLoadingSettings && !isOffline;
   const showErrorSettings = errorSettings && !isOffline;
   const showLoadingFixed = isLoadingFixed && !isOffline;
   const showErrorFixed = errorFixed && !isOffline;
   const showLoadingSubjects = isLoadingSubjects && !isOffline;
   const showErrorSubjects = errorSubjects && !isOffline;


    // Calculate if fixed timetable has changes
   const hasFixedTimetableChanged = useMemo(() => {
       if (editedFixedTimetable.length !== initialFixedTimetableData.length) return true;
       // Deep comparison needed
       return JSON.stringify(editedFixedTimetable) !== JSON.stringify(initialFixedTimetableData);
   }, [editedFixedTimetable, initialFixedTimetableData]);

   // Return the actual JSX
   return (
     <div>
       <h1 className="text-2xl font-semibold mb-6">設定</h1>

        {/* --- Basic Settings Card --- */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>基本設定</CardTitle>
            <CardDescription>クラスの1日の時間数を設定します。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {showLoadingSettings ? (
              <div className="space-y-2">
                  <Skeleton className="h-6 w-1/4" />
                  <Skeleton className="h-10 w-1/2" />
              </div>
            ) : showErrorSettings ? (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>エラー</AlertTitle>
                    <AlertDescription>基本設定の読み込みに失敗しました。</AlertDescription>
                </Alert>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="numberOfPeriods">1日の時間数</Label>
                <Input
                  id="numberOfPeriods"
                  type="number"
                  min="1"
                  max="12"
                  value={numberOfPeriods}
                  onChange={handlePeriodsChange}
                  className="w-24"
                  disabled={settingsMutation.isPending || isOffline}
                />
                <p className="text-sm text-muted-foreground">
                    時間割に表示する1日の時間数を1〜12の間で設定します。
                </p>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button onClick={handleSaveSettings} disabled={settingsMutation.isPending || showLoadingSettings || isOffline}>
              <Save className="mr-2 h-4 w-4" />
              {settingsMutation.isPending ? '保存中...' : '基本設定を保存'}
            </Button>
          </CardFooter>
        </Card>

        {/* --- Fixed Timetable Card --- */}
        <Card>
          <CardHeader>
            <CardTitle>固定時間割の設定</CardTitle>
            <CardDescription>基本的な曜日ごとの時間割を設定します。保存後、自動的に3週間先までの予定に適用されます。</CardDescription>
          </CardHeader>
          <CardContent>
             {showLoadingSettings || showLoadingFixed || showLoadingSubjects ? (
                  <div className="space-y-4">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                  </div>
             ) : showErrorSettings || showErrorFixed || showErrorSubjects ? (
                 <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>エラー</AlertTitle>
                    <AlertDescription>
                        固定時間割または科目の読み込みに失敗しました。{showErrorSubjects ? ' 科目データを確認してください。' : ''}
                    </AlertDescription>
                 </Alert>
             ) : editedFixedTimetable.length > 0 ? (
                 <div className="overflow-x-auto">
                     <Table>
                       <TableHeader>
                         <TableRow>
                           <TableHead className="w-[60px]">時限</TableHead>
                           {(settings?.activeDays ?? WeekDays).map((day) => (
                             <TableHead key={day} className="min-w-[180px]">
                               {getDayOfWeekName(day)}
                             </TableHead>
                           ))}
                         </TableRow>
                       </TableHeader>
                       <TableBody>
                         {Array.from({ length: settings.numberOfPeriods }, (_, i) => i + 1).map((period) => (
                           <TableRow key={period}>
                             <TableCell className="font-medium text-center">{period}</TableCell>
                             {(settings?.activeDays ?? WeekDays).map((day) => {
                               const slot = editedFixedTimetable.find(s => s.day === day && s.period === period);
                               const subjectId = slot?.subjectId ?? null;
                               return (
                                 <TableCell key={day}>
                                   <SubjectSelector
                                       subjects={subjects}
                                       selectedSubjectId={subjectId}
                                       onValueChange={(newSubId) => handleSubjectChange(day, period, newSubId)}
                                       placeholder="科目未設定"
                                       disabled={fixedTimetableMutation.isPending || isOffline || isLoadingSubjects}
                                   />
                                 </TableCell>
                               );
                             })}
                           </TableRow>
                         ))}
                       </TableBody>
                     </Table>
                 </div>
             ) : (
                 <p className="text-muted-foreground text-center py-4">時間割データがありません。</p>
             )}
          </CardContent>
          <CardFooter className="flex justify-between items-center flex-wrap gap-2">
             <div className="flex gap-2 items-center">
                  <Button
                      onClick={handleSaveFixedTimetable}
                      disabled={!hasFixedTimetableChanged || fixedTimetableMutation.isPending || showLoadingFixed || showLoadingSubjects || isOffline}
                   >
                    <Save className="mr-2 h-4 w-4" />
                    {fixedTimetableMutation.isPending ? '保存中...' : '固定時間割を保存'}
                  </Button>
                   {!hasFixedTimetableChanged && !fixedTimetableMutation.isPending && !showLoadingFixed && (
                        <p className="text-sm text-muted-foreground self-center">変更はありません。</p>
                   )}
             </div>
             <div className="flex gap-2 flex-wrap">
                 <AlertDialog>
                   <AlertDialogTrigger asChild>
                     <Button
                       variant="destructive"
                       disabled={resetTimetableMutation.isPending || showLoadingFixed || isOffline}
                     >
                       <RotateCcw className="mr-2 h-4 w-4" />
                       {resetTimetableMutation.isPending ? '初期化中...' : '時間割を初期化'}
                     </Button>
                   </AlertDialogTrigger>
                   <AlertDialogContent>
                     <AlertDialogHeader>
                       <AlertDialogTitle>時間割を初期化しますか？</AlertDialogTitle>
                       <AlertDialogDescription>
                         すべての固定時間割の科目が「未設定」に戻ります。将来の時間割も未設定で上書きされます。この操作は元に戻せません。
                       </AlertDialogDescription>
                     </AlertDialogHeader>
                     <AlertDialogFooter>
                       <AlertDialogCancel>キャンセル</AlertDialogCancel>
                       <AlertDialogAction onClick={handleResetTimetable} disabled={resetTimetableMutation.isPending || isOffline}>
                         初期化する
                       </AlertDialogAction>
                     </AlertDialogFooter>
                   </AlertDialogContent>
                 </AlertDialog>

                 <AlertDialog>
                     <AlertDialogTrigger asChild>
                         <Button
                             variant="outline"
                             disabled={overwriteFutureMutation.isPending || fixedTimetableMutation.isPending || isResetting || isOffline}
                             title="現在保存されている固定時間割で、将来の変更を含むすべての日付を上書きします"
                         >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            {overwriteFutureMutation.isPending ? '上書き中...' : '将来の時間割を基本で上書き'}
                         </Button>
                     </AlertDialogTrigger>
                     <AlertDialogContent>
                         <AlertDialogHeader>
                             <AlertDialogTitle>将来の時間割を上書きしますか？</AlertDialogTitle>
                             <AlertDialogDescription>
                                現在保存されている固定時間割の内容で、将来の日付のすべての時間割（手動での変更を含む）を上書きします。この操作は元に戻せません。
                             </AlertDialogDescription>
                         </AlertDialogHeader>
                         <AlertDialogFooter>
                             <AlertDialogCancel>キャンセル</AlertDialogCancel>
                             <AlertDialogAction onClick={handleOverwriteFuture} disabled={overwriteFutureMutation.isPending || isOffline}>
                                 上書きする
                             </AlertDialogAction>
                         </AlertDialogFooter>
                     </AlertDialogContent>
                 </AlertDialog>

                 {/* Kept the 'Apply to Future' button for non-destructive application */}
                 {/*
                 <Button
                    onClick={handleApplyFixedTimetable}
                    variant="outline"
                    disabled={applyFutureMutation.isPending || fixedTimetableMutation.isPending || showLoadingFixed || showLoadingSubjects || isOffline || hasFixedTimetableChanged}
                    title={hasFixedTimetableChanged ? "先に固定時間割を保存してください" : "現在の固定時間割を将来の日付に適用します（既存の変更は保持）"}
                 >
                    <Send className="mr-2 h-4 w-4" />
                    {applyFutureMutation.isPending ? '適用中...' : '固定時間割を将来に適用'}
                 </Button>
                 */}
             </div>
          </CardFooter>
        </Card>
     </div>
   );
 }
