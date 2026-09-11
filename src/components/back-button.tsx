"use client";

import { useI18n } from "@/components/i18n-provider";

export function BackButton() {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.href = "/search"; }}
      className="text-sm text-[var(--cf-text-muted)] hover:text-[var(--cf-text)] mb-6 inline-flex items-center"
    >
      {t.common.back}
    </button>
  );
}
