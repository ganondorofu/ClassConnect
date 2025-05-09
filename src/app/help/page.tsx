"use client";

import React, { useState, useEffect } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import ReactMarkdown from 'react-markdown';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

export default function HelpPage() {
  const [markdown, setMarkdown] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMarkdown = async () => {
      try {
        const response = await fetch('/docs/USAGE.md');
        if (!response.ok) {
          throw new Error(`Failed to fetch usage guide: ${response.statusText}`);
        }
        const text = await response.text();
        setMarkdown(text);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMarkdown();
  }, []);

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
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>エラー</AlertTitle>
            <AlertDescription>
              利用ガイドの読み込みに失敗しました。時間をおいて再度お試しください。
              <p className="mt-2 text-xs">{error}</p>
            </AlertDescription>
          </Alert>
        )}
        {!isLoading && !error && (
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
                // Add more custom components if needed
              }}
            >
              {markdown}
            </ReactMarkdown>
          </article>
        )}
      </div>
    </MainLayout>
  );
}
