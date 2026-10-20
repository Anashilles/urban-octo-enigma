"use client";

import { useEffect, type ReactNode } from "react";
import { Direction } from "radix-ui";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/controls";
import { I18nProvider } from "@/i18n/client";
import { localeDirection, type Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/en";
import { usePreferences } from "@/store/preferences";

/** Applies interface-level accessibility preferences to <html>. */
function PreferenceClasses() {
  const highContrast = usePreferences((s) => s.highContrast);
  const reducedMotion = usePreferences((s) => s.reducedMotion);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("high-contrast", highContrast);
    root.classList.toggle("reduce-motion", reducedMotion);
  }, [highContrast, reducedMotion]);
  return null;
}

export function Providers({ locale, messages, children }: { locale: Locale; messages: Messages; children: ReactNode }) {
  const dir = localeDirection[locale];
  return (
    <I18nProvider locale={locale} messages={messages}>
      <Direction.Provider dir={dir}>
        <TooltipProvider>
          <PreferenceClasses />
          {children}
          <Toaster dir={dir} />
        </TooltipProvider>
      </Direction.Provider>
    </I18nProvider>
  );
}
