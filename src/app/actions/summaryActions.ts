
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
      let errorType = 'UNKNOWN_API_ERROR';
      try {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
          errorType = errorData.type || errorType;
          // If the server sends detailed error info, use it
          if (errorData.details) {
            console.error("Server error details:", errorData.details);
          }
        } else {
          // Attempt to read text only if not JSON, could be HTML error page
          const errorText = await response.text();
          errorMessage = `API error ${response.status}: ${errorText.substring(0, 200)}${errorText.length > 200 ? '...' : ''}`;
        }
      } catch (e) {
        console.error("Failed to parse error response:", e);
      }
      
      // Specific user-facing messages based on error type from server
      if (errorType === 'AI_NOT_CONFIGURED') {
        throw new Error("AI機能は設定されていません。管理者に連絡してください。");
      } else if (errorType === 'AI_PROCESSING_ERROR') {
        throw new Error(errorMessage); // Show the specific AI processing error from the server
      } else if (errorType === 'FIREBASE_OFFLINE') {
         throw new Error("オフラインのため要約を生成できませんでした。");
      }
      
      // Revised logic for other errors:
      // Prefer the specific message from the server unless it's very generic.
      const genericApiErrorMessages = [
        "API error 500: Failed to generate summary.", // Exact match for a very generic server error
        `API error ${response.status}: Failed to generate summary.`, // Another form
        "サーバーエラー: Failed to generate summary.",
        `サーバーエラー: サーバーエラー: Failed to generate summary.` // In case it gets double wrapped
      ];
      
      const isVeryGenericApiErrorMessage = genericApiErrorMessages.some(msg => errorMessage.startsWith(msg) && errorMessage.length < (msg.length + 10)); // allow for small additions but not much detail

      if (errorMessage.startsWith("API error") || errorMessage.startsWith("サーバーエラー:")) {
        if (isVeryGenericApiErrorMessage && !errorMessage.includes("AI Flow Error")) {
          // If it's a truly generic message and not a relayed AI Flow Error, show our standard fallback.
          throw new Error("要約の生成中にサーバーでエラーが発生しました。");
        } else {
          // Otherwise, the server message (errorMessage) likely contains more useful details.
          throw new Error(errorMessage); 
        }
      } else {
          // For non-API errors or errors parsed differently.
          throw new Error(errorMessage);
      }
    }

    const data = await response.json();
    return data.summary;
  } catch (error: any) {
    console.error(`Error requesting summary generation for date ${date}:`, error);
    // Re-throw specific errors already constructed, or create a new one for general issues.
    if (error.message.includes("AI機能は設定されていません") || 
        error.message.includes("AI処理エラー:") || 
        error.message.includes("オフラインのため")) {
        throw error; 
    }
    if ((error as FirebaseError).code === 'unavailable' || error.message.includes("offline") || error.message.includes("Failed to fetch")) {
        throw new Error("オフラインのため要約を生成できませんでした。");
    }
    // Fallback for other unexpected client-side errors or unhandled re-throws
    throw new Error(error.message || "要約の生成リクエスト中に予期せぬエラーが発生しました。");
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
          errorMessage = `API error ${response.status}: ${errorText.substring(0, 200)}${errorText.length > 200 ? '...' : ''}`;
        }
      } catch (e) {
        console.error("Failed to parse error response for deletion:", e);
      }
      throw new Error(errorMessage.startsWith("API error") ? "要約の削除中にサーバーでエラーが発生しました。" : errorMessage);
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

