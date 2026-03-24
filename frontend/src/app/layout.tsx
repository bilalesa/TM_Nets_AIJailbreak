import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nets AI Jailbreak",
  description: "A game where you try to jailbreak an AI by sending it prompts. Built with Next.js, Express, and Supabase.",
};

// frontend/src/app/layout.tsx
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body 
        className="min-h-full flex flex-col" 
        suppressHydrationWarning // Add it here too!
      >
        {children}
      </body>
    </html>
  );
}