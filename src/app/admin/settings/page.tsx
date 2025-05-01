
'use client';

import React from 'react'; // Explicitly import React
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout'; // Use default import
import SettingsContent from '@/components/admin/SettingsContent'; // Import the actual content component

// Create a client
const queryClient = new QueryClient();

// This remains the main page component exported
export default function SettingsPage() {
    console.log("Rendering SettingsPage"); // Add console log for debugging
    try {
        // Ensure the return statement is correct JSX
        return (
          <QueryClientProvider client={queryClient}>
            <MainLayout>
                {/* Render the actual SettingsContent component */}
                <SettingsContent />
            </MainLayout>
          </QueryClientProvider>
        );
    } catch (error) {
        console.error("Error during SettingsPage render:", error);
        return <div>Error rendering settings page. Check console.</div>; // Fallback UI
    }
}
