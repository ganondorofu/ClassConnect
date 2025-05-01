
'use client';

import React from 'react'; // Explicitly import React
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout'; // Use default import
import SettingsContent from '@/components/admin/SettingsContent'; // Import the content component

// Create a client
const queryClient = new QueryClient();

// This remains the main page component exported
export default function SettingsPage() {
    return (
        <QueryClientProvider client={queryClient}>
            <MainLayout>
                <SettingsContent />
            </MainLayout>
        </QueryClientProvider>
    );
}

