"use client";

import { LogoMark } from "@/components/layout/logo";
import { useT } from "@/i18n/client";

export function MuseumLoading({ label }: { label?: string }) {
  const t = useT();
  return (
    <div className="fixed inset-0 grid place-items-center bg-ink text-ivory" role="status" data-testid="museum-loading">
      <div className="grid justify-items-center gap-4">
        <LogoMark className="size-12 animate-pulse text-ivory" />
        <p className="font-display text-xl text-ivory/80">{label ?? t("museum.loading")}</p>
      </div>
    </div>
  );
}
