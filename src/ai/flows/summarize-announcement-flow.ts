'use server';
/**
 * @fileOverview A Genkit flow for summarizing announcement text.
 *
 * - summarizeAnnouncement - A function that handles the announcement summarization.
 * - SummarizeAnnouncementInput - The input type for the summarizeAnnouncement function.
 * - SummarizeAnnouncementOutput - The return type for the summarizeAnnouncement function.
 */

import { ai } from '@/ai/ai-instance'; // Corrected import path
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
  return summarizeAnnouncementFlow(input);
}

const summarizePrompt = ai.definePrompt({
  name: 'summarizeAnnouncementPrompt',
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

