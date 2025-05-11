// src/ai/ai-instance.ts
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

// Key provided by user: AIzaSyAZQRxzXE8A8ODIL-FyjEo4rbSKIWFG1dU
// IT IS STRONGLY RECOMMENDED TO USE ENVIRONMENT VARIABLES FOR API KEYS IN PRODUCTION.
// This hardcoded key is included for debugging to ensure AI functionality can be tested
// if environment variable setup is problematic.
// For production, GOOGLE_GENAI_API_KEY should be set securely in your environment.
const DEBUG_API_KEY = "AIzaSyAZQRxzXE8A8ODIL-FyjEo4rbSKIWFG1dU"; 

let effectiveApiKey = process.env.GOOGLE_GENAI_API_KEY;

if (!effectiveApiKey) {
  console.warn(
    "--------------------------------------------------------------------------------\n" +
    "WARNING: GOOGLE_GENAI_API_KEY environment variable is NOT SET.\n" +
    "         Attempting to use a hardcoded DEBUG_API_KEY for AI features.\n" +
    "         This is INSECURE and NOT recommended for production environments.\n" +
    "         Please ensure GOOGLE_GENAI_API_KEY is properly configured in your\n" +
    "         .env.local file or hosting environment for secure operation.\n" +
    "--------------------------------------------------------------------------------"
  );
  effectiveApiKey = DEBUG_API_KEY; 
}

const pluginsToUse:any[] = []; // Using any[] to avoid potential type conflicts with plugin versions

if (effectiveApiKey) {
  try {
    pluginsToUse.push(googleAI({ apiKey: effectiveApiKey }));
    console.log("Google AI Plugin initialized with an API key.");
  } catch (e) {
    console.error("ERROR: Failed to initialize GoogleAI plugin. AI features might be unavailable.", e);
    // If plugin initialization fails even with a key, mark as not configured
    effectiveApiKey = undefined; 
  }
} else {
    console.warn(
        "--------------------------------------------------------------------------------\n" +
        "WARNING: No API key available (neither from environment nor hardcoded).\n" +
        "         AI features will be DISABLED.\n" +
        "--------------------------------------------------------------------------------"
    );
}

export const ai = genkit({
  promptDir: './src/ai/prompts', // Ensure this path is correct relative to where genkit commands run
  plugins: pluginsToUse,
});

/**
 * Checks if the AI features are configured and the necessary plugin is active.
 * @returns {boolean} True if AI is configured, false otherwise.
 */
export const isAiConfigured = (): boolean => {
  const configured = !!effectiveApiKey && pluginsToUse.length > 0;
  if (!configured) {
    console.log("isAiConfigured check: AI is NOT configured (effectiveApiKey is falsy or no plugins loaded).");
  } else {
    console.log("isAiConfigured check: AI IS configured.");
  }
  return configured;
};
