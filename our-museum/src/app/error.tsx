"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="grid min-h-[60dvh] place-items-center px-6">
      <div className="grid max-w-md justify-items-center gap-4 text-center">
        <h1 className="font-display text-4xl">{t("errors.genericTitle")}</h1>
        <p className="text-muted-foreground">{t("errors.genericBody")}</p>
        <Button onClick={reset}>{t("common.retry")}</Button>
      </div>
    </main>
  );
}
