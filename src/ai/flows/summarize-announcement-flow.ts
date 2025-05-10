'use server';
/**
 * @fileOverview A Genkit flow for summarizing announcement text.
 *
 * - summarizeAnnouncement - A function that handles the announcement summarization.
 * - SummarizeAnnouncementInput - The input type for the summarizeAnnouncement function.
 * - SummarizeAnnouncementOutput - The return type for the summarizeAnnouncement function.
 */

import { ai, isAiConfigured } from '@/ai/ai-instance'; // Corrected import path and add isAiConfigured
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
  if (!isAiConfigured()) {
    console.warn("AI is not configured. Skipping summary generation.");
    throw new Error("AI機能は設定されていません。管理者に連絡してください。");
  }
  return summarizeAnnouncementFlow(input);
}

const summarizePrompt = ai.definePrompt({
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

const summarizeAnnouncementFlow = ai.defineFlow(
  {
    name: 'summarizeAnnouncementFlow',
    inputSchema: SummarizeAnnouncementInputSchema,
    outputSchema: SummarizeAnnouncementOutputSchema,
  },
  async (input) => {
    const { output } = await summarizePrompt(input);
    if (!output) {
      throw new Error('Failed to generate summary.');
    }
    return output;
  }
);

