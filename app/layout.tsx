import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Local Multimodal RAG — AI Document Intelligence",
  description: "Advanced local AI system with Multi-Query Fusion, Hybrid Search, Vision AI, and Reciprocal Rank Fusion. Powered by Ollama & Supabase.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <div className="mesh-gradient" />
        {children}
      </body>
    </html>
  );
}
