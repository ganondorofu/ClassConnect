
import {genkit} from 'genkit';
import {googleAI, type GoogleAIPlugin} from '@genkit-ai/googleai';

const googleApiKey = process.env.GOOGLE_GENAI_API_KEY;

let activePlugins: GoogleAIPlugin[] = [];

if (!googleApiKey) {
  console.warn(
    "WARNING: GOOGLE_GENAI_API_KEY is not set in environment variables. AI features will be disabled. Please set it in your .env.local file if you want to use AI capabilities."
  );
} else {
  activePlugins.push(googleAI({ apiKey: googleApiKey }));
}

export const ai = genkit({
  promptDir: './src/ai/prompts', // Adjusted path to be relative to project root or a clear location
  plugins: activePlugins,
  // Model should ideally be specified per prompt or generate call for clarity
  // model: 'googleai/gemini-2.0-flash', 
});

/**
 * Checks if the AI features are configured (i.e., API key is set).
 * @returns {boolean} True if AI is configured, false otherwise.
 */
export const isAiConfigured = (): boolean => {
  return !!googleApiKey;
};
