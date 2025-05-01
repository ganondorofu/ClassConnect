"use client";

import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { getLogs } from '@/controllers/timetableController';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { AlertCircle } from 'lucide-react';

// Re-export QueryClientProvider for client components using queries
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const queryClient = new QueryClient();


function LogsPageContent() {
    const { data: logs, isLoading, error } = useQuery({
        queryKey: ['actionLogs'],
        queryFn: () => getLogs(100), // Fetch latest 100 logs
        staleTime: 1000 * 60, // 1 minute stale time
        refetchInterval: 1000 * 60 * 5, // Refetch every 5 minutes
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


    return (
        <MainLayout>
            <h1 className="text-2xl font-semibold mb-6">変更履歴</h1>
            <Card>
                <CardHeader>
                    <CardTitle>操作ログ</CardTitle>
                    <CardDescription>最近の変更履歴を表示します。</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-2">
                            {[...Array(5)].map((_, i) => (
                                <Skeleton key={i} className="h-10 w-full" />
                            ))}
                        </div>
                    ) : error ? (
                         <div className="text-destructive flex items-center gap-2">
                             <AlertCircle className="h-4 w-4" />
                             ログの読み込みに失敗しました。
                         </div>
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

