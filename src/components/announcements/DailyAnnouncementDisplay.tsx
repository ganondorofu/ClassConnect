
"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import ReactMarkdown from 'react-markdown';
import { format, isValid } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Edit, Save, X, AlertCircle, Info } from 'lucide-react';
import type { DailyGeneralAnnouncement } from '@/models/announcement';
import { upsertDailyGeneralAnnouncement } from '@/controllers/timetableController';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext'; // Import useAuth

interface DailyAnnouncementDisplayProps {
  date: Date | null;
  announcement: DailyGeneralAnnouncement | null | undefined;
  isLoading: boolean;
  error: unknown;
}

export function DailyAnnouncementDisplay({ date, announcement, isLoading, error }: DailyAnnouncementDisplayProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const { user, isAnonymous, loading: authLoading } = useAuth(); // Get auth state
  const dateStr = date && isValid(date) ? format(date, 'yyyy-MM-dd') : '';

  const canEdit = !!user || isAnonymous; // Admin or anonymous can edit announcements

  const handleEditClick = () => {
    if (!canEdit) return;
    setEditText(announcement?.content ?? '');
    setIsEditing(true);
  };

  const handleCancelClick = () => {
    setIsEditing(false);
    setEditText('');
  };

  const handleSaveClick = async () => {
    if (isSaving || !dateStr || !canEdit) return;
    setIsSaving(true);
    try {
      // Pass user ID if logged in, otherwise null or 'anonymous' for logging
      const userId = user ? user.uid : (isAnonymous ? 'anonymous_general_edit' : 'unknown_user');
      await upsertDailyGeneralAnnouncement(dateStr, editText, userId);
      toast({ title: "成功", description: "今日のお知らせを保存しました。" });
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to save general announcement:", err);
      toast({
        title: "エラー",
        description: `お知らせの保存に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderContent = () => {
    if (isLoading || authLoading || !date) {
      return (
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      );
    }

    if (error) {
      return (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>エラー</AlertTitle>
          <AlertDescription>お知らせの読み込みに失敗しました。</AlertDescription>
        </Alert>
      );
    }
    
    if (!user && !isAnonymous && !authLoading) { // Not logged in, not anonymous, and auth check done
        return (
             <Alert variant="default" className="mt-4">
                <Info className="h-4 w-4" />
                <AlertTitle>お知らせの表示</AlertTitle>
                <AlertDescription>
                    ログインまたは「ログインなしで利用」を選択すると、お知らせが表示されます。
                </AlertDescription>
            </Alert>
        );
    }


    if (isEditing) {
      return (
        <div className="space-y-4">
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            placeholder="Markdown形式で入力 (例: # 見出し, - リスト, **太字**)"
            className="min-h-[150px] font-mono text-sm"
            disabled={isSaving || !canEdit}
          />
          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="w-3 h-3" /> Markdown記法が使えます。空欄で保存するとお知らせは削除されます。
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleCancelClick} disabled={isSaving || !canEdit} size="sm">
                <X className="mr-1 h-4 w-4" /> キャンセル
              </Button>
              <Button onClick={handleSaveClick} disabled={isSaving || !canEdit} size="sm">
                <Save className="mr-1 h-4 w-4" /> {isSaving ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    if (!announcement?.content) {
      return (
        <div className="text-center text-muted-foreground py-4">
          <p>今日のお知らせはありません。</p>
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={handleEditClick} className="mt-2">
              <Edit className="mr-1 h-4 w-4" /> お知らせを作成する
            </Button>
          )}
        </div>
      );
    }

    return (
      <div className="prose dark:prose-invert max-w-none text-sm">
        <ReactMarkdown>{announcement.content}</ReactMarkdown>
      </div>
    );
  };

  const renderTitle = () => {
    if (!date || !isValid(date)) {
      return <Skeleton className="h-6 w-48" />;
    }
    return `${format(date, 'M月d日', { locale: ja })} (${format(date, 'EEEE', { locale: ja })}) のお知らせ`;
  };

  return (
    <Card className="mb-6 shadow-md">
      <CardHeader className="flex flex-row justify-between items-start pb-2">
        <div>
          <CardTitle className="text-lg">{renderTitle()}</CardTitle>
          <CardDescription>クラス全体への連絡事項です。</CardDescription>
        </div>
        {!isEditing && announcement?.content && date && canEdit && (
          <Button variant="outline" size="sm" onClick={handleEditClick}>
            <Edit className="mr-1 h-4 w-4" /> 編集
          </Button>
        )}
      </CardHeader>
      <CardContent>{renderContent()}</CardContent>
    </Card>
  );
}
