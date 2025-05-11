import { z } from 'zod';
import { getApiKey, isAiConfigured } from '@/ai/ai-instance';

/**
 * 要約対象の入力オブジェクトのスキーマ定義
 * - announcementText: 要約したい連絡事項テキスト（必須・非空）
 */
const SummarizeAnnouncementInputSchema = z.object({
  announcementText: z
    .string()
    .min(1, '連絡事項のテキストが空です。')
    .describe('要約対象の連絡事項テキスト'),
});
export type SummarizeAnnouncementInput = z.infer<
  typeof SummarizeAnnouncementInputSchema
>;

/**
 * 要約結果オブジェクトのスキーマ定義
 * - summary: Markdown 形式の要約テキスト
 */
const SummarizeAnnouncementOutputSchema = z.object({
  summary: z.string().describe('Markdown形式の要約結果'),
});
export type SummarizeAnnouncementOutput = z.infer<
  typeof SummarizeAnnouncementOutputSchema
>;

/**
 * Google Generative Language API の generateContent を直接叩いて
 * announcementText を Markdown 箇条書きで要約します。
 *
 * @param input { announcementText: string }
 * @returns { summary: string }
 * @throws 入力エラー、APIキー未設定、リクエスト失敗、レスポンス形式エラー など
 */
export async function summarizeAnnouncement(
  input: SummarizeAnnouncementInput
): Promise<SummarizeAnnouncementOutput> {
  // 1) 入力検証
  const parsedInput = SummarizeAnnouncementInputSchema.safeParse(input);
  if (!parsedInput.success) {
    throw new Error(parsedInput.error.errors.map((e) => e.message).join('; '));
  }
  const textToSummarize = parsedInput.data.announcementText;

  // 2) AI設定チェック
  if (!isAiConfigured()) {
    throw new Error('AI 機能が設定されていません。API キーを確認してください。');
  }
  const apiKey = getApiKey();

  // 3) エンドポイントとリクエストボディ組み立て
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [
      {
        parts: [{ text: textToSummarize }],
      },
    ],
    // generationConfig: { temperature: 0.5 }, // 必要なら有効化
  };

  // 4) fetch でリクエスト実行
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  // 5) レスポンステキスト取得 → JSON パース
  const raw = await res.text();
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    console.error('⚠️ 非JSONレスポンス:', raw);
    throw new Error('APIがHTMLまたは不正な形式で応答しました。');
  }

  // 6) HTTP ステータスチェック
  if (!res.ok) {
    console.error('🔴 API エラー詳細:', json);
    const code = json.error?.code ?? res.status;
    const msg = json.error?.message ?? res.statusText;
    throw new Error(`API error ${code}: ${msg}`);
  }

  // 7) 要約テキスト抽出
  const candidate = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!candidate) {
    console.error('⚠️ 要約テキストが見つかりませんでした:', json);
    throw new Error('要約テキストの抽出に失敗しました。');
  }

  // 8) 出力検証＆返却
  const out = { summary: candidate };
  const parsedOut = SummarizeAnnouncementOutputSchema.safeParse(out);
  if (!parsedOut.success) {
    throw new Error('要約結果がスキーマ検証に失敗しました。');
  }
  return parsedOut.data;
}
