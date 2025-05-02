
"use client";

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button'; // Import Button
import { useToast } from '@/hooks/use-toast'; // Import useToast
import { getLogs } from '@/controllers/timetableController';
import { rollbackAction } from '@/services/logService'; // Import rollbackAction
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"; // Import AlertDialog
import { AlertCircle, WifiOff, RotateCcw } from 'lucide-react'; // Added RotateCcw

// Re-export QueryClientProvider for client components using queries
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const queryClient = new QueryClient();


function LogsPageContent() {
    const [isOffline, setIsOffline] = useState(false);
    const queryClientHook = useQueryClient(); // Hook for invalidation
    const { toast } = useToast(); // Hook for toasts
    const [rollingBackId, setRollingBackId] = useState<string | null>(null); // Track rollback state

    // --- Check Online Status ---
    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);
        if (typeof navigator !== 'undefined') setIsOffline(!navigator.onLine);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const handleQueryError = (error: unknown) => {
        console.error("Log Query Error:", error);
        const isOfflineError = (error as any)?.code === 'unavailable';
        setIsOffline(isOfflineError || !navigator.onLine);
    };

    const { data: logs, isLoading, error } = useQuery({
        queryKey: ['actionLogs'],
        queryFn: () => getLogs(100),
        staleTime: 1000 * 60,
        refetchInterval: isOffline ? false : 1000 * 60 * 5,
        onError: handleQueryError,
        enabled: !isOffline,
        refetchOnMount: true,
    });

     // --- Rollback Mutation ---
     const rollbackMutation = useMutation({
         mutationFn: (logId: string) => rollbackAction(logId, 'admin_user'), // Pass user ID if available
         onSuccess: (data, logId) => {
            toast({
                 title: "ロールバック成功",
                 description: `ログID: ${logId} の操作を元に戻しました。関連データが更新されるまで時間がかかる場合があります。`,
             });
            // Invalidate relevant queries to reflect the rollback
             queryClientHook.invalidateQueries({ queryKey: ['actionLogs'] });
             queryClientHook.invalidateQueries({ queryKey: ['timetableSettings'] });
             queryClientHook.invalidateQueries({ queryKey: ['fixedTimetable'] });
             queryClientHook.invalidateQueries({ queryKey: ['dailyAnnouncements'] });
             queryClientHook.invalidateQueries({ queryKey: ['dailyGeneralAnnouncement'] });
             queryClientHook.invalidateQueries({ queryKey: ['subjects'] });
             queryClientHook.invalidateQueries({ queryKey: ['schoolEvents'] });
         },
         onError: (error: Error, logId) => {
             toast({
                 title: "ロールバック失敗",
                 description: `ログID: ${logId} の操作を元に戻せませんでした: ${error.message}`,
                 variant: "destructive",
                 duration: 7000, // Show error longer
             });
             // Check if offline contributed
             if (!navigator.onLine) setIsOffline(true);
         },
         onSettled: () => {
             setRollingBackId(null); // Reset loading state
         },
     });

     const handleRollback = (logId: string) => {
         if (isOffline || rollingBackId) return;
         setRollingBackId(logId); // Set loading state for this specific log
         rollbackMutation.mutate(logId);
     };

     const isRollbackPossible = (action: string): boolean => {
         // Define actions that are generally considered NOT easily reversible
         const nonReversibleActions = [
            'apply_fixed_timetable_future',
            'reset_future_daily_announcements',
            'reset_fixed_timetable', // Can be complex, disable automatic for safety
            'initialize_settings', // Might be okay, but disable for safety
            'rollback_action', // Cannot rollback a rollback
            'rollback_action_failed'
         ];
         return !nonReversibleActions.includes(action);
     };


    const formatTimestamp = (timestamp: Date | undefined): string => {
        if (!timestamp) return 'N/A';
        try {
            return format(timestamp, 'yyyy/MM/dd HH:mm:ss', { locale: ja });
        } catch (e) {
            console.error("Error formatting timestamp:", e);
            return 'Invalid Date';
        }
    };

     // Basic function to determine action description
    const getActionDescription = (action: string): string => {
        switch (action) {
            case 'update_settings': return '時間割設定変更';
            case 'initialize_settings': return '時間割設定初期化';
            case 'update_fixed_slot': return '固定時間割更新'; // Note: Might be part of batch now
            case 'upsert_announcement': return '今日の連絡 更新/作成';
            case 'delete_announcement': return '今日の連絡 削除';
            case 'add_event': return '行事追加';
            case 'update_event': return '行事更新';
            case 'delete_event': return '行事削除';
            case 'add_subject': return '科目追加';
            case 'update_subject': return '科目更新';
            case 'delete_subject': return '科目削除';
            case 'batch_update_fixed_timetable': return '固定時間割一括更新';
            case 'apply_fixed_timetable_future': return '固定時間割の将来適用';
            case 'apply_fixed_timetable_future_error': return '固定時間割の将来適用エラー';
            case 'reset_fixed_timetable': return '固定時間割リセット';
            case 'reset_future_daily_announcements': return '将来の連絡リセット';
            case 'upsert_general_announcement': return '全体連絡 更新/作成';
            case 'delete_general_announcement': return '全体連絡 削除';
            case 'rollback_action': return '操作のロールバック'; // Log for rollback
            case 'rollback_action_failed': return 'ロールバック失敗'; // Log for failed rollback
            default: return action;
        }
    };

     // Function to render details in a readable way (improved)
    const renderDetails = (details: any): React.ReactNode => {
        try {
             if (!details) return '詳細なし';

             // Special handling for rollback logs
             if (details.originalLogId) {
                 return (
                     <div className="text-xs text-muted-foreground break-all">
                        <p>元ログID: {details.originalLogId}</p>
                        <p>元アクション: {getActionDescription(details.originalAction)}</p>
                        {details.restoredDocPath && <p>復元パス: {details.restoredDocPath}</p>}
                        {details.deletedDocPath && <p>削除パス: {details.deletedDocPath}</p>}
                        {details.restoredSlotsCount !== undefined && <p>復元スロット数: {details.restoredSlotsCount}</p>}
                        {details.error && <p className="text-destructive">エラー: {details.error}</p>}
                    </div>
                 );
             }

             // Simple JSON string for others, potentially truncated
             const detailString = JSON.stringify(details, null, 2); // Pretty print
             return (
                 <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground break-all max-h-24 overflow-y-auto">
                     {detailString}
                 </pre>
             );
        } catch {
            return '表示不可';
        }
    };

    const showLoading = isLoading && !isOffline;
    const showError = error && !isOffline;

    const tableHeaders = ['日時', '操作', 'ユーザー', '詳細', '操作'];
    const headerWidths = ['w-[180px]', 'w-[150px]', 'w-[100px]', '', 'w-[100px] text-right'];


    return (
        <MainLayout>
            <h1 className="text-2xl font-semibold mb-6">変更履歴</h1>
            <Card>
                <CardHeader>
                    <CardTitle>操作ログ</CardTitle>
                    <CardDescription>最近の変更履歴を表示します。一部の操作は元に戻すことができます。</CardDescription>
                    {isOffline && (
                      <Alert variant="destructive" className="mt-4">
                        <WifiOff className="h-4 w-4" />
                        <AlertTitle>オフライン</AlertTitle>
                        <AlertDescription>
                          現在オフラインです。ログの取得やロールバックはできません。
                        </AlertDescription>
                      </Alert>
                    )}
                </CardHeader>
                <CardContent>
                    {showLoading ? (
                        <div className="space-y-2">
                            {[...Array(5)].map((_, i) => (
                                <Skeleton key={i} className="h-16 w-full" /> // Increased height for button
                            ))}
                        </div>
                    ) : showError ? (
                         <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>エラー</AlertTitle>
                            <AlertDescription>
                                ログの読み込みに失敗しました。時間をおいて再試行してください。
                            </AlertDescription>
                        </Alert>
                    ) : !logs || logs.length === 0 ? (
                        <p className="text-muted-foreground text-center py-4">ログはありません。</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                {/* Render TableHeader Row using map */}
                                <TableRow>
                                    {tableHeaders.map((header, index) => (
                                        <TableHead key={`${header}-${index}`} className={headerWidths[index]}>
                                            {header}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {logs.map((log) => {
                                    const canRollback = isRollbackPossible(log.action);
                                    const isCurrentlyRollingBack = rollingBackId === log.id;
                                    const cells = [
                                        <TableCell key={`${log.id}-timestamp`}>{formatTimestamp(log.timestamp)}</TableCell>,
                                        <TableCell key={`${log.id}-action`} className="font-medium">{getActionDescription(log.action)}</TableCell>,
                                        <TableCell key={`${log.id}-user`} className="text-muted-foreground">{log.userId}</TableCell>,
                                        <TableCell key={`${log.id}-details`}>{renderDetails(log.details)}</TableCell>,
                                        <TableCell key={`${log.id}-rollback`} className="text-right">
                                            {canRollback && (
                                                <AlertDialog>
                                                  <AlertDialogTrigger asChild>
                                                     <Button
                                                         variant="outline"
                                                         size="sm"
                                                         disabled={isOffline || !!rollingBackId} // Disable if offline or any rollback is in progress
                                                         className={`h-8 ${isCurrentlyRollingBack ? 'animate-pulse' : ''}`}
                                                     >
                                                         <RotateCcw className={`mr-1 h-3 w-3 ${isCurrentlyRollingBack ? 'animate-spin' : ''}`} />
                                                         {isCurrentlyRollingBack ? '処理中' : '元に戻す'}
                                                     </Button>
                                                  </AlertDialogTrigger>
                                                  <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                      <AlertDialogTitle>操作を元に戻しますか？</AlertDialogTitle>
                                                      <AlertDialogDescription>
                                                         ログID: {log.id} ({getActionDescription(log.action)}) の操作を元に戻します。
                                                         関連するデータが変更前の状態に復元されます。
                                                         この操作はロールバックログとして記録されます。
                                                         <strong className="block mt-2 text-destructive">注意: 複雑な操作や依存関係のある変更は、予期せぬ結果を招く可能性があります。</strong>
                                                      </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                      <AlertDialogCancel disabled={isCurrentlyRollingBack}>キャンセル</AlertDialogCancel>
                                                      <AlertDialogAction onClick={() => handleRollback(log.id!)} disabled={isCurrentlyRollingBack}>
                                                        元に戻す
                                                      </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                  </AlertDialogContent>
                                                </AlertDialog>
                                            )}
                                        </TableCell>
                                    ];
                                    // Render TableRow with cells from the array
                                    return <TableRow key={log.id}>{cells}</TableRow>;
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </MainLayout>
    );
}

// Wrap the content component with the provider
export default function LogsPage() {
    return (
        <QueryClientProvider client={queryClient}>
            <LogsPageContent />
        </QueryClientProvider>
    );
}
