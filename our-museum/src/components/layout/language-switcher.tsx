"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LanguagesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n/client";
import { localeNames, locales, type Locale } from "@/i18n/config";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ tone = "light", className }: { tone?: "light" | "dark"; className?: string }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: Locale) {
    if (next === locale) return;
    startTransition(async () => {
      try {
        await api("/api/locale", { method: "POST", body: { locale: next } });
      } catch {
        document.cookie = `om_locale=${next}; path=/; max-age=31536000; samesite=lax`;
      }
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={tone === "dark" ? "glass" : "ghost"}
          size="sm"
          aria-label={t("common.language")}
          disabled={pending}
          className={cn("gap-1.5", className)}
          data-testid="language-switcher"
        >
          <LanguagesIcon aria-hidden="true" />
          <span>{localeNames[locale]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((l) => (
          <DropdownMenuItem key={l} onSelect={() => choose(l)} lang={l} data-testid={`locale-${l}`}>
            {localeNames[l]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
