
import { NextResponse, type NextRequest } from 'next/server';
import { generateAndStoreAnnouncementSummary } from '@/controllers/timetableController';
import type { FirebaseError } from 'firebase/app';

export async function POST(request: NextRequest) {
  try {
    const { date, userId } = await request.json();

    if (!date || typeof date !== 'string') {
      return NextResponse.json({ error: 'Date is required and must be a string.' }, { status: 400 });
    }
    if (!userId || typeof userId !== 'string') {
      // While userId might not be strictly validated on backend for AI call, it's good practice
      return NextResponse.json({ error: 'User ID is required and must be a string.' }, { status: 400 });
    }

    const summary = await generateAndStoreAnnouncementSummary(date, userId);
    return NextResponse.json({ summary });
  } catch (error: any) {
    console.error(`API Error generating summary:`, error);
    if (error.message && error.message.includes("AI機能は設定されていません")) {
      return NextResponse.json({ error: error.message }, { status: 503 }); // Service Unavailable
    }
    if ((error as FirebaseError).code === 'unavailable') {
      return NextResponse.json({ error: "オフラインのため要約を生成できませんでした。" }, { status: 503 });
    }
    return NextResponse.json({ error: error.message || 'Failed to generate summary.' }, { status: 500 });
  }
}
