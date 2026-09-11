"use client";
import { useI18n } from "@/components/i18n-provider";
import { useEffect, useRef, useState } from "react";

const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION", "CODE", "PRE", "KBD", "SAMP", "SVG", "CANVAS", "IFRAME", "NAV", "FOOTER"]);

function collectTextNodes(root: Node): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || SKIP.has(parent.tagName) || parent.closest('[data-cf-no-translate="true"]')) return NodeFilter.FILTER_REJECT;
      const text = node.nodeValue?.replace(/\s+/g, " ").trim() ?? "";
      if (text.length < 4 || !/[A-Za-zÀ-ÿ]/.test(text)) return NodeFilter.FILTER_REJECT;
      if (/^(https?:\/\/|www\.)/i.test(text)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let n: Node | null;
  while ((n = walker.nextNode())) out.push(n as Text);
  return out;
}

export function PageTranslator() {
  const { locale, t } = useI18n();
  const [busy, setBusy] = useState(false);
  const localeRef = useRef(locale);
  const runningRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | null = null;

    const translatePage = async () => {
      if (cancelled || runningRef.current || !document.body) return;
      runningRef.current = true;
      setBusy(true);
      try {
        const nodes = collectTextNodes(document.body);
        for (let i = 0; i < nodes.length; i += 50) {
          if (cancelled) break;
          const batch = nodes.slice(i, i + 50);
          const texts = batch.map((n) => n.nodeValue ?? "");
          const response = await fetch("/api/translate", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ target: localeRef.current, texts }),
            cache: "no-store",
          });
          if (!response.ok) throw new Error("translation_failed");
          const data = (await response.json()) as { translations?: unknown };
          if (!Array.isArray(data.translations) || data.translations.length !== batch.length || data.translations.some((x) => typeof x !== "string")) {
            throw new Error("translation_invalid");
          }
          const translations = data.translations as string[];
          batch.forEach((node, index) => {
            node.nodeValue = translations[index];
          });
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
      } catch (error) {
        console.warn("[cogniflux-translate]", error);
      } finally {
        runningRef.current = false;
        if (!cancelled) setBusy(false);
      }
    };

    const schedule = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => { timerRef.current = null; void translatePage(); }, 250);
    };

    observer = new MutationObserver(() => schedule());
    observer.observe(document.body, { childList: true, subtree: true, characterData: false });
    schedule();

    return () => {
      cancelled = true;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      observer?.disconnect();
    };
  }, [locale]);

  return <span className="sr-only" aria-live="polite">{busy ? t.language.translating : ""}</span>;
}
