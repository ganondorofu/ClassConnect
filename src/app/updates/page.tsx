
"use client";

import React from 'react';
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
    version: "1.1.0",
    date: "2024-05-20", 
    title: "時間割の一括編集＆UI/UXの大幅改善",
    type: 'improvement',
    details: [
      "【新機能】時間割表で複数のコマを一度に選択し、同じ科目を設定できる「一括編集機能」を追加しました。",
      "【改善】科目選択で「科目未設定（なし）」を明示的に選べるようにし、空きコマの設定が容易になりました。",
      "【改善】一括編集パネルが表示されても、時間割表の一番下のコマが隠れないように画面レイアウトを調整しました。",
      "【バグ修正】一部のページでヘッダーが二重に表示されるレイアウトの不具合を修正しました。",
      "【改善】アプリケーション全体で「生徒/先生」などの表現を「学生/クラス管理者」に統一し、分かりやすさを向上させました。",
    ],
  },
  {
    version: "1.0.0",
    date: "2024-05-15",
    title: "初回リリース＆主要機能の実装",
    type: 'new',
    details: [
      "ClassConnectの最初のバージョンが利用可能になりました。",
      "時間割・日々の連絡事項の表示、編集機能。",
      "課題の登録、一覧表示、編集、削除、カレンダー連携機能。",
      "クラスの重要な行事を登録・表示するカレンダー機能。",
      "利用者からのご意見を送信できるお問い合わせフォーム。",
      "管理者向けに、お問い合わせ内容を一覧で確認し、ステータスを管理できるページ。",
      "更新情報を確認できる「更新ログ」ページ。",
    ],
  },
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
  );
}
