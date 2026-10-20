"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckIcon, XIcon } from "lucide-react";
import { Progress } from "@/components/ui/controls";
import { useT } from "@/i18n/client";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export interface OnboardingStep {
  key: "museum" | "upload" | "hang" | "avatar" | "invite" | "explore";
  done: boolean;
  href: string;
}

export function OnboardingChecklist({ steps }: { steps: OnboardingStep[] }) {
  const t = useT();
  const router = useRouter();
  const done = steps.filter((s) => s.done).length;
  return (
    <section className="relative rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/10 to-transparent p-6" aria-labelledby="onboarding-title" data-testid="onboarding">
      <button
        type="button"
        className="absolute end-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label={t("dashboard.onboarding.dismiss")}
        onClick={async () => {
          await api("/api/me", { method: "PATCH", body: { preferences: { onboardingDismissed: true } } }).catch(() => undefined);
          router.refresh();
        }}
      >
        <XIcon className="size-4" />
      </button>
      <h2 id="onboarding-title" className="font-display text-2xl">
        {t("dashboard.onboarding.title")}
      </h2>
      <div className="mt-3 flex items-center gap-3">
        <Progress value={(done / steps.length) * 100} className="max-w-xs" aria-label={t("dashboard.onboarding.progress", { done, total: steps.length })} />
        <span className="text-sm text-muted-foreground">{t("dashboard.onboarding.progress", { done, total: steps.length })}</span>
      </div>
      <ol className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s) => (
          <li key={s.key}>
            <Link
              href={s.href}
              className={cn(
                "flex items-center gap-3 rounded-xl border border-border bg-card/70 px-4 py-3 text-sm transition hover:border-gold/50",
                s.done && "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border",
                  s.done ? "border-sage bg-sage text-white" : "border-input",
                )}
                aria-hidden="true"
              >
                {s.done && <CheckIcon className="size-3.5" />}
              </span>
              <span className={cn(s.done && "line-through decoration-muted-foreground/50")}>{t(`dashboard.onboarding.${s.key}`)}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
