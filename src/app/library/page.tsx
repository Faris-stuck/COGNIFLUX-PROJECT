import type { Metadata } from "next";

export const metadata: Metadata = { title: "Library" };

export default function LibraryPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-24 text-center">
      <h1 className="text-xl font-semibold mb-2">Your library is empty.</h1>
      <p className="text-sm text-[var(--cf-text-muted)] max-w-[45ch] mx-auto">
        Sign in to save papers, build collections, and keep notes across devices. Searching and reading stay free without
        an account.
      </p>
    </div>
  );
}
