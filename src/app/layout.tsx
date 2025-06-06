
import type { Metadata } from 'next';
import { Inter } from 'next/font/google'; // Using Inter for a modern look
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from "@/components/ui/toaster"; // Import Toaster
import { AuthProvider } from '@/contexts/AuthContext';
import { ClassProvider } from '@/contexts/ClassContext';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'ClassConnect',
  description: 'Streamlined class information sharing.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <AuthProvider>
          <ClassProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              {children}
              <Toaster />
            </ThemeProvider>
          </ClassProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
