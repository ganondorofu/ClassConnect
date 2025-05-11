
import { NextResponse, type NextRequest } from 'next/server';
import { generateAndStoreAnnouncementSummary } from '@/services/aiSummarizationService'; 
import type { FirebaseError } from 'firebase/app';

export async function POST(request: NextRequest) {
  try {
    const { date, userId } = await request.json();

    if (!date || typeof date !== 'string') {
      return NextResponse.json({ error: 'Date is required and must be a string.' }, { status: 400 });
    }
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'User ID is required and must be a string for logging.' }, { status: 400 });
    }

    const summary = await generateAndStoreAnnouncementSummary(date, userId);
    return NextResponse.json({ summary });
  } catch (error: any) {
    // Log the full error details on the server side for better debugging
    console.error(`[API_ERROR] /api/summary/generate: Failed to generate summary for date ${request.nextUrl.searchParams.get('date')}`);
    console.error(`[API_ERROR_DETAILS] Message: ${error.message}`);
    console.error(`[API_ERROR_DETAILS] Name: ${error.name}`);
    console.error(`[API_ERROR_DETAILS] Stack: ${error.stack}`);
    if (error.cause) {
      console.error(`[API_ERROR_DETAILS] Cause: ${JSON.stringify(error.cause)}`);
    }
    // Extract additional properties if available
    const errorProperties = Object.getOwnPropertyNames(error).reduce((acc, key) => {
        acc[key] = (error as any)[key];
        return acc;
    }, {} as Record<string, any>);
    console.error(`[API_ERROR_DETAILS] All Properties: ${JSON.stringify(errorProperties, null, 2)}`);


    if (error.message && error.message.includes("AI機能は設定されていません")) {
      return NextResponse.json({ error: error.message, type: 'AI_NOT_CONFIGURED' }, { status: 503 }); 
    }
    if ((error as FirebaseError).code === 'unavailable') {
      return NextResponse.json({ error: "オフラインのため要約を生成できませんでした。", type: 'FIREBASE_OFFLINE' }, { status: 503 });
    }
    
    let responseErrorMessage = 'Failed to generate summary.';
    if (error && error.message) {
        responseErrorMessage = error.message;
    } else if (typeof error === 'string') {
        responseErrorMessage = error;
    }

    // Ensure a JSON response is always sent
    return NextResponse.json({ 
        error: `サーバーエラー: ${responseErrorMessage}`, 
        type: error?.name || (typeof error),
        details: `An unexpected error occurred on the server. Please check server logs. Original error: ${error.message}`
    }, { status: 500 });
  }
}
