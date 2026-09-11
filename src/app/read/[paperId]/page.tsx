import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getFullTextDocument } from "@/lib/reader/service";
import { getPool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { Reader, type ReaderDoc } from "@/components/reader";
import { getServerLocale, getDict } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ paperId: string }>;
}

async function loadReaderDoc(paperId: string) {
  const result = await getFullTextDocument(paperId);
  if (!result.available || !result.document) return { result, doc: null as ReaderDoc | null };

  const d = result.document;
  const readerDoc: ReaderDoc = {
    paperId,
    title: d.title,
    authors: d.authors,
    journal: d.journal,
    year: d.year,
    doi: d.doi,
    sections: d.sections,
    references: d.references,
  };
  return { result, doc: readerDoc };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { paperId } = await params;
  let id = paperId;
  try {
    id = decodeURIComponent(paperId);
  } catch {
    /* keep raw */
  }
  const { doc } = await loadReaderDoc(id);
  const t = await getDict(await getServerLocale());
  return { title: doc?.title ? `${doc.title} — ${t.reader.reader}` : `${t.reader.reader}` };
}

export default async function ReadPage({ params }: Props) {
  const { paperId } = await params;
  let id = paperId;
  try {
    id = decodeURIComponent(paperId);
  } catch {
    /* keep raw */
  }

  const { result, doc } = await loadReaderDoc(id);
  const t = await getDict(await getServerLocale());

  // Unknown upstream failure with nothing to show.
  if (!doc && (result.reason === "upstream_error" || result.reason === "bad_response")) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="text-xl font-semibold">{t.readerPage.loadingFailed}</h1>
        <p className="mt-2 text-sm text-[var(--cf-text-muted)]">{t.readerPage.sourceDown}</p>
        <RetryButtons paperId={id} t={t} />
      </div>
    );
  }

  if (!doc) {
    // Genuinely unavailable full text - be honest about it.
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="text-xl font-semibold">{t.readerPage.unavailable}</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--cf-text-muted)]">
          {t.readerPage.unavailableText}
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link href="/" className="text-sm font-medium text-[var(--cf-accent-strong)] hover:underline">
            {t.readerPage.back}
          </Link>
        </div>
      </div>
    );
  }

  // Reading progress for signed-in users (Continue reading support).
  let progress: number | null = null;
  try {
    const user = await getSessionUser();
    if (user) {
      const { rows } = await getPool().query(
        `SELECT progress FROM reading_history WHERE user_id = $1 AND paper_key = $2 LIMIT 1`,
        [user.id, id]
      );
      progress = rows[0]?.progress ?? null;
    }
  } catch {
    /* guest or DB hiccup - reader still works without progress */
  }

  return (
    <>
      {progress != null && progress > 5 && progress < 95 && (
        <div className="bg-[var(--cf-surface)] text-center text-xs text-[var(--cf-text-muted)] py-1.5 border-b border-[var(--cf-border)]">
          Continue where you left off — you&apos;ve read about {progress}% of this paper.
        </div>
      )}
      <Reader doc={doc} initialProgress={progress} />
    </>
  );
}

function RetryButtons({ paperId, t }: { paperId: string; t: Awaited<ReturnType<typeof getDict>> }) {
  return (
    <div className="mt-6 flex items-center justify-center gap-3">
      <Link
        href={`/read/${encodeURIComponent(paperId)}`}
        className="rounded-full bg-[var(--cf-accent-strong)] px-4 py-1.5 text-sm font-medium text-white"
      >
        {t.readerPage.retry}
      </Link>
      <Link href="/" className="text-sm text-[var(--cf-text-muted)] hover:underline">
        {t.readerPage.back}
      </Link>
    </div>
  );
}
