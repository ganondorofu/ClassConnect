
import {genkit, type GenkitPlugin} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

// This function will be called to get the plugins for Genkit.
// It reads the environment variable when called.
const initializeActivePlugins = (): GenkitPlugin[] => {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    const errorMessage = "CRITICAL: GOOGLE_GENAI_API_KEY is not set in environment variables. AI features will be disabled. Please set this in your Vercel project environment variables for the production build, or in .env.local for local development.";
    console.error(errorMessage); // Log as error for server logs
    // For Vercel deployment, throwing an error here might provide clearer build failure reasons.
    // However, returning an empty array allows the app to start, with AI features failing at runtime.
    // Consider uncommenting the throw if a hard failure on missing key is preferred during deployment.
    // throw new Error(errorMessage); 
    return [];
  }
  console.log("[Genkit Init] GOOGLE_GENAI_API_KEY is set. Initializing GoogleAI plugin.");
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
  if (!apiKey) {
    console.warn("[isAiConfigured] Check: GOOGLE_GENAI_API_KEY is not set.");
  }
  return !!apiKey;
};
