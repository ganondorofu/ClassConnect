
// 'use server'; // Removed: This is not a module used by an API route.

/**
 * @fileOverview A Genkit flow for summarizing announcement text.
 *
 * - summarizeAnnouncement - A function that handles the announcement summarization.
 * - SummarizeAnnouncementInput - The input type for the summarizeAnnouncement function.
 * - SummarizeAnnouncementOutput - The return type for the summarizeAnnouncement function.
 */

import { ai, isAiConfigured } from '@/ai/ai-instance';
import { z } from 'genkit';
import type { Flow, Prompt } from 'genkit'; // Import types for conditional assignment

const SummarizeAnnouncementInputSchema = z.object({
  announcementText: z.string().describe('The full text of the announcement to be summarized.'),
});
export type SummarizeAnnouncementInput = z.infer<typeof SummarizeAnnouncementInputSchema>;

const SummarizeAnnouncementOutputSchema = z.object({
  summary: z.string().describe('A concise summary of the announcement, formatted as Markdown bullet points.'),
});
export type SummarizeAnnouncementOutput = z.infer<typeof SummarizeAnnouncementOutputSchema>;

// Conditionally define prompt and flow
// These will hold the Genkit prompt and flow definitions if AI is configured.
let summarizePromptInstance: Prompt<typeof SummarizeAnnouncementInputSchema, typeof SummarizeAnnouncementOutputSchema> | undefined;
let summarizeAnnouncementFlowInstance: Flow<typeof SummarizeAnnouncementInputSchema, typeof SummarizeAnnouncementOutputSchema> | undefined;

if (isAiConfigured()) {
  summarizePromptInstance = ai.definePrompt({
    name: 'summarizeAnnouncementPrompt',
    model: 'googleai/gemini-2.0-flash', // Explicitly define model
    input: { schema: SummarizeAnnouncementInputSchema },
    output: { schema: SummarizeAnnouncementOutputSchema },
    prompt: `以下の連絡事項を、Markdown形式の簡潔な箇条書きで要約してください。

連絡事項:
{{{announcementText}}}

要約 (Markdown形式の箇条書き):
`,
  });

  summarizeAnnouncementFlowInstance = ai.defineFlow(
    {
      name: 'summarizeAnnouncementFlow',
      inputSchema: SummarizeAnnouncementInputSchema,
      outputSchema: SummarizeAnnouncementOutputSchema,
    },
    async (input) => {
      if (!summarizePromptInstance) {
        // This case should ideally not be reached if isAiConfigured() was true during setup.
        throw new Error('Summarize prompt is not initialized. AI configuration issue.');
      }
      try {
        const { output } = await summarizePromptInstance(input);
        if (!output) {
          throw new Error('Failed to generate summary (no output).');
        }
        return output;
      } catch (flowError: any) {
        console.error("Error within summarizeAnnouncementFlow:", flowError);
        // Re-throw to be caught by the service/API route, but with potentially more info
        // This helps in distinguishing AI specific processing errors.
        let detail = flowError.message || String(flowError);
        if (flowError.cause && typeof flowError.cause === 'object' && flowError.cause.message) {
            detail += ` | कॉज: ${flowError.cause.message}`;
        } else if (flowError.details) {
            detail += ` | 詳細: ${JSON.stringify(flowError.details)}`;
        }
        throw new Error(`AI Flow Error: ${detail}`);
      }
    }
  );
}

export async function summarizeAnnouncement(input: SummarizeAnnouncementInput): Promise<SummarizeAnnouncementOutput> {
  if (!isAiConfigured() || !summarizeAnnouncementFlowInstance) {
    console.warn("AI is not configured or the summarization flow is not defined. Skipping summary generation.");
    throw new Error("AI機能は設定されていません。管理者に連絡してください。");
  }
  return summarizeAnnouncementFlowInstance(input);
}

