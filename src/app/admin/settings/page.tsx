'use client';

import React, { useEffect } from 'react'; // Explicitly import React and useEffect
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout';
import SettingsContent from '@/components/admin/SettingsContent';
import { useAuth } from '@/contexts/AuthContext'; // Import useAuth
import { useRouter } from 'next/navigation'; // Import useRouter
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button'; // Import Button

const queryClient = new QueryClient();

export default function SettingsPage() {
  const { user, loading: authLoading, isAnonymous } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user && !isAnonymous) { // Not loading, no user, not anonymous -> redirect
      router.push('/teacher-login?redirect=/admin/settings');
    } else if (!authLoading && isAnonymous) { // Not loading, is anonymous -> redirect to home
        router.push('/');
    }
  }, [user, authLoading, isAnonymous, router]);

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
  
  if (user && !isAnonymous) {
    return (
      <QueryClientProvider client={queryClient}>
        <MainLayout>
          <SettingsContent />
        </MainLayout>
      </QueryClientProvider>
    );
  }

  return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)] p-4">
           <Alert variant="default" className="w-full max-w-md">
             <AlertCircle className="h-5 w-5" />
             <AlertTitle>認証情報を確認中...</AlertTitle>
             <AlertDescription>
               ページの読み込みに時間がかかっています。
             </AlertDescription>
           </Alert>
         </div>
      </MainLayout>
  );
}
