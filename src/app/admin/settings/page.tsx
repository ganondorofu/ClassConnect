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
import { AlertCircle } from 'lucide-react';

// Re-export QueryClientProvider for client components using queries
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const queryClient = new QueryClient();


function SettingsPageContent() {
  const { toast } = useToast();
  const queryClientHook = useQueryClient(); // Hook to invalidate queries
  const [numberOfPeriods, setNumberOfPeriods] = useState<number | string>(DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods);

   // --- Realtime State ---
  const [liveSettings, setLiveSettings] = useState<TimetableSettings | null>(null);

  // Fetch initial settings
  const { data: initialSettings, isLoading, error } = useQuery({
    queryKey: ['timetableSettings'],
    queryFn: queryFnGetTimetableSettings,
    staleTime: Infinity, // Fetch once and rely on realtime updates
    refetchOnWindowFocus: false,
  });

   // --- Realtime Subscription ---
  useEffect(() => {
    const unsubscribe = onTimetableSettingsUpdate((settings) => {
      console.log("Realtime settings update received:", settings);
      setLiveSettings(settings);
       if (settings?.numberOfPeriods !== undefined) {
        setNumberOfPeriods(settings.numberOfPeriods);
      }
    });
    return () => unsubscribe(); // Cleanup subscription on unmount
  }, []);

   // Merge initial and live data
  const settings = liveSettings ?? initialSettings;

   // Update local state when settings data is loaded/updated
  useEffect(() => {
     if (settings?.numberOfPeriods !== undefined && numberOfPeriods === DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods) {
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
      toast({
        title: "エラー",
        description: "設定の更新に失敗しました。",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
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
          if (!isNaN(numValue)) {
              setNumberOfPeriods(numValue);
          }
          // Optionally, handle non-numeric input differently or ignore
      }
  };


  return (
    <MainLayout>
      <h1 className="text-2xl font-semibold mb-6">時間割設定</h1>
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle>カスタマイズ</CardTitle>
          <CardDescription>クラスの1日の時間数を設定します。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
             <div className="text-destructive flex items-center gap-2">
                 <AlertCircle className="h-4 w-4" />
                 設定の読み込みに失敗しました。
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="numberOfPeriods">1日の時間数 (時限)</Label>
              <Input
                id="numberOfPeriods"
                type="number"
                min="1"
                max="12" // Example max limit
                value={numberOfPeriods}
                 onChange={handlePeriodsChange}
                placeholder={`デフォルト: ${DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods}`}
                disabled={mutation.isPending}
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
                disabled={isLoading || mutation.isPending || String(numberOfPeriods) === String(settings?.numberOfPeriods ?? '')}
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

