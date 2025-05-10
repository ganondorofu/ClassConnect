"use client";

import React, { useState, useEffect, useMemo } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import ReactMarkdown from 'react-markdown';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { cn } from "@/lib/utils";
import { useAuth } from '@/contexts/AuthContext';

export default function HelpPage() {
  const [rawMarkdown, setRawMarkdown] = useState<string>('');
  const [isLoadingMarkdown, setIsLoadingMarkdown] = useState<boolean>(true);
  const [errorMarkdown, setErrorMarkdown] = useState<string | null>(null);
  const { user, isAnonymous, loading: authLoading } = useAuth();

  useEffect(() => {
    const fetchMarkdown = async () => {
      setIsLoadingMarkdown(true);
      try {
        const response = await fetch('/docs/USAGE.md');
        if (!response.ok) {
          throw new Error(`Failed to fetch usage guide: ${response.statusText}`);
        }
        const text = await response.text();
        setRawMarkdown(text);
      } catch (err) {
        setErrorMarkdown(err instanceof Error ? err.message : 'An unknown error occurred');
        console.error(err);
      } finally {
        setIsLoadingMarkdown(false);
      }
    };

    fetchMarkdown();
  }, []);

  const filterAdminContent = (markdown: string, isAdminUser: boolean): string => {
    if (isAdminUser) {
      // For admin users, remove only the markers, keeping the content.
      let adminContent = markdown;
      adminContent = adminContent.replace(/<!-- ADMIN_SECTION_START -->/g, '');
      adminContent = adminContent.replace(/<!-- ADMIN_SECTION_END -->/g, '');
      // Also remove sections specifically tagged for replacement in non-admin views
      adminContent = adminContent.replace(/<!-- ADMIN_SECTION_START_REPLACE_WITH_EMPTY_FOR_NON_ADMIN -->[\s\S]*?<!-- ADMIN_SECTION_END_REPLACE_WITH_EMPTY_FOR_NON_ADMIN -->/g, '');
      return adminContent;
    } else {
      // For non-admin users, remove the entire admin section (markers + content).
      const adminSectionRegex = /<!-- ADMIN_SECTION_START -->[\s\S]*?<!-- ADMIN_SECTION_END -->/g;
      let nonAdminContent = markdown.replace(adminSectionRegex, '');
      // Replace sections specifically tagged for non-admin view with empty string
      const nonAdminReplaceRegex = /<!-- ADMIN_SECTION_START_REPLACE_WITH_EMPTY_FOR_NON_ADMIN -->([\s\S]*?)<!-- ADMIN_SECTION_END_REPLACE_WITH_EMPTY_FOR_NON_ADMIN -->/g;
      nonAdminContent = nonAdminContent.replace(nonAdminReplaceRegex, '');
      return nonAdminContent;
    }
  };
  
  const isAdmin = !authLoading && user && !isAnonymous;
  const isLoading = isLoadingMarkdown || authLoading;
  
  const displayedMarkdown = useMemo(() => {
    if (isLoading || !rawMarkdown) return '';
    return filterAdminContent(rawMarkdown, isAdmin);
  }, [isLoading, rawMarkdown, isAdmin]);


  return (
    <MainLayout>
      <div className="container mx-auto py-8 px-4 md:px-0">
        <h1 className="text-3xl font-bold mb-8 text-center text-primary">ClassConnect 利用ガイド</h1>
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-8 w-1/2 mt-6" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        )}
        {errorMarkdown && !isLoading && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>エラー</AlertTitle>
            <AlertDescription>
              利用ガイドの読み込みに失敗しました。時間をおいて再度お試しください。
              <p className="mt-2 text-xs">{errorMarkdown}</p>
            </AlertDescription>
          </Alert>
        )}
        {!isLoading && !errorMarkdown && displayedMarkdown && (
          <article className="prose dark:prose-invert max-w-none lg:prose-lg bg-card p-6 rounded-lg shadow-md">
            <ReactMarkdown
              components={{
                h1: ({node, ...props}) => <h1 className="text-3xl font-semibold mt-8 mb-4 pb-2 border-b border-border" {...props} />,
                h2: ({node, ...props}) => <h2 className="text-2xl font-semibold mt-6 mb-3 pb-1 border-b border-border" {...props} />,
                h3: ({node, ...props}) => <h3 className="text-xl font-semibold mt-4 mb-2" {...props} />,
                p: ({node, ...props}) => <p className="mb-4 leading-relaxed" {...props} />,
                ul: ({node, ...props}) => <ul className="list-disc pl-6 mb-4 space-y-1" {...props} />,
                ol: ({node, ...props}) => <ol className="list-decimal pl-6 mb-4 space-y-1" {...props} />,
                li: ({node, ...props}) => <li className="mb-1" {...props} />,
                code: ({node, inline, className, children, ...props}) => {
                  const match = /language-(\w+)/.exec(className || '')
                  return !inline && match ? (
                     <pre className={cn("my-4 p-4 overflow-x-auto rounded-md bg-muted text-sm", className)} {...props}><code>{String(children).replace(/\n$/, '')}</code></pre>
                  ) : (
                    <code className={cn("px-1 py-0.5 bg-muted rounded-sm text-sm font-mono", className)} {...props}>
                      {children}
                    </code>
                  )
                },
                a: ({node, ...props}) => <a className="text-primary hover:underline" {...props} />,
              }}
            >
              {displayedMarkdown}
            </ReactMarkdown>
          </article>
        )}
         {!isLoading && !errorMarkdown && !displayedMarkdown && rawMarkdown && (
           <Alert variant="default">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>情報</AlertTitle>
            <AlertDescription>
              表示できるヘルプコンテンツがありません。
            </AlertDescription>
          </Alert>
        )}
      </div>
    </MainLayout>
  );
}

