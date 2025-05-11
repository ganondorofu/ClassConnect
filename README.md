# ClassConnect

ClassConnect is a streamlined information sharing application designed for classrooms, aiming to replace traditional morning and homeroom meetings. Built with Next.js, React, Firebase (Firestore), and Tailwind CSS, it provides a real-time, accessible platform for viewing timetables and daily announcements.

## Features

- **Fixed Timetable Display:** View the weekly class schedule (Monday-Friday).
- **Daily Announcements:** Teachers/admins can post updates (special items, tests, changes, etc.) for specific time slots for the current day.
- **AI-Powered Announcement Summarization:** Option to generate a concise summary of daily general announcements.
- **Timetable Customization:** Admins can adjust the number of periods per day via a settings page.
- **Event Display:** Register and view non-regular events like school trips or festivals on a calendar.
- **Real-time Updates:** Changes are reflected instantly for all users via Firestore's real-time capabilities.
- **Dark/Light Mode:** Toggle between themes for user preference.
- **Responsive Design:** Works on desktops, tablets, and mobile devices.
- **Authentication:** Supports admin login (email/password) and anonymous access with role-based feature availability.
- **Logging & Rollback:** Basic logging of administrative actions with a UI to view logs and rollback certain changes.

## Tech Stack

- **Frontend:** Next.js (App Router), React (Hooks/Functional Components)
- **Backend/Database:** Firebase (Firestore, Firebase Auth)
- **AI Features:** Genkit with Google Gemini
- **Styling:** Tailwind CSS, shadcn/ui
- **State Management/Data Fetching:** Tanstack Query (@tanstack/react-query)
- **Date Management:** date-fns

## Project Structure (Simplified MVC-like approach)

- `src/app/`: Next.js App Router pages (Views/Routing)
  - `api/`: API Route handlers
- `src/components/`: Reusable React components (Views)
  - `layout/`: Layout components (Header, MainLayout)
  - `timetable/`: Timetable specific components (TimetableGrid)
  - `ui/`: shadcn/ui components
- `src/controllers/`: Business logic and data fetching/manipulation functions interacting with Firebase (Controllers)
- `src/models/`: TypeScript interfaces defining data structures (Models)
- `src/config/`: Configuration files (e.g., Firebase setup)
- `src/lib/`: Utility functions
- `src/hooks/`: Custom React hooks
- `src/ai/`: Genkit flows and AI related logic
- `public/`: Static assets

## Setup and Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd classconnect
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Configure Firebase & AI Services:**
    - Create a Firebase project at [https://console.firebase.google.com/](https://console.firebase.google.com/).
    - Enable **Firestore Database**. Start in **test mode** for initial development (remember to set up security rules later!).
    - Enable **Firebase Authentication** and configure Email/Password sign-in method.
    - Go to Project Settings > General > Your apps > Web app.
    - Register a new web app and copy the `firebaseConfig` object.
    - Create a file named `.env.local` in the root of the project.
    - Copy the contents of `.env.local.example` (if available, otherwise create one) into `.env.local`.
    - Replace the placeholder values in `.env.local` with your actual Firebase configuration values from the `firebaseConfig` object. **Prefix all Firebase environment variables with `NEXT_PUBLIC_`** to make them available on the client-side.
    - **For AI Features (Gemini):**
        - Obtain a Google AI API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
        - Add this key to your `.env.local` file as `GOOGLE_GENAI_API_KEY=YOUR_GEMINI_API_KEY`.

    Your `.env.local` should look something like this:
    ```.env.local
    NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_FIREBASE_API_KEY
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=YOUR_FIREBASE_AUTH_DOMAIN
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=YOUR_FIREBASE_STORAGE_BUCKET
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=YOUR_FIREBASE_MESSAGING_SENDER_ID
    NEXT_PUBLIC_FIREBASE_APP_ID=YOUR_FIREBASE_APP_ID
    # NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=YOUR_MEASUREMENT_ID # Optional

    GOOGLE_GENAI_API_KEY=YOUR_GEMINI_API_KEY
    ```

4.  **Run the development server:**
    ```bash
    npm run dev
    # or
    yarn dev
    ```
    The application should now be running on [http://localhost:9002](http://localhost:9002) (or the specified port).

## Building for Production

```bash
npm run build
```
This command builds the application for production usage.

## Deploying

You can deploy the application to various platforms like Vercel (recommended for Next.js), Firebase Hosting, Netlify, etc.

**Deploying to Vercel:**

1.  Push your code to a Git repository (GitHub, GitLab, Bitbucket).
2.  Sign up or log in to [Vercel](https://vercel.com/).
3.  Import your Git repository.
4.  **Configure Environment Variables:**
    - In your Vercel project settings, add all the environment variables defined in your `.env.local` file.
    - This includes `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, etc., and also `GOOGLE_GENAI_API_KEY`.
    - **Important:** Vercel does not automatically pick up `.env.local` for production builds; you must set them in the Vercel dashboard.
5.  Ensure your `next.config.ts` **does not** have `output: 'export'` if you are using server-side features like API Routes (which Genkit relies on for AI summarization). Vercel's default Next.js deployment supports server-side rendering and API routes.
6.  Deploy!

**Deploying to Firebase Hosting (with server-side features):**

Deploying a Next.js app with server-side features (like API Routes or Genkit flows) to Firebase Hosting typically requires integration with Cloud Functions for Firebase or Cloud Run. This is more complex than deploying a static site.
- For simpler deployment of Next.js applications with server-side logic, Vercel is often preferred.
- If you intend to use Firebase Hosting, you'll need to:
    1. Initialize Firebase: `firebase init hosting`
    2. Configure rewrites in `firebase.json` to direct requests to your Next.js server function.
    3. Set up a Cloud Function to serve your Next.js app.
    4. Build the app: `npm run build`.
    5. Deploy: `firebase deploy`.
    6. Set environment variables (Firebase config, Gemini API key) in the Cloud Functions environment.

## Future Enhancements (Based on Request)

- **More Event Types:** Expand announcement/event types with more icons and potentially custom fields.
- **Notifications:** Implement push notifications for important announcements.
- **Offline Support:** Explore strategies for offline data access (e.g., Firestore offline persistence, PWA features).
- **PWA Conversion:** Enhance the app to be a Progressive Web App for better mobile experience and offline capabilities.
