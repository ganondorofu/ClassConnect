
"use client";

import { useQuery } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout'; // Corrected: Default import
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { getLogs } from '@/controllers/timetableController';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, WifiOff } from 'lucide-react';
import React, { useState, useEffect } from 'react'; // Import useState and useEffect


// Re-export QueryClientProvider for client components using queries
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const queryClient = new QueryClient();


function LogsPageContent() {
    const [isOffline, setIsOffline] = useState(false); // State to track offline status

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
        console.error("Log Query Error:", error);
        const isOfflineError = (error as any)?.code === 'unavailable';
        setIsOffline(isOfflineError || !navigator.onLine); // Update offline state based on error
    };


    const { data: logs, isLoading, error } = useQuery({
        queryKey: ['actionLogs'],
        queryFn: () => getLogs(100), // Fetch latest 100 logs
        staleTime: 1000 * 60, // 1 minute stale time
        refetchInterval: isOffline ? false : 1000 * 60 * 5, // Refetch every 5 minutes only if online
        onError: handleQueryError,
        enabled: !isOffline, // Only enable query if initially online
        refetchOnMount: true, // Refetch on mount to check connectivity
    });

    const formatTimestamp = (timestamp: Date | undefined): string => {
        if (!timestamp) return 'N/A';
        try {
            // Example format: 2023/10/27 15:30:10
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
            case 'update_fixed_slot': return '固定時間割更新';
            case 'upsert_announcement': return '今日の連絡 更新/作成';
            case 'delete_announcement': return '今日の連絡 削除';
            case 'add_event': return '行事追加';
            case 'update_event': return '行事更新';
            case 'delete_event': return '行事削除';
            case 'add_subject': return '科目追加'; // Add log descriptions for subjects
            case 'update_subject': return '科目更新';
            case 'delete_subject': return '科目削除';
            case 'batch_update_fixed_timetable': return '固定時間割一括更新';
            case 'apply_fixed_timetable_future': return '固定時間割の将来適用';
            case 'apply_fixed_timetable_future_error': return '固定時間割の将来適用エラー';
            default: return action; // Fallback to the raw action type
        }
    };

     // Function to render details in a readable way (basic example)
    const renderDetails = (details: any): string => {
        try {
            // Simple JSON string representation, truncated for brevity
            const detailString = JSON.stringify(details);
            return detailString.length > 150 ? detailString.substring(0, 147) + '...' : detailString;
        } catch {
            return '表示不可';
        }
    };

    const showLoading = isLoading && !isOffline;
    const showError = error && !isOffline;


    return (
        <MainLayout>
            <h1 className="text-2xl font-semibold mb-6">変更履歴</h1>
            <Card>
                <CardHeader>
                    <CardTitle>操作ログ</CardTitle>
                    <CardDescription>最近の変更履歴を表示します。</CardDescription>
                     {/* Display Offline Indicator */}
                    {isOffline && (
                      <Alert variant="destructive" className="mt-4">
                        <WifiOff className="h-4 w-4" />
                        <AlertTitle>オフライン</AlertTitle>
                        <AlertDescription>
                          現在オフラインです。ログの取得や更新はできません。
                        </AlertDescription>
                      </Alert>
                    )}
                </CardHeader>
                <CardContent>
                    {showLoading ? (
                        <div className="space-y-2">
                            {[...Array(5)].map((_, i) => (
                                <Skeleton key={i} className="h-10 w-full" />
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
                                <TableRow>
                                    <TableHead className="w-[200px]">日時</TableHead>
                                    <TableHead className="w-[150px]">操作</TableHead>
                                    <TableHead className="w-[120px]">ユーザー</TableHead>
                                    <TableHead>詳細</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {logs.map((log) => (
                                    <TableRow key={log.id}>
                                        <TableCell>{formatTimestamp(log.timestamp)}</TableCell>
                                        <TableCell className="font-medium">{getActionDescription(log.action)}</TableCell>
                                         <TableCell className="text-muted-foreground">{log.userId}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground break-all">
                                             {/* Render details - consider a more structured view or modal for complex details */}
                                            <pre className="whitespace-pre-wrap font-mono">{renderDetails(log.details)}</pre>
                                        </TableCell>
                                    </TableRow>
                                ))}
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

