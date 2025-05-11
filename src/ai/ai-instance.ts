import {genkit} from 'genkit';
import type { Plugin } from '@genkit-ai/core';
import {googleAI} from '@genkit-ai/googleai';

// As per user request, directly use the hardcoded API key.
// Ensure this key is valid and has permissions for the Gemini API on your Google Cloud project.
const hardcodedApiKey = "AIzaSyBJc9NcsOWwnmSH-robtbpsEJXENwDwRoE"; 
let effectiveApiKey = hardcodedApiKey;

let activePlugins: Plugin[] = [];

if (!effectiveApiKey) {
  // This case should ideally not be hit if hardcodedApiKey is always set.
  // If it can be empty, this warning is important.
  console.error(
    "CRITICAL_AI_CONFIG_ERROR: No Google GenAI API Key provided (neither hardcoded nor via GOOGLE_GENAI_API_KEY environment variable). AI features will be DISABLED."
  );
} else {
  try {
    const plugin = googleAI({ apiKey: effectiveApiKey });
    if (plugin && typeof plugin.name === 'string') { // Basic check for a valid plugin structure
      activePlugins.push(plugin);
      console.log("Google AI plugin initialized successfully with the provided API key.");
    } else {
      // This case means googleAI() didn't throw but returned something unexpected.
      throw new Error("GoogleAI plugin factory did not return a valid plugin object.");
    }
  } catch (e) {
    console.error("CRITICAL_AI_CONFIG_ERROR: Failed to initialize Google AI plugin. This might be due to an invalid API key, incorrect project setup, or network issues. AI features will be DISABLED.", e);
    effectiveApiKey = undefined; // Mark as not configured
    activePlugins = []; // Ensure no plugins are active if initialization fails
  }
}

export const ai = genkit({
  promptDir: './src/ai/prompts', // Ensure this path is correct relative to your project root
  plugins: activePlugins,
});

/**
 * Checks if the AI features are configured and the Google AI plugin is active.
 * @returns {boolean} True if AI is configured and plugin is active, false otherwise.
 */
export const isAiConfigured = (): boolean => {
  return !!effectiveApiKey && activePlugins.some(plugin => plugin.name === 'googleai');
};

/**
 * Retrieves the currently configured Google GenAI API key.
 * @returns {string | undefined} The API key if configured, otherwise undefined.
 */
export const getGoogleApiKey = (): string | undefined => {
    return effectiveApiKey;
};
