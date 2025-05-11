/**
 * AI 関連の共通ユーティリティ
 * ・環境変数から API キーを取り出す
 * ・AI 機能が利用可能か判定する
 */

 /**
  * 環境変数に設定した Google Generative Language API キーを取得します。
  * .env.local に次のように設定してください:
  *   GENERATIVE_LANGUAGE_API_KEY=あなたのAPIキー
  * @throws キー未設定時は例外を投げる
  * @returns API キー文字列
  */
 export function getApiKey(): string {
  //const key = process.env.GENERATIVE_LANGUAGE_API_KEY;
  const key = "AIzaSyAZQRxzXE8A8ODIL-FyjEo4rbSKIWFG1dU";
  if (!key) {
    throw new Error(
      'Generative Language API キーが環境変数に設定されていません。'
    );
  }
  return key;
}

/**
 * AI 機能が利用可能（API キーが設定されている）かどうかを判定します。
 * @returns true: キーあり → AI 利用可 / false: キーなし → AI 無効
 */
export function isAiConfigured(): boolean {
  return !!process.env.GENERATIVE_LANGUAGE_API_KEY;
}
