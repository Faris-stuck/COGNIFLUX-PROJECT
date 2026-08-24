import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/nav-bar";
import { PersonaOnboarding } from "@/components/persona-onboarding";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: { default: "Cogniflux - Explore Knowledge. Discover Research.", template: "%s | Cogniflux" },
  description:
    "Search scientific papers, open-access research and learning materials across global academic sources. Free for everyone.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={geist.variable}>
      <body className="min-h-[100dvh] flex flex-col">
        <NavBar />
        <PersonaOnboarding />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-[var(--cf-border)] py-8 mt-16">
          <div className="max-w-6xl mx-auto px-4 text-sm text-[var(--cf-text-muted)] flex flex-col sm:flex-row gap-3 justify-between">
            <p>Cogniflux. Explore Knowledge. Discover Research.</p>
            <p>Free forever, powered by open science.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
