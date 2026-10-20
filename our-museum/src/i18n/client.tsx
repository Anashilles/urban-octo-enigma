"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { localeDirection, type Locale } from "./config";
import type { Messages } from "./messages/en";
import { createTranslator, type Translator } from "./translate";

interface I18nValue {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: Translator;
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatRelative: (value: Date | string | number) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: ReactNode;
}) {
  const value = useMemo<I18nValue>(() => {
    const t = createTranslator(locale, messages);
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    return {
      locale,
      dir: localeDirection[locale],
      t,
      formatDate: (v, options) =>
        new Intl.DateTimeFormat(locale, options ?? { dateStyle: "medium" }).format(new Date(v)),
      formatNumber: (v, options) => new Intl.NumberFormat(locale, options).format(v),
      formatRelative: (v) => {
        const diff = (new Date(v).getTime() - Date.now()) / 1000;
        const abs = Math.abs(diff);
        if (abs < 60) return rtf.format(Math.round(diff), "second");
        if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
        if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
        if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
        if (abs < 86400 * 365) return rtf.format(Math.round(diff / (86400 * 30)), "month");
        return rtf.format(Math.round(diff / (86400 * 365)), "year");
      },
    };
  }, [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

export function useT(): Translator {
  return useI18n().t;
}
