import { getSessionUser } from "@/lib/auth/session";
import { LogoutButton } from "@/components/logout-button";
import { LibraryTabs } from "@/components/library-tabs";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Library" };
export const dynamic = "force-dynamic";

/**
 * Library shell. Server component resolves auth; guest sees an honest
 * sign-in prompt, signed-in users get the tabbed library (client component).
 */
export default async function LibraryPage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-24 text-center">
        <h1 className="text-xl font-semibold mb-2">Your library is empty.</h1>
        <p className="text-sm text-[var(--cf-text-muted)] max-w-[45ch] mx-auto mb-8">
          Sign in to save papers, build collections, and keep notes across devices.
          Searching and reading stay free without an account.
        </p>
        <a
          href="/login"
          className="inline-block rounded-[10px] bg-[var(--cf-accent)] hover:bg-[var(--cf-accent-strong)] transition text-white text-sm font-medium px-5 py-2.5"
        >
          Sign in
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          <p className="text-sm text-[var(--cf-text-muted)] mt-0.5">{user.email}</p>
        </div>
        <LogoutButton />
      </header>
      <LibraryTabs />
    </div>
  );
}
