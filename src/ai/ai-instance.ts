import {genkit} from 'genkit';
import type { Plugin } from '@genkit-ai/core';
import {googleAI} from '@genkit-ai/googleai';

// Ensure GOOGLE_GENAI_API_KEY is read from .env.local or fallback to the hardcoded one.
// The user explicitly set this key in a previous step.
const envApiKey = process.env.GOOGLE_GENAI_API_KEY;
const hardcodedApiKey = "AIzaSyBJc9NcsOWwnmSH-robtbpsEJXENwDwRoE";
let effectiveApiKey = envApiKey || hardcodedApiKey;

let activePlugins: Plugin[] = [];

if (!effectiveApiKey) {
  console.warn(
    "WARNING: GOOGLE_GENAI_API_KEY is not set in environment variables and no fallback is hardcoded. AI features will be disabled. Please set it in your .env.local file if you want to use AI capabilities."
  );
} else {
  try {
    // Attempt to initialize the GoogleAI plugin
    activePlugins.push(googleAI({ apiKey: effectiveApiKey }));
    console.log("Google AI plugin initialized successfully.");
  } catch (e) {
    console.error("CRITICAL: Failed to initialize Google AI plugin. AI features will be disabled. Check API key and project settings.", e);
    // If initialization fails, ensure effectiveApiKey is considered null for isAiConfigured check
    effectiveApiKey = undefined; // Mark as not configured
    activePlugins = []; // Ensure no plugins are active if one fails
  }
}

export const ai = genkit({
  promptDir: './src/ai/prompts',
  plugins: activePlugins,
  // model: 'googleai/gemini-2.0-flash', // Model is defined per-prompt
});

/**
 * Checks if the AI features are configured and the Google AI plugin is active.
 * @returns {boolean} True if AI is configured and plugin is active, false otherwise.
 */
export const isAiConfigured = (): boolean => {
  // Check if effectiveApiKey is set (meaning it was provided AND plugin init didn't fail)
  // AND check if the googleai plugin is actually in the list of active plugins.
  return !!effectiveApiKey && activePlugins.some(plugin => plugin.name === 'googleai');
};

/**
 * Retrieves the currently configured Google GenAI API key.
 * This is for potential diagnostic purposes or if other parts of the app need it directly.
 * @returns {string | undefined} The API key if configured, otherwise undefined.
 */
export const getGoogleApiKey = (): string | undefined => {
    return effectiveApiKey;
};