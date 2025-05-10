
// src/app/not-found.tsx
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function NotFound() {
  return (
    <MainLayout>
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)] text-center p-4">
        <AlertTriangle className="w-16 h-16 text-destructive mb-6" />
        <h1 className="text-4xl font-bold text-foreground mb-3">404 - ページが見つかりません</h1>
        <p className="text-lg text-muted-foreground mb-8">
          お探しのページは存在しないか、移動された可能性があります。
        </p>
        <Button asChild>
          <Link href="/">トップページに戻る</Link>
        </Button>
      </div>
    </MainLayout>
  );
}
