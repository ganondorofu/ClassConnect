# ClassConnect

ClassConnect is a streamlined information sharing application designed for classrooms, aiming to replace traditional morning and homeroom meetings. Built with Next.js, React, Firebase (Firestore), and Tailwind CSS, it provides a real-time, accessible platform for viewing timetables and daily announcements.

## Features

- **Fixed Timetable Display:** View the weekly class schedule (Monday-Friday).
- **Daily Announcements:** Teachers/admins can post updates (special items, tests, changes, etc.) for specific time slots for the current day.
- **Timetable Customization:** Admins can adjust the number of periods per day via a settings page.
- **Event Display:** Register and view non-regular events like school trips or festivals.
- **Real-time Updates:** Changes are reflected instantly for all users via Firestore's real-time capabilities.
- **Dark/Light Mode:** Toggle between themes for user preference.
- **Responsive Design:** Works on desktops, tablets, and mobile devices.
- **Anonymous Access:** No login required for basic viewing (initial setup).
- **Logging:** Basic logging of administrative actions.

## Tech Stack

- **Frontend:** Next.js (App Router), React (Hooks/Functional Components)
- **Backend/Database:** Firebase (Firestore)
- **Styling:** Tailwind CSS, shadcn/ui
- **State Management/Data Fetching:** Tanstack Query (@tanstack/react-query)
- **Date Management:** date-fns

## Project Structure (Simplified MVC-like approach)

- `src/app/`: Next.js App Router pages (Views/Routing)
- `src/components/`: Reusable React components (Views)
  - `layout/`: Layout components (Header, MainLayout)
  - `timetable/`: Timetable specific components (TimetableGrid)
  - `ui/`: shadcn/ui components
- `src/controllers/`: Business logic and data fetching/manipulation functions interacting with Firebase (Controllers)
- `src/models/`: TypeScript interfaces defining data structures (Models)
- `src/config/`: Configuration files (e.g., Firebase setup)
- `src/lib/`: Utility functions
- `src/hooks/`: Custom React hooks
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

3.  **Configure Firebase:**
    - Create a Firebase project at [https://console.firebase.google.com/](https://console.firebase.google.com/).
    - Enable **Firestore Database**. Start in **test mode** for initial development (remember to set up security rules later!).
    - Go to Project Settings > General > Your apps > Web app.
    - Register a new web app and copy the `firebaseConfig` object.
    - Create a file named `.env.local` in the root of the project.
    - Copy the contents of `.env.local.example` into `.env.local`.
    - Replace the placeholder values in `.env.local` with your actual Firebase configuration values from the `firebaseConfig` object. **Prefix all environment variables with `NEXT_PUBLIC_`** to make them available on the client-side.

    ```.env.local
    NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_API_KEY
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=YOUR_AUTH_DOMAIN
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=YOUR_STORAGE_BUCKET
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID
    NEXT_PUBLIC_FIREBASE_APP_ID=YOUR_APP_ID
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=YOUR_MEASUREMENT_ID # Optional
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
4.  Configure the environment variables (copy them from your `.env.local` file) in the Vercel project settings.
5.  Deploy!

**Deploying to Firebase Hosting:**

1.  Install Firebase CLI: `npm install -g firebase-tools`
2.  Login: `firebase login`
3.  Initialize Firebase in your project: `firebase init hosting`
    - Select your Firebase project.
    - Set the public directory to `out` (if using static export `next export`) or configure rewrites for a Next.js server. For standard Next.js deployment, Firebase Hosting might require Cloud Functions or Cloud Run integration. Consider Vercel for easier Next.js deployment.
4.  Build the app: `npm run build` (and potentially `next export` if doing a static site)
5.  Deploy: `firebase deploy --only hosting`

## Future Enhancements (Based on Request)

- **Authentication & Authorization:** Implement user accounts (Firebase Auth) to restrict editing capabilities to specific roles (teachers, class reps).
- **Log Restoration UI:** Build a UI to view logs and potentially revert changes (complex feature requiring careful implementation).
- **More Event Types:** Expand announcement/event types with more icons and potentially custom fields.
- **Notifications:** Implement push notifications for important announcements.
- **Offline Support:** Explore strategies for offline data access (e.g., Firestore offline persistence).

