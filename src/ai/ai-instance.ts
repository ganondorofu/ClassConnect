
import {genkit, type GenkitPlugin} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

// This function will be called to get the plugins for Genkit.
// It reads the environment variable when called.
const initializeActivePlugins = (): GenkitPlugin[] => {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    console.warn(
      "WARNING: GOOGLE_GENAI_API_KEY is not set in environment variables. AI features will be disabled. Please set it in your .env.local file and restart the server if you want to use AI capabilities."
    );
    return [];
  }
  return [googleAI({ apiKey })];
};

export const ai = genkit({
  promptDir: './src/ai/prompts',
  plugins: initializeActivePlugins(),
  // model: 'googleai/gemini-2.0-flash', // Model is defined per prompt, if not globally here
});

/**
 * Checks if the AI features are configured (i.e., API key is set).
 * This function reads the environment variable directly when called.
 * @returns {boolean} True if AI is configured, false otherwise.
 */
export const isAiConfigured = (): boolean => {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  // A warning here might be redundant if initializeActivePlugins already warned,
  // but could be useful if this function is called from other contexts.
  // Consider removing if too noisy and initializeActivePlugins warning is sufficient.
  if (!apiKey) {
    // console.warn("isAiConfigured check: GOOGLE_GENAI_API_KEY is not set.");
  }
  return !!apiKey;
};

