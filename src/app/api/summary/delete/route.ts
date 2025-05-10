
import { NextResponse, type NextRequest } from 'next/server';
import { deleteAiSummary } from '@/controllers/timetableController';
import type { FirebaseError } from 'firebase/app';

export async function POST(request: NextRequest) {
  try {
    const { date, userId } = await request.json();

    if (!date || typeof date !== 'string') {
      return NextResponse.json({ error: 'Date is required and must be a string.' }, { status: 400 });
    }
     if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'User ID is required for logging.' }, { status: 400 });
    }

    await deleteAiSummary(date, userId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(`API Error deleting summary:`, error);
    if ((error as FirebaseError).code === 'unavailable') {
      return NextResponse.json({ error: "オフラインのため要約を削除できませんでした。" }, { status: 503 });
    }
    return NextResponse.json({ error: error.message || 'Failed to delete summary.' }, { status: 500 });
  }
}
