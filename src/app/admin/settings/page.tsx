
'use client';

import React from 'react'; // Explicitly import React
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout'; // Use default import
// import SettingsContent from '@/components/admin/SettingsContent'; // Temporarily commented out

// Create a client
const queryClient = new QueryClient();

// This remains the main page component exported
export default function SettingsPage() {
    console.log("Rendering SettingsPage (Simplified)"); // Add console log for debugging
    try {
        // Ensure the return statement is correct JSX
        return (
          <QueryClientProvider client={queryClient}>
            <MainLayout>
                {/* Temporarily replace SettingsContent with simple text */}
                <div className="p-4">Settings Page Content Placeholder for Debugging</div>
                {/* <SettingsContent /> */}
            </MainLayout>
          </QueryClientProvider>
        );
    } catch (error) {
        console.error("Error during SettingsPage render:", error);
        return <div>Error rendering settings page. Check console.</div>; // Fallback UI
    }
}

