
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

const googleApiKey = process.env.GOOGLE_GENAI_API_KEY;

if (!googleApiKey) {
  const errorMessage = "CRITICAL_ERROR: GOOGLE_GENAI_API_KEY is not set in environment variables. AI features require this key. Please set it in your .env.local file.";
  console.error(errorMessage);
  // Fail fast if AI is essential for the application's core functionality
  throw new Error(errorMessage); 
}

export const ai = genkit({
  promptDir: './src/ai/prompts', // Adjusted path to be relative to project root or a clear location
  plugins: [
    googleAI({
      apiKey: googleApiKey, // Now guaranteed to be a string
    }),
  ],
  model: 'googleai/gemini-2.0-flash',
});

