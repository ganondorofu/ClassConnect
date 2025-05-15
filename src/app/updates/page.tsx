
"use client";

import React from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface UpdateEntry {
  version: string;
  date: string;
  title: string;
  type: 'new' | 'fix' | 'improvement';
  details: string[];
}

const updateLog: UpdateEntry[] = [
  {
    version: "1.0.0",
    date: "2024-05-15", // Use current date or actual release date
    title: "初回リリース＆大型アップデート！",
    type: 'new',
    details: [
      "ClassConnectへようこそ！最初のバージョンがリリースされました。",
      "ダッシュボード（サイドバーメニュー）を導入し、ナビゲーションを改善しました。",
      "本「更新ログ」ページを追加しました。今後のアップデート情報はこちらで確認できます。",
      "新機能「課題管理」を実装しました。課題の登録、一覧表示、編集、削除、カレンダー連携が可能です。",
      "管理者向けに、お問い合わせ内容を一覧で確認し、ステータスを管理できるページを追加しました。",
      "モバイル版で時間割表の連絡事項が多い場合に表示がずれるバグを修正しました。",
      "全体的なUI/UXの改善とパフォーマンス向上を行いました。",
    ],
  },
  // Future updates will be added here
];

const typeLabel: Record<UpdateEntry['type'], string> = {
  new: '新機能',
  fix: 'バグ修正',
  improvement: '改善',
};

const typeColor: Record<UpdateEntry['type'], string> = {
  new: 'bg-green-500 hover:bg-green-600',
  fix: 'bg-red-500 hover:bg-red-600',
  improvement: 'bg-blue-500 hover:bg-blue-600',
};

export default function UpdatesPage() {
  return (
    <MainLayout>
      <div className="container mx-auto py-8 px-4 md:px-0">
        <h1 className="text-3xl font-bold mb-8 text-center text-primary">
          ClassConnect 更新ログ
        </h1>
        <div className="space-y-8">
          {updateLog.map((entry) => (
            <Card key={entry.version} className="shadow-lg">
              <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <CardTitle className="text-2xl font-semibold">
                    {entry.title}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge className={`${typeColor[entry.type]} text-white`}>
                      {typeLabel[entry.type]}
                    </Badge>
                    <Badge variant="outline">v{entry.version}</Badge>
                  </div>
                </div>
                <CardDescription className="text-sm text-muted-foreground pt-1">
                  リリース日: {entry.date}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
                  {entry.details.map((detail, index) => (
                    <li key={index}>{detail}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
        {updateLog.length === 0 && (
          <p className="text-center text-muted-foreground mt-10">
            更新履歴はまだありません。
          </p>
        )}
      </div>
    </MainLayout>
  );
}
