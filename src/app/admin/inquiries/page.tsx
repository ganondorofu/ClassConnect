
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { queryFnGetInquiries, updateInquiryStatus } from '@/controllers/inquiryController';
import type { Inquiry } from '@/models/inquiry';
import { InquiryStatus, inquiryTypeLabels, inquiryStatusLabels } from '@/models/inquiry';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, WifiOff, Lock, MessageSquareWarning } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';

const queryClient = new QueryClient();

function InquiriesPageContent() {
  const [isOffline, setIsOffline] = useState(false);
  const queryClientHook = useQueryClient();
  const { toast } = useToast();
  const { user, loading: authLoading, isAnonymous } = useAuth();
  const router = useRouter();

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
    console.error("Inquiries Query Error:", error);
    const isOfflineError = (error as any)?.code === 'unavailable' || (error as Error)?.message?.includes("オフライン");
    setIsOffline(isOfflineError || (typeof navigator !== 'undefined' && !navigator.onLine));
  };

  const { data: inquiries, isLoading, error } = useQuery<Inquiry[], Error>({
    queryKey: ['inquiries'],
    queryFn: queryFnGetInquiries,
    staleTime: 1000 * 60, // 1 minute
    refetchInterval: isOffline ? false : 1000 * 60 * 5, // 5 minutes
    onError: handleQueryError,
    enabled: !isOffline && !!user && !isAnonymous,
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ inquiryId, status }: { inquiryId: string; status: InquiryStatus }) => 
      updateInquiryStatus(inquiryId, status, user?.uid ?? 'admin_user_inquiries'),
    onSuccess: (data, variables) => {
      toast({ title: "ステータス更新成功", description: `問い合わせID: ${variables.inquiryId} のステータスを更新しました。` });
      queryClientHook.invalidateQueries({ queryKey: ['inquiries'] });
    },
    onError: (error: Error, variables) => {
      toast({ title: "ステータス更新失敗", description: `問い合わせID: ${variables.inquiryId} のステータス更新に失敗: ${error.message}`, variant: "destructive" });
      if (!navigator.onLine) setIsOffline(true);
    },
  });

  const handleStatusChange = (inquiryId: string, newStatus: InquiryStatus) => {
    if (isOffline || updateStatusMutation.isPending) return;
    updateStatusMutation.mutate({ inquiryId, status: newStatus });
  };

  const formatTimestamp = (timestamp: Date | undefined | import('firebase/firestore').Timestamp): string => {
    if (!timestamp) return 'N/A';
    try {
      const dateObject = timestamp instanceof Date ? timestamp : (timestamp as import('firebase/firestore').Timestamp).toDate();
      if (isNaN(dateObject.getTime())) return 'Invalid Date';
      return format(dateObject, 'yyyy/MM/dd HH:mm', { locale: ja });
    } catch (e) { return 'Invalid Date'; }
  };
  
  const getStatusBadgeVariant = (status: InquiryStatus): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case InquiryStatus.NEW: return "default"; // Primary color for new
      case InquiryStatus.IN_PROGRESS: return "secondary"; // Yellow-ish or neutral
      case InquiryStatus.RESOLVED: return "outline"; // Green-ish or success
      case InquiryStatus.WONT_FIX: return "destructive"; // Red-ish or gray
      default: return "outline";
    }
  };


  const showLoading = isLoading && !isOffline;
  const showError = error && !isOffline;
  const tableHeaders = ['日時', '種別', '内容 (一部)', 'メールアドレス', 'ステータス', '最終更新'];
  const headerWidths = ['w-[130px]', 'w-[100px]', 'min-w-[200px] max-w-[400px]', 'w-[180px]', 'w-[150px]', 'w-[130px]'];


  if (authLoading || (!user && !isAnonymous)) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
            <Skeleton className="h-12 w-1/2 mb-4" />
            <Skeleton className="h-8 w-3/4 mb-2" />
            <Skeleton className="h-8 w-3/4" />
        </div>
      </MainLayout>
    );
  }
  
  if (isAnonymous) {
     return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)] p-4">
          <Alert variant="destructive" className="w-full max-w-md">
            <Lock className="h-5 w-5" />
            <AlertTitle>アクセス権限がありません</AlertTitle>
            <AlertDescription>
              このページを表示するには管理者としてログインする必要があります。
              <Button onClick={() => router.push('/')} className="mt-4 w-full">ホームに戻る</Button>
            </AlertDescription>
          </Alert>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <h1 className="text-2xl font-semibold mb-6">お問い合わせ一覧</h1>
      <Card>
        <CardHeader>
          <CardTitle>受信したお問い合わせ</CardTitle>
          <CardDescription>ユーザーから送信されたお問い合わせ内容を確認し、対応状況を管理します。</CardDescription>
          {isOffline && (<Alert variant="destructive" className="mt-4"><WifiOff className="h-4 w-4" /><AlertTitle>オフライン</AlertTitle><AlertDescription>現在オフラインです。お問い合わせ一覧の取得や更新はできません。</AlertDescription></Alert>)}
        </CardHeader>
        <CardContent>
          {showLoading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : showError ? (
            <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>エラー</AlertTitle><AlertDescription>お問い合わせ一覧の読み込みに失敗しました。</AlertDescription></Alert>
          ) : !inquiries || inquiries.length === 0 ? (
            <div className="text-center py-10">
                <MessageSquareWarning className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-2 text-sm font-semibold text-muted-foreground">お問い合わせはまだありません</h3>
                <p className="mt-1 text-sm text-muted-foreground">新しいお問い合わせはここに表示されます。</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>{tableHeaders.map((header, index) => <TableHead key={`${header}-${index}`} className={headerWidths[index]}>{header}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {inquiries.map((inquiry) => (
                    <TableRow key={inquiry.id}>
                      <TableCell className="text-xs">{formatTimestamp(inquiry.createdAt)}</TableCell>
                      <TableCell className="text-xs">{inquiryTypeLabels[inquiry.type]}</TableCell>
                      <TableCell className="text-xs max-w-xs truncate" title={inquiry.content}>{inquiry.content.substring(0, 100)}{inquiry.content.length > 100 ? '...' : ''}</TableCell>
                      <TableCell className="text-xs">{inquiry.email || <span className="text-muted-foreground italic">未入力</span>}</TableCell>
                      <TableCell>
                        <Select
                          value={inquiry.status}
                          onValueChange={(value) => handleStatusChange(inquiry.id!, value as InquiryStatus)}
                          disabled={isOffline || updateStatusMutation.isPending}
                        >
                          <SelectTrigger className="h-8 text-xs w-[130px]">
                            <SelectValue placeholder="ステータス選択" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.values(InquiryStatus).map((s) => (
                              <SelectItem key={s} value={s} className="text-xs">
                                <Badge variant={getStatusBadgeVariant(s)} className="mr-2 w-16 justify-center text-[10px] px-1.5 py-0.5">
                                  {inquiryStatusLabels[s]}
                                </Badge>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                       <TableCell className="text-xs">{formatTimestamp(inquiry.updatedAt ?? inquiry.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </MainLayout>
  );
}

export default function InquiriesPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <InquiriesPageContent />
    </QueryClientProvider>
  );
}
