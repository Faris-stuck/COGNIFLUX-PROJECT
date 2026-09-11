import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/nav-bar";
import { PersonaOnboarding } from "@/components/persona-onboarding";
import { PageTranslator } from "@/components/page-translator";
import { I18nProvider } from "@/components/i18n-provider";
import { getServerLocale, getDict } from "@/lib/i18n-server";
import { getNavigation } from "@/lib/site-content";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cogniflux.web.id";
const SITE_DESCRIPTION =
  "Search scientific papers, open-access research and learning materials across global academic sources. Free for everyone.";

export const metadata: Metadata = {
  // metadataBase makes every relative OG/canonical URL absolute. Without it Next
  // emits relative og:url/og:image values, which crawlers and link unfurlers drop.
  metadataBase: new URL(SITE_URL),
  title: { default: "Cogniflux - Explore Knowledge. Discover Research.", template: "%s | Cogniflux" },
  description: SITE_DESCRIPTION,
  applicationName: "Cogniflux",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Cogniflux",
    url: SITE_URL,
    title: "Cogniflux - Explore Knowledge. Discover Research.",
    description: SITE_DESCRIPTION,
    locale: "id_ID",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cogniflux - Explore Knowledge. Discover Research.",
    description: SITE_DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getServerLocale();
  const t = await getDict(locale);
  const navigation = await getNavigation();
  return (
    <html lang={locale} className={geist.variable}>
      <body className="min-h-[100dvh] flex flex-col">
        <I18nProvider initialLocale={locale} initialDictionary={t}>
          <NavBar initialLinks={navigation} />
          <PersonaOnboarding />
          <PageTranslator />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-[var(--cf-border)] py-8 mt-16">
            <div className="max-w-6xl mx-auto px-4 text-sm text-[var(--cf-text-muted)] flex flex-col sm:flex-row gap-3 justify-between">
              <p>Cogniflux. {t.footer.tag}</p>
              <p>{t.footer.free}</p>
                      </div>
          </footer>
        </I18nProvider>
      </body>
    </html>
  );
}
