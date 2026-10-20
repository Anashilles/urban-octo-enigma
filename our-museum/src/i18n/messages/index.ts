import type { Locale } from "../config";
import en, { type Messages } from "./en";
import ar from "./ar";

export const catalogs: Record<Locale, Messages> = { en, ar: ar as Messages };

export function getMessages(locale: Locale): Messages {
  return catalogs[locale];
}

export type { Messages };
