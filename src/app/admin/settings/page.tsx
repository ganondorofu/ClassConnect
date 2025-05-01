"use client";

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { queryFnGetTimetableSettings, updateTimetableSettings, onTimetableSettingsUpdate } from '@/controllers/timetableController';
import type { TimetableSettings } from '@/models/timetable';
import { DEFAULT_TIMETABLE_SETTINGS } from '@/models/timetable';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'; // Import Alert
import { AlertCircle, WifiOff } from 'lucide-react'; // Import WifiOff

// Re-export QueryClientProvider for client components using queries
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const queryClient = new QueryClient();


function SettingsPageContent() {
  const { toast } = useToast();
  const queryClientHook = useQueryClient(); // Hook to invalidate queries
  const [numberOfPeriods, setNumberOfPeriods] = useState<number | string>(DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods);
  const [isOffline, setIsOffline] = useState(false); // State to track offline status

   // --- Realtime State ---
  const [liveSettings, setLiveSettings] = useState<TimetableSettings | null>(null);

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

     const handleQueryError = (error: unknown) => {
        console.error("Settings Query Error:", error);
        const isOfflineError = (error as any)?.code === 'unavailable';
        setIsOffline(isOfflineError || !navigator.onLine); // Update offline state based on error
    };

  // Fetch initial settings
  const { data: initialSettings, isLoading, error } = useQuery({
    queryKey: ['timetableSettings'],
    queryFn: queryFnGetTimetableSettings,
    staleTime: Infinity, // Fetch once and rely on realtime updates
    refetchOnWindowFocus: false,
    onError: handleQueryError,
    enabled: !isOffline, // Only enable query if initially online
    refetchOnMount: true, // Refetch on mount to check connectivity
  });

   // --- Realtime Subscription ---
  useEffect(() => {
      // Only subscribe if online
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

   // Merge initial and live data
  const settings = liveSettings ?? initialSettings;

   // Update local state when settings data is loaded/updated
  useEffect(() => {
     // Only set initial value if settings are loaded and local state hasn't been manually changed yet
      if (settings?.numberOfPeriods !== undefined && (numberOfPeriods === DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods || numberOfPeriods === '')) {
       setNumberOfPeriods(settings.numberOfPeriods);
     }
  }, [settings]); // Depend on the merged settings


  // Mutation for updating settings
  const mutation = useMutation({
    mutationFn: updateTimetableSettings,
    onSuccess: async () => {
      toast({
        title: "成功",
        description: "時間割設定を更新しました。",
      });
      // Invalidate query to refetch, although realtime should update it
      await queryClientHook.invalidateQueries({ queryKey: ['timetableSettings'] });
      await queryClientHook.invalidateQueries({ queryKey: ['fixedTimetable'] }); // Invalidate fixed timetable too
    },
    onError: (error) => {
      console.error("Failed to update settings:", error);
      const isOfflineError = error.message.includes("オフラインのため"); // Check specific error message from controller
      setIsOffline(isOfflineError || !navigator.onLine);
      toast({
        title: isOfflineError ? "オフライン" : "エラー",
        description: isOfflineError ? "設定の更新に失敗しました。接続を確認してください。" : "設定の更新に失敗しました。",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
     // Prevent saving if offline
    if (isOffline) {
      toast({
        title: "オフライン",
        description: "現在オフラインのため、設定を保存できません。",
        variant: "destructive",
      });
      return;
    }

    const periods = parseInt(String(numberOfPeriods), 10);
    if (isNaN(periods) || periods < 1 || periods > 12) { // Add validation (e.g., 1-12 periods)
      toast({
        title: "入力エラー",
        description: "1日の時間数は1から12の間で入力してください。",
        variant: "destructive",
      });
      return;
    }
    // Only mutate if the value has changed
     if (settings && periods !== settings.numberOfPeriods) {
        mutation.mutate({ numberOfPeriods: periods });
     } else if (!settings) {
         // Handle case where settings might initially be null/undefined
         mutation.mutate({ numberOfPeriods: periods });
     }
  };

  const handlePeriodsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      // Allow empty string for intermediate input, otherwise parse as number
      if (value === '') {
          setNumberOfPeriods('');
      } else {
          const numValue = parseInt(value, 10);
          // Allow setting if numeric, or if it becomes NaN (to clear potentially invalid input)
          // We clamp/validate on save
          setNumberOfPeriods(isNaN(numValue) ? value : numValue);
      }
  };

   const showLoading = isLoading && !isOffline;
   const showError = error && !isOffline;


  return (
    <MainLayout>
      <h1 className="text-2xl font-semibold mb-6">時間割設定</h1>
       {/* Display Offline Indicator */}
        {isOffline && (
          <Alert variant="destructive" className="mb-4 max-w-md mx-auto">
            <WifiOff className="h-4 w-4" />
            <AlertTitle>オフライン</AlertTitle>
            <AlertDescription>
              現在オフラインです。設定の表示や変更はできません。
            </AlertDescription>
          </Alert>
        )}
      <Card className={`max-w-md mx-auto ${isOffline ? 'opacity-50 pointer-events-none' : ''}`}>
        <CardHeader>
          <CardTitle>カスタマイズ</CardTitle>
          <CardDescription>クラスの1日の時間数を設定します。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {showLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : showError ? (
             <Alert variant="destructive">
                 <AlertCircle className="h-4 w-4" />
                  <AlertTitle>エラー</AlertTitle>
                 <AlertDescription>
                     設定の読み込みに失敗しました。時間をおいて再試行してください。
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
                value={numberOfPeriods === '' ? '' : String(numberOfPeriods)} // Ensure value is string or empty string
                 onChange={handlePeriodsChange}
                placeholder={`例: ${DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods}`}
                disabled={mutation.isPending || isOffline}
              />
              <p className="text-xs text-muted-foreground">
                 時間数を変更すると、固定時間割表の行数が自動的に調整されます。
              </p>
            </div>
          )}
        </CardContent>
        <CardFooter>
           <Button
                onClick={handleSave}
                disabled={
                     showLoading || // Disable if loading and not offline
                     mutation.isPending ||
                     isOffline || // Disable if offline
                     String(numberOfPeriods) === '' || // Disable if input is empty
                     (settings && String(numberOfPeriods) === String(settings.numberOfPeriods)) // Disable if no change
                 }
            >
                {mutation.isPending ? '保存中...' : '変更を保存'}
            </Button>
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

