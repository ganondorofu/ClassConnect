
// This file now contains client-side helper functions to call API routes
// 'use server'; // Removed

import type { FirebaseError } from 'firebase/app';

export async function requestSummaryGeneration(date: string, userId: string): Promise<string | null> {
  if (!date) {
    console.error("requestSummaryGeneration called with no date.");
    return null;
  }
  try {
    const response = await fetch('/api/summary/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ date, userId }),
    });

    if (!response.ok) {
      let errorMessage = `API error: ${response.status}`;
      try {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } else {
          const errorText = await response.text();
          // Truncate long HTML error messages
          errorMessage = `API error ${response.status}: ${errorText.substring(0, 200)}${errorText.length > 200 ? '...' : ''}`;
        }
      } catch (e) {
        // If parsing errorData fails or reading text fails, stick with the status code
        console.error("Failed to parse error response:", e);
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.summary;
  } catch (error: any) {
    console.error(`Error requesting summary generation for date ${date}:`, error);
    if (error.message && error.message.includes("AI機能は設定されていません")) {
        throw error; 
    }
    if ((error as FirebaseError).code === 'unavailable' || error.message.includes("offline") || error.message.includes("Failed to fetch")) {
        throw new Error("オフラインのため要約を生成できませんでした。");
    }
    throw new Error(error.message || "要約の生成中に予期せぬエラーが発生しました。");
  }
}

export async function requestSummaryDeletion(date: string, userId: string): Promise<void> {
  if (!date) {
    console.error("requestSummaryDeletion called with no date.");
    return;
  }
  try {
    const response = await fetch('/api/summary/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ date, userId }),
    });

    if (!response.ok) {
      let errorMessage = `API error: ${response.status}`;
      try {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } else {
          const errorText = await response.text();
          // Truncate long HTML error messages
          errorMessage = `API error ${response.status}: ${errorText.substring(0, 200)}${errorText.length > 200 ? '...' : ''}`;
        }
      } catch (e) {
        console.error("Failed to parse error response for deletion:", e);
      }
      throw new Error(errorMessage);
    }
    // No specific data to return on success for deletion
  } catch (error: any) {
    console.error(`Error requesting summary deletion for date ${date}:`, error);
     if ((error as FirebaseError).code === 'unavailable' || error.message.includes("offline") || error.message.includes("Failed to fetch")) {
       throw new Error("オフラインのため要約を削除できませんでした。");
    }
    throw new Error(error.message || "要約の削除中に予期せぬエラーが発生しました。");
  }
}

