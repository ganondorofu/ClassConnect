
import { NextResponse, type NextRequest } from 'next/server';
import { generateAndStoreAnnouncementSummary } from '@/services/aiSummarizationService'; 
import type { FirebaseError } from 'firebase/app';

export async function POST(request: NextRequest) {
  let requestBody;
  try {
    requestBody = await request.json();
  } catch (e) {
    console.error("[API_ERROR] /api/summary/generate: Invalid JSON in request body", e);
    return NextResponse.json({ error: '無効なリクエストデータです。', type: 'INVALID_REQUEST_BODY' }, { status: 400 });
  }

  const { date, userId } = requestBody;

  if (!date || typeof date !== 'string') {
    return NextResponse.json({ error: 'Date is required and must be a string.', type: 'INVALID_DATE_PARAM' }, { status: 400 });
  }
  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'User ID is required and must be a string for logging.', type: 'INVALID_USERID_PARAM' }, { status: 400 });
  }

  try {
    const summary = await generateAndStoreAnnouncementSummary(date, userId);
    return NextResponse.json({ summary });
  } catch (error: any) {
    console.error(`[API_ERROR] /api/summary/generate: Failed to generate summary for date ${date}`);
    console.error(`[API_ERROR_DETAILS] Message: ${error.message}`);
    console.error(`[API_ERROR_DETAILS] Name: ${error.name}`);
    console.error(`[API_ERROR_DETAILS] Stack: ${error.stack}`);
    if (error.cause) {
      // Ensure error.cause is stringified if it's an object for better logging
      const causeDetails = (typeof error.cause === 'object' && error.cause !== null) ? JSON.stringify(error.cause) : String(error.cause);
      console.error(`[API_ERROR_DETAILS] Cause: ${causeDetails}`);
    }
    const errorProperties = Object.getOwnPropertyNames(error).reduce((acc, key) => {
        acc[key] = (error as any)[key];
        return acc;
    }, {} as Record<string, any>);
    console.error(`[API_ERROR_DETAILS] All Properties: ${JSON.stringify(errorProperties, null, 2)}`);


    if (error.message && error.message.includes("AI機能は設定されていません")) {
      return NextResponse.json({ error: error.message, type: 'AI_NOT_CONFIGURED', details: error.stack }, { status: 503 }); 
    }
    if (error.message && error.message.startsWith("AI Flow Error:")) {
      const originalAiErrorMessage = error.message.substring("AI Flow Error: ".length);
      // Provide a slightly more user-friendly message but include technical details for debugging
      return NextResponse.json({ error: `AI処理中にエラーが発生しました: ${originalAiErrorMessage}`, type: 'AI_PROCESSING_ERROR', details: error.stack }, { status: 500 });
    }
    if ((error as FirebaseError).code === 'unavailable') {
      return NextResponse.json({ error: "オフラインのため要約を生成できませんでした。", type: 'FIREBASE_OFFLINE', details: error.stack }, { status: 503 });
    }
    
    let responseErrorMessage = 'Failed to generate summary.';
    if (error && error.message) {
        responseErrorMessage = error.message;
    } else if (typeof error === 'string') {
        responseErrorMessage = error;
    }

    return NextResponse.json({ 
        error: `サーバーエラー: ${responseErrorMessage}`, 
        type: error?.name || (typeof error === 'object' && error !== null ? error.constructor.name : typeof error),
        details: `An unexpected error occurred on the server. Please check server logs. Original error: ${error.message}`
    }, { status: 500 });
  }
}
