
'use server';
/**
 * @fileOverview A Genkit flow for summarizing announcement text.
 *
 * - summarizeAnnouncement - A function that handles the announcement summarization.
 * - SummarizeAnnouncementInput - The input type for the summarizeAnnouncement function.
 * - SummarizeAnnouncementOutput - The return type for the summarizeAnnouncement function.
 */

import { ai, isAiConfigured } from '@/ai/ai-instance'; 
import { z } from 'genkit';

const SummarizeAnnouncementInputSchema = z.object({
  announcementText: z.string().describe('The full text of the announcement to be summarized.'),
});
export type SummarizeAnnouncementInput = z.infer<typeof SummarizeAnnouncementInputSchema>;

const SummarizeAnnouncementOutputSchema = z.object({
  summary: z.string().describe('A concise summary of the announcement, formatted as Markdown bullet points.'),
});
export type SummarizeAnnouncementOutput = z.infer<typeof SummarizeAnnouncementOutputSchema>;

export async function summarizeAnnouncement(input: SummarizeAnnouncementInput): Promise<SummarizeAnnouncementOutput> {
  console.log('[AI Flow Entry] summarizeAnnouncement called.');
  if (!isAiConfigured()) {
    console.warn("[AI Flow Entry] AI is not configured (isAiConfigured() returned false). Skipping summary generation.");
    throw new Error("AI機能は設定されていません。管理者に連絡してください。");
  }
  console.log('[AI Flow Entry] AI is configured. Proceeding to call summarizeAnnouncementFlow.');
  return summarizeAnnouncementFlow(input);
}

const summarizePrompt = ai.definePrompt({
  name: 'summarizeAnnouncementPrompt',
  model: 'googleai/gemini-2.0-flash', 
  input: { schema: SummarizeAnnouncementInputSchema },
  output: { schema: SummarizeAnnouncementOutputSchema },
  prompt: `以下の連絡事項を、Markdown形式の簡潔な箇条書きで要約してください。

連絡事項:
{{{announcementText}}}

要約 (Markdown形式の箇条書き):
`,
});

const summarizeAnnouncementFlow = ai.defineFlow(
  {
    name: 'summarizeAnnouncementFlow',
    inputSchema: SummarizeAnnouncementInputSchema,
    outputSchema: SummarizeAnnouncementOutputSchema,
  },
  async (input) => {
    try {
      console.log(`[Genkit Flow summarizeAnnouncementFlow] Starting for text: ${input.announcementText.substring(0, 70)}...`);
      const { output } = await summarizePrompt(input);
      if (!output) {
        console.error('[Genkit Flow summarizeAnnouncementFlow] summarizePrompt returned no output.');
        throw new Error('Failed to generate summary from AI.');
      }
      console.log(`[Genkit Flow summarizeAnnouncementFlow] Summary generated successfully. Length: ${output.summary.length}`);
      return output;
    } catch (flowError: any) {
      console.error(`[Genkit Flow summarizeAnnouncementFlow] Error: ${flowError.message}`, flowError.stack, JSON.stringify(flowError, Object.getOwnPropertyNames(flowError)));
      // It's better to throw a new error with a message that can be displayed to the user,
      // or let the controller handle the specifics of the error.
      throw new Error(`AI要約フローでエラーが発生しました。詳細はサーバーログを確認してください。 (Original: ${flowError.message || 'Unknown AI flow error'})`);
    }
  }
);
