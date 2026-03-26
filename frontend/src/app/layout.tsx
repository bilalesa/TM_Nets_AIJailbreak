import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Breaking the Prompt - Inside AI Manipulation",
  description: "Get the AI to reveal the secret code. A jailbreak challenge by TrendAI x NETS.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} font-inter min-h-screen`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}