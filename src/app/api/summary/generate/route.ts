
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
      return NextResponse.json({ error: 'User ID is required and must be a string.' }, { status: 400 });
    }

    const summary = await generateAndStoreAnnouncementSummary(date, userId);
    return NextResponse.json({ summary });
  } catch (error: any) {
    console.error(`API Error generating summary (route handler):`);
    console.error(`Error Type: ${typeof error}`);
    if (error && error.message) {
      console.error(`Error Message: ${error.message}`);
    }
    if (error && error.name) {
      console.error(`Error Name: ${error.name}`);
    }
    if (error && error.stack) {
      console.error(`Error Stack: ${error.stack}`);
    }
    // Attempt to get more details from the error object
    let errorDetails = {};
    if (error && typeof error === 'object') {
        errorDetails = Object.getOwnPropertyNames(error).reduce((acc, key) => {
            acc[key] = (error as any)[key];
            return acc;
        }, {} as Record<string, any>);
    }
    console.error(`Full Error Object (stringified): ${JSON.stringify(errorDetails)}`);


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

    return NextResponse.json({ 
        error: responseErrorMessage, 
        type: error?.name || (typeof error), 
        details: errorDetails 
    }, { status: 500 });
  }
}
